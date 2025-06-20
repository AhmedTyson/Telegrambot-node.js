# Telegram Google Drive Bot

A powerful Node.js Telegram bot that automatically downloads files from Google Drive sharing links and sends them directly to your Telegram chat. Built with modern JavaScript, comprehensive error handling, and production-ready logging.

## 🌟 Features

### Core Functionality
- **Google Drive Link Detection**: Automatically detects and processes various Google Drive link formats
- **Smart File Handling**: Downloads files up to 50MB (configurable) with proper MIME type detection
- **Intelligent Sending**: 
  - PDFs and documents sent as `sendDocument`
  - Videos sent as `sendVideo` with streaming support
  - Images sent as `sendPhoto`
  - Audio files sent as `sendAudio`

### Advanced Features
- **Multiple Link Formats Support**:
  - `https://drive.google.com/file/d/FILE_ID/view`
  - `https://drive.google.com/open?id=FILE_ID`
  - `https://docs.google.com/document/d/FILE_ID`
  - Direct download URLs
- **Virus Scan Handling**: Automatically handles Google Drive's virus scan confirmation pages
- **File Size Validation**: Respects Telegram's 50MB file size limit
- **Error Recovery**: Comprehensive error handling with user-friendly messages
- **Security Features**: File type validation and safety checks

### Technical Features
- **Modular Architecture**: Clean separation of concerns with utility modules
- **Winston Logging**: Structured logging with different levels and file rotation
- **Environment Configuration**: Flexible configuration management with dotenv
- **Retry Logic**: Automatic retry for failed downloads with exponential backoff
- **Cleanup**: Automatic cleanup of temporary files

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram-gdrive-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your bot token:
   ```env
   BOT_TOKEN=your_telegram_bot_token_here
   NODE_ENV=development
   LOG_LEVEL=debug
   MAX_FILE_SIZE_MB=50
   ```

4. **Create necessary directories**
   ```bash
   mkdir temp logs
   ```

5. **Start the bot**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## 📋 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_TOKEN` | Telegram Bot API token | - | ✅ |
| `NODE_ENV` | Environment (development/production) | `development` | ❌ |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `debug` (dev) / `info` (prod) | ❌ |
| `MAX_FILE_SIZE_MB` | Maximum file size in MB | `50` | ❌ |
| `DOWNLOAD_TIMEOUT_MS` | Download timeout in milliseconds | `30000` | ❌ |
| `TEMP_DIR` | Temporary files directory | `./temp` | ❌ |
| `ENABLE_ERROR_DETAILS` | Show detailed errors in development | `true` (dev) / `false` (prod) | ❌ |

### File Type Configuration

The bot automatically detects file types and chooses the appropriate Telegram send method:

- **Videos**: `sendVideo` with streaming support
- **Images**: `sendPhoto`
- **Audio**: `sendAudio`
- **Documents**: `sendDocument` (PDFs, Office files, etc.)

## 🔧 Usage

### Bot Commands

- `/start` - Welcome message and usage instructions
- `/help` - Detailed help and supported formats
- `/status` - Bot status and uptime information

### Sending Files

Simply send any Google Drive sharing link to the bot:

```
https://drive.google.com/file/d/1ABC123XYZ789/view?usp=sharing
```

The bot will:
1. Validate the link format
2. Download the file from Google Drive
3. Detect the file type
4. Send it using the appropriate Telegram method
5. Clean up temporary files

### Supported Link Formats

- **Standard sharing**: `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
- **Open format**: `https://drive.google.com/open?id=FILE_ID`
- **Google Docs**: `https://docs.google.com/document/d/FILE_ID/edit`
- **Direct download**: `https://drive.google.com/uc?export=download&id=FILE_ID`

## 🏗️ Architecture

### Project Structure

```
telegram-gdrive-bot/
├── src/
│   ├── bot.js                 # Main bot application
│   ├── config/
│   │   └── index.js          # Configuration management
│   ├── utils/
│   │   ├── googleDrive.js    # Google Drive download logic
│   │   ├── fileHandler.js    # File type detection & validation
│   │   └── urlParser.js      # URL parsing utilities
│   ├── middleware/
│   │   └── errorHandler.js   # Error handling middleware
│   └── logger/
│       └── index.js          # Winston logger configuration
├── package.json
├── .env                      # Environment variables
└── README.md
```

### Key Components

#### 1. URL Parser (`utils/urlParser.js`)
- Validates Google Drive URLs
- Extracts file IDs from various link formats
- Handles URL normalization and format detection

#### 2. Google Drive Downloader (`utils/googleDrive.js`)
- Downloads files using Axios with streaming
- Handles virus scan confirmation pages
- Implements retry logic with exponential backoff
- Manages temporary file cleanup

#### 3. File Handler (`utils/fileHandler.js`)
- MIME type detection using file-type library
- File size validation
- Security checks for dangerous file types
- Filename sanitization

#### 4. Error Handler (`middleware/errorHandler.js`)
- Centralized error handling
- User-friendly error messages
- Comprehensive logging
- Security event handling

#### 5. Logger (`logger/index.js`)
- Winston-based structured logging
- Different log levels and formats
- File rotation and console output
- Performance and security logging

## 🛠️ Development

### Adding New Features

1. **New URL Pattern Support**
   ```javascript
   // In utils/urlParser.js
   const GOOGLE_DRIVE_PATTERNS = {
     newPattern: /your-regex-pattern-here/,
     // ... existing patterns
   };
   ```

2. **Custom File Type Handling**
   ```javascript
   // In utils/fileHandler.js
   export function determineSendMethod(fileType, fileName) {
     if (fileType.mime === 'your/custom-type') {
       return {
         method: 'sendDocument',
         reason: 'Custom file type',
         options: { /* custom options */ }
       };
     }
     // ... existing logic
   }
   ```

3. **Adding Middleware**
   ```javascript
   // In bot.js
   this.bot.use(yourCustomMiddleware);
   ```

### Testing

```bash
# Run the bot in development mode
npm run dev

# Test with various Google Drive links
# Check logs in console and logs/ directory
```

### Debugging

Enable debug logging:
```env
LOG_LEVEL=debug
ENABLE_ERROR_DETAILS=true
```

Monitor logs:
```bash
# Console logs
npm run dev

# File logs (if enabled)
tail -f logs/app.log
tail -f logs/error.log
```

## 🔒 Security Considerations

### File Security
- Validates file types before sending
- Checks for potentially dangerous file extensions
- Sanitizes filenames to prevent path traversal
- Limits file sizes to prevent abuse

### Privacy
- Logs only partial file IDs for privacy
- No sensitive data in logs
- Temporary files are automatically cleaned up

### Rate Limiting
- Handles Telegram API rate limits gracefully
- Implements retry logic with exponential backoff
- Respects Google Drive's download limits

## 📊 Monitoring and Logging

### Log Levels
- **Error**: Critical errors and failures
- **Warn**: Warnings and potential issues
- **Info**: General information and successful operations
- **Debug**: Detailed debugging information

### Log Files (Production)
- `logs/app.log` - General application logs
- `logs/error.log` - Error-specific logs
- `logs/debug.log` - Debug logs (development only)

### Metrics Logged
- Download performance
- File sizes and types
- User interactions
- Error rates
- Security events

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```env
   NODE_ENV=production
   LOG_LEVEL=info
   ENABLE_ERROR_DETAILS=false
   ENABLE_FILE_LOGGING=true
   ```

2. **Using PM2** (Recommended)
   ```bash
   npm install -g pm2
   pm2 start src/bot.js --name "gdrive-bot"
   pm2 save
   pm2 startup
   ```

3. **Using Docker**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY src/ ./src/
   CMD ["node", "src/bot.js"]
   ```

### Health Monitoring

The bot includes:
- Graceful shutdown handling
- Memory usage monitoring
- Uptime tracking
- Error rate monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes
4. Add tests if applicable
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/new-feature`
7. Submit a pull request

### Code Style
- Use ESLint configuration
- Follow existing code patterns
- Add JSDoc comments for functions
- Include error handling

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This bot is for educational and personal use. Ensure you comply with:
- Google Drive Terms of Service
- Telegram Bot API Terms
- Copyright laws
- File sharing regulations

## 🆘 Support

- **Issues**: [GitHub Issues](link-to-issues)
- **Documentation**: This README and inline code comments
- **Logs**: Check application logs for troubleshooting

## 🎯 Roadmap

- [ ] Support for Google Drive folders
- [ ] Batch file processing
- [ ] Custom download scheduling
- [ ] Integration with cloud storage providers
- [ ] Web dashboard for monitoring
- [ ] User permission system
- [ ] File conversion capabilities

---

Made with ❤️ for the Telegram community