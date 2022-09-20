import { Injectable, Inject, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { Sdk } from '@unique-nft/substrate-client';
import { KeyringPair } from '@polkadot/keyring/types';

import { MarketConfig } from '@app/config/market-config';
import { OffersEntity, BlockchainBlock, NFTTransfer } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { SearchIndexService } from '@app/auction/services/search-index.service';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { InjectSentry, SentryService } from '@app/utils/sentry';
import { PayOffersService } from '@app/offers/pay.service';
import { OfferFiatDto } from '@app/offers/dto/pay.dto';

import { MassFiatSaleDTO, MassFiatSaleResultDto, MassCancelFiatResult } from '../dto';

@Injectable()
export class FiatSaleService {
  private logger: Logger;
  private auctionAccount: Account<KeyringPair>;
  private mainAccount: Account<KeyringPair>;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly blockchainBlockRepository: Repository<BlockchainBlock>;
  private readonly nftTransferRepository: Repository<NFTTransfer>;
  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private readonly searchIndex: SearchIndexService,
    @InjectUniqueSDK() private readonly unique: Sdk,
    @InjectSentry() private readonly sentryService: SentryService,
    private readonly payOffersService: PayOffersService,
  ) {
    this.logger = new Logger(FiatSaleService.name);
    this.offersRepository = this.connection.getRepository(OffersEntity);
    this.blockchainBlockRepository = connection.getRepository(BlockchainBlock);
    this.nftTransferRepository = connection.getRepository(NFTTransfer);
    this.auctionAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.auction.seed);
    this.mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);
  }

  async massFiatSale(data: MassFiatSaleDTO): Promise<MassFiatSaleResultDto> {
    const { tokens: accountTokens } = await this.unique.tokens.getAccountTokens({
      collectionId: data.collectionId,
      address: this.mainAccount.instance.address,
    });
    if (accountTokens.length === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The collectionId is not in the collections',
        error: 'The collectionId is not in the collections',
      });
    }
    const tokenIdsAcount = data.tokenIds?.length
      ? data.tokenIds.filter((tokenId) => accountTokens.map(({ tokenId }) => tokenId).includes(tokenId)).map((token) => token.toString())
      : accountTokens.map(({ tokenId }) => tokenId.toString());

    if (!tokenIdsAcount.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Not tokens to sale',
        tokenIds: [],
      };
    }

    const offersFiat: OfferFiatDto[] = [];

    for (const tokenId of tokenIdsAcount) {
      const unsignedTxPayload = await this.unique.tokens.transfer.build(
        {
          address: this.mainAccount.instance.address,
          to: this.auctionAccount.instance.address,
          collectionId: data.collectionId,
          tokenId: parseInt(tokenId),
        },
        { signer: this.mainAccount },
      );

      const { signature } = await this.mainAccount.sign(unsignedTxPayload);

      const offerFiat = await this.payOffersService.createFiat({
        price: data.price,
        currency: data.currency,
        signature,
        signerPayloadJSON: unsignedTxPayload.signerPayloadJSON,
      });
      offersFiat.push(offerFiat);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Mass fiat listing completed',
      tokenIds: offersFiat.map((offer) => offer.tokenId),
    };
  }

  async massCancelFiat(): Promise<MassCancelFiatResult> {
    const mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);

    const currentOffers = await this.offersRepository.find({
      where: {
        status: ASK_STATUS.ACTIVE,
        type: SellingMethod.Fiat,
        address_from: mainAccount.instance.address,
        address_to: this.auctionAccount.instance.address,
      },
    });

    for (const offer of currentOffers) {
      const { parsed, submittableResult, isCompleted } = await this.unique.tokens.transfer.submitWaitResult(
        {
          address: this.auctionAccount.instance.address,
          to: this.mainAccount.instance.address,
          collectionId: parseInt(offer.collection_id),
          tokenId: parseInt(offer.token_id),
        },
        { signer: this.auctionAccount.getSigner() },
      );

      const blockHash = submittableResult.status.asInBlock;
      const signedBlock = await this.unique.api.rpc.chain.getBlock(submittableResult.status.asInBlock);
      const blockNumber = signedBlock.block.header.number.toBigInt();

      if (blockNumber === undefined || blockNumber === null || blockNumber.toString() === '0') {
        this.sentryService.message('sendTransferExtrinsic');

        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: 'Block number is not defined',
        });
      }

      if (!isCompleted) {
        this.sentryService.instance().captureException(new BadRequestException(submittableResult.internalError), {
          tags: { section: 'fiat' },
        });
        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: `Failed at block # ${blockNumber} (${blockHash.toHex()})`,
        });
      }
      offer.block_number_cancel = blockNumber.toString();

      this.logger.debug(`Token transfer block number: ${blockNumber}`);

      const { collectionId, tokenId, from, to } = parsed;

      const newTransfer = this.nftTransferRepository.create({
        id: uuid(),
        network: this.config.blockchain.unique.network,
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        address_from: from,
        address_to: to,
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });

      await this.nftTransferRepository.save(newTransfer);
    }

    const savedOffer = await this.offersRepository.save(currentOffers.map((offer) => ({ ...offer, status: ASK_STATUS.CANCELLED })));

    return {
      statusCode: HttpStatus.OK,
      message: `${savedOffer.length} offers successfully canceled`,
    };
  }
}
