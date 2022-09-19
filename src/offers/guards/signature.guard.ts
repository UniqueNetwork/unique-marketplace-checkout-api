import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { hexToU8a } from '@polkadot/util';
import { signatureVerify } from '@polkadot/util-crypto';

@Injectable()
export class CancelFiatGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    try {
      const authHeader = req.headers.authorization;
      const bearer = authHeader.split(' ')[0];
      const signature = authHeader.split(' ')[1];
      const signerAddress = req.query.sellerAddress;
      const payload = 'cancel_fiat_offer';

      if (bearer !== 'Bearer' || !signature || !signerAddress) {
        throw new UnauthorizedException('Authorization required');
      }

      const signatureU8a = hexToU8a(signature);
      const verificationResult = signatureVerify(payload, signatureU8a, signerAddress);

      if (!verificationResult.isValid) {
        throw new Error('Bad signature');
      }
      return true;
    } catch (e) {
      throw new UnauthorizedException('Access denied');
    }
  }
}
