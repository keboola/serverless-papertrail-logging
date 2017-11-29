'use strict';

const _ = require('lodash');
const papertrail = require('winston-papertrail').Papertrail;
const winston = require('winston');
const zlib = require('zlib');

const formatLog = (level, message) => {
  const consoleLog = message.split('\t');
  if (consoleLog.length === 3) {
    try {
      const logData = JSON.parse(consoleLog[2]);
      if (_.has(logData.event, 'body') && _.isString(logData.event.body)) {
        logData.event.body = JSON.parse(logData.event.body);
      }
      if (!_.has(logData, 'requestId')) {
        logData.requestId = consoleLog[1];
      }
      return JSON.stringify(logData);
    } catch (e) {
      return JSON.stringify({ requestId: consoleLog[1], log: consoleLog[2] });
    }
  }

  try {
    const logData = JSON.parse(message);
    if (!_.has(logData, 'statusCode')) {
      logData.statusCode = 500;
    }
    return JSON.stringify(logData);
  } catch (e) {
    return message;
  }
};

exports.handler = function (event, context, callback) {
  const logger = new (winston.Logger)({
    transports: [],
  });
  logger.add(papertrail, {
    host: 'logs.papertrailapp.com',
    port: '%papertrailPort%',
    hostname: '%papertrailHostname%',
    program: '%papertrailProgram%',
    flushOnClose: true,
    includeMetaInMessage: false,
    handleExceptions: true,
    humanReadableUnhandledException: false,
    logFormat: formatLog,
  });

  const payload = new Buffer(event.awslogs.data, 'base64');
  zlib.gunzip(payload, (err, result) => {
    if (err) {
      return callback(err);
    }

    const logData = JSON.parse(result.toString('utf8'));
    if (logData.messageType === 'CONTROL_MESSAGE') {
      return callback();
    }

    logData.logEvents.forEach((line) => {
      if (line.message && !_.startsWith(line.message, 'START RequestId') && !_.startsWith(line.message, 'END RequestId')
        && !_.startsWith(line.message, 'REPORT RequestId')) {
        logger.info(line.message);
      }
    });

    logger.close();
    return callback();
  });
};
