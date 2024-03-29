import { Inject } from '@nestjs/common';
import { KUSAMA_SDK_PROVIDER, UNIQUE_SDK_PROVIDER } from './constants';

export const InjectUniqueSDK = () => Inject(UNIQUE_SDK_PROVIDER);
export const InjectKusamaSDK = () => Inject(KUSAMA_SDK_PROVIDER);
