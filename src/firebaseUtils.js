import { stageFbConfig, prodFbConfig } from './constants';

const firebase = require('firebase/app');
require('firebase/database');
require('firebase/auth');

let firebaseInstance;

/**
 * Initialize Firebase instance from service account (from local
 * serviceAccount.json)
 * @param {Object} reporterOptions - Options passed to the reporter
 * @param {Boolean} reporterOptions.useStage - Whether or not to use Barista stage environment
 * @return {Firebase} Initialized Firebase instance
 */
export function initializeFirebase({ useStage }) {
  try {
    if (!firebaseInstance) {
      firebaseInstance = firebase.initializeApp(
        useStage ? stageFbConfig : prodFbConfig,
      );
    }
    return firebaseInstance;
  } catch (err) {
    console.log('Error initializing firebase instance from service account.'); // eslint-disable-line no-console
    throw err;
  }
}

let authRetries = 0;
const MAX_RETRIES = 3;

/**
 * Authenticate anonymously with Firebase
 */
export function authWithFirebase() {
  if (!firebase.auth) {
    /* eslint-disable no-console */
    console.log(
      'Auth is not defined in authWithFirebase. Checking for retries.',
    );
    /* eslint-enable no-console */
    if (authRetries < MAX_RETRIES) {
      /* eslint-disable no-console */
      console.log(
        'Less than three retries, retrying authWithFirebase again in a second',
      );
      /* eslint-enable no-console */
      setTimeout(() => {
        authRetries += 1;
        authWithFirebase();
      }, 1000);
    }
  }
  // Check to see if user is already authed
  if (firebase.auth().currentUser) {
    return Promise.resolve(firebase.auth().currentUser);
  }

  return new Promise((resolve, reject) => {
    // Attach auth state change listener that resolves promise after login
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        resolve(user);
      }
    });

    // Authenticate anonymously rejecting on failure
    firebase
      .auth()
      .signInAnonymously()
      .catch(error => {
        reject(error);
      });
  });
}

let writeRetries = 0;

/**
 * Write data to Real Time Database
 * @param  {Firebase.Database.Reference} dbRef - Database reference to write to
 * @param  {Object} data - Data to write to database
 * @return {Promise} Resolves with results of database update
 */
export function writeToDatabase(dbRef, data) {
  // Handle auth not being defined
  if (!firebase.auth) {
    console.log('Auth is not defined. Checking for retries.'); // eslint-disable-line no-console
    if (writeRetries < MAX_RETRIES) {
      console.log('Less than three retries, retrying again in a second'); // eslint-disable-line no-console
      setTimeout(() => {
        writeRetries += 1;
        writeToDatabase(dbRef, data);
      }, 1000);
    }
  }

  // Handle current user not being authed
  if (!firebase.auth().currentUser) {
    console.log('Authing before write to RTDB'); // eslint-disable-line no-console
    return authWithFirebase().then(() => writeToDatabase(dbRef, data));
  }

  // Write to RTDB
  return dbRef.update(data).catch(err => {
    /* eslint-disable no-console */
    console.log(
      `Error writing test run data to Firebase at path: ${dbRef.path}`,
    );
    /* eslint-enable no-console */
    return Promise.reject(err);
  });
}
