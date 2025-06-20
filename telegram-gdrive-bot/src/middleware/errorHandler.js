import config from "../config/index.js";
import logger from "../logger/index.js";

/**
 * Error Handling Middleware for Telegram Bot
 * Provides centralized error handling with user-friendly messages and detailed logging
 */

/**
 * Main error handler middleware for Telegraf
 * @param {Error} error - The error that occurred
 * @param {Object} ctx - Telegraf context
 * @returns {Promise<void>}
 */
export async function errorHandler(error, ctx) {
  try {
    // Extract error information
    const errorInfo = {
      name: error.name || "UnknownError",
      message: error.message || "An unknown error occurred",
      stack: error.stack,
      code: error.code,
      chatId: ctx?.chat?.id,
      userId: ctx?.from?.id,
      updateType: ctx?.updateType,
      messageText: ctx?.message?.text?.substring(0, 100), // First 100 chars for context
    };

    // Log the error with full details
    logger.error("Bot error caught by middleware", errorInfo);

    // Determine user-friendly error message
    const userMessage = generateUserErrorMessage(error, ctx);

    // Send error message to user if we have a valid context
    if (ctx && ctx.reply) {
      try {
        await ctx.reply(userMessage);
      } catch (replyError) {
        logger.error("Failed to send error message to user", {
          originalError: error.message,
          replyError: replyError.message,
          chatId: ctx.chat?.id,
        });
      }
    }

    // Handle specific error types
    await handleSpecificErrors(error, ctx);
  } catch (handlerError) {
    // If our error handler itself fails, log it
    logger.error("Error in error handler", {
      handlerError: handlerError.message,
      originalError:
        typeof error === "object" && error !== null && "message" in error
          ? error.message
          : JSON.stringify(error),
    });
  }
}

/**
 * Generate user-friendly error messages based on error type
 * @param {Error} error - The error that occurred
 * @param {Object} ctx - Telegraf context
 * @returns {string} User-friendly error message
 */
function generateUserErrorMessage(error, ctx) {
  const errorMessage = error.message || "";
  const errorCode = error.code;

  // Telegram API specific errors
  if (error.code === 429) {
    return "⏳ I'm being rate limited. Please wait a moment and try again.";
  }

  if (error.code === 403) {
    return "🚫 I don't have permission to perform this action. Please check my permissions.";
  }

  if (error.code === 400 && errorMessage.includes("Bad Request")) {
    if (errorMessage.includes("message is too long")) {
      return "📝 The message is too long. Please try with a shorter request.";
    }
    if (errorMessage.includes("file size")) {
      return `📁 File size exceeds the ${config.MAX_FILE_SIZE_MB}MB limit.`;
    }
    return "❌ Invalid request. Please check your input and try again.";
  }

  // File download specific errors
  if (errorMessage.includes("file size") && errorMessage.includes("exceeds")) {
    return `📁 File is too large! Maximum allowed size is ${config.MAX_FILE_SIZE_MB}MB.`;
  }

  if (errorMessage.includes("not found") || errorMessage.includes("404")) {
    return "🔍 File not found. Please check if the Google Drive link is correct and the file is publicly accessible.";
  }

  if (errorMessage.includes("access denied") || errorMessage.includes("403")) {
    return '🔒 Access denied. Please make sure the file is shared with "Anyone with the link" permission.';
  }

  if (
    errorMessage.includes("timeout") ||
    errorMessage.includes("ECONNABORTED")
  ) {
    return "⏰ Download timed out. The file might be too large or the connection is slow. Please try again.";
  }

  if (
    errorMessage.includes("network") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("ECONNREFUSED")
  ) {
    return "🌐 Network error occurred. Please check your internet connection and try again.";
  }

  // Google Drive specific errors
  if (
    errorMessage.includes("virus scan") ||
    errorMessage.includes("confirmation")
  ) {
    return "🦠 Google Drive virus scan detected. This usually happens with large files. Please try again or use a smaller file.";
  }

  if (
    errorMessage.includes("quota") ||
    errorMessage.includes("limit exceeded")
  ) {
    return "📊 Google Drive quota exceeded. Please try again later.";
  }

  if (errorMessage.includes("file ID")) {
    return "🔗 Invalid Google Drive link. Please make sure you're using a valid sharing link.";
  }

  // File type errors
  if (errorMessage.includes("unsupported") && errorMessage.includes("type")) {
    return "📄 Unsupported file type. I can handle most common file formats.";
  }

  // Generic errors based on environment
  if (config.IS_DEVELOPMENT && config.ENABLE_ERROR_DETAILS) {
    return `🐛 Development Error: ${errorMessage}`;
  }

  // Default user-friendly message
  return "❌ Something went wrong while processing your request. Please try again or contact support if the problem persists.";
}

/**
 * Handle specific error types with custom logic
 * @param {Error} error - The error that occurred
 * @param {Object} ctx - Telegraf context
 */
async function handleSpecificErrors(error, ctx) {
  // Handle rate limiting
  if (error.code === 429) {
    // Extract retry after header if available
    const retryAfter = error.response?.headers?.["retry-after"];
    if (retryAfter) {
      logger.warn("Rate limited by Telegram API", {
        retryAfter: retryAfter,
        chatId: ctx?.chat?.id,
      });
    }
    return;
  }

  // Handle file download failures
  if (
    error.message?.includes("download") ||
    error.message?.includes("Google Drive")
  ) {
    logger.logFileOperation("download_failed", "unknown", 0, {
      error: error.message,
      chatId: ctx?.chat?.id,
    });
    return;
  }

  // Handle bot token issues
  if (error.code === 401) {
    logger.error("Bot token authentication failed", {
      error: error.message,
      recommendation: "Check BOT_TOKEN environment variable",
    });
    return;
  }

  // Handle webhook issues
  if (error.message?.includes("webhook")) {
    logger.error("Webhook related error", {
      error: error.message,
      chatId: ctx?.chat?.id,
    });
    return;
  }
}

/**
 * Validation error handler for input validation
 * @param {Array} validationErrors - Array of validation error objects
 * @param {Object} ctx - Telegraf context
 */
export async function handleValidationErrors(validationErrors, ctx) {
  try {
    const errorMessages = validationErrors
      .map((err) => `• ${err.message}`)
      .join("\n");
    const userMessage = `❌ Validation Error:\n${errorMessages}\n\nPlease correct these issues and try again.`;

    logger.warn("Validation errors occurred", {
      errors: validationErrors,
      chatId: ctx?.chat?.id,
    });

    if (ctx && ctx.reply) {
      await ctx.reply(userMessage);
    }
  } catch (handlerError) {
    logger.error("Error in validation error handler", {
      handlerError: handlerError.message,
      validationErrors,
    });
  }
}

/**
 * Create a custom error with additional context
 * @param {string} message - Error message
 * @param {Object} context - Additional context information
 * @param {string} code - Error code
 * @returns {Error} Enhanced error object
 */
export function createContextualError(message, context = {}, code = null) {
  const error = new Error(message);
  error.context = context;
  if (code) {
    error.code = code;
  }
  return error;
}

/**
 * Security error handler for potentially malicious requests
 * @param {string} securityEvent - Type of security event
 * @param {Object} ctx - Telegraf context
 * @param {Object} details - Additional security event details
 */
export async function handleSecurityError(securityEvent, ctx, details = {}) {
  try {
    // Log security event
    logger.logSecurity(securityEvent, "Potential security threat detected", {
      chatId: ctx?.chat?.id,
      userId: ctx?.from?.id,
      username: ctx?.from?.username,
      details,
    });

    // Send generic error message to user (don't reveal security details)
    const userMessage =
      "🔒 Security check failed. Please ensure you're using valid, safe content.";

    if (ctx && ctx.reply) {
      await ctx.reply(userMessage);
    }
  } catch (handlerError) {
    logger.error("Error in security error handler", {
      handlerError: handlerError.message,
      securityEvent,
      details,
    });
  }
}

/**
 * Async operation timeout handler
 * @param {Promise} operation - Promise to execute with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for error messages
 * @returns {Promise} Promise that resolves or rejects with timeout
 */
export function withTimeout(operation, timeoutMs, operationName = "Operation") {
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          createContextualError(
            `${operationName} timed out after ${timeoutMs}ms`,
            { timeout: timeoutMs, operation: operationName },
            "TIMEOUT"
          )
        );
      }, timeoutMs);
    }),
  ]);
}

/**
 * Retry operation with exponential backoff
 * @param {Function} operation - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves when operation succeeds or max retries reached
 */
export async function retryOperation(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryCondition = () => true,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!retryCondition(error) || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

      logger.debug(`Operation failed, retrying in ${delay}ms`, {
        attempt,
        maxRetries,
        error: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Global uncaught exception handler
 */
export function setupGlobalErrorHandlers() {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception - shutting down gracefully", {
      error: error.message,
      stack: error.stack,
    });

    // Give some time for logging before exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });
  });

  process.on("warning", (warning) => {
    logger.warn("Node.js warning", {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  });
}
