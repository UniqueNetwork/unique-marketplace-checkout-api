import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuctionCreationService } from './services/auction-creation.service';
import { BidPlacingService } from './services/bid-placing.service';
import {
  CalculationInfoResponseDto,
  CalculationRequestDto,
  CancelAuctionQueryDto,
  CreateAuctionRequestDto,
  OwnerWithdrawBidQueryDto,
  PlaceBidRequestDto,
  WithdrawBidChosenQueryDto,
  WithdrawBidQueryDto,
} from './requests';

import { SignatureVerifier } from './services/helpers/signature-verifier';
import { AuctionCancelingService } from './services/auction-canceling.service';
import { BidWithdrawService } from './services/bid-withdraw.service';
import { TraceInterceptor } from '@app/utils/sentry';
import { BadRequestResponse, BidsWitdrawByOwnerDto, ConflictResponse, UnauthorizedResponse } from './responses';
import * as fs from 'fs';
import { DateHelper } from '@app/utils/date-helper';
import { OfferEntityDto } from '@app/offers/dto';
import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { Sdk } from '@unique-nft/substrate-client';
import { HelperService } from '@app/helpers/helper.service';

@ApiTags('Auction')
@Controller('auction')
@UseInterceptors(TraceInterceptor)
export class AuctionController {
  private logger: Logger;
  constructor(
    private readonly auctionCreationService: AuctionCreationService,
    private readonly auctionCancellingService: AuctionCancelingService,
    private readonly bidPlacingService: BidPlacingService,
    private readonly bidWithdrawService: BidWithdrawService,
    private readonly signatureVerifier: SignatureVerifier,
    @InjectKusamaSDK() private kusamaApi: Sdk,
    @InjectUniqueSDK() private uniqueApi: Sdk,
    private helper: HelperService,
  ) {
    this.logger = new Logger(AuctionController.name);
  }

  /**
   * Create auction with signature verification
   * @param createAuctionRequest
   */
  @Post('create_auction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create an auction',
    description: fs.readFileSync('docs/create_auction.md').toString(),
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OfferEntityDto })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiConflictResponse({ type: ConflictResponse })
  async createAuction(
    @Body(new ValidationPipe({ transform: true })) createAuctionRequest: CreateAuctionRequestDto,
  ): Promise<OfferEntityDto> {
    DateHelper.checkDateAndMinutes(createAuctionRequest.days, createAuctionRequest.minutes);
    try {
      return await this.auctionCreationService.create(createAuctionRequest);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Place bid with signature verification
   * @param placeBidRequest
   */
  @Post('place_bid')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.CREATED, type: OfferEntityDto })
  @ApiOperation({
    summary: 'Placing a bid in an auction',
    description: fs.readFileSync('docs/place_bid_auction.md').toString(),
  })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  async placeBid(@Body() placeBidRequest: PlaceBidRequestDto): Promise<OfferEntityDto> {
    return await this.bidPlacingService.placeBid(placeBidRequest);
  }

  /**
   * Calculate the amount of tokens to withdraw from the auction
   * @param calculationRequest
   */
  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.CREATED, type: CalculationInfoResponseDto })
  @ApiOperation({
    summary: 'Calculation',
    description: fs.readFileSync('docs/calculation.md').toString(),
  })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  async calculate(@Body() calculationRequest: CalculationRequestDto): Promise<CalculationInfoResponseDto> {
    try {
      const bidderAddress = await this.helper.convertAddress(calculationRequest.bidderAddress, this.kusamaApi.api.registry.chainSS58);

      const [calculationInfo] = await this.bidPlacingService.getCalculationInfo({
        ...calculationRequest,
        bidderAddress,
      });

      return CalculationInfoResponseDto.fromCalculationInfo(calculationInfo);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   *  Delete auction
   * @param query
   * @param authorization
   * @param req
   */
  @Delete('cancel_auction')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, type: OfferEntityDto })
  @ApiOperation({
    summary: 'Canceled an auction',
    description: fs.readFileSync('docs/cancel_auction.md').toString(),
  })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponse })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiSecurity('address:signature')
  async cancelAuction(
    @Query() query: CancelAuctionQueryDto,
    @Headers('Authorization') authorization = '',
    @Req() req: Request,
  ): Promise<OfferEntityDto> {
    AuctionController.checkRequestTimestamp(query.timestamp);
    const [signerAddress = '', signature = ''] = authorization.split(':');
    const queryString = req.originalUrl.split('?')[1];

    await this.signatureVerifier.verify({
      payload: queryString,
      signature,
      signerAddress,
    });

    const ownerAddress = await this.helper.convertAddress(signerAddress, this.uniqueApi.api.registry.chainSS58);
    this.logger.debug;
    return this.auctionCancellingService.tryCancelAuction({
      collectionId: query.collectionId,
      tokenId: query.tokenId,
      ownerAddress,
    });
  }

  @Delete('withdraw_bid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw bid',
    description: fs.readFileSync('docs/withdraw_bid.md').toString(),
  })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponse })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiSecurity('address:signature')
  async withdrawBid(@Query() query: WithdrawBidQueryDto, @Headers('Authorization') authorization = '', @Req() req: Request): Promise<void> {
    AuctionController.checkRequestTimestamp(query.timestamp);
    const [signerAddress = '', signature = ''] = authorization.split(':');
    const queryString = req.originalUrl.split('?')[1];

    await this.signatureVerifier.verify({
      payload: queryString,
      signature,
      signerAddress,
    });

    const bidderAddress = await this.helper.convertAddress(signerAddress, this.kusamaApi.api.registry.chainSS58);

    await this.bidWithdrawService.withdrawBidByBidder({
      collectionId: query.collectionId,
      tokenId: query.tokenId,
      bidderAddress,
    });
  }

  @Get('withdraw_bids')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get bids',
    description: fs.readFileSync('docs/list_withdraw_bid.md').toString(),
  })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiResponse({ status: HttpStatus.OK, type: BidsWitdrawByOwnerDto })
  async getTokenWithdrawBid(@Query() query: OwnerWithdrawBidQueryDto): Promise<BidsWitdrawByOwnerDto> {
    return this.bidWithdrawService.getBidsForWithdraw(query.owner);
  }

  @Delete('withdraw_choose_bid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw choose bid',
    description: fs.readFileSync('docs/withdraw_choose_bid.md').toString(),
  })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponse })
  @ApiBadRequestResponse({ type: BadRequestResponse })
  @ApiSecurity('address:signature')
  async withdrawChooseBid(
    @Query() query: WithdrawBidChosenQueryDto,
    @Headers('Authorization') authorization = '',
    @Req() req: Request,
  ): Promise<void> {
    AuctionController.checkRequestTimestamp(query.timestamp);
    const [signerAddress = '', signature = ''] = authorization.split(':');
    const queryString = req.originalUrl.split('?')[1];

    await this.signatureVerifier.verify({
      payload: queryString,
      signature,
      signerAddress,
    });

    const bidderAddress = await this.helper.convertAddress(signerAddress, this.kusamaApi.api.registry.chainSS58);

    await this.bidWithdrawService.withdrawBidsByBidder({
      bidderAddress,
      auctionIds: Array.isArray(query.auctionId) ? query.auctionId : [query.auctionId],
    });
  }

  // todo - make custom validator?
  private static checkRequestTimestamp(timestamp: number): void {
    const maxShiftMinutes = 10;

    const shift = Math.abs(timestamp - Date.now());

    if (shift > maxShiftMinutes * 60 * 1000) {
      const shiftMinutes = (shift / (60 * 1000)).toFixed(2);

      const message = `Max request timestamp shift is ${maxShiftMinutes} minutes, current is ${shiftMinutes} minutes. Please send new request`;

      throw new BadRequestException(message);
    }
  }
}
