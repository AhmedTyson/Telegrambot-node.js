# <img src="https://api.iconify.design/lucide:bot.svg?color=%238A2BE2" width="32" height="32" align="center" /> Telegrambot — Node.js

> **Telegram bot integrated with Google Drive for automated cloud file management.**
> Upload, retrieve, and organize files directly from your chat using Node.js and OAuth 2.0.

<div align="center">

| Project Status | Stack                                                                                                    | Integration                                                                                                       | Auth        |
| :------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :---------- |
| `PRODUCTION`   | ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) | ![Drive](https://img.shields.io/badge/Google_Drive-API-4285F4?style=flat-square&logo=googledrive&logoColor=white) | `OAuth 2.0` |

</div>

---

## <img src="https://api.iconify.design/lucide:list.svg?color=%238A2BE2" width="20" height="20" align="center" /> Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Bot Commands](#-bot-commands)

---

## Overview

This project bridges **Telegram** and **Google Drive** through a Node.js bot, enabling users to manage cloud storage without ever opening a browser. By chatting with the bot, you can upload files directly to Drive, retrieve stored files on demand, and organize your cloud storage — all from the Telegram app on any device.

The bot uses the **Telegram Bot API** for interaction and the **Google Drive API v3** for cloud operations, connected through OAuth 2.0 authentication.

---

---

## <img src="https://api.iconify.design/lucide:sparkles.svg?color=%238A2BE2" width="20" height="20" align="center" /> Features

| Feature            | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| **File Upload**    | Send any file to the bot and it gets stored in your Google Drive automatically |
| **File Retrieval** | Request files from Drive by name — the bot fetches and sends them back         |
| **Cloud Listing**  | List files currently stored in your Drive folder                               |
| **Chat Interface** | No browser or Drive app needed — all operations happen in a Telegram chat      |
| **Cross-Platform** | Works on any device with Telegram installed                                    |

---

---

## <img src="https://api.iconify.design/lucide:cpu.svg?color=%238A2BE2" width="20" height="20" align="center" /> Tech Stack

| Layer         | Technology                                     |
| ------------- | ---------------------------------------------- |
| **Runtime**   | Node.js                                        |
| **Language**  | JavaScript (CommonJS/ES6)                      |
| **Bot API**   | Telegram Bot API (via `node-telegram-bot-api`) |
| **Cloud API** | Google Drive API v3                            |
| **Auth**      | OAuth 2.0 (Google Cloud)                       |
| **Config**    | `.env` environment variables                   |

---

---

## <img src="https://api.iconify.design/lucide:git-pull-request.svg?color=%238A2BE2" width="20" height="20" align="center" /> Architecture

```
User (Telegram)
    ↓  sends message/file
Telegram Bot API
    ↓  webhook / long polling
Node.js Bot Handler (index.js)
    ↓  routes to command handler
Google Drive API Client
    ↓  upload / retrieve / list
Google Drive (Cloud Storage)
```

---

---

## <img src="https://api.iconify.design/lucide:folder-tree.svg?color=%238A2BE2" width="20" height="20" align="center" /> Project Structure

```
Telegrambot-node.js/
├── package.json                    # Node.js dependencies and scripts
├── telegram_bot_architecture.png  # Architecture diagram
├── telegram_bot_features.png      # Features overview image
│
└── telegram-gdrive-bot/           # Core bot implementation
    ├── index.js                   # Bot entry point and command router
    ├── driveService.js            # Google Drive API integration
    ├── auth.js                    # OAuth 2.0 authentication handler
    └── .env.example               # Environment variable template
```

---

---

## <img src="https://api.iconify.design/lucide:rocket.svg?color=%238A2BE2" width="20" height="20" align="center" /> Getting Started

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- A **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
- A **Google Cloud Project** with the Drive API enabled
- OAuth 2.0 credentials (Client ID + Secret) from Google Cloud Console

### 1. Clone & Install

```bash
git clone https://github.com/AhmedTyson/Telegrambot-node.js.git
cd Telegrambot-node.js/telegram-gdrive-bot
npm install
```

### 2. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
DRIVE_FOLDER_ID=your_target_drive_folder_id
```

### 3. Run the Bot

```bash
node index.js
```

The bot is now listening for messages. Open Telegram and start chatting with it.

---

---

## <img src="https://api.iconify.design/lucide:message-square.svg?color=%238A2BE2" width="20" height="20" align="center" /> Bot Commands

| Command           | Description                                     |
| ----------------- | ----------------------------------------------- |
| `/start`          | Initialize the bot and display help             |
| `/upload`         | Followed by a file — uploads it to Google Drive |
| `/list`           | Lists files stored in your Drive folder         |
| `/get <filename>` | Retrieves and sends a file from Drive           |
| `/help`           | Shows available commands                        |

---

> **Note:** You must complete the Google OAuth flow the first time you run the bot. The bot will provide an authorization link in the console — follow it to grant Drive permissions.
