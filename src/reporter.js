/* eslint-disable no-console */
import mocha from 'mocha';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { reduce, set, isFunction, isUndefined, omit, get } from 'lodash';
import {
  prefixesByCiEnv,
  omitList,
  passed,
  failed,
  pending,
} from './constants';

/**
 * Get prefix for current environment based on environment vars available
 * within CI. Falls back to staging (i.e. STAGE)
 * @return {String} Environment prefix string
 */
function getEnvPrefix() {
  return (
    prefixesByCiEnv[process.env.CI_ENVIRONMENT_SLUG] || prefixesByCiEnv.staging
  );
}

/**
 * Get environment variable based on the current CI environment
 * @param  {String} varNameRoot - variable name without the environment prefix
 * @return {Any} Value of the environment variable
 * @example
 * envVarBasedOnCIEnv('FIREBASE_PROJECT_ID')
 * // => 'fireadmin-stage' (value of 'STAGE_FIREBASE_PROJECT_ID' environment var)
 */
function envVarBasedOnCIEnv(varNameRoot) {
  const prefix = getEnvPrefix();
  const combined = `${prefix}${varNameRoot}`;
  if (!process.env.CI && !process.env.CI_ENVIRONMENT_SLUG) {
    const localTestConfigPath = path.join(
      process.cwd(),
      'cypress',
      'config.json',
    );
    const configObj = require(localTestConfigPath); // eslint-disable-line global-require, import/no-dynamic-require
    console.log(
      `Running in local environment, ${
        configObj[combined] ? combined : varNameRoot
      } is being loaded from cypress/config.json`,
    );
    return configObj[combined] || configObj[varNameRoot];
  }
  return process.env[combined] || process.env[varNameRoot];
}

let adminInstance;

function initializeFirebase() {
  try {
    if (!adminInstance) {
      const serviceAccountPath = path.join(
        process.cwd(),
        'serviceAccount.json',
      );
      if (!fs.existsSync(serviceAccountPath)) {
        const missingAccountErr = `Service account not found, check: ${serviceAccountPath}`;
        console.error(missingAccountErr);
        throw new Error(missingAccountErr);
      }
      const serviceAccount = require(serviceAccountPath); // eslint-disable-line global-require, import/no-dynamic-require
      adminInstance = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${envVarBasedOnCIEnv(
          'FIREBASE_PROJECT_ID',
        )}.firebaseio.com`,
      });
    }
    return adminInstance;
  } catch (err) {
    console.log(
      'Error initializing firebase-admin instance from service account.',
    );
    throw err;
  }
}

function sanitizeTest(test) {
  const cleanedTest = omit(test, omitList);
  return reduce(
    cleanedTest,
    (acc, value, key) => {
      if (isFunction(value)) {
        return acc;
      }
      if (isUndefined(value)) {
        return set(acc, key, null);
      }
      return set(acc, key, value);
    },
    {},
  );
}

function writeToDatabase(dbRef, data) {
  console.log(`writing to Firebase at path: ${dbRef.path}`);
  return dbRef.update(data).catch(err => {
    console.log(`error writing data to Firebase at path: ${dbRef.path}`); // eslint-disable-line no-console
    return Promise.reject(err);
  });
}

export default function MyReporter(runner) {
  const fbInstance = initializeFirebase();
  const testJobKey = process.env.TEST_JOB_KEY || 'testJobKey';
  const dbRef = fbInstance
    .database()
    .ref('test_results_data')
    .child(testJobKey);

  const metaRef = fbInstance
    .database()
    .ref('test_results_meta')
    .child(testJobKey);

  mocha.reporters.Base.call(this, runner);

  let currentSuiteTitle = '';

  function getTestRef(test) {
    return dbRef.child(currentSuiteTitle).child(test.id);
  }

  runner.on('start', () => {
    writeToDatabase(metaRef, { status: pending, [pending]: true });
  });
  runner.on('end', async function onRunnerEnd() {
    const { passes, failures, end } = this.stats;
    console.log('Test run end: %d/%d', passes, passes + failures); // eslint-disable-line no-console
    await metaRef
      .child('stats')
      .once('value')
      .then(testJobMetaStatsSnap => {
        const existingStats = testJobMetaStatsSnap.val();
        const newStats = reduce(
          this.stats,
          (stats, value, key) => {
            if (key === 'start') {
              return stats;
            }
            if (key === 'end') {
              return set(stats, key, end);
            }
            return set(stats, key, value + get(existingStats, key, 0));
          },
          {},
        );
        writeToDatabase(metaRef.child('stats'), newStats).then(() => {
          const hasFailures =
            failures > 0 || get(existingStats, failures, 0) > 0;
          console.log('hasFailures', hasFailures);
          if (hasFailures) {
            return writeToDatabase(metaRef, { status: failed, pending: false });
          }
          return writeToDatabase(metaRef, { status: passed, pending: false });
        });
      });
  });

  // when the new test file is loaded
  runner.on('suite', suite => {
    if (suite.title) {
      currentSuiteTitle = suite.title;
    }
  });
  runner.on('suite end', () => {
    currentSuiteTitle = '';
  });
  runner.on('test', test => {
    writeToDatabase(getTestRef(test), { state: 'pending' });
    writeToDatabase(metaRef, { pending: true });
  });
  runner.on('test end', test => {
    writeToDatabase(getTestRef(test), sanitizeTest(test));
  });

  runner.on('pass', test => {
    writeToDatabase(getTestRef(test), { state: 'pass' });
  });
  runner.on('fail', (test, err) => {
    writeToDatabase(getTestRef(test), { state: 'failed' });
    console.log('Test fail: %s -- error: %s', test.title, err.message);
  });
}
