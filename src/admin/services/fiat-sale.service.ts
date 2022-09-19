import { Injectable, Inject, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { Repository, DataSource, In } from 'typeorm';
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

    const tokenIds = tokenIdsAcount.length ? tokenIdsAcount : accountTokens.map(({ tokenId }) => tokenId.toString());

    const newOffers: OffersEntity[] = tokenIds.map((tokenId) => {
      return this.offersRepository.create({
        id: uuid(),
        type: SellingMethod.Fiat,
        status: ASK_STATUS.ACTIVE,
        collection_id: data.collectionId.toString(),
        token_id: tokenId,
        network: this.config.blockchain.unique.network,
        price: (data.price * 100).toString(),
        currency: data.currency,
        address_from: this.mainAccount.instance.address,
        address_to: this.auctionAccount.instance.address,
      });
    });

    if (!newOffers.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Not tokens to sale',
        data: [],
      };
    }

    for (const offer of newOffers) {
      const { parsed, submittableResult, isCompleted } = await this.unique.tokens.transfer.submitWaitResult(
        {
          address: this.mainAccount.instance.address,
          to: this.auctionAccount.instance.address,
          collectionId: parseInt(offer.collection_id),
          tokenId: parseInt(offer.token_id),
        },
        { signer: this.mainAccount.getSigner() },
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

      const block = this.blockchainBlockRepository.create({
        network: this.config.blockchain.unique.network,
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });
      await this.connection.createQueryBuilder().insert().into(BlockchainBlock).values(block).orIgnore().execute();

      offer.block_number_ask = block.block_number;

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

    const saveOffers = await this.offersRepository.save(newOffers);

    for (const item of saveOffers) {
      await this.searchIndex.addSearchIndexIfNotExists({ collectionId: data.collectionId, tokenId: parseInt(item.token_id) });
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Mass fiat listing completed',
      data: saveOffers.map(({ token_id }) => parseInt(token_id)),
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
