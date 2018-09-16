import mocha from 'mocha';
import {
  reduce,
  set,
  isFunction,
  isUndefined,
  omit,
  get,
  startCase,
} from 'lodash';
import * as firebase from 'firebase';
import { omitList, passed, failed, pending } from './constants';
import {
  initializeFirebase,
  writeToDatabase,
  authWithFirebase,
} from './firebaseUtils';

/**
 * Transform an Error object into a JSON object.
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

export default function Reporter(runner, options = {}) {
  // Recieve options from reporter options flag
  const reporterOptions = get(options, 'reporterOptions', {});

  // Path constants (option with fallback to env or default)
  const JOB_RUN_KEY =
    reporterOptions.jobRunKey ||
    process.env.JOB_RUN_KEY ||
    `barista/${Date.now()}`;
  const RESULTS_DATA_PATH =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_DATA_PATH ||
    'test_runs_data';
  const RESULTS_META_PATH =
    reporterOptions.resultsDataPath ||
    process.env.RESULTS_META_PATH ||
    'test_runs_meta';

  // Create Firebase instance
  const fbInstance = initializeFirebase(reporterOptions);
  authWithFirebase();

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
        startedAt: firebase.database.ServerValue.TIMESTAMP,
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
