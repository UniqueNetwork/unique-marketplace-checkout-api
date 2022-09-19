import { BadRequestException, HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';
import { Repository, DataSource } from 'typeorm';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { v4 as uuid } from 'uuid';

import { SdkTransferService } from '@app/uniquesdk';
import { MarketConfig } from '@app/config/market-config';
import { OffersEntity, BlockchainBlock, NFTTransfer } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { SearchIndexService } from '@app/auction/services/search-index.service';
import { SdkExtrinsicService, NetworkName } from '@app/uniquesdk';
import { InjectSentry, SentryService } from '@app/utils/sentry';

import { PayOfferDto, PayOfferResponseDto, CreateFiatInput, OfferFiatDto, CancelFiatInput } from './dto';

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

  private logger: Logger;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly blockchainBlockRepository: Repository<BlockchainBlock>;
  private readonly nftTransferRepository: Repository<NFTTransfer>;
  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);
  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private readonly sdkTransferService: SdkTransferService,
    private searchIndexService: SearchIndexService,
    private readonly sdkExtrinsicService: SdkExtrinsicService,
    @InjectSentry() private readonly sentryService: SentryService,
  ) {
    this.logger = new Logger(PayOffersService.name);
    this.offersRepository = this.connection.getRepository(OffersEntity);
    this.blockchainBlockRepository = connection.getRepository(BlockchainBlock);
    this.nftTransferRepository = connection.getRepository(NFTTransfer);
    this.auctionAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.auction.seed);
  }

  async payOffer(input: PayOfferDto): Promise<PayOfferResponseDto> {
    const offer = await this.offersRepository.findOne({
      where: {
        type: SellingMethod.Fiat,
        collection_id: input.collectionId,
        token_id: input.tokenId,
        address_to: this.auctionAccount.instance.address,
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

    const payment = (await this.cko.payments
      .request({
        source: {
          token: input.tokenCard,
        },
        currency: offer.currency,
        amount: parseInt(offer.price),
        reference: offer.id,
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

    const { isError, blockNumber, collectionId, tokenId, addressFrom, addressTo } = await this.sdkTransferService.transferToken(
      this.auctionAccount,
      input.buyerAddress,
      parseInt(offer.collection_id),
      parseInt(offer.token_id),
    );

    if (isError) {
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

    const newTransfer = this.nftTransferRepository.create({
      id: uuid(),
      network: this.config.blockchain.unique.network,
      collection_id: collectionId.toString(),
      token_id: tokenId.toString(),
      address_from: addressFrom,
      address_to: addressTo,
      block_number: blockNumber.toString(),
      created_at: new Date(),
    });

    await this.nftTransferRepository.save(newTransfer);

    await this.offersRepository.update(
      {
        id: offer.id,
      },
      {
        status: ASK_STATUS.BOUGHT,
        address_to: input.buyerAddress,
        address_from: this.auctionAccount.instance.address,
        block_number_buy: blockNumber.toString(),
      },
    );

    this.logger.log(
      `{subject:'Got buyKSM fiat', thread:'offer update', collection: ${offer.collection_id.toString()}, token: ${offer.token_id.toString()},
      )}', status: ${ASK_STATUS.BOUGHT}, log:'buyKSMfiat' }`,
    );

    return {
      isOk: true,
    };
  }

  async createFiat(createFiatInput: CreateFiatInput): Promise<OfferFiatDto> {
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
        address_from: addressFrom,
        address_to: addressTo,
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
        address_from: addressFrom,
        address_to: addressTo,
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
        seller: savedOffer.address_to,
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
      address_from: addressFrom,
      address_to: addressTo,
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
  }
}
