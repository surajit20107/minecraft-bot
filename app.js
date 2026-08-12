import "dotenv/config";
import bedrockProtocol from "bedrock-protocol";
import express from "express";

const app = express();
let client;
let isConnected = false;

function connectBot() {
  client = bedrockProtocol.createClient({
    host: process.env.MC_HOST, // Minecraft server IP or hostname
    port: Number(process.env.MC_PORT), // Minecraft server port
    username: process.env.MC_USERNAME, // Minecraft username
    offline: process.env.MC_OFFLINE === "true", // set to true for offline mode
    profilesFolder: "./profiles", // stores login tokens
  });

  client.on("connect", () => {
    console.log("Connected to the server!");
  });

  client.on("join", () => {
    console.log("Bot spawned!");
    isConnected = true;
  });

  client.on("death_info", async () => {
    client.close();
    isConnected = false;
    client = null;
    console.log("Bot died. Reconnecting in 30 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait for 30 seconds before reconnecting
    connectBot();
  });

  client.on("disconnect", async (packet) => {
    client.close();
    isConnected = false;
    client = null;
    console.log(`Bot disconnected: ${packet.reason || "unknown reason"}. Reconnecting in 30 seconds...`);
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait for 30 seconds before reconnecting
    connectBot();
  });

  client.on("error", console.error);
}

async function getServerStatus() {
  const host = process.env.MC_HOST;
  const port = Number(process.env.MC_PORT);
  const platform = process.env.MC_PLATFORM || "bedrock"; // Default to "bedrock" if not specified
  const url = `https://minecraft-serverhub.com/api/ping?host=${host}&port=${port}&platform=${platform}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Failed to fetch server status:", err.message);
    return null;
  }
}

app.get("/", async (_, res) => {
  const status = await getServerStatus();

  const botStatus = isConnected
    ? "Bot is connected 🤖"
    : "Bot is disconnected ❌";

  const serverOnline = status?.online ?? false;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />

      <title>Minecraft Bot Status</title>

      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: Arial, sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        .container {
          width: 100%;
          max-width: 600px;
        }

        h1 {
          text-align: center;
          margin-bottom: 25px;
          font-size: 32px;
        }

        .card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        }

        .card h2 {
          margin-bottom: 18px;
          font-size: 20px;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: bold;
        }

        .online {
          color: #22c55e;
        }

        .offline {
          color: #ef4444;
        }

        .info {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #334155;
        }

        .info:last-child {
          border-bottom: none;
        }

        .label {
          color: #94a3b8;
        }

        .value {
          font-weight: bold;
          text-align: right;
        }

        .motd {
          white-space: pre-line;
        }

        .refresh {
          text-align: center;
          color: #64748b;
          font-size: 14px;
          margin-top: 15px;
        }
      </style>
    </head>

    <body>
      <div class="container">

        <h1>🎮 Minecraft Server</h1>

        <!-- Bot Status -->
        <div class="card">
          <h2>🤖 Bot Status</h2>

          <div class="status ${isConnected ? "online" : "offline"}">
            <span>
              ${botStatus}
            </span>
          </div>
        </div>

        <!-- Server Status -->
        <div class="card">
          <h2>🌐 Server Status</h2>

          <div class="info">
            <span class="label">Status</span>
            <span class="value ${serverOnline ? "online" : "offline"}">
              ${serverOnline ? "🟢 Online" : "🔴 Offline"}
            </span>
          </div>

          <div class="info">
            <span class="label">Players</span>
            <span class="value">
              ${status?.players?.online ?? 0}
              /
              ${status?.players?.max ?? 0}
            </span>
          </div>

          <div class="info">
            <span class="label">Version</span>
            <span class="value">
              ${status?.version ?? "Unknown"}
            </span>
          </div>

          <div class="info">
            <span class="label">Ping</span>
            <span class="value">
              ${status?.ping ?? "N/A"} ms
            </span>
          </div>

          <div class="info">
            <span class="label">MOTD</span>
            <span class="value motd">
              ${status?.motd ?? "Unknown"}
            </span>
          </div>
        </div>

        <div class="refresh">
          Page generated at ${new Date().toLocaleString()}
        </div>

      </div>
    </body>
    </html>
  `);
});


app.head("/health", (_, res) => {
  res.sendStatus(200);
});

app.get("/health", (_, res) => {
  res.sendStatus(200);
});

connectBot();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
