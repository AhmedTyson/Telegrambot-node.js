import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

/**
 * Configuration management for the Telegram Google Drive Bot
 * Validates and provides access to environment variables with defaults
 */
class Config {
  constructor() {
    this.validateRequiredEnvVars();
  }

  /**
   * Validate that all required environment variables are present
   * @throws {Error} If required environment variables are missing
   */
  validateRequiredEnvVars() {
    const required = ["BOT_TOKEN"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}\n` +
          "Please check your .env file and ensure all required variables are set."
      );
    }
  }

  /**
   * Get environment variable with type conversion and validation
   * @param {string} key - Environment variable key
   * @param {*} defaultValue - Default value if not set
   * @param {'string'|'number'|'boolean'} type - Expected type
   * @returns {*} Parsed environment variable value
   */
  getEnvVar(key, defaultValue, type = "string") {
    const value = process.env[key];

    if (value === undefined) {
      return defaultValue;
    }

    switch (type) {
      case "number":
        const numValue = Number(value);
        if (isNaN(numValue)) {
          throw new Error(
            `Environment variable ${key} must be a valid number, got: ${value}`
          );
        }
        return numValue;

      case "boolean":
        return value.toLowerCase() === "true";

      case "string":
      default:
        return value;
    }
  }

  // Telegram Bot Configuration
  get BOT_TOKEN() {
    return this.getEnvVar("BOT_TOKEN");
  }

  // Environment Settings
  get NODE_ENV() {
    return this.getEnvVar("NODE_ENV", "development");
  }

  get IS_DEVELOPMENT() {
    return this.NODE_ENV === "development";
  }

  get IS_PRODUCTION() {
    return this.NODE_ENV === "production";
  }

  // Logging Configuration
  get LOG_LEVEL() {
    return this.getEnvVar("LOG_LEVEL", this.IS_DEVELOPMENT ? "debug" : "info");
  }

  // File Download Settings
  get MAX_FILE_SIZE_MB() {
    return this.getEnvVar("MAX_FILE_SIZE_MB", 50, "number");
  }

  get MAX_FILE_SIZE_BYTES() {
    return this.MAX_FILE_SIZE_MB * 1024 * 1024;
  }

  get DOWNLOAD_TIMEOUT_MS() {
    return this.getEnvVar("DOWNLOAD_TIMEOUT_MS", 30000, "number");
  }

  // Directory Configuration
  get TEMP_DIR() {
    const tempDir = this.getEnvVar("TEMP_DIR", "./temp");
    return path.resolve(tempDir);
  }

  // Error Reporting Configuration
  get ENABLE_ERROR_DETAILS() {
    return this.getEnvVar(
      "ENABLE_ERROR_DETAILS",
      this.IS_DEVELOPMENT,
      "boolean"
    );
  }

  // Google Drive API Configuration
  get GOOGLE_DRIVE_BASE_URL() {
    return "https://drive.google.com";
  }

  get GOOGLE_DRIVE_DOWNLOAD_URL() {
    return "https://drive.google.com/uc?export=download&id=";
  }

  get GOOGLE_DRIVE_CONFIRM_URL() {
    return "https://drive.google.com/uc?export=download&confirm=t&id=";
  }

  // Request Configuration
  get REQUEST_HEADERS() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
  }

  // File Type Configuration
  get SUPPORTED_VIDEO_TYPES() {
    return [
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-ms-wmv",
      "video/x-matroska",
      "video/webm",
    ];
  }

  get SUPPORTED_IMAGE_TYPES() {
    return [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
    ];
  }

  get SUPPORTED_DOCUMENT_TYPES() {
    return [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
    ];
  }

  /**
   * Get configuration summary for logging
   * @returns {Object} Configuration summary (without sensitive data)
   */
  getSummary() {
    return {
      nodeEnv: this.NODE_ENV,
      logLevel: this.LOG_LEVEL,
      maxFileSizeMB: this.MAX_FILE_SIZE_MB,
      downloadTimeoutMs: this.DOWNLOAD_TIMEOUT_MS,
      tempDir: this.TEMP_DIR,
      enableErrorDetails: this.ENABLE_ERROR_DETAILS,
      botTokenSet: !!this.BOT_TOKEN,
    };
  }

  /**
   * Validate configuration values
   * @throws {Error} If configuration is invalid
   */
  validate() {
    if (this.MAX_FILE_SIZE_MB <= 0 || this.MAX_FILE_SIZE_MB > 2000) {
      throw new Error("MAX_FILE_SIZE_MB must be between 1 and 2000");
    }

    if (this.DOWNLOAD_TIMEOUT_MS <= 0) {
      throw new Error("DOWNLOAD_TIMEOUT_MS must be a positive number");
    }

    if (!this.BOT_TOKEN.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
      throw new Error("BOT_TOKEN format is invalid");
    }
  }
}

// Create and validate configuration instance
const config = new Config();
config.validate();

export default config;
