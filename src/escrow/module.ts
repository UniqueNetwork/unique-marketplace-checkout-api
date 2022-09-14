import { Module } from '@nestjs/common';
import { EscrowCommand } from './command';
import { EscrowService } from './service';
import { ConfigServiceModule } from '@app/config/module';
import { UniqueSdkModule } from '@app/uniquesdk/sdk.module';
import { DatabaseORMModule } from '@app/database/database.module';

@Module({
  providers: [EscrowCommand, EscrowService],
  exports: [EscrowCommand, EscrowService],
  imports: [DatabaseORMModule, ConfigServiceModule, UniqueSdkModule],
})
export class EscrowModule {}
