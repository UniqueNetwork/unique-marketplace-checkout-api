import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UseInterceptors,
  ParseIntPipe,
  Post,
  Body,
  HttpCode,
  ValidationPipe,
  Delete,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBadRequestResponse, ApiConflictResponse } from '@nestjs/swagger';
import * as fs from 'fs';

import { OffersService } from './offers.service';
import {
  OfferTraits,
  OfferEntityDto,
  OffersFilter,
  OfferAttributesDto,
  OfferAttributes,
  PayOfferResponseDto,
  PayOfferDto,
  BadRequestResponse,
  ConflictResponse,
  CreateFiatInput,
  OfferFiatDto,
  CancelFiatInput,
} from './dto';
import { ParseOffersFilterPipe, ParseOffersAttributes } from './pipes';

import { PaginationRequest } from '../utils/pagination/pagination-request';
import { PaginationResultDto } from '../utils/pagination/pagination-result';
import { OfferSortingRequest } from '../utils/sorting/sorting-request';
import { TraceInterceptor } from '../utils/sentry';
import { PayOffersService } from './pay.service';
import { verifySignature } from '@app/utils';

@ApiTags('Offers')
@Controller()
@UseInterceptors(TraceInterceptor)
export class OffersController {
  constructor(private readonly offersService: OffersService, private readonly payOffersService: PayOffersService) {}

  @Get('offers')
  @ApiOperation({
    summary: 'Get offers, filters and seller',
    description: fs.readFileSync('docs/offers.md').toString(),
  })
  @ApiResponse({ type: OfferEntityDto, status: HttpStatus.OK })
  get(
    @Query() pagination: PaginationRequest,
    @Query(ParseOffersFilterPipe) offersFilter: OffersFilter,
    @Query() sort: OfferSortingRequest,
  ): Promise<PaginationResultDto<OfferEntityDto>> {
    return this.offersService.get(pagination, offersFilter, sort);
  }

  @Get('offer/:collectionId/:tokenId')
  @ApiResponse({ type: OfferEntityDto, status: HttpStatus.OK })
  async getOneOffer(
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('tokenId', ParseIntPipe) tokenId: number,
  ): Promise<OfferEntityDto> {
    const offer = await this.offersService.getOne({ collectionId, tokenId });

    if (offer) {
      return offer;
    } else {
      throw new NotFoundException(`No active offer for collection ${collectionId}, token ${tokenId}`);
    }
  }

  @Get('attributes/:collectionId')
  @ApiOperation({
    summary: 'Get attributes by collectionId',
  })
  @ApiResponse({ type: OfferTraits, status: HttpStatus.OK })
  async getTraitsByCollection(@Param('collectionId', ParseIntPipe) collectionId: number): Promise<OfferTraits> {
    const traits = await this.offersService.getAttributes(collectionId);

    if (traits) return traits;

    throw new NotFoundException(`No found  collection ${collectionId} in offer`);
  }

  @Get('attribute-counts')
  @ApiOperation({
    summary: 'Get count of attributes by collectionId',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OfferAttributes })
  async getAttributeCounts(@Query(ParseOffersAttributes) offerAttributes: OfferAttributesDto): Promise<Array<OfferAttributes>> {
    return this.offersService.getAttributesCounts(offerAttributes);
  }

  @ApiOperation({
    summary: 'To pay offer to from card',
    description: fs.readFileSync('docs/fiat_pay.md').toString(),
  })
  @ApiResponse({ type: PayOfferResponseDto, status: HttpStatus.CREATED })
  @Post('pay')
  async pay(@Body() input: PayOfferDto): Promise<PayOfferResponseDto> {
    return this.payOffersService.payOffer(input);
  }

  @Post('create_fiat_offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create fiat offer',
    description: fs.readFileSync('docs/create_fiat_offer.md').toString(),
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OfferFiatDto })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  async createFiat(@Body(new ValidationPipe({ transform: true })) createFiatInput: CreateFiatInput): Promise<OfferFiatDto> {
    return this.payOffersService.createFiat(createFiatInput);
  }

  @Delete('cancel_fiat_offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel fiat offer',
    description: fs.readFileSync('docs/cancel_fiat_offer.md').toString(),
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OfferFiatDto })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiConflictResponse({ type: ConflictResponse })
  async cancelFiat(@Query() cancelFiatInput: CancelFiatInput): Promise<OfferFiatDto> {
    verifySignature('cancel_fiat_offer', cancelFiatInput.signature, cancelFiatInput.sellerAddress);
    return this.payOffersService.cancelFiat(cancelFiatInput);
  }
}
