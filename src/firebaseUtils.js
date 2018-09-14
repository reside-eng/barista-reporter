import firebase from 'firebase/app';
import 'firebase/database';
import 'firebase/auth';
import { stageFbConfig, prodFbConfig } from './constants';

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

/**
 * Authenticate anonymously with Firebase
 */
export function authWithFirebase() {
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

let retries = 0;
const MAX_RETRIES = 3;

/**
 * Write data to Real Time Database
 * @param  {Firebase.Database.Reference} dbRef - Database reference to write to
 * @param  {Object} data - Data to write to database
 * @return {Promise} Resolves with results of database update
 */
export function writeToDatabase(dbRef, data) {
  if (!firebase.auth) {
    console.log('Auth is not defined. Checking for retries.'); // eslint-disable-line no-console
    if (retries < MAX_RETRIES) {
      console.log('Less than three retries, retrying again in a second'); // eslint-disable-line no-console
      setTimeout(() => {
        retries += 1;
        writeToDatabase(dbRef, data);
      }, 1000);
    }
  }
  if (!firebase.auth().currentUser) {
    return authWithFirebase().then(() => writeToDatabase(dbRef, data));
  }
  return dbRef.update(data).catch(err => {
    /* eslint-disable no-console */
    console.log(
      `Error writing test run data to Firebase at path: ${dbRef.path}`,
    );
    /* eslint-enable no-console */
    return Promise.reject(err);
  });
}
