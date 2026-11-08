import { fileURLToPath } from "node:url";
import bedrockProtocol from "bedrock-protocol";
import { config } from "../config/index.js";
import { BOT_CONSTANTS } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { createChatHandler } from "./handlers/chat.handler.js";
import { getServerStatus } from "../services/serverStatus.service.js";

export class BotManager {
  #client = null;
  #isConnected = false;
  #reconnectTimer = null;

  get isConnected() {
    return this.#isConnected;
  }

  get client() {
    return this.#client;
  }

  async connect() {
    if (this.#client) {
      logger.warn("Bot already has a client, cleaning up before reconnect");
      this.#cleanup();
    }

    // Dynamic versioning: prefer configured version, otherwise fetch live version from ping API
    // No hardcoded fallback here - version is resolved at runtime
    let version = config.mc.version;
    if (!version || version === "auto") version = undefined;
    if (!version) {
      try {
        const status = await getServerStatus();
        if (status?.version) {
          logger.info(`Resolved Minecraft version dynamically from server: ${status.version}`);
        }
      } catch (err) {
        logger.warn(`Could not resolve dynamic version: ${err.message}`);
      }
    }

    logger.info(
      `Connecting to ${config.mc.host}:${config.mc.port} as ${config.mc.username} (v${version ?? "auto"})`
    );

    // Project-root profiles folder (file is at src/bot/BotManager.js)
    const profilesFolder = fileURLToPath(new URL("../../profiles", import.meta.url));

    this.#client = bedrockProtocol.createClient({
      host: config.mc.host,
      port: Number(config.mc.port),
      username: config.mc.username,
      offline: config.mc.offline,
      profilesFolder,
      // undefined lets bedrock-protocol discover the server's protocol version and
      // pick the matching minecraft-data version automatically.
      version: version || undefined,
    });

    this.#registerEvents();
    return this.#client;
  }

  sendChat(message) {
    try {
      if (!this.#client) {
        logger.error("Cannot send chat: client is not connected");
        return;
      }
      this.#client.queue("text", {
        needs_translation: false,
        category: "authored",
        type: "chat",
        source_name: this.#client.username,
        message,
        xuid: "",
        platform_chat_id: "",
        has_filtered_message: false,
      });
      logger.sent(message);
    } catch (err) {
      logger.error("Error sending chat:", err?.message ?? err);
    }
  }

  #registerEvents() {
    const client = this.#client;
    if (!client) return;

    const chatHandler = createChatHandler(
      () => this.#client,
      (msg) => this.sendChat(msg)
    );

    client.on("connect", () => {
      logger.info("Connected to the server!");
    });

    client.on("join", () => {
      logger.info("Bot spawned!");
      this.#isConnected = true;
    });

    client.on("text", chatHandler);

    client.on("death_info", async (packet) => {
      if (!this.#isConnected) return;
      logger.debug("Death info:", JSON.stringify(packet));
      this.#handleDisconnect("Bot died. Reconnecting...");
    });

    client.on("disconnect", async (packet) => {
      if (!this.#isConnected) return;
      logger.debug("Disconnect packet:", JSON.stringify(packet));
      this.#handleDisconnect(
        `Bot disconnected: ${packet.reason || "unknown reason"}. Reconnecting...`
      );
    });

    client.on("close", async () => {
      if (!this.#isConnected) return;
      logger.info("Client connection closed unexpectedly.");
      this.#handleDisconnect("Bot lost connection. Reconnecting...");
    });

    client.on("end", async () => {
      if (!this.#isConnected) return;
      logger.info("Client stream ended.");
      this.#handleDisconnect("Bot stream ended. Reconnecting...");
    });

    client.on("error", (err) => {
      if (err.message?.includes("Missing characters in string")) return;
      if (err.message?.includes("Read error")) return;
      logger.error("Client error:", err.message);
      // The initial connection can fail before "join" fires (bad version, auth,
      // protocol mismatch). Without this the bot would never retry.
      if (!this.#isConnected) {
        this.#handleDisconnect("Initial connection failed.");
      }
    });
  }

  #handleDisconnect(logMessage) {
    this.#cleanup();
    logger.info(`${logMessage} Retrying in ${BOT_CONSTANTS.RECONNECT_DELAY_MS / 1000}s`);
    this.#scheduleReconnect();
  }

  #cleanup() {
    try {
      this.#client?.close();
    } catch (_) {}
    this.#isConnected = false;
    this.#client = null;
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      this.connect();
    }, BOT_CONSTANTS.RECONNECT_DELAY_MS);
  }
}

// Singleton instance for app-wide use
export const botManager = new BotManager();
