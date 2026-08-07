# 🤖 Minecraft Bot

A 24/7 Minecraft bot that connects to a Bedrock/Java server, keeps it active, and automatically reconnects if it dies or gets disconnected. It also exposes a small HTTP status API so you can monitor the bot from anywhere.

## ✨ Features

- 🔌 Connects to a Minecraft server and spawns a bot
- 🔁 **Auto-reconnect** — reconnects automatically 30 seconds after dying or disconnecting
- 📊 **Status API** — returns the bot connection state and live server status
- 🖥️ Keeps free servers active **24/7**
- ⚙️ Configure everything via a single `.env` file

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A Minecraft server (Bedrock or Java) you want the bot to join

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/surajit20107/minecraft-bot.git
cd minecraft-bot

# 2. Install dependencies
npm install
```

### Configuration

Create a `.env` file in the project root (or copy from `.env.example`):

```env
MC_HOST=SERVER_IP          # Minecraft server IP or hostname
MC_PORT=19132              # Minecraft server port
MC_PLATFORM=bedrock        # Options: bedrock & java
MC_USERNAME=surajit        # Bot username (only needed for offline mode)
```

| Variable      | Description                                          |
| ------------- | ---------------------------------------------------- |
| `MC_HOST`     | The server's IP address or hostname                  |
| `MC_PORT`     | The server's port (e.g. `19132` for Bedrock)         |
| `MC_PLATFORM` | Server type — `bedrock` or `java`                    |
| `MC_USERNAME` | Bot name (only used for offline/offline-mode servers)|
| `PORT`        | (Optional) HTTP server port — defaults to `3000`     |

### Run the Bot

```bash
npm start
```

That's it! The bot will connect to the server, and the status API will be live.

## 📡 API Endpoints

| Method | Path       | Description                                         |
| ------ | ---------- | --------------------------------------------------- |
| `GET`  | `/`         | Returns bot connection status + live server status  |
| `GET`  | `/health`   | Health check — returns `200 OK`                     |
| `HEAD` | `/health`   | Health check (headers only) — returns `200 OK`      |

Example response from `GET /`:

```json
{
  "botStatus": "Bot is connected 🤖",
  "serverStatus": {
    "...": "live server data"
  }
}
```

## 🧩 How It Works

1. On startup, the bot reads your `.env` config and connects to the server.
2. If the bot dies or gets disconnected, it waits **30 seconds** and reconnects automatically.
3. The Express server runs alongside the bot, serving the status and health endpoints.

## 📁 Project Structure

```
├── app.js          # Main entry point — bot + status API
├── .env            # Your configuration (never commit this)
├── .env.example    # Sample configuration template
├── profiles/       # Stores login tokens
└── package.json
```

## 📝 Author

> [github.com/surajit20107](https://github.com/surajit20107)
