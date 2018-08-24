/* eslint-disable no-console */
import mocha from 'mocha';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import {
  reduce,
  set,
  isFunction,
  isUndefined,
  omit,
  get,
  startCase,
} from 'lodash';
import { omitList, passed, failed, pending } from './constants';

let adminInstance;

/**
 * Initialize Firebase instance from service account (from local
 * serviceAccount.json)
 * @return {Firebase} Initialized Firebase instance
 */
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
      console.log(
        `Local Service account exists, project id: ${
          serviceAccount.project_id
        }`,
      );
      adminInstance = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
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

/**
 * Remove invalid paramters from test object so it can be written to Real
 * time database
 * @param  {Object} test - Test object from Mocha event
 * @return {Object} Sanitized test object
 */
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

/**
 * Write data to Real Time Database
 * @param  {Firebase.Database.Reference} dbRef - Database reference to write to
 * @param  {Object} data - Data to write to database
 * @return {Promise} Resolves with results of database update
 */
function writeToDatabase(dbRef, data) {
  console.log(`writing test run data to Firebase at path: ${dbRef.path}`);
  return dbRef.update(data).catch(err => {
    console.log(
      `error writing test run data to Firebase at path: ${dbRef.path}`,
    );
    return Promise.reject(err);
  });
}

export default function Reporter(runner, options = {}) {
  const fbInstance = initializeFirebase();
  const reporterOptions = get(options, 'reporterOptions', {});
  const jobRunKey =
    reporterOptions.jobRunKey || process.env.JOB_RUN_KEY || Date.now();
  console.log('Job run key:', jobRunKey);
  const resultsDataPath =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_DATA_PATH ||
    'test_runs_data';
  const resultsMetaPath =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_META_PATH ||
    'test_runs_meta';

  const metaRef = fbInstance
    .database()
    .ref(resultsMetaPath)
    .child(jobRunKey)
    .push();

  const dataRef = fbInstance
    .database()
    .ref(resultsDataPath)
    .child(jobRunKey)
    .child(metaRef.key);

  mocha.reporters.Base.call(this, runner);

  let currentSuiteTitle = '';
  let currentSuiteRef = dataRef.push();
  let currentTestRef = currentSuiteRef.push();

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
          if (hasFailures) {
            return writeToDatabase(metaRef, { status: failed, pending: false });
          }
          return writeToDatabase(metaRef, { status: passed, pending: false });
        });
      });
  });

  // when the new test file is loaded
  runner.on('suite', suite => {
    currentSuiteRef = dataRef.push();
    if (suite.title) {
      currentSuiteTitle = suite.title;
      writeToDatabase(metaRef, {
        stats: {
          [`suiteStart-${startCase(suite.title)}`]: get(
            this,
            'stats.start',
            'Not Set',
          ),
        },
        title: currentSuiteTitle,
      });
    } else {
      writeToDatabase(metaRef.child('stats'), {
        startedAt: admin.database.ServerValue.TIMESTAMP,
        start: get(this, 'stats.start', 'Not Set'),
      });
    }
  });

  runner.on('suite end', () => {
    currentSuiteTitle = '';
  });

  runner.on('test', () => {
    currentTestRef = currentSuiteRef.push();
    writeToDatabase(currentTestRef, { state: 'pending' });
    writeToDatabase(metaRef, { pending: true });
  });

  runner.on('test end', test => {
    writeToDatabase(currentTestRef, sanitizeTest(test));
  });

  runner.on('pass', () => {
    writeToDatabase(currentTestRef, { state: 'pass' });
  });

  runner.on('fail', (test, err) => {
    console.log('Test fail: %s -- error: %s', test.title, err.message);
    writeToDatabase(currentTestRef, { state: 'failed' });
  });
}
