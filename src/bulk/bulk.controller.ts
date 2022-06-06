import { Controller, Post, Body, HttpStatus, Put } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import * as fs from 'fs';

import { BulkSellNotBlockchainInputDto } from './dto/bulk.sell.not.blockchain.input.dto';
import { IsOkOutputDto } from './dto/is.ok.output.dto';

import { BulkService } from './bulk.service';

@ApiTags('Bulk')
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}
  @Post('sell-not-blockchain')
  @ApiOperation({
    summary: 'Put up for sale for money',
    description: fs.readFileSync('docs/bulk/bulk-sell-not-blockchain.md').toString(),
  })
  @ApiResponse({ type: IsOkOutputDto, status: HttpStatus.CREATED })
  async bulkSellNotBlockchain(@Body() input: BulkSellNotBlockchainInputDto) {
    return this.bulkService.bulkSellNotBlockchain(input);
  }

  @Put('remove-from-sale')
  @ApiOperation({
    summary: 'Remove from sale',
    description: fs.readFileSync('docs/bulk/remove-from-sale.md').toString(),
  })
  @ApiResponse({ type: IsOkOutputDto, status: HttpStatus.OK })
  async removeFromSale() {
    return this.bulkService.removeFromSale();
  }
}
