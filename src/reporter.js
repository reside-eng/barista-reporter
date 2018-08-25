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
 * Transform an Error object into a JSON object.
 *
 * @api private
 * @param {Error} err
 * @return {Object}
 */
function errorJSON(err) {
  const res = {};
  Object.getOwnPropertyNames(err).forEach(key => {
    res[key] = err[key];
  }, err);
  return res;
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
  // Recieve options from reporter options flag
  const reporterOptions = get(options, 'reporterOptions', {});

  // Path constants (option with fallback to env or default)
  const JOB_RUN_KEY =
    reporterOptions.jobRunKey || process.env.JOB_RUN_KEY || Date.now();
  const RESULTS_DATA_PATH =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_DATA_PATH ||
    'test_runs_data';
  const RESULTS_META_PATH =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_META_PATH ||
    'test_runs_meta';

  // Create Firebase instance
  const fbInstance = initializeFirebase();

  // Database references
  const metaRef = fbInstance
    .database()
    .ref(RESULTS_META_PATH)
    .child(JOB_RUN_KEY);

  const reporterRef = fbInstance
    .database()
    .ref(RESULTS_DATA_PATH)
    .child(JOB_RUN_KEY);

  mocha.reporters.Base.call(this, runner);

  let currentSuiteTitle = '';
  let currentSuiteRef = reporterRef.push();
  let currentTestRef = currentSuiteRef.child('tests').push();

  // Mocha event listeners
  // Run start
  runner.on('start', () => {
    writeToDatabase(metaRef, { status: pending, [pending]: true });
  });

  // Run complete
  runner.on('end', async function onRunnerEnd() {
    const { passes, failures, end } = this.stats;
    console.log('Run end: %d/%d', passes, passes + failures); // eslint-disable-line no-console
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
        const hasFailures = failures > 0 || get(existingStats, failures, 0) > 0;
        // Update both test ref and meta ref with failure
        return writeToDatabase(metaRef, {
          stats: newStats,
          [pending]: false,
          status: hasFailures ? failed : passed,
        });
      });
  });

  // New test file is loaded
  runner.on('suite', suite => {
    if (suite.title) {
      currentSuiteTitle = suite.title;
      writeToDatabase(currentSuiteRef, {
        [`suiteStart-${startCase(suite.title)}`]: get(
          this,
          'stats.start',
          'Not Set',
        ),
        title: currentSuiteTitle,
      });
    } else {
      writeToDatabase(currentSuiteRef, {
        startedAt: admin.database.ServerValue.TIMESTAMP,
        start: get(this, 'stats.start', 'Not Set'),
      });
    }
  });

  runner.on('suite end', () => {
    currentSuiteTitle = '';
    currentSuiteRef = reporterRef.push();
  });

  runner.on('test', () => {
    writeToDatabase(currentTestRef, { state: pending });
  });

  runner.on('test end', test => {
    writeToDatabase(currentTestRef, sanitizeTest(test));
    currentTestRef = currentSuiteRef.child('tests').push();
  });

  // Test pass
  runner.on('pass', () => {
    writeToDatabase(currentTestRef, { state: passed });
  });

  // Test fail
  runner.on('fail', (test, err) => {
    writeToDatabase(currentTestRef, { state: failed, error: errorJSON(err) });
  });
}
