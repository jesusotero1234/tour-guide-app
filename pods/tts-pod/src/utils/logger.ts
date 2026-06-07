import winston from 'winston';
import { env } from '../config/env';

const logger = winston.createLogger({
  level: env.env === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'tts-pod',
    environment: env.env
  },
  transports: [
    // Write all logs to console only - no file outputs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export default logger;
