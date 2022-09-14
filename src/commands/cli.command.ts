import { Injectable } from '@nestjs/common';
import { Command, CommandPositionalOption, Option, Positional } from 'nestjs-command';
import { StartMarketService } from '@app/commands/services/start-market.service';
import { CheckConfigCommandService } from '@app/commands/services/check-config.service';
import { CollectionCommandService } from '@app/commands/services/collection.service';
import { DeployContractService } from '@app/commands/services/deploy-contract.service';

@Injectable()
export class CliCommands {
  constructor(
    private readonly checkoutConfigService: CheckConfigCommandService,
    private readonly collectionService: CollectionCommandService,
    private readonly deployContractService: DeployContractService,
    private readonly startMarketService: StartMarketService,
  ) {}

  /**
   *
   */
  @Command({
    command: 'checkconfig',
    describe: 'Checking the collection configuration',
  })
  async showSetting() {
    await this.checkoutConfigService.checkoutCollecetionMain();
  }

  /**
   * Deploy contract
   */
  @Command({
    command: 'deploy contract',
    describe: 'Deploy contract',
  })
  async deployContract() {
    await this.deployContractService.init();
    await this.deployContractService.deploy();
  }

  /**
   * Deploy market
   */
  @Command({
    command: 'deploymarket',
    describe: 'Deploy market for start',
  })
  async deployMarket() {
    await this.startMarketService.setup();
    await this.startMarketService.destroy();
  }

  @Command({
    command: 'startmarket',
    describe: 'Start market for start',
  })
  async startMarket() {
    await this.startMarketService.setup();
    await this.startMarketService.destroy();
  }

  /**
   *
   * @param collection
   * @param token
   * @param depth
   * @param wss
   */
  @Command({
    command: 'check collection <id>',
    describe: 'Get collection data',
  })
  async showCollections(
    @Positional({ name: 'id', describe: 'ID collection', type: 'string' } as CommandPositionalOption)
    collection: string,
    @Option({ name: 'token', describe: 'Get token ID', type: 'string', alias: 't', required: false } as CommandPositionalOption)
    token: string,
    @Option({
      name: 'depth',
      describe: 'Object view depth',
      type: 'string',
      alias: 'd',
      default: 1,
      required: false,
    } as CommandPositionalOption)
    depth: number,
    @Option({ name: 'wsEndpoint', describe: 'WSS Endpoint', type: 'string', alias: 'w', required: false } as CommandPositionalOption)
    wss: string,
  ) {
    const data = { collection, token, depth, wss };
    await this.collectionService.showCollection(data);
  }
}
