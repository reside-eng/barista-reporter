export const PASSED = 'passed';
export const FAILED = 'failed';
export const PENDING = 'pending';

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

export const BARISTA_API_BASE_URL =
  'https://us-central1-barista-stage.cloudfunctions.net/api/';

export const BARISTA_API_STAGE_BASE_URL =
  'https://us-central1-barista-stage.cloudfunctions.net/api/';

export const BARISTA_API_LOCAL_BASE_URL =
  'http://localhost:5000/barista-stage/us-central1/api/';
