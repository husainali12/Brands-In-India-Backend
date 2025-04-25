const admin = require('firebase-admin');

const serviceAccount = require('../firebase-service-secret.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
