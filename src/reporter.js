import mocha from 'mocha';
import { reduce, set, isFunction, isUndefined, omit, get } from 'lodash';
import { omitList, FAILED, PENDING, PASSED } from './constants';
import {
  createBaristaApiInstance,
  sendDataToBaristaApi,
} from './baristaApiUtils';

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
  mocha.reporters.Base.call(this, runner);
  const self = this;
  const suites = [];
  const parentSuites = [];
  const pending = [];
  let currentSuiteTests = [];
  const failures = [];
  const passes = [];
  let currentSuite = null;
  let hierarchyMode = false;

  // Recieve options from reporter options flag
  const reporterOptions = get(options, 'reporterOptions', {});

  const baristaApiInstance = createBaristaApiInstance(reporterOptions);

  // Apply reporter options
  if (reporterOptions.hierarchyMode) {
    hierarchyMode = reporterOptions.hierarchyMode;
  }

  // Mocha event listeners
  // Run start
  runner.on('start', () => {
    sendDataToBaristaApi(baristaApiInstance, {
      meta: { status: PENDING, [PENDING]: true },
    });
  });

  // New test file is loaded
  runner.on('suite', suite => {
    if (suite.title) {
      const newSuite = {
        title: suite.title,
        tests: [],
      };
      if (hierarchyMode) {
        newSuite.suites = [];
        if (parentSuites.length === 0) {
          suites.push(newSuite);
        } else {
          parentSuites[parentSuites.length - 1].suites.push(newSuite);
        }
        parentSuites.push(newSuite);
      } else {
        suites.push(newSuite);
      }
      currentSuite = newSuite;
    }
  });

  runner.on('suite end', () => {
    if (hierarchyMode) {
      parentSuites.pop();
    }
    currentSuite.tests = [
      ...pending.map(sanitizeTest),
      ...passes.map(sanitizeTest),
      ...failures.map(sanitizeTest),
    ];
    currentSuiteTests = [];
  });

  runner.on('test end', test => {
    currentSuite.tests.push(sanitizeTest(test));
    currentSuiteTests.push(sanitizeTest(test));
  });

  // Test pass
  runner.on('pass', test => {
    passes.push(test);
    currentSuiteTests.push({ state: PASSED });
  });

  // Test fail
  runner.on('fail', (test, err) => {
    failures.push(test);
    currentSuiteTests.push({ state: FAILED, error: errorJSON(err) });
  });

  runner.on('pending', test => {
    pending.push(test);
  });

  runner.once('end', () => {
    const obj = {
      stats: self.stats,
      suites,
      pending: pending.map(sanitizeTest),
      failures: failures.map(sanitizeTest),
      passes: passes.map(sanitizeTest),
    };
    sendDataToBaristaApi(baristaApiInstance, sanitizeTest(obj));
  });
}
