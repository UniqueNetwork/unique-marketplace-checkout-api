import { ApiProperty } from '@nestjs/swagger';
import { OffersEntity } from '../../entity';
import { AuctionStatus, Bid, BidStatus, TokenDescription } from '../../types';
import { Exclude, Expose, plainToInstance, Type } from 'class-transformer';
import { AuctionOffer } from '../../types/auction';

export class AuctionDto implements AuctionOffer {
  @Exclude() @ApiProperty({ example: 'afb625bf-d9b0-4f41-98d0-ae88814744f9' }) id: string;
  @Exclude() createdAt: Date;
  @Exclude() updatedAt: Date;

  @Expose() @ApiProperty({ example: '10' }) priceStep: string;
  @Expose() @ApiProperty({ example: '100' }) startPrice: string;
  @Expose() @ApiProperty({ example: 'active' }) status: AuctionStatus;
  @Expose() @ApiProperty({ example: '2022-06-24T14:32:00.833Z' }) stopAt: Date;

  @Expose()
  @Type(() => BidDto)
  bids?: BidDto[];
}

class BidDto implements Bid {
  @Exclude() id: string;
  @Exclude() auctionId: string;
  @Exclude() isWithdrawn: boolean;
  @Exclude() status: BidStatus;

  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
  @Expose() amount: string;
  @Expose() balance: string;
  @Expose() bidderAddress: string;
}

export class TokenDescriptionDto {
  @Expose() @ApiProperty({ example: 'Test' }) collectionName: string;
  @Expose() image: string;
  @Expose() video: string;
  @Expose() @ApiProperty({ example: 'TEST' }) prefix: string;
  @Expose() @ApiProperty({ example: 'Test collection' }) description: string;
  @Expose() collectionCover: string;
  @Expose() @ApiProperty({ example: '5CSxpZepJj5dxkSBEDnN23pgg6B5X6VFRJ2kyubhb5Svstuu' }) owner: string;
  @Expose() collectionId: number;
  @Expose() @ApiProperty({ example: '1' }) tokenId: string;
  @Expose() attributes: Array<TokenDescription>;
  @Expose() nestingChildTokens: Array<any>;
}

export class CollectionDescriptionDto {
  @Expose() @ApiProperty({ example: 'NFT' }) mode: string;
  @Expose() @ApiProperty({ example: 'Test' }) name: string;
  @Expose() @ApiProperty({ example: 'Test collection' }) description: string;
  @Expose() @ApiProperty({ example: 'NFT' }) tokenPrefix: string;
  @Expose() id: number;
  @Expose() owner: string;
  @Expose() schema: any;
}

export class OfferEntityDto {
  @ApiProperty({ description: 'Collection ID', example: 16 })
  @Expose()
  collectionId: number;
  @ApiProperty({ description: 'Token ID', example: 4 })
  @Expose()
  tokenId: number;
  @ApiProperty({ description: 'Price', example: '100' })
  @Expose()
  price: string;
  @ApiProperty({ description: 'Contract ask currency', example: 0 })
  @Expose()
  quoteId: number;
  @ApiProperty({ description: 'Contract ask from', example: '5CfC8HRcV5Rc4jHFHmZsSjADCMYc7zoWbvxdoNG9qwEP7aUB' })
  @Expose()
  seller: string;

  @ApiProperty({ description: 'Type offer' })
  @Expose()
  type: string;

  @ApiProperty({ description: 'Status offer' })
  @Expose()
  status: string;

  @ApiProperty({ description: 'Date blockchain block created' })
  @Expose()
  creationDate: Date;

  @ApiProperty({ required: false })
  @Expose()
  @Type(() => AuctionDto)
  auction?: AuctionDto;

  @ApiProperty({ description: 'Token description' })
  @Expose()
  @Type(() => TokenDescriptionDto)
  tokenDescription: TokenDescriptionDto;

  @ApiProperty({ description: 'Collection description' })
  @Expose()
  @Type(() => CollectionDescriptionDto)
  collectionDescription: CollectionDescriptionDto;

  static fromOffersEntity(offersData: OffersEntity): OfferEntityDto {
    const plain: Record<string, any> = {
      ...offersData,
      collectionId: +offersData.collection_id,
      tokenId: +offersData.token_id,
      price: offersData.price.toString(),
      quoteId: +offersData.currency,
      seller: offersData.address_from,
      creationDate: offersData.created_at,
      status: offersData.status,
      types: offersData.type,
    };

    if (offersData?.bids?.length) {
      offersData.bids = offersData.bids.sort((a, b) => {
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    return plainToInstance<OfferEntityDto, Record<string, any>>(OfferEntityDto, plain, {
      excludeExtraneousValues: true,
    });
  }
}
