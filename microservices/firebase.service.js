const admin = require('firebase-admin');

const serviceAccount = require('../firebase-service-secret');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
