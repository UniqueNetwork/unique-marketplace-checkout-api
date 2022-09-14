import { Command, Option, Positional } from 'nestjs-command';
import { ModuleRef } from '@nestjs/core';
import { Injectable } from '@nestjs/common';

import { KusamaEscrow } from './kusama';
import { UniqueEscrow } from './unique';
import { EscrowService } from './service';
import { Escrow } from './base';
import { AuctionClosingScheduler } from '../auction/services/closing/auction-closing.scheduler';
import { PostgresIoAdapter } from '../broadcast/services/postgres-io.adapter';
import { MarketConfig } from '@app/config';
import { BroadcastService } from '../broadcast/services/broadcast.service';
import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { SdkProvider } from '../uniquesdk/sdk-provider';

@Injectable()
export class EscrowCommand {
  constructor(
    private moduleRef: ModuleRef,
    @InjectUniqueSDK() private readonly unique: SdkProvider,
    @InjectKusamaSDK() private readonly kusama: SdkProvider,
  ) {}

  @Command({
    command: 'start_escrow <network>',
    describe: 'Starts escrow service for selected network',
  })
  async start_escrow(@Positional({ name: 'network' }) network: string, @Option({ name: 'auction' }) isAuctionManager = false) {
    const networks: Record<string, typeof Escrow> = {
      unique: UniqueEscrow,
      kusama: KusamaEscrow,
    };

    if (!networks.hasOwnProperty(network)) {
      console.error(`No escrow service for ${network} network`);
      return;
    }

    if (isAuctionManager) this.startAuctionManager();

    const config = this.moduleRef.get('CONFIG', { strict: false });
    const service = this.moduleRef.get(EscrowService, { strict: false });
    const web3service = this.moduleRef.get(Web3Service, { strict: false });

    const escrow = new networks[network](config, service, network === 'unique' ? this.unique.sdk : this.kusama.sdk, web3service);

    await escrow.init();

    await escrow.work();
  }

  private startAuctionManager(): void {
    setImmediate(() => {
      const broadcastService = this.moduleRef.get<BroadcastService>(BroadcastService, { strict: false });
      const auctionClosingScheduler = this.moduleRef.get(AuctionClosingScheduler, { strict: false });

      if (!broadcastService.isInitialized) {
        const config = this.moduleRef.get<MarketConfig>('CONFIG', { strict: false });
        const ioEmitter = PostgresIoAdapter.createIOEmitter(config);

        broadcastService.init(ioEmitter);
      }

      auctionClosingScheduler.startIntervals();
    });
  }
}
