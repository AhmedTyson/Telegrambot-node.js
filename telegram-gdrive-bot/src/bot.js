import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import config from "./config/index.js";
import logger from "./logger/index.js";
import {
  parseGoogleDriveUrl,
  isValidGoogleDriveUrl,
} from "./utils/urlParser.js";
import { downloadGoogleDriveFile } from "./utils/googleDrive.js";
import { getFileType, validateFileSize } from "./utils/fileHandler.js";

// Load environment variables
dotenv.config();

/**
 * Enhanced Telegram Bot Class with Dynamic Modules
 * Includes File Manager and Admin Dashboard with dynamic keyboards
 */
class EnhancedTelegramGDriveBot {
  constructor() {
    this.bot = new Telegraf(config.BOT_TOKEN);
    this.userSessions = new Map();
    this.userStats = new Map();
    this.fileHistory = new Map();
    this.adminUsers = new Set(config.ADMIN_USER_IDS || []);
    this.cooldowns = new Map(); // NEW: cooldowns for actions

    this.setupMiddleware();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  // NEW: Content change detection utility
  hasContentChanged(currentText, newText, currentMarkup, newMarkup) {
    if (currentText !== newText) return true;
    const currentMarkupStr = JSON.stringify(currentMarkup || {});
    const newMarkupStr = JSON.stringify(newMarkup || {});
    return currentMarkupStr !== newMarkupStr;
  }

  // NEW: Safe message editing with change detection
  async safeEditMessageText(ctx, newText, options = {}) {
    try {
      const currentMessage = ctx.update.callback_query?.message;
      const currentText = currentMessage?.text || "";
      const currentMarkup = currentMessage?.reply_markup;
      const newMarkup = options.reply_markup;

      if (
        this.hasContentChanged(currentText, newText, currentMarkup, newMarkup)
      ) {
        await ctx.editMessageText(newText, options);
      } else {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery("✅ Already up to date");
        }
      }
      return true;
    } catch (error) {
      if (error.message.includes("message is not modified")) {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery("✅ Already up to date");
        }
        return true;
      }
      throw error;
    }
  }

  // NEW: Action cooldown management
  checkCooldown(userId, action, cooldownTime = 2000) {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const lastAction = this.cooldowns.get(key) || 0;
    if (now - lastAction < cooldownTime) {
      return Math.ceil((cooldownTime - (now - lastAction)) / 1000);
    }
    this.cooldowns.set(key, now);
    return 0;
  }

  /**
   * Setup middleware for the bot
   */
  setupMiddleware() {
    // Request logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const responseTime = Date.now() - start;

      // Track user statistics
      const userId = ctx.from?.id;
      if (userId) {
        this.updateUserStats(userId, "message_count");
      }

      logger.info(`Processed message in ${responseTime}ms`, {
        chatId: ctx.chat?.id,
        messageType: ctx.message?.text ? "text" : "other",
        responseTime,
      });
    });
  }

  /**
   * Setup core command and message handlers
   */
  setupHandlers() {
    // Enhanced start command with dynamic menu
    this.bot.command("start", async (ctx) => {
      const welcomeMessage = `🤖 **Welcome to Enhanced Google Drive File Bot!**\n\n
🚀 **New Features Available:**
• 📁 **File Manager** - Organize and browse your downloaded files
• 📊 **Admin Dashboard** - Advanced analytics and user management
• 🔄 **Smart Downloads** - Intelligent file processing with progress tracking\n\n
**How to use:**
• Send me any Google Drive sharing link
• I'll download the file (up to ${config.MAX_FILE_SIZE_MB}MB)
• Use the menu below to explore all features!\n\n
**Quick Start:** Just paste your Google Drive link and I'll handle the rest! 🔗`;

      const mainMenuKeyboard = this.generateMainMenuKeyboard(ctx.from.id);

      await ctx.replyWithMarkdown(welcomeMessage, {
        reply_markup: mainMenuKeyboard.reply_markup,
      });

      logger.info("Enhanced start command executed", {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
      });
    });

    // Enhanced help command
    this.bot.command("help", async (ctx) => {
      const helpKeyboard = this.generateHelpMenuKeyboard();
      await ctx.replyWithMarkdown(
        `
*🤖 Enhanced Google Drive Bot Help*

*📁 File Operations:*
• Drag & drop Google Drive links for instant download
• Smart file type detection and optimization
• Automatic file organization and categorization

*🔗 Supported Link Formats:*
• https://drive.google.com/file/d/[FILE_ID]/view
• https://drive.google.com/open?id=[FILE_ID]
• https://docs.google.com/document/d/[FILE_ID]

*📊 Advanced Features:*
• File Manager for browsing downloaded content
• Admin Dashboard for analytics and management
• Smart progress tracking and notifications

*⚡ Quick Commands:*
/start - Main menu with all features
/files - Open File Manager
/admin - Admin Dashboard (authorized users)
/stats - Your usage statistics

*🔧 Technical Specs:*
• Max file size: ${config.MAX_FILE_SIZE_MB}MB
• Supported: PDFs, Videos, Images, Documents
• Files must be publicly accessible

Need more help? Use the buttons below! 👇
`,
        {
          reply_markup: helpKeyboard.reply_markup,
        }
      );
    });

    // Enhanced status command
    this.bot.command("status", async (ctx) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const totalUsers = this.userStats.size;
      const totalDownloads = Array.from(this.userStats.values()).reduce(
        (sum, stats) => sum + (stats.download_count || 0),
        0
      );

      const statusKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh Status", "refresh_status")],
        [Markup.button.callback("📊 Detailed Stats", "detailed_stats")],
        [Markup.button.callback("🏠 Main Menu", "main_menu")],
      ]);

      await ctx.replyWithMarkdown(
        `
*🤖 Enhanced Bot Status* ✅

*⚡ System Status:*
🟢 Status: Active & Enhanced
⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
📊 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🔧 Node.js: ${process.version}

*📈 Usage Statistics:*
👥 Total Users: ${totalUsers}
📥 Total Downloads: ${totalDownloads}
📁 Max File Size: ${config.MAX_FILE_SIZE_MB}MB
🚀 Bot Version: Enhanced v2.0

*🔧 Available Modules:*
📁 File Manager: ✅ Active
📊 Admin Dashboard: ✅ Active
🔄 Smart Downloads: ✅ Active
`,
        {
          reply_markup: statusKeyboard.reply_markup,
        }
      );
    });

    // Google Drive link processing with enhanced features
    this.bot.on(message("text"), async (ctx) => {
      const messageText = ctx.message.text;

      if (isValidGoogleDriveUrl(messageText)) {
        await this.handleEnhancedGoogleDriveLink(ctx, messageText);
      } else if (!messageText.startsWith("/")) {
        const suggestionKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback("📖 Show Examples", "show_examples")],
          [Markup.button.callback("🆘 Get Help", "get_help")],
          [Markup.button.callback("🏠 Main Menu", "main_menu")],
        ]);

        await ctx.reply(
          "🔗 Please send me a valid Google Drive sharing link.\n\n" +
            "💡 **Tip:** Look for links that contain 'drive.google.com' or 'docs.google.com'\n\n" +
            "Use the buttons below for examples and help! 👇",
          { reply_markup: suggestionKeyboard.reply_markup }
        );
      }
    });

    // Handler for "My Statistics" button
    this.bot.action("user_stats", async (ctx) => {
      await ctx.answerCbQuery();
      const stats = this.getUserStats(ctx.from.id);
      const statsKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🏠 Main Menu", "main_menu")],
      ]);
      await ctx.editMessageText(
        `*📊 Your Statistics*\n\n` +
          `• Messages sent: ${stats.message_count}\n` +
          `• Files downloaded: ${stats.download_count}\n` +
          `• First seen: ${new Date(stats.first_seen).toLocaleString()}\n` +
          `• Last activity: ${new Date(stats.last_activity).toLocaleString()}`,
        {
          parse_mode: "Markdown",
          reply_markup: statsKeyboard.reply_markup,
        }
      );
    });

    // Handler for "Bot Status" button
    this.bot.action("refresh_status", async (ctx) => {
      // Cooldown for refresh action
      const cooldown = this.checkCooldown(ctx.from.id, "refresh_status");
      if (cooldown > 0) {
        await ctx.answerCbQuery(
          `Please wait ${cooldown} seconds before refreshing again`
        );
        return;
      }

      await ctx.answerCbQuery();
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const totalUsers = this.userStats.size;
      const totalDownloads = Array.from(this.userStats.values()).reduce(
        (sum, stats) => sum + (stats.download_count || 0),
        0
      );

      const statusKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh Status", "refresh_status")],
        [Markup.button.callback("🏠 Main Menu", "main_menu")],
      ]);

      await this.safeEditMessageText(
        ctx,
        `*🤖 Enhanced Bot Status* ✅\n\n` +
          `*⚡ System Status:*\n` +
          `🟢 Status: Active & Enhanced\n` +
          `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
          `📊 Memory: ${Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024
          )}MB\n` +
          `🔧 Node.js: ${process.version}\n\n` +
          `*📈 Usage Statistics:*\n` +
          `👥 Total Users: ${totalUsers}\n` +
          `📥 Total Downloads: ${totalDownloads}\n` +
          `📁 Max File Size: ${config.MAX_FILE_SIZE_MB}MB\n` +
          `🚀 Bot Version: Enhanced v2.0\n\n` +
          `*🔧 Available Modules:*\n` +
          `📁 File Manager: ✅ Active\n` +
          `📊 Admin Dashboard: ✅ Active\n` +
          `🔄 Smart Downloads: ✅ Active`,
        {
          parse_mode: "Markdown",
          reply_markup: statusKeyboard.reply_markup,
        }
      );
    });

    // ====================
    // 📁 FILE MANAGER MODULE
    // ====================

    // File Manager main command
    this.bot.command("files", async (ctx) => {
      await this.showFileManagerInterface(ctx);
    });

    // File Manager dynamic keyboard handlers
    this.bot.action("file_manager", async (ctx) => {
      await ctx.answerCbQuery();
      await this.showFileManagerInterface(ctx);
    });

    this.bot.action(/^fm_category_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const category = ctx.match[1];
      await this.showFilesByCategory(ctx, category);
    });

    this.bot.action(/^fm_file_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const fileId = ctx.match[1];
      await this.showFileDetails(ctx, fileId);
    });

    this.bot.action("fm_organize", async (ctx) => {
      await ctx.answerCbQuery();
      await this.showOrganizeMenu(ctx);
    });

    this.bot.action("fm_search", async (ctx) => {
      await ctx.answerCbQuery();
      await this.initiateFileSearch(ctx);
    });

    // Handler for downloading a file from File Manager
    this.bot.action(/^download_file_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const fileId = ctx.match[1];
      const userId = ctx.from.id;
      const userFiles = this.getUserFiles(userId);
      const fileInfo = userFiles.find((f) => f.id === fileId);

      if (!fileInfo) {
        await ctx.reply("❌ File not found or no longer available.");
        return;
      }

      try {
        // You may want to check if the file still exists in storage
        // For this example, we assume you have a way to retrieve the file
        // If you store the file path, use it here:
        if (!fileInfo.driveFileId) {
          await ctx.reply("❌ Original Google Drive file ID not found.");
          return;
        }
        // Re-download from Google Drive if needed
        const downloadResult = await downloadGoogleDriveFile(
          fileInfo.driveFileId
        );
        if (!downloadResult.success) {
          throw new Error(downloadResult.error || "Download failed");
        }
        const { filePath, fileName, fileSize } = downloadResult;
        const fileType = await getFileType(filePath);

        await this.sendFileByType(ctx, filePath, fileName, fileType);

        await fs.remove(filePath); // Clean up temp file
      } catch (error) {
        logger.error("Error downloading file from File Manager", {
          error: error.message,
          stack: error.stack,
        });
        await ctx.reply("❌ Could not download the file. Please try again.");
      }
    });

    // Handler for deleting a file from File Manager
    this.bot.action(/^delete_file_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const fileId = ctx.match[1];
      const userId = ctx.from.id;
      let userFiles = this.getUserFiles(userId);

      const fileIndex = userFiles.findIndex((f) => f.id === fileId);
      if (fileIndex === -1) {
        await ctx.reply("❌ File not found or already deleted.");
        return;
      }

      // Remove file from user's history
      userFiles.splice(fileIndex, 1);
      this.fileHistory.set(userId, userFiles);

      await ctx.editMessageText("🗑️ File deleted successfully.", {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Files", "file_manager")],
          [Markup.button.callback("🏠 Main Menu", "main_menu")],
        ]).reply_markup,
      });
    });

    // ====================
    // 📊 ADMIN DASHBOARD MODULE
    // ====================

    // Admin Dashboard main command
    this.bot.command("admin", async (ctx) => {
      if (this.isAdmin(ctx.from.id)) {
        await this.showAdminDashboard(ctx);
      } else {
        await ctx.reply("🚫 Access denied. Admin privileges required.");
      }
    });

    // Admin Dashboard dynamic keyboard handlers
    this.bot.action("admin_dashboard", async (ctx) => {
      await ctx.answerCbQuery();
      if (this.isAdmin(ctx.from.id)) {
        await this.showAdminDashboard(ctx);
      } else {
        await ctx.reply("🚫 Access denied. Admin privileges required.");
      }
    });

    this.bot.action("admin_users", async (ctx) => {
      await ctx.answerCbQuery();
      await this.showUserManagement(ctx);
    });

    this.bot.action("admin_stats", async (ctx) => {
      await ctx.answerCbQuery();
      await this.showDetailedStatistics(ctx);
    });

    this.bot.action("admin_broadcast", async (ctx) => {
      await ctx.answerCbQuery();
      await this.initiateBroadcast(ctx);
    });

    this.bot.action(/^admin_user_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.match[1];
      await this.showUserDetails(ctx, userId);
    });

    // ====================
    // SHARED ACTION HANDLERS
    // ====================

    // Main menu navigation
    this.bot.action("main_menu", async (ctx) => {
      await ctx.answerCbQuery();
      const mainMenuKeyboard = this.generateMainMenuKeyboard(ctx.from.id);
      await ctx.editMessageText(
        "🏠 **Main Menu**\nChoose an option below to get started:",
        {
          parse_mode: "Markdown",
          reply_markup: mainMenuKeyboard.reply_markup,
        }
      );
    });

    // Enhanced Google Drive link processing from buttons
    this.bot.action("download_file", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText("⏳ Starting enhanced download process...");

      const originalMessage =
        ctx.update.callback_query.message.reply_to_message;
      if (originalMessage && originalMessage.text) {
        await this.handleEnhancedGoogleDriveLink(ctx, originalMessage.text);
      } else {
        await ctx.reply(
          "❌ Could not retrieve the Google Drive link. Please send it again."
        );
      }
    });

    // Show examples
    this.bot.action("show_examples", async (ctx) => {
      await ctx.answerCbQuery();
      const exampleKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back", "main_menu")],
      ]);

      await ctx.editMessageText(
        `
*📖 Google Drive Link Examples*

*✅ Valid link formats:*

1️⃣ **Standard sharing link:**
\`https://drive.google.com/file/d/1ABC123xyz/view?usp=sharing\`

2️⃣ **Open format:**
\`https://drive.google.com/open?id=1ABC123xyz\`

3️⃣ **Google Docs:**
\`https://docs.google.com/document/d/1ABC123xyz/edit\`

4️⃣ **Google Sheets:**
\`https://docs.google.com/spreadsheets/d/1ABC123xyz/edit\`

*💡 Tips:*
• Make sure the file is shared with "Anyone with the link"
• File size must be under ${config.MAX_FILE_SIZE_MB}MB
• All file types are supported!

*🎯 Just copy any of these link formats and send them to me!*
`,
        {
          parse_mode: "Markdown",
          reply_markup: exampleKeyboard.reply_markup,
        }
      );
    });
  }

  /**
   * Generate Main Menu Keyboard with Dynamic Options
   */
  generateMainMenuKeyboard(userId) {
    const isAdmin = this.isAdmin(userId);
    const userStats = this.getUserStats(userId);

    const buttons = [
      [
        Markup.button.callback("📁 File Manager", "file_manager"),
        Markup.button.callback("📊 My Statistics", "user_stats"),
      ],
      [
        Markup.button.callback("📖 Help & Examples", "show_examples"),
        Markup.button.callback("⚙️ Bot Status", "refresh_status"),
      ],
    ];

    // Add admin button for authorized users
    if (isAdmin) {
      buttons.push([
        Markup.button.callback("🔧 Admin Dashboard", "admin_dashboard"),
      ]);
    }

    // Add quick actions based on user history
    if (userStats.download_count > 0) {
      buttons.push([
        Markup.button.callback("🕒 Recent Downloads", "recent_downloads"),
      ]);
    }

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Generate Help Menu Keyboard
   */
  generateHelpMenuKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("📖 Link Examples", "show_examples"),
        Markup.button.callback("🎥 Video Tutorial", "video_tutorial"),
      ],
      [
        Markup.button.callback("🆘 Contact Support", "contact_support"),
        Markup.button.callback("📋 FAQ", "show_faq"),
      ],
      [Markup.button.callback("🏠 Main Menu", "main_menu")],
    ]);
  }

  /**
   * 📁 FILE MANAGER MODULE IMPLEMENTATION
   */

  async showFileManagerInterface(ctx) {
    const userId = ctx.from.id;
    const userFiles = this.getUserFiles(userId);
    const categories = this.categorizeFiles(userFiles);

    // Generate dynamic keyboard based on available file categories
    const categoryButtons = [];

    if (categories.documents.length > 0) {
      categoryButtons.push(
        Markup.button.callback(
          `📄 Documents (${categories.documents.length})`,
          "fm_category_documents"
        )
      );
    }

    if (categories.videos.length > 0) {
      categoryButtons.push(
        Markup.button.callback(
          `🎥 Videos (${categories.videos.length})`,
          "fm_category_videos"
        )
      );
    }

    if (categories.images.length > 0) {
      categoryButtons.push(
        Markup.button.callback(
          `📷 Images (${categories.images.length})`,
          "fm_category_images"
        )
      );
    }

    if (categories.others.length > 0) {
      categoryButtons.push(
        Markup.button.callback(
          `📦 Others (${categories.others.length})`,
          "fm_category_others"
        )
      );
    }

    // Arrange buttons in rows (2 per row)
    const rows = [];
    for (let i = 0; i < categoryButtons.length; i += 2) {
      rows.push(categoryButtons.slice(i, i + 2));
    }

    // Add utility buttons
    rows.push([
      Markup.button.callback("🔍 Search Files", "fm_search"),
      Markup.button.callback("🗂️ Organize", "fm_organize"),
    ]);

    rows.push([
      Markup.button.callback("🔄 Refresh", "file_manager"),
      Markup.button.callback("🏠 Main Menu", "main_menu"),
    ]);

    const keyboard = Markup.inlineKeyboard(rows);

    const totalFiles = userFiles.length;
    const messageText = `
*📁 File Manager Dashboard*

*📊 Your File Overview:*
📄 Documents: ${categories.documents.length}
🎥 Videos: ${categories.videos.length}
📷 Images: ${categories.images.length}
📦 Others: ${categories.others.length}

*📈 Total Files: ${totalFiles}*

${
  totalFiles > 0
    ? "*Choose a category below to browse your files:* 👇"
    : "*No files found. Start by downloading files from Google Drive links!* 🔗"
}`;

    if (ctx.update.callback_query) {
      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: keyboard.reply_markup,
      });
    } else {
      await ctx.replyWithMarkdown(messageText, {
        reply_markup: keyboard.reply_markup,
      });
    }
  }

  async showFilesByCategory(ctx, category) {
    const userId = ctx.from.id;
    const userFiles = this.getUserFiles(userId);
    const categories = this.categorizeFiles(userFiles);
    const categoryFiles = categories[category] || [];

    const categoryEmojis = {
      documents: "📄",
      videos: "🎥",
      images: "📷",
      others: "📦",
    };

    const categoryNames = {
      documents: "Documents",
      videos: "Videos",
      images: "Images",
      others: "Other Files",
    };

    // Generate dynamic file list buttons (max 10 files per page)
    const fileButtons = categoryFiles
      .slice(0, 10)
      .map((file) => [
        Markup.button.callback(
          `${this.getFileEmoji(file.type)} ${file.name.substring(0, 30)}${
            file.name.length > 30 ? "..." : ""
          }`,
          `fm_file_${file.id}`
        ),
      ]);

    // Add navigation buttons
    fileButtons.push([
      Markup.button.callback("🔙 Back to Categories", "file_manager"),
      Markup.button.callback("🏠 Main Menu", "main_menu"),
    ]);

    if (categoryFiles.length > 10) {
      fileButtons.splice(-1, 0, [
        Markup.button.callback("⬅️ Previous", `fm_prev_${category}_0`),
        Markup.button.callback("➡️ Next", `fm_next_${category}_10`),
      ]);
    }

    const keyboard = Markup.inlineKeyboard(fileButtons);

    const messageText = `
*${categoryEmojis[category]} ${categoryNames[category]} Browser*

*📊 Category Overview:*
Total Files: ${categoryFiles.length}
Showing: ${Math.min(10, categoryFiles.length)} files

${
  categoryFiles.length > 0
    ? "*Click on any file below to view details:* 👇"
    : "*No files in this category yet.*"
}`;

    await ctx.editMessageText(messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboard.reply_markup,
    });
  }

  /**
   * 📊 ADMIN DASHBOARD MODULE IMPLEMENTATION
   */

  async showAdminDashboard(ctx) {
    const totalUsers = this.userStats.size;
    const totalDownloads = Array.from(this.userStats.values()).reduce(
      (sum, stats) => sum + (stats.download_count || 0),
      0
    );
    const activeUsers = Array.from(this.userStats.values()).filter(
      (stats) => stats.last_activity > Date.now() - 24 * 60 * 60 * 1000
    ).length;

    // Generate dynamic admin keyboard
    const adminButtons = [
      [
        Markup.button.callback("👥 User Management", "admin_users"),
        Markup.button.callback("📊 Detailed Stats", "admin_stats"),
      ],
      [
        Markup.button.callback("📢 Broadcast Message", "admin_broadcast"),
        Markup.button.callback("🔧 System Logs", "admin_logs"),
      ],
      [
        Markup.button.callback("⚙️ Bot Settings", "admin_settings"),
        Markup.button.callback("🚨 Emergency Controls", "admin_emergency"),
      ],
      [
        Markup.button.callback("🔄 Refresh Dashboard", "admin_dashboard"),
        Markup.button.callback("🏠 Main Menu", "main_menu"),
      ],
    ];

    const keyboard = Markup.inlineKeyboard(adminButtons);

    const messageText = `
*🔧 Admin Dashboard*

*📈 Real-time Statistics:*
👥 Total Users: ${totalUsers}
🔥 Active Users (24h): ${activeUsers}
📥 Total Downloads: ${totalDownloads}
⚡ Bot Uptime: ${Math.floor(process.uptime() / 3600)}h

*🚀 System Status:*
💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🔄 Response Time: Optimal
🛡️ Security: Active

*🎛️ Available Controls:* 👇`;

    if (ctx.update.callback_query) {
      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: keyboard.reply_markup,
      });
    } else {
      await ctx.replyWithMarkdown(messageText, {
        reply_markup: keyboard.reply_markup,
      });
    }
  }

  async showUserManagement(ctx) {
    const users = Array.from(this.userStats.entries())
      .sort(([, a], [, b]) => (b.last_activity || 0) - (a.last_activity || 0))
      .slice(0, 8); // Show top 8 most recent users

    // Generate dynamic user list buttons
    const userButtons = users.map(([userId, stats]) => [
      Markup.button.callback(
        `👤 User ${userId.toString().substring(0, 8)}... (${
          stats.download_count || 0
        } downloads)`,
        `admin_user_${userId}`
      ),
    ]);

    // Add navigation buttons
    userButtons.push([
      Markup.button.callback("🔍 Search User", "admin_search_user"),
      Markup.button.callback("📊 Export Data", "admin_export_users"),
    ]);

    userButtons.push([
      Markup.button.callback("🔙 Back to Dashboard", "admin_dashboard"),
      Markup.button.callback("🏠 Main Menu", "main_menu"),
    ]);

    const keyboard = Markup.inlineKeyboard(userButtons);

    const messageText = `
*👥 User Management Panel*

*📊 User Overview:*
Total Registered Users: ${this.userStats.size}
Showing Recent: ${users.length} users

*🔧 Management Tools:*
• View detailed user profiles
• Monitor download activity
• Export user data
• Search specific users

*👇 Select a user to view details:*`;

    await ctx.editMessageText(messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboard.reply_markup,
    });
  }

  async showFileDetails(ctx, fileId) {
    try {
      const userId = ctx.from.id;
      const userFiles = this.getUserFiles(userId);
      const fileInfo = userFiles.find((f) => f.id === fileId);

      if (!fileInfo) {
        await ctx.answerCbQuery();
        await ctx.reply("❌ File not found or no longer available.");
        return;
      }

      const detailsMessage =
        `📄 *File Details*\n` +
        `📝 Name: ${fileInfo.name}\n` +
        `📏 Size: ${this.formatFileSize(fileInfo.size)}\n` +
        `📅 Added: ${
          fileInfo.downloadDate
            ? new Date(fileInfo.downloadDate).toLocaleString()
            : "Unknown"
        }\n` +
        `🔢 File ID: ${fileId.substring(0, 8)}...`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback("📥 Download", `download_file_${fileId}`),
          Markup.button.callback("🗑️ Delete", `delete_file_${fileId}`),
        ],
        [Markup.button.callback("🔙 Back to Files", "file_manager")],
      ]);

      await ctx.editMessageText(detailsMessage, {
        parse_mode: "Markdown",
        reply_markup: keyboard.reply_markup,
      });
    } catch (error) {
      logger.error("Error showing file details", {
        error: error.message,
        stack: error.stack,
      });
      await ctx.reply("❌ Could not display file details. Please try again.");
    }
  }

  // Helper to format file size
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
    else return (bytes / 1048576).toFixed(2) + " MB";
  }

  /**
   * Enhanced Google Drive Link Handler with Progress Tracking
   */
  async handleEnhancedGoogleDriveLink(ctx, messageText) {
    // Show initial processing message with dynamic keyboard
    const processingKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback("⏹️ Cancel Download", "cancel_download")],
      [Markup.button.callback("📊 Show Progress", "show_progress")],
    ]);

    const processingMessage = await ctx.reply(
      "🔄 **Enhanced Processing Started**\n⏳ Analyzing Google Drive link...",
      {
        parse_mode: "Markdown",
        reply_markup: processingKeyboard.reply_markup,
      }
    );

    try {
      // Parse the Google Drive URL
      const fileId = parseGoogleDriveUrl(messageText);
      if (!fileId) {
        throw new Error("Could not extract file ID from the URL");
      }

      // Update progress
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        null,
        "📥 **Downloading from Google Drive**\n🔍 Validating file permissions...",
        { parse_mode: "Markdown" }
      );

      // Download the file
      const downloadResult = await downloadGoogleDriveFile(fileId);
      if (!downloadResult.success) {
        throw new Error(downloadResult.error || "Download failed");
      }

      const { filePath, fileName, fileSize } = downloadResult;

      // Validate file size
      if (!validateFileSize(fileSize, config.MAX_FILE_SIZE_MB)) {
        await fs.remove(filePath);
        throw new Error(
          `File size (${Math.round(
            fileSize / 1024 / 1024
          )}MB) exceeds the limit of ${config.MAX_FILE_SIZE_MB}MB`
        );
      }

      // Update progress
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        null,
        "🔍 **Processing Complete**\n📤 Preparing file for delivery...",
        { parse_mode: "Markdown" }
      );

      // Process and send file
      const fileType = await getFileType(filePath);
      await this.sendFileByType(ctx, filePath, fileName, fileType);

      // Store file in user history
      this.addToUserFileHistory(ctx.from.id, {
        id: this.generateFileId(),
        name: fileName,
        size: fileSize,
        type: fileType?.mime || "unknown",
        downloadDate: new Date(),
        driveFileId: fileId,
      });

      // Update user statistics
      this.updateUserStats(ctx.from.id, "download_count");

      // Clean up
      await fs.remove(filePath);
      await ctx.deleteMessage(processingMessage.message_id);

      // Show success message with file manager option
      const successKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📁 View in File Manager", "file_manager")],
        [Markup.button.callback("🔗 Download Another", "main_menu")],
      ]);

      await ctx.reply(
        `✅ **Download Complete!**\n📄 ${fileName}\n💾 Size: ${Math.round(
          fileSize / 1024
        )}KB\n\n🎉 File delivered successfully!`,
        {
          parse_mode: "Markdown",
          reply_markup: successKeyboard.reply_markup,
        }
      );

      logger.info("Enhanced file processing completed", {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        fileName,
        fileSize: Math.round(fileSize / 1024) + "KB",
        fileType: fileType?.mime || "unknown",
      });
    } catch (error) {
      logger.error("Enhanced processing error", {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        error: error.message,
        stack: error.stack,
      });

      const errorKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Try Again", "main_menu")],
        [Markup.button.callback("🆘 Get Help", "get_help")],
      ]);

      const errorMessage = this.generateUserErrorMessage(error);

      await this.safeEditMessageText(
        ctx,
        `❌ **Processing Failed**\n\n${errorMessage}`,
        {
          parse_mode: "Markdown",
          reply_markup: errorKeyboard.reply_markup,
        }
      );
    }
  }

  /**
   * Utility Methods for Dynamic Features
   */

  // User Statistics Management
  updateUserStats(userId, metric) {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        message_count: 0,
        download_count: 0,
        first_seen: Date.now(),
        last_activity: Date.now(),
      });
    }

    const stats = this.userStats.get(userId);
    stats[metric] = (stats[metric] || 0) + 1;
    stats.last_activity = Date.now();
    this.userStats.set(userId, stats);
  }

  getUserStats(userId) {
    return (
      this.userStats.get(userId) || {
        message_count: 0,
        download_count: 0,
        first_seen: Date.now(),
        last_activity: Date.now(),
      }
    );
  }

  // File Management
  addToUserFileHistory(userId, fileData) {
    if (!this.fileHistory.has(userId)) {
      this.fileHistory.set(userId, []);
    }

    const userFiles = this.fileHistory.get(userId);
    userFiles.unshift(fileData); // Add to beginning

    // Keep only last 50 files per user
    if (userFiles.length > 50) {
      userFiles.splice(50);
    }

    this.fileHistory.set(userId, userFiles);
  }

  getUserFiles(userId) {
    return this.fileHistory.get(userId) || [];
  }

  categorizeFiles(files) {
    return {
      documents: files.filter(
        (f) =>
          f.type?.startsWith("application/") || f.type?.includes("document")
      ),
      videos: files.filter((f) => f.type?.startsWith("video/")),
      images: files.filter((f) => f.type?.startsWith("image/")),
      others: files.filter(
        (f) =>
          !f.type?.startsWith("application/") &&
          !f.type?.includes("document") &&
          !f.type?.startsWith("video/") &&
          !f.type?.startsWith("image/")
      ),
    };
  }

  getFileEmoji(mimeType) {
    if (!mimeType) return "📄";

    if (mimeType.startsWith("video/")) return "🎥";
    if (mimeType.startsWith("image/")) return "📷";
    if (mimeType.includes("pdf")) return "📕";
    if (mimeType.includes("document")) return "📘";
    if (mimeType.includes("spreadsheet")) return "📊";
    if (mimeType.includes("presentation")) return "📑";
    if (mimeType.startsWith("audio/")) return "🎵";
    if (mimeType.includes("zip") || mimeType.includes("archive")) return "📦";

    return "📄";
  }

  generateFileId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Admin Functions
  isAdmin(userId) {
    return this.adminUsers.has(userId);
  }

  // Send file by type (existing method)
  async sendFileByType(ctx, filePath, fileName, fileType) {
    const caption = `📄 ${fileName}`;
    const fileBuffer = await fs.readFile(filePath);

    if (fileType?.mime) {
      if (fileType.mime.startsWith("video/")) {
        await ctx.replyWithVideo(
          { source: fileBuffer, filename: fileName },
          {
            caption,
            supports_streaming: true,
            parse_mode: "Markdown",
          }
        );
        return;
      }

      if (fileType.mime.startsWith("image/")) {
        await ctx.replyWithPhoto(
          { source: fileBuffer, filename: fileName },
          { caption, parse_mode: "Markdown" }
        );
        return;
      }
    }

    await ctx.replyWithDocument(
      { source: fileBuffer, filename: fileName },
      { caption, parse_mode: "Markdown" }
    );
  }

  // Error handling (existing method)
  setupErrorHandling() {
    this.bot.catch(async (error, ctx) => {
      // Handle "message is not modified" errors globally
      if (error.message.includes("message is not modified")) {
        logger.debug('Handled "message not modified" error', {
          chatId: ctx?.chat?.id,
          userId: ctx?.from?.id,
        });
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery("✅ Already up to date").catch(() => {});
        }
        return;
      }

      logger.error("Enhanced bot error occurred", {
        error: error.message,
        stack: error.stack,
        chatId: ctx?.chat?.id,
        updateType: ctx?.updateType,
      });

      if (ctx && ctx.reply) {
        const userMessage = this.generateUserErrorMessage(error);
        ctx.reply(userMessage).catch((replyError) => {
          logger.error("Failed to send error message to user", {
            originalError: error.message,
            replyError: replyError.message,
            chatId: ctx.chat?.id,
          });
        });
      }
    });

    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception", {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection", {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    process.once("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully");
      this.bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      logger.info("Received SIGTERM, shutting down gracefully");
      this.bot.stop("SIGTERM");
    });
  }

  generateUserErrorMessage(error) {
    const errorMessage = error && error.message ? error.message.toString() : "";
    const errorCode = error?.code;

    if (errorCode === 429) {
      return "⏳ I'm being rate limited by Telegram. Please wait a moment and try again.";
    }

    if (errorCode === 403) {
      return "🚫 I don't have permission to perform this action. Please check your file's sharing settings.";
    }

    if (
      errorMessage.includes("file size") &&
      errorMessage.includes("exceeds")
    ) {
      return `📁 File is too large! Maximum allowed size is ${config.MAX_FILE_SIZE_MB}MB.`;
    }

    if (errorMessage.includes("not found") || errorMessage.includes("404")) {
      return "🔍 File not found. Please check if the Google Drive link is correct and the file is publicly accessible.";
    }

    if (
      errorMessage.includes("access denied") ||
      errorMessage.includes("403") ||
      errorMessage.includes("permission")
    ) {
      return '🔒 Access denied. Please make sure the file is shared with "Anyone with the link" permission in Google Drive.';
    }

    if (errorMessage.includes("Could not extract file ID")) {
      return "❗ I couldn't extract a valid file ID from your link. Please double-check the link format.";
    }

    if (errorMessage.includes("Download failed")) {
      return "⚠️ Download failed. The file may be restricted or temporarily unavailable. Please try again later.";
    }

    if (errorMessage.includes("Could not retrieve the Google Drive link")) {
      return "❗ I couldn't find a Google Drive link in your message. Please send a valid link.";
    }

    // Fallback for unknown errors
    return `❌ An unexpected error occurred: ${
      errorMessage || "Unknown error."
    } Please try again or contact support if the problem persists.`;
  }

  /**
   * Start the enhanced bot
   */
  async start() {
    try {
      await fs.ensureDir(config.TEMP_DIR);
      await this.bot.launch();

      logger.info(
        "🚀 Enhanced Telegram Google Drive Bot started successfully",
        {
          botUsername: this.bot.botInfo?.username,
          environment: config.NODE_ENV,
          maxFileSize: config.MAX_FILE_SIZE_MB + "MB",
          modulesActive: ["FileManager", "AdminDashboard", "SmartDownloads"],
        }
      );

      console.log(
        "🎉 Enhanced Bot is running with dynamic modules! Press Ctrl+C to stop."
      );
    } catch (error) {
      logger.error("Failed to start enhanced bot", {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  }

  async showOrganizeMenu(ctx) {
    await ctx.editMessageText(
      "🗂️ The organize feature is coming soon! Stay tuned for updates.",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Main Menu", "main_menu")],
        ]).reply_markup,
      }
    );
  }
}

// Create and start the enhanced bot
const enhancedBot = new EnhancedTelegramGDriveBot();
enhancedBot.start();

// For debugging: expose bot instance
if (process.env.NODE_ENV === "development") {
  global.enhancedBot = enhancedBot;
  console.log("🔧 Enhanced bot instance exposed for debugging.");
}
