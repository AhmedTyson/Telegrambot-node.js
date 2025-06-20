import winston from 'winston';
import config from '../config/index.js';

/**
 * Winston Logger Configuration for Telegram Google Drive Bot
 * Provides structured logging with different levels and formats
 */

// Define custom log levels
const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
  }
};

// Add colors to winston
winston.addColors(logLevels.colors);

/**
 * Create custom format for console output
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    return msg;
  })
);

/**
 * Create custom format for file output
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

/**
 * Create transports array based on environment
 */
const createTransports = () => {
  const transports = [];

  // Console transport (always enabled)
  transports.push(
    new winston.transports.Console({
      level: config.LOG_LEVEL,
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transports (enabled in production or when explicitly requested)
  if (config.IS_PRODUCTION || process.env.ENABLE_FILE_LOGGING === 'true') {
    // General log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/app.log',
        level: 'info',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Debug log file (development only)
    if (config.IS_DEVELOPMENT) {
      transports.push(
        new winston.transports.File({
          filename: 'logs/debug.log',
          level: 'debug',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 3
        })
      );
    }
  }

  return transports;
};

/**
 * Create and configure Winston logger
 */
const logger = winston.createLogger({
  levels: logLevels.levels,
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
  ),
  transports: createTransports(),
  exitOnError: false,
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

/**
 * Enhanced logger with additional utility methods
 */
const enhancedLogger = {
  // Standard logging methods
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => logger.http(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),

  // Utility methods for common logging scenarios
  
  /**
   * Log API request information
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {number} statusCode - Response status code
   * @param {number} responseTime - Response time in milliseconds
   * @param {Object} meta - Additional metadata
   */
  logRequest: (method, url, statusCode, responseTime, meta = {}) => {
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    logger[level](`${method} ${url} ${statusCode}`, {
      method,
      url,
      statusCode,
      responseTime,
      ...meta
    });
  },

  /**
   * Log file operation
   * @param {string} operation - Operation type (download, upload, delete, etc.)
   * @param {string} fileName - File name
   * @param {number} fileSize - File size in bytes
   * @param {Object} meta - Additional metadata
   */
  logFileOperation: (operation, fileName, fileSize, meta = {}) => {
    logger.info(`File ${operation}: ${fileName}`, {
      operation,
      fileName,
      fileSize,
      fileSizeFormatted: formatFileSize(fileSize),
      ...meta
    });
  },

  /**
   * Log user interaction
   * @param {string} action - User action
   * @param {string|number} chatId - Telegram chat ID
   * @param {Object} meta - Additional metadata
   */
  logUserAction: (action, chatId, meta = {}) => {
    logger.info(`User action: ${action}`, {
      action,
      chatId: String(chatId), // Ensure it's a string for privacy
      ...meta
    });
  },

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} meta - Additional metadata
   */
  logPerformance: (operation, duration, meta = {}) => {
    const level = duration > 5000 ? 'warn' : 'info'; // Warn if operation takes > 5 seconds
    logger[level](`Performance: ${operation} completed in ${duration}ms`, {
      operation,
      duration,
      ...meta
    });
  },

  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {string} description - Event description
   * @param {Object} meta - Additional metadata
   */
  logSecurity: (event, description, meta = {}) => {
    logger.warn(`Security event: ${event} - ${description}`, {
      securityEvent: event,
      description,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }
};

/**
 * Format file size for human readability
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Log configuration on startup
if (config.IS_DEVELOPMENT) {
  enhancedLogger.debug('Logger initialized', {
    logLevel: config.LOG_LEVEL,
    environment: config.NODE_ENV,
    transports: logger.transports.map(t => t.constructor.name)
  });
}

export default enhancedLogger;