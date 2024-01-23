const fs = require('fs');
const pino = require('pino');

// Create a writable stream
const logStream = fs.createWriteStream('./credit.log');

// Create a logger that writes to the stream
const creditslog = pino({
  level: 'trace', // log all messages
}, logStream);

module.exports = creditslog;