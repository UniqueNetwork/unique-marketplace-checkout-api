/** Unique provider */
export const UNIQUE_SDK_PROVIDER = 'UNIQUE_SDK_PROVIDER';
/** Kusama provider */
export const KUSAMA_SDK_PROVIDER = 'KUSAMA_SDK_PROVIDER';
/** Web3 provider */
export const WEB3_PROVIDER = 'WEB3_PROVIDER';
/** GAS */
export const WEB3_GAS_ARGS = { gas: 2500000 };
/** TODO: need description */
export const WEB3_MICROUNIQUE = 1_000_000_000_000n;
/** TODO: need description */
export const WEB3_MILLIUNIQUE = 1_000n * WEB3_MICROUNIQUE;
/** TODO: need description */
export const WEB3_CENTIUNIQUE = 10n * WEB3_MILLIUNIQUE;
/** TODO: need description */
export const WEB3_UNIQUE = 100n * WEB3_CENTIUNIQUE;

/** TODO: need description */
export const CONTRACT_DEPLOY_COST = 9n * WEB3_UNIQUE;
/** TODO: need description */
export const CONTRACT_MIN_BALANCE = 40n * WEB3_UNIQUE;
/** TODO: need description */
export const ESCROW_MIN_BALANCE = (5n * WEB3_UNIQUE) / 10n;
