import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkSellNotBlockchainOutputDto {
  @ApiProperty()
  @IsBoolean()
  isOk: boolean;
}
