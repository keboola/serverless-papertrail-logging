'use strict';

const { PapertrailTransport } = require('winston-papertrail-transport')
const _ = require('lodash');
const winston = require('winston');
const zlib = require('zlib');

exports.handler = (event, context, callback) => {
  const papertrailTransport = new PapertrailTransport({
    host: '%papertrailHost%',
    port: '%papertrailPort%',
    colorize: true,
    hostname: '%papertrailHostname%',
    program: '%papertrailProgram%'
  });

  const logger = winston.createLogger({
    transports: [papertrailTransport],
    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
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
