const winston = require('winston');
const path = require('path');

// Create logs directory
const logDir = path.join(__dirname, '../logs');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shelfhelp-api' },
  transports: [
    // Write all logs to console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let log = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
          }
          return log;
        })
      )
    })
  ]
});

// Add file logging in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 10
  }));
}

// Helper functions for common logging patterns
logger.security = (message, meta = {}) => {
  logger.warn(message, { ...meta, category: 'security' });
};

logger.performance = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'performance' });
};

logger.api = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'api' });
};

logger.cache = (message, meta = {}) => {
  logger.debug(message, { ...meta, category: 'cache' });
};

module.exports = logger;