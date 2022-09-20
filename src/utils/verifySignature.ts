import { UnauthorizedException } from '@nestjs/common';
import { hexToU8a } from '@polkadot/util';
import { signatureVerify } from '@polkadot/util-crypto';
import { HexString } from '@unique-nft/substrate-client/types';

export const verifySignature = (message?: string, signature?: HexString, address?: string) => {
  try {
    if (!message || !signature || !address) {
      throw new UnauthorizedException('Authorization required');
    }
    const signatureU8a = hexToU8a(signature);
    const verificationResult = signatureVerify(message, signatureU8a, address);
    if (!verificationResult.isValid) {
      throw new Error('Bad signature');
    }
  } catch (e) {
    throw new UnauthorizedException(e.message);
  }
};
