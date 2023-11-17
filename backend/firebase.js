const firebase = require("firebase/app");
require("firebase/database"); // for realtime database
require("firebase/firestore");
require("firebase/storage");
require("firebase/auth");

// require('dotenv').config();

const myfirebase = firebase.initializeApp({
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
});
const db = firebase.firestore();
const firestorage = firebase.storage();

module.exports = { myfirebase, db, firestorage };
