import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';

// Import utilities and configurations
import config from './config/index.js';
import logger from './logger/index.js';
import { parseGoogleDriveUrl, isValidGoogleDriveUrl } from './utils/urlParser.js';
import { downloadGoogleDriveFile } from './utils/googleDrive.js';
import { getFileType, validateFileSize } from './utils/fileHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

/**
 * Main Telegram Bot Class for handling Google Drive file downloads
 */
class TelegramGDriveBot {
  constructor() {
    this.bot = new Telegraf(config.BOT_TOKEN);
    this.setupMiddleware();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware for the bot
   */
  setupMiddleware() {
    // Global error handling middleware
    this.bot.use(errorHandler);

    // Request logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const responseTime = Date.now() - start;
      logger.info(`Processed message in ${responseTime}ms`, {
        chatId: ctx.chat?.id,
        messageType: ctx.message?.text ? 'text' : 'other',
        responseTime
      });
    });
  }

  /**
   * Setup command and message handlers
   */
  setupHandlers() {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      const welcomeMessage = `
🤖 *Welcome to Google Drive File Bot!*

I can help you download files from Google Drive links and send them directly to this chat.

*How to use:*
• Send me any Google Drive sharing link
• I'll download the file (up to ${config.MAX_FILE_SIZE_MB}MB)
• PDFs will be sent as documents 📄
• Videos will be sent as video files 🎥

*Supported link formats:*
• https://drive.google.com/file/d/FILE_ID/view
• https://drive.google.com/open?id=FILE_ID
• https://docs.google.com/document/d/FILE_ID

*Commands:*
/help - Show this help message
/status - Check bot status

Just paste your Google Drive link and I'll handle the rest! 🚀
      `;

      await ctx.replyWithMarkdown(welcomeMessage);
      logger.info('Start command executed', { chatId: ctx.chat.id });
    });

    // Help command handler
    this.bot.command('help', async (ctx) => {
      await ctx.replyWithMarkdown(`
*Google Drive File Bot Help* 🤖

*Supported Google Drive Link Formats:*
• https://drive.google.com/file/d/[FILE_ID]/view
• https://drive.google.com/open?id=[FILE_ID]
• https://docs.google.com/document/d/[FILE_ID]

*File Type Support:*
📄 Documents (PDF, DOC, etc.) - Sent as document
🎥 Videos (MP4, MKV, etc.) - Sent as video with streaming support
📸 Images - Sent as photos
📁 Other files - Sent as documents

*Limitations:*
• Maximum file size: ${config.MAX_FILE_SIZE_MB}MB
• Files must be publicly accessible (shared with "Anyone with the link")
• Download timeout: ${config.DOWNLOAD_TIMEOUT_MS / 1000} seconds

*Commands:*
/start - Welcome message
/help - This help message
/status - Bot status

Need help? Just send me your Google Drive link! 🔗
      `);
    });

    // Status command handler
    this.bot.command('status', async (ctx) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      await ctx.replyWithMarkdown(`
*Bot Status* ✅

🟢 Status: Active
⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
📊 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🔧 Node.js Version: ${process.version}
📁 Max File Size: ${config.MAX_FILE_SIZE_MB}MB
      `);
    });

    // Main message handler for Google Drive links
    this.bot.on(message('text'), async (ctx) => {
      const messageText = ctx.message.text;
      
      // Check if message contains a Google Drive URL
      if (isValidGoogleDriveUrl(messageText)) {
        await this.handleGoogleDriveLink(ctx, messageText);
      } else {
        // Provide helpful response for non-Drive links
        await ctx.reply(
          '🔗 Please send me a valid Google Drive sharing link.\n\n' +
          'Example formats:\n' +
          '• https://drive.google.com/file/d/FILE_ID/view\n' +
          '• https://drive.google.com/open?id=FILE_ID\n\n' +
          'Use /help for more information.'
        );
      }
    });

    // Handle non-text messages
    this.bot.on('message', async (ctx) => {
      if (!ctx.message.text) {
        await ctx.reply(
          '📝 I can only process Google Drive links sent as text messages.\n' +
          'Please send me a Google Drive sharing link.'
        );
      }
    });
  }

  /**
   * Handle Google Drive link processing
   * @param {Object} ctx - Telegraf context
   * @param {string} messageText - Message containing the Google Drive link
   */
  async handleGoogleDriveLink(ctx, messageText) {
    const processingMessage = await ctx.reply('🔄 Processing your Google Drive link...');
    
    try {
      // Parse the Google Drive URL to extract file ID
      const fileId = parseGoogleDriveUrl(messageText);
      if (!fileId) {
        throw new Error('Could not extract file ID from the URL');
      }

      logger.info('Processing Google Drive link', {
        chatId: ctx.chat.id,
        fileId: fileId.substring(0, 10) + '...' // Log partial ID for privacy
      });

      // Update status message
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        null,
        '📥 Downloading file from Google Drive...'
      );

      // Download the file from Google Drive
      const downloadResult = await downloadGoogleDriveFile(fileId);
      
      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Download failed');
      }

      const { filePath, fileName, fileSize } = downloadResult;

      // Validate file size
      if (!validateFileSize(fileSize, config.MAX_FILE_SIZE_MB)) {
        // Clean up downloaded file
        await fs.remove(filePath);
        throw new Error(`File size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds the limit of ${config.MAX_FILE_SIZE_MB}MB`);
      }

      // Update status message
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        null,
        '🔍 Detecting file type and preparing to send...'
      );

      // Determine file type and send accordingly
      const fileType = await getFileType(filePath);
      await this.sendFileByType(ctx, filePath, fileName, fileType);

      // Clean up: remove the temporary file
      await fs.remove(filePath);

      // Delete the processing message
      await ctx.deleteMessage(processingMessage.message_id);

      logger.info('File processed successfully', {
        chatId: ctx.chat.id,
        fileName,
        fileSize: Math.round(fileSize / 1024) + 'KB',
        fileType: fileType?.mime || 'unknown'
      });

    } catch (error) {
      logger.error('Error processing Google Drive link', {
        chatId: ctx.chat.id,
        error: error.message,
        stack: error.stack
      });

      // Update the processing message with error
      const errorMessage = config.NODE_ENV === 'development' && config.ENABLE_ERROR_DETAILS
        ? `❌ Error: ${error.message}`
        : '❌ Sorry, I couldn\'t process this file. Please make sure:\n\n' +
          '• The file is shared with "Anyone with the link"\n' +
          '• The file size is under ' + config.MAX_FILE_SIZE_MB + 'MB\n' +
          '• The link is a valid Google Drive sharing link';

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        null,
        errorMessage
      );
    }
  }

  /**
   * Send file based on its detected type
   * @param {Object} ctx - Telegraf context
   * @param {string} filePath - Path to the downloaded file
   * @param {string} fileName - Original file name
   * @param {Object} fileType - File type information from file-type detection
   */
  async sendFileByType(ctx, filePath, fileName, fileType) {
    const caption = `📄 ${fileName}`;
    const fileBuffer = await fs.readFile(filePath);

    if (fileType?.mime) {
      // Check if it's a video file
      if (fileType.mime.startsWith('video/')) {
        logger.info('Sending as video', { fileName, mimeType: fileType.mime });
        await ctx.replyWithVideo(
          { source: fileBuffer, filename: fileName },
          {
            caption,
            supports_streaming: true,
            parse_mode: 'Markdown'
          }
        );
        return;
      }

      // Check if it's an image file
      if (fileType.mime.startsWith('image/')) {
        logger.info('Sending as photo', { fileName, mimeType: fileType.mime });
        await ctx.replyWithPhoto(
          { source: fileBuffer, filename: fileName },
          { caption, parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // For PDFs and other document types, send as document
    logger.info('Sending as document', { fileName, mimeType: fileType?.mime || 'unknown' });
    await ctx.replyWithDocument(
      { source: fileBuffer, filename: fileName },
      { caption, parse_mode: 'Markdown' }
    );
  }

  /**
   * Setup error handling for uncaught exceptions
   */
  setupErrorHandling() {
    // Handle bot errors
    this.bot.catch((error, ctx) => {
      logger.error('Bot error occurred', {
        error: error.message,
        stack: error.stack,
        chatId: ctx?.chat?.id,
        updateType: ctx?.updateType
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
      });
    });

    // Graceful shutdown handlers
    process.once('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      this.bot.stop('SIGINT');
    });

    process.once('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      this.bot.stop('SIGTERM');
    });
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      // Ensure temp directory exists
      await fs.ensureDir(config.TEMP_DIR);

      // Start the bot
      await this.bot.launch();
      
      logger.info('🤖 Telegram Google Drive Bot started successfully', {
        botUsername: this.bot.botInfo?.username,
        environment: config.NODE_ENV,
        maxFileSize: config.MAX_FILE_SIZE_MB + 'MB'
      });

      console.log('🚀 Bot is running! Press Ctrl+C to stop.');

    } catch (error) {
      logger.error('Failed to start bot', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }
}

// Create and start the bot
const bot = new TelegramGDriveBot();
bot.start();