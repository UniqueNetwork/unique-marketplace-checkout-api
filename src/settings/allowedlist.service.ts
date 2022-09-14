import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { MarketConfig } from '@app/config';
import { HelperService } from '@app/helpers/helper.service';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { SdkProvider } from '../uniquesdk/sdk-provider';

@Injectable()
export class AllowedListService {
  private web3;
  private contractOwner;
  private logger: Logger;

  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider,
    private web3conn: Web3Service,
    private helper: HelperService,
  ) {
    this.web3 = this.web3conn.web3;

    this.logger = new Logger(AllowedListService.name);
  }

  /**
   * Initialize the web3 connection
   */
  init() {
    if (this.config.blockchain.unique.wsEndpoint === undefined || this.config.blockchain.unique.wsEndpoint === '') {
      new Error('No UNIQUE_WS_ENDPOINT provided');
      return;
    }
    if (this.config.blockchain.unique.contractOwnerSeed === undefined || this.config.blockchain.unique.contractOwnerSeed === null) {
      new Error('No CONTRACT_OWNER_SEED provided enverionment variable');
      return;
    }
    this.contractOwner = this.web3.eth.accounts.privateKeyToAccount(this.config.blockchain.unique.contractOwnerSeed);
  }

  /**
   * Set substitute address to the allowed list sponsorship
   * @param {String} address - address to set
   */
  async setAllowedList(address: string): Promise<any> {
    this.init();
    // Contract address is the address of the market contract
    const contractAddress = this.config.blockchain.unique.contractAddress;
    // Web3 contract
    const helpers = this.web3conn.contractHelpers(this.web3, this.contractOwner.address);
    // Contract
    const contract = new this.web3.eth.Contract(this.getMarketAbi(), contractAddress);
    // Substrate address to ethers address
    const ethAddress = this.web3conn.subToEth(address);
    if (this.web3.eth.accounts.wallet.length === 0) {
      this.web3.eth.accounts.wallet.add(this.contractOwner.privateKey);
    }

    //Check if address is already in the list
    const isAllowed = (await this.uniqueProvider.stateService.allowlist(contractAddress, ethAddress)).json;
    if (!isAllowed) {
      try {
        await helpers.methods.toggleAllowed(contract.options.address, ethAddress, true).send({ from: this.contractOwner.address });
        this.logger.log(`${address} added to the allowed list`);
        return {
          statusCode: HttpStatus.OK,
          message: 'Address added to the allowed list',
          isAllowed: true,
        };
      } catch (error) {
        this.logger.log(`${address} not added to the allowed list`);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          isAllowed: false,
        };
      }
    } else {
      this.logger.log(`${address} already in the allowed list`);
      return {
        statusCode: HttpStatus.OK,
        message: 'Address already in the allowed list',
        isAllowed: isAllowed,
      };
    }
  }

  getMarketAbi() {
    return JSON.parse(this.helper.marketABIStaticFile('MarketPlace.abi'));
  }
}
