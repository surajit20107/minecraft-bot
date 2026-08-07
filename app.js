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
  const platform = process.env.MC_PLATFORM;
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

  res.status(200).json({
    botStatus: isConnected ? "Bot is connected 🤖" : "Bot is disconnected ❌",
    serverStatus: status || "Unable to fetch server status",
  })
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
