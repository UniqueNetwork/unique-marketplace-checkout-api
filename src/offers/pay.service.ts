import { BadRequestException, HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';
import { Repository, DataSource } from 'typeorm';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { v4 as uuid } from 'uuid';

import { SdkTokensService, SdkTransferService } from '@app/uniquesdk';
import { MarketConfig } from '@app/config/market-config';
import { OffersEntity, BlockchainBlock, NFTTransfer, MarketTrade } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { SearchIndexService } from '@app/auction/services/search-index.service';
import { SdkExtrinsicService, NetworkName } from '@app/uniquesdk';
import { InjectSentry, SentryService } from '@app/utils/sentry';
import { encodeAddress } from '@polkadot/util-crypto';

import { PayOfferDto, CreateFiatInput, OfferFiatDto, CancelFiatInput, OfferEntityDto } from './dto';

type PaymentsResult = {
  id: string;
  amount: number;
  currency: string;
  approved: boolean;
  status: string;
  auth_code: string;
  response_code: string;
  response_summary: string;
  requiresRedirect: boolean;
};

@Injectable()
export class PayOffersService {
  private auctionAccount: Account<KeyringPair>;
  private bulkSaleAccount: Account<KeyringPair>;
  private escrowAccount: Account<KeyringPair>;

  private logger: Logger;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly blockchainBlockRepository: Repository<BlockchainBlock>;
  private readonly nftTransferRepository: Repository<NFTTransfer>;
  private tradeRepository: Repository<MarketTrade>;

  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);

  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private readonly sdkTransferService: SdkTransferService,
    private searchIndexService: SearchIndexService,
    private readonly sdkExtrinsicService: SdkExtrinsicService,
    private readonly sdkTokensService: SdkTokensService,
    @InjectSentry() private readonly sentryService: SentryService,
  ) {
    this.logger = new Logger(PayOffersService.name);

    this.offersRepository = this.connection.getRepository(OffersEntity);
    this.blockchainBlockRepository = connection.getRepository(BlockchainBlock);
    this.nftTransferRepository = connection.getRepository(NFTTransfer);
    this.tradeRepository = connection.manager.getRepository(MarketTrade);

    this.auctionAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.auction.seed);
    this.bulkSaleAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.bulkSaleSeed);
    this.escrowAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.blockchain.escrowSeed);
  }

  async payOffer(input: PayOfferDto): Promise<OfferEntityDto> {
    const offer = await this.offersRepository.findOne({
      where: {
        type: SellingMethod.Fiat,
        collection_id: input.collectionId,
        token_id: input.tokenId,
        address_to: encodeAddress(this.auctionAccount.instance.address),
        status: ASK_STATUS.ACTIVE,
      },
    });

    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Offer not found',
        error: 'Offer not found',
      });
    }

    const newOffer = this.offersRepository.create({
      ...offer,
      id: uuid(),
      token_id: (Number(offer.token_id) * -1).toString(),
      status: ASK_STATUS.PENDING,
      collection_data: { copiedFromTokenId: offer.token_id } as any,
      copiesCount: null,
    });

    await this.offersRepository.save(newOffer);

    const payment = (await this.cko.payments
      .request({
        source: {
          token: input.tokenCard,
        },
        currency: newOffer.currency,
        amount: parseInt(newOffer.price),
        reference: newOffer.id,
        // name plus email are unique
        customer: {
          name: input.buyerAddress,
          email: `${input.buyerAddress}@unique.network`,
        },
        metadata: {
          transferAddress: input.buyerAddress,
          collectionId: input.collectionId,
          tokenId: input.tokenId,
        },
      })
      .catch((err) => {
        this.logger.error(err);
        throw new BadRequestException({
          statusCode: err.http_code,
          message: 'Offer purchase error',
          error: err.message,
          errorBody: err.body,
        });
      })) as PaymentsResult;

    if (!payment.approved) {
      await this.offersRepository.update(newOffer.id, { status: ASK_STATUS.ERROR as string });
      throw new BadRequestException({
        statusCode: payment.response_code,
        message: 'Offer purchase not approved',
        error: 'Offer purchase error',
        errorBody: {
          amount: payment.amount,
          currency: payment.currency,
          approved: payment.approved,
          status: payment.status,
          auth_code: payment.auth_code,
          response_code: payment.response_code,
          response_summary: payment.response_summary,
          requiresRedirect: payment.requiresRedirect,
        },
      });
    }

    const { isCompleted, parsed, blockNumber } = await this.sdkTokensService.createTokenToBuyer(
      Number(offer.token_id),
      Number(offer.collection_id),
      input.buyerAddress,
      this.escrowAccount,
    );

    if (!isCompleted) {
      await this.cko.payments
        .refund(payment.id, {
          amount: parseInt(offer.price) / 100,
          reference: offer.id,
        })
        .catch((err) => {
          this.logger.error(err);
        });
      throw new BadRequestException({
        statusCode: HttpStatus.CONFLICT,
        message: 'Offer transfer error',
        error: 'Offer transfer error',
      });
    }

    const updatedOffer = await this.offersRepository.save({
      ...newOffer,
      token_id: parsed.tokenId.toString(),
      status: ASK_STATUS.BOUGHT,
      address_to: input.buyerAddress,
      address_from: this.auctionAccount.instance.address,
      block_number_buy: blockNumber.toString(),
    });

    await this.tradeRepository.save({
      id: uuid(),
      collection_id: updatedOffer.collection_id,
      token_id: updatedOffer.token_id,
      network: updatedOffer.network,
      price: `${updatedOffer.price}`,
      currency: `${payment.currency}`,
      address_seller: updatedOffer.address_from,
      address_buyer: updatedOffer.address_to,
      block_number_ask: updatedOffer.block_number_ask,
      block_number_buy: updatedOffer.block_number_buy,
      ask_created_at: new Date(updatedOffer.created_at_ask),
      buy_created_at: new Date(),
      originPrice: `${updatedOffer.price}`,
      status: SellingMethod.Fiat,
      commission: `0`,
    });

    await this.searchIndexService.addSearchIndexIfNotExists({
      collectionId: Number(updatedOffer.collection_id),
      tokenId: Number(updatedOffer.token_id),
    });

    await this.offersRepository.update(offer.id, { copiesCount: (parseInt(offer.copiesCount || '0') + 1).toString() });

    this.logger.log(
      `{subject:'Got buyKSM fiat', thread:'offer update', collection: ${updatedOffer.collection_id.toString()}, token: ${updatedOffer.token_id.toString()},
          )}', status: ${ASK_STATUS.BOUGHT}, log:'buyKSMfiat' }`,
    );

    return OfferEntityDto.fromOffersEntity(updatedOffer);
  }

  async createFiat(createFiatInput: CreateFiatInput): Promise<OfferFiatDto> {
    const allowedAccounts = [
      ...this.config.adminList.split(',').map((item) => encodeAddress(item.trim())),
      this.bulkSaleAccount.instance.address,
    ];
    if (!allowedAccounts.includes(encodeAddress(createFiatInput.signerPayloadJSON.address))) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Wrong signer address',
        error: 'Wrong signer address',
      });
    }
    try {
      const { blockNumber, collectionId, tokenId, addressFrom, addressTo, isCompleted, internalError, blockHash } =
        await this.sdkExtrinsicService.submitTransferToken(
          createFiatInput.signerPayloadJSON,
          createFiatInput.signature,
          NetworkName.UNIQUE,
        );

      if (blockNumber === undefined || blockNumber === null || blockNumber.toString() === '0') {
        this.sentryService.message('sendTransferExtrinsic');

        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: 'Block number is not defined',
        });
      }

      if (!isCompleted) {
        this.sentryService.instance().captureException(new BadRequestException(internalError), {
          tags: { section: 'fiat' },
        });
        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: `Failed at block # ${blockNumber} (${blockHash.toHex()})`,
        });
      }

      const block = this.blockchainBlockRepository.create({
        network: this.config.blockchain.unique.network,
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });
      await this.connection.createQueryBuilder().insert().into(BlockchainBlock).values(block).orIgnore().execute();

      this.logger.debug(`Token transfer block number: ${blockNumber}`);

      const newTransfer = this.nftTransferRepository.create({
        id: uuid(),
        network: this.config.blockchain.unique.network,
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        address_from: encodeAddress(addressFrom),
        address_to: encodeAddress(addressTo),
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });

      await this.nftTransferRepository.save(newTransfer);

      const newOffer = this.offersRepository.create({
        id: uuid(),
        type: SellingMethod.Fiat,
        status: ASK_STATUS.ACTIVE,
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        network: this.config.blockchain.unique.network,
        price: (createFiatInput.price * 100).toString(),
        currency: createFiatInput.currency,
        address_from: encodeAddress(addressFrom),
        address_to: encodeAddress(addressTo),
        block_number_ask: blockNumber.toString(),
      });

      const savedOffer = await this.offersRepository.save(newOffer);

      await this.searchIndexService.addSearchIndexIfNotExists({
        collectionId: Number(savedOffer.collection_id),
        tokenId: Number(savedOffer.token_id),
      });

      return {
        id: savedOffer.id,
        collectionId: parseInt(savedOffer.collection_id),
        tokenId: parseInt(savedOffer.token_id),
        price: savedOffer.price,
        seller: encodeAddress(savedOffer.address_to),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async cancelFiat(cancelFiatInput: CancelFiatInput): Promise<OfferFiatDto> {
    const offer = await this.offersRepository.findOne({
      where: {
        collection_id: cancelFiatInput.collectionId,
        token_id: cancelFiatInput.tokenId,
        address_from: encodeAddress(cancelFiatInput.sellerAddress),
        address_to: this.auctionAccount.instance.address,
        status: ASK_STATUS.ACTIVE,
        type: SellingMethod.Fiat,
      },
    });
    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Active offer not found',
        error: 'Active offer not found',
      });
    }

    try {
      const { isError, blockNumber, collectionId, tokenId, addressFrom, addressTo } = await this.sdkTransferService.transferToken(
        this.auctionAccount,
        cancelFiatInput.sellerAddress,
        parseInt(offer.collection_id),
        parseInt(offer.token_id),
      );

      if (isError) {
        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: 'Offer transfer error',
          error: 'Offer transfer error',
        });
      }

      this.logger.debug(`Token transfer block number: ${blockNumber}`);

      const updatedOffer = await this.offersRepository.save({
        ...offer,
        status: ASK_STATUS.CANCELLED,
        block_number_cancel: blockNumber.toString(),
      });

      const newTransfer = this.nftTransferRepository.create({
        id: uuid(),
        network: this.config.blockchain.unique.network,
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        address_from: encodeAddress(addressFrom),
        address_to: encodeAddress(addressTo),
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });

      await this.nftTransferRepository.save(newTransfer);

      return {
        id: updatedOffer.id,
        collectionId: parseInt(updatedOffer.collection_id),
        tokenId: parseInt(updatedOffer.token_id),
        price: updatedOffer.price,
        seller: updatedOffer.address_from,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
