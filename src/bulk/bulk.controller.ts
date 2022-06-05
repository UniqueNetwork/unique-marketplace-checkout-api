import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import * as fs from 'fs';

import { BulkSellNotBlockchainInputDto } from './bulk.sell.not.blockchain.input.dto';
import { BulkSellNotBlockchainOutputDto } from './bulk.sell.not.blockchain.output.dto';

import { BulkService } from './bulk.service';

@ApiTags('Bulk')
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}
  @Post('sell-not-blockchain')
  @ApiOperation({
    summary: 'Put up for sale for money',
    description: fs.readFileSync('docs/bulk-sell-not-blockchain.md').toString(),
  })
  @ApiResponse({ type: BulkSellNotBlockchainOutputDto, status: HttpStatus.CREATED })
  async bulkSellNotBlockchain(@Body() input: BulkSellNotBlockchainInputDto) {
    return this.bulkService.bulkSellNotBlockchain(input);
  }
}
