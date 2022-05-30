import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';


import { BulkSellNotBlockchainInputDto } from './bulk.sell.not.blockchain.input.dto';
import { BulkSellNotBlockchainOutputDto } from './bulk.sell.not.blockchain.output.dto';

import { BulkService } from './bulk.service';

@ApiTags('Bulk')
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}
  @Post('sell-not-blockchain')
  @ApiResponse({ type: BulkSellNotBlockchainOutputDto, status: HttpStatus.OK })
  //@ApiExcludeEndpoint()
  async bulkSellNotBlockchain(@Body() input: BulkSellNotBlockchainInputDto) {
    return this.bulkService.bulkSellNotBlockchain(input);
  }
}
