# Minecraft Bedrock AI Bot

A Minecraft Bedrock Edition bot powered by OpenAI that connects to your server and responds to player queries via chat. Includes a built-in web dashboard for monitoring bot and server status.

## Features

- **AI-Powered Chat** - Players can ask questions by typing `bot <question>` in chat, and the bot responds using OpenAI's API.
- **Realtime Web Search (Tavily)** - AI can call `askTavily` via OpenAI tool-calling to fetch up-to-date information (news, weather, prices, scores, recent releases) when training data is insufficient. Falls back to model knowledge if `TAVILY_API_KEY` is not set or search fails.
- **Auto-Reconnect** - Automatically reconnects after death or disconnection with a 30-second delay.
- **Web Dashboard** - Real-time status page showing bot connection state and server details (players, version, ping, MOTD).
- **Health Endpoint** - `/health` endpoint for uptime monitoring.
- **Offline Mode Support** - Works with both online and offline Minecraft servers.
- **Configurable AI Model** - Use any OpenAI-compatible API endpoint with your preferred model.

## Requirements

- Node.js 18+
- A Minecraft Bedrock Edition server
- An OpenAI API key (or any OpenAI-compatible API)
- (Optional) A [Tavily API key](https://tavily.com) for realtime search - if omitted the bot answers from model training data only

## Installation & Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/surajit20107/mc-bot-new-test.git
   cd mc-bot-new-test
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file from the sample:

   ```bash
   cp .env.sample .env
   ```

4. Configure your environment variables in `.env`:

   ```env
   MC_HOST=""            # your server IP
   MC_PORT=""            # your server port
   MC_USERNAME=""        # bot name
   MC_PLATFORM="bedrock" # options: [bedrock or java]
   MC_VERSION=""         # optional: override auto-detected version
   MC_PING_TIMEOUT_MS="" # optional: RakNet ping timeout in ms (default: 5000)
   MC_CONNECT_TIMEOUT_MS="" # optional: connection timeout in ms (default: 15000)
   MC_SIGNALLING_URL=""  # optional: NetherNet signalling origin (auto-derived from MC_HOST/MC_PORT)
   OPENAI_BASE_URL=""    # any OpenAI compatible API endpoint
   OPENAI_API_KEY=""     # your AI API key
   AI_MODEL=""           # your AI model (e.g. gpt-4, gpt-3.5-turbo) default: auto
   TAVILY_API_KEY=""     # optional: Tavily API key for realtime web search
   ```

5. Start the bot:

   ```bash
   npm start
   ```

## Usage

Once running, the bot connects to your Minecraft server automatically.

- **In-game:** Type `bot <your question>` in chat to get an AI-generated response.
  - Example realtime queries: `bot what is the latest Minecraft update?`, `bot weather in Kolkata today`, `bot score of yesterday's match`. When a realtime query is detected, the AI calls Tavily (`src/bot/tavily.js`) and answers with fresh results.
- **Dashboard:** Visit `http://localhost:3000` (or your configured `PORT`) to view the bot and server status.
- **Health Check:** `GET /health` returns `200 OK` when the bot is running.

## Project Structure

```
minecraft-bot/
├── src/
│   ├── server.js                     # Entry point — starts Express + bot
│   ├── bot/
│   │   ├── BotManager.js             # Connection, lifecycle & auto-reconnect
│   │   ├── tavily.js                 # Tavily realtime search wrapper (askTavily)
│   │   ├── index.js                  # Bot exports
│   │   └── handlers/
│   │       └── chat.handler.js       # `bot <question>` handler
│   ├── config/
│   │   ├── index.js                  # Env config & validation
│   │   └── constants.js              # Default constants & AI prompt
│   ├── services/
│   │   ├── ai.service.js             # OpenAI integration + Tavily tool-calling logic
│   │   └── serverStatus.service.js   # Server ping & dynamic version resolution
│   ├── utils/
│   │   └── logger.js                 # Structured logger
│   └── web/
│       ├── app.js                    # Express app factory
│       ├── routes/
│       │   ├── health.routes.js      # GET /health
│       │   └── dashboard.routes.js   # GET /
│       └── views/
│           └── dashboard.view.js     # Dashboard HTML template
├── package.json                      # Dependencies and scripts (@tavily/core included)
├── .env.sample                       # Environment variable template
├── .gitignore                        # Git ignore rules
└── profiles/                         # Cached auth tokens (gitignored)
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MC_HOST` | Yes | - | Minecraft server IP or hostname |
| `MC_PORT` | No | `19132` | Minecraft server port |
| `MC_USERNAME` | No | `surajit_bot` | Bot's in-game username |
| `MC_PLATFORM` | No | `bedrock` | Server platform (`bedrock` or `java`) |
| `MC_VERSION` | No | _(auto)_ | Minecraft version override (auto-resolved from server ping if empty) |
| `MC_PING_TIMEOUT_MS` | No | `5000` | RakNet/NetherNet ping timeout in milliseconds |
| `MC_CONNECT_TIMEOUT_MS` | No | `15000` | Connection timeout in milliseconds |
| `MC_SIGNALLING_URL` | No | _(auto)_ | NetherNet HTTP(S) signalling origin. Derived as `https://<host>:<port>` when unset |
| `OPENAI_BASE_URL` | Yes | - | OpenAI-compatible API endpoint |
| `OPENAI_API_KEY` | Yes | - | Your API key |
| `AI_MODEL` | No | `auto` | Model to use for chat completions |
| `TAVILY_API_KEY` | No | - | Tavily API key for realtime search (`src/bot/tavily.js`). If unset, `askTavily` returns `false` and AI falls back to training data |
| `PORT` | No | `3000` | Web server port |
| `HOST` | No | `0.0.0.0` | Web server host |

## How It Works

1. The bot resolves the Minecraft version dynamically via the status ping (`src/services/serverStatus.service.js`) or `MC_VERSION` if set, then connects using `bedrock-protocol` (`src/bot/BotManager.js`). Both legacy RakNet and modern NetherNet servers are supported: NetherNet HTTP(S) signalling (`GET /v1/join`) is probed in parallel with the RakNet UDP ping, and the discovered transport is reused for the connection.
2. It listens for incoming `text` (chat) packets via `src/bot/handlers/chat.handler.js`.
3. When a message starts with `bot `, the rest of the message is sent to the OpenAI-compatible API (`src/services/ai.service.js`).
4. The AI is configured with a function tool `askTavily` (defined in `src/services/ai.service.js:22` and implemented in `src/bot/tavily.js:3`). If the user asks about current events, news, weather, prices, etc., the model calls the tool; `askTavily` queries Tavily (`searchDepth: "advanced"`, `includeAnswer: "basic"`) and returns `answer` or top 3 `results` content. The result is appended as a `tool` message and the model generates a final grounded answer. Providers without tool support fall back to a plain completion without Tavily.
5. The AI response is sent back to the server as a chat message.
6. If the bot dies or disconnects, `BotManager` waits 30 seconds and reconnects automatically. The web dashboard (`src/web/`) exposes bot/server status at `GET /` and `GET /health`.

### Tavily Integration Details

- **File:** `src/bot/tavily.js:3` — exports `askTavily(query)`
- **Dependency:** `@tavily/core@^0.7.13` (see `package.json:11`)
- **Behaviour:** Returns `response.answer` if present, otherwise joined top-3 `results[].content`, otherwise `false`. On missing key or error it logs and returns `false` so `ai.service.js:100` can instruct the model to fall back to training data.
- **Env:** `TAVILY_API_KEY` — see `.env.sample:12`

## License

MIT
