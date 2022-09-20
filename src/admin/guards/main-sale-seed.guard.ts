import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MarketConfig } from '../../config/market-config';
import { Keyring } from '@polkadot/api';
import { UNAUTHORIZED_ADMIN_ERROR_MESSAGE } from '../constants';

@Injectable()
export class MainSaleSeedGuard implements CanActivate {
  constructor(private jwtService: JwtService, @Inject('CONFIG') private config: MarketConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const { adminAddress } = req;

    const { bulkSaleSeed } = this.config;

    if (!bulkSaleSeed) throw new UnauthorizedException(UNAUTHORIZED_ADMIN_ERROR_MESSAGE);

    const keyring = new Keyring({ type: 'sr25519' });

    const signer = keyring.addFromUri(bulkSaleSeed);

    const mainSaleSeedAddress = signer.address;

    if (mainSaleSeedAddress !== adminAddress) throw new UnauthorizedException(UNAUTHORIZED_ADMIN_ERROR_MESSAGE);

    return true;
  }
}
