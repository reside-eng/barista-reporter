export const passed = 'passed';
export const failed = 'failed';
export const pending = 'pending';

export const omitList = [
  'fn',
  'async',
  'sync',
  '_timeout',
  '_slow',
  '_enableTimeouts',
  'timedOut',
  '_trace',
  '_retries',
  '_currentRetry',
  'parent',
];

export const prefixesByCiEnv = {
  staging: 'STAGE_',
  production: 'PROD_',
};
