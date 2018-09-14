/* eslint-disable no-console */
import firebase from 'firebase/app';
import 'firebase/database';
import 'firebase/auth';

let firebaseInstance;

const stageFbConfig = {
  apiKey: 'AIzaSyD8UB1rOfw5oWzwyKrKvH0WLJ6wDPC94ac',
  authDomain: 'barista-stage.firebaseapp.com',
  databaseURL: 'https://barista-stage.firebaseio.com',
  projectId: 'barista-stage',
  storageBucket: 'barista-stage.appspot.com',
  messagingSenderId: '109344700598',
};

const prodFbConfig = {
  apiKey: 'AIzaSyCiaUr9jIU_FdTKArOE0UsZq3K-ftChbLg',
  authDomain: 'barista-836b4.firebaseapp.com',
  databaseURL: 'https://barista-836b4.firebaseio.com',
  projectId: 'barista-836b4',
  storageBucket: 'barista-836b4.appspot.com',
  messagingSenderId: '438807155877',
};

/**
 * Initialize Firebase instance from service account (from local
 * serviceAccount.json)
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
    console.log('Error initializing firebase instance from service account.');
    throw err;
  }
}

export function authWithFirebase() {
  return new Promise((resolve, reject) => {
    firebaseInstance.auth().onAuthStateChanged(user => {
      if (user) {
        resolve(user);
      }
    });
    firebaseInstance
      .auth()
      .signInAnonymously()
      .catch(error => {
        reject(error);
      });
  });
}

/**
 * Write data to Real Time Database
 * @param  {Firebase.Database.Reference} dbRef - Database reference to write to
 * @param  {Object} data - Data to write to database
 * @return {Promise} Resolves with results of database update
 */
export function writeToDatabase(dbRef, data) {
  if (!firebase.auth().currentUser) {
    return authWithFirebase().then(() => writeToDatabase(dbRef, data));
  }
  return dbRef.update(data).catch(err => {
    console.log(
      `error writing test run data to Firebase at path: ${dbRef.path}`,
    );
    return Promise.reject(err);
  });
}
