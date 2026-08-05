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
    console.log("Bot died. Reconnecting in 30 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait for 30 seconds before reconnecting
    connectBot();
  });

  client.on("disconnect", async (reason) => {
    console.log("Disconnected:", reason);
    if (isConnected) return; // If the bot was connected, don't attempt to reconnect
  });

  client.on("error", console.error);
}

app.get("/", (_, res) => {
  res.send("Server is up and running... 🚀");
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
