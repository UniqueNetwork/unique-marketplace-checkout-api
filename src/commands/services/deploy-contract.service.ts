import { Inject, Injectable } from '@nestjs/common';
import { MarketConfig } from '@app/config';
import { evmToAddress } from '@polkadot/util-crypto';
import * as logging from '@app/utils/logging';
import { signTransaction, TransactionStatus } from '@app/utils/blockchain';
import { InjectUniqueSDK, SdkProvider } from '@app/uniquesdk';
import { HelperService } from '@app/helpers/helper.service';
import { SponsoringMode, WEB3_GAS_ARGS, WEB3_UNIQUE } from '@app/uniquesdk';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { ApiPromise } from '@polkadot/api';

@Injectable()
export class DeployContractService {
  private helperService = new HelperService();
  private summary: string[] = [];
  private api: ApiPromise;
  private web3;
  private ownerSeed: string;

  private DEPLOY_COST = 9n * WEB3_UNIQUE;
  private CONTRACT_MIN_BALANCE = 40n * WEB3_UNIQUE;
  private ESCROW_MIN_BALANCE = (5n * WEB3_UNIQUE) / 10n;

  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    @InjectUniqueSDK() private readonly uniqueSdk: SdkProvider,
    private web3conn: Web3Service,
  ) {
    this.web3 = web3conn.web3;
    this.ownerSeed = config.blockchain.unique.contractOwnerSeed;
  }

  /**
   * Initialize the service.
   */
  async init() {
    if (this.config.blockchain.escrowSeed === null) {
      logging.log('You need to set ESCROW_SEED env or override config "blockchain.escrowSeed" section');
      return;
    }

    logging.log(['WS endpoint:', this.config.blockchain.unique.wsEndpoint]);
    this.api = this.uniqueSdk.sdk.api;
  }

  /**
   *
   * @param x
   */
  numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{18})+(?!\d))/g, ',');
  }
  /**
   * Disconnect the service.
   * @private
   */
  private async disconnect() {
    if (this.summary.length) {
      console.log(`\n\n\nSUMMARY:\n\n${this.summary.join('\n')}`);
    }
    this.web3conn.disconnect();
    await this.api.disconnect();
    process.exit(0);
  }
  private async getBalance(address) {
    return ((await this.api.query.system.account(address)) as any).data.free.toBigInt();
  }
  private async addSubstrateMirror(address) {
    this.summary.push(`\n\nSubstrate mirror of contract address (for balances): ${evmToAddress(address)}`);
    this.summary.push(`Current contract balance: ${this.numberWithCommas(await this.getBalance(evmToAddress(address)))}`);
  }

  /**
   * Deploy the contract.
   */
  async deploy() {
    const escrow = this.helperService.privateKey(this.config.blockchain.escrowSeed);

    logging.log(['Escrow substrate address:', escrow.address]);
    {
      const balance = await this.getBalance(escrow.address);
      logging.log(['Balance on escrow:', this.numberWithCommas(balance.toString())]);
    }
    if (this.config.blockchain.unique.contractOwnerSeed === null) {
      logging.log('No existed CONTRACT_ETH_OWNER_SEED, creating new eth account');
      const balance = await this.getBalance(escrow.address);
      const minBalance = this.CONTRACT_MIN_BALANCE + this.ESCROW_MIN_BALANCE + this.DEPLOY_COST;
      if (balance < minBalance) {
        logging.log(['Balance on account', escrow.address, 'too low to create eth account. Need at least', minBalance.toString()]);
        return await this.disconnect();
      }
      const account = this.web3.eth.accounts.create();

      const result = await signTransaction(
        escrow,
        this.api.tx.balances.transfer(evmToAddress(account.address), this.DEPLOY_COST),
        'api.tx.balances.transfer',
      );
      if (result.status !== TransactionStatus.SUCCESS) {
        logging.log(
          ['Unable to transfer', this.DEPLOY_COST.toString(), 'from', escrow.address, 'to', evmToAddress(account.address)],
          logging.level.ERROR,
        );
        logging.log(result.result.toHuman(), logging.level.ERROR);
        return await this.disconnect();
      }

      logging.log(['Your new eth account seed:', account.privateKey]);
      logging.log(['Your new eth account address:', account.address]);
      logging.log('Set it to CONTRACT_ETH_OWNER_SEED env or override config "blockchain.unique.contractOwnerSeed" section');
      this.ownerSeed = account.privateKey;
    }
    this.summary.push(`CONTRACT_ETH_OWNER_SEED: '${this.ownerSeed}'`);
    if (this.config.blockchain.unique.contractAddress !== null) {
      logging.log(
        'Contract already deployed. Check your CONTRACT_ADDRESS env or "blockchain.unique.contractAddress" config section',
        logging.level.WARNING,
      );

      this.summary.push(`CONTRACT_ADDRESS: '${this.config.blockchain.unique.contractAddress}'`);
      await this.addSubstrateMirror(this.config.blockchain.unique.contractAddress);

      return await this.disconnect();
    }
    const balance = await this.getBalance(escrow.address);
    const minBalance = this.CONTRACT_MIN_BALANCE + this.ESCROW_MIN_BALANCE;
    if (balance < minBalance) {
      logging.log(
        ['Balance on account', escrow.address, 'too low to deploy contract. Need at least', minBalance.toString()],
        logging.level.WARNING,
      );
      return await this.disconnect();
    }
    logging.log('Deploy contract...');
    const account = this.web3.eth.accounts.privateKeyToAccount(this.ownerSeed);
    this.web3.eth.accounts.wallet.add(account.privateKey);

    const contractAbi = new this.web3.eth.Contract(JSON.parse(this.helperService.marketABIStaticFile('MarketPlace.abi')), undefined, {
      from: account.address,
      ...WEB3_GAS_ARGS,
    });
    const contract = await contractAbi
      .deploy({ data: this.helperService.marketABIStaticFile('MarketPlace.bin') })
      .send({ from: account.address, gas: 5_000_000 });
    logging.log('Set escrow...');
    await contract.methods.setEscrow(account.address, true).send({ from: account.address });
    const helpers = this.web3conn.contractHelpers(this.web3, account.address);
    logging.log('Set sponsoring mode...');
    // await helpers.methods.toggleSponsoring(contract.options.address, true).send({from: account.address});
    await helpers.methods.setSponsoringMode(contract.options.address, SponsoringMode.Allowlisted).send({ from: account.address });
    logging.log('Set sponsoring rate limit...');
    await helpers.methods.setSponsoringRateLimit(contract.options.address, 0).send({ from: account.address });
    logging.log('Transfer balance...');
    const result = await signTransaction(
      escrow,
      this.api.tx.balances.transfer(evmToAddress(contract.options.address), this.CONTRACT_MIN_BALANCE),
      'api.tx.balances.transfer',
    );
    if (result.status !== TransactionStatus.SUCCESS) {
      logging.log(
        ['Unable to transfer', this.CONTRACT_MIN_BALANCE.toString(), 'from', escrow.address, 'to', evmToAddress(contract.options.address)],
        logging.level.ERROR,
      );
      logging.log(result.result.toHuman(), logging.level.ERROR);
      return await this.disconnect();
    }
    logging.log('All done');
    logging.log(['Your new contract address:', contract.options.address]);
    logging.log('Set it to CONTRACT_ADDRESS env or override config "blockchain.unique.contractAddress"');
    this.summary.push(`CONTRACT_ADDRESS: '${contract.options.address}'`);
    await this.addSubstrateMirror(contract.options.address);

    return await this.disconnect();
  }
}
