import { fileURLToPath } from "node:url";
import bedrockProtocol from "bedrock-protocol";
import { config } from "../config/index.js";
import { BOT_CONSTANTS } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { createChatHandler } from "./handlers/chat.handler.js";
import { SessionInput } from "./sessionInput.js";
import { getServerStatus } from "../services/serverStatus.service.js";

export class BotManager {
  #client = null;
  #isConnected = false;
  #reconnectTimer = null;
  #watchdogTimer = null;
  #lastPacketAt = 0;
  #handlingDisconnect = false;
  #sessionInput = new SessionInput(() => this.#client);

  get isConnected() {
    return this.#isConnected;
  }

  get client() {
    return this.#client;
  }

  get lastPacketAt() {
    return this.#lastPacketAt;
  }

  get sessionInputActive() {
    return this.#sessionInput.isRunning;
  }

  async connect() {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#client) {
      logger.warn("Bot already has a client, cleaning up before reconnect");
      this.#cleanup();
    }

    const {
      host,
      port,
      username,
      offline,
      version: configuredVersion,
      pingTimeout,
      connectTimeout,
    } = config.mc;

    // A configured version comes from MC_VERSION. Empty/"auto" means undefined,
    // which lets bedrock-protocol discover the server protocol and map it to a
    // version supported by minecraft-data.
    let version = configuredVersion;
    if (!version || version === "auto") version = undefined;

    // Ping first so an offline/sleeping server produces an actionable message
    // instead of an opaque "All promises were rejected" / "Connect timed out".
    const status = await getServerStatus();
    if (status.online) {
      logger.info(
        `Server is online: ${status.version ? `v${status.version}, ` : ""}` +
          `protocol ${status.protocol ?? "?"}, ` +
          `transport ${status.transport}${status.signalling ? `/${status.signalling}` : ""}, ` +
          `${status.players.online}/${status.players.max} players, ${status.ping}ms`
      );
    } else {
      logger.warn(
        `Server ${host}:${port} is not responding to pings. Aternos servers sleep when empty - ` +
          "start it from the Aternos panel and the bot will connect on the next retry."
      );
    }

    logger.info(
      `Connecting to ${host}:${port} as ${username} (v${version ?? "auto"})`
    );

    // Project-root profiles folder (file is at src/bot/BotManager.js)
    const profilesFolder = fileURLToPath(new URL("../../profiles", import.meta.url));

    // Bedrock 1.26.60+ uses NetherNet. When the status ping discovered the
    // server through its HTTP signalling endpoint, connect over that same
    // transport (plain UDP RakNet no longer exists on these servers).
    const nethernet =
      status.online &&
      status.transport === "nethernet" &&
      status.signalling === "http" &&
      status.signallingUrl
        ? { signalling: "http", url: status.signallingUrl }
        : undefined;

    this.#client = bedrockProtocol.createClient({
      host,
      port: Number(port),
      username,
      offline,
      profilesFolder,
      // undefined lets bedrock-protocol discover the server's protocol version and
      // pick the matching minecraft-data version automatically.
      version,
      // The library defaults these to 1s/9s, which is too aggressive for
      // remote hosts (and Aternos in particular).
      pingTimeout,
      connectTimeout,
      ...(nethernet ? { nethernet } : {}),
    });

    this.#registerEvents();
    this.#lastPacketAt = Date.now();
    this.#sessionInput.attach(this.#client);
    this.#startWatchdog();
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

    client.on("packet", () => {
      this.#lastPacketAt = Date.now();
    });

    client.on("connect", () => {
      logger.info("Connected to the server!");
    });

    client.on("join", () => {
      logger.info("Bot joined the server!");
      this.#isConnected = true;
      this.#lastPacketAt = Date.now();
      if (config.mc.inputHeartbeat) this.#sessionInput.start();
    });

    client.on("spawn", () => {
      logger.info("Bot spawned in the world.");
      this.#lastPacketAt = Date.now();
      if (config.mc.inputHeartbeat) this.#sessionInput.start();
    });

    client.on("text", chatHandler);

    client.on("death_info", async (packet) => {
      if (!this.#isConnected) return;
      logger.debug("Death info:", JSON.stringify(packet));
      this.#handleDisconnect("Bot died. Reconnecting...");
    });

    client.on("kick", (packet) => {
      logger.warn(
        `Kicked by server: ${packet?.message || packet?.reason || "unknown reason"}`
      );
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
    if (this.#handlingDisconnect) return;
    this.#handlingDisconnect = true;

    this.#isConnected = false;
    this.#cleanup();

    logger.info(
      `${logMessage} Retrying in ${BOT_CONSTANTS.RECONNECT_DELAY_MS / 1000}s`
    );
    this.#scheduleReconnect();
    this.#handlingDisconnect = false;
  }

  #cleanup() {
    this.#stopWatchdog();
    this.#sessionInput.detach();

    const client = this.#client;
    this.#client = null;
    this.#isConnected = false;
    this.#lastPacketAt = 0;

    try {
      client?.close();
    } catch (_) {}
  }

  #startWatchdog() {
    this.#stopWatchdog();
    const timeout = config.mc.keepaliveTimeout;
    const interval = Math.max(5_000, Math.min(30_000, Math.floor(timeout / 3)));

    this.#watchdogTimer = setInterval(() => {
      if (!this.#isConnected || !this.#client || !this.#lastPacketAt) return;
      const silentFor = Date.now() - this.#lastPacketAt;
      if (silentFor < timeout) return;

      logger.warn(
        `No packets from the server for ${Math.round(silentFor / 1000)}s. ` +
          "The session looks dead, reconnecting..."
      );
      this.#handleDisconnect("Session timed out.");
    }, interval);
    this.#watchdogTimer.unref?.();
  }

  #stopWatchdog() {
    if (this.#watchdogTimer) clearInterval(this.#watchdogTimer);
    this.#watchdogTimer = null;
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect().catch((err) => {
        logger.error("Reconnect failed:", err?.message ?? err);
        this.#scheduleReconnect();
      });
    }, BOT_CONSTANTS.RECONNECT_DELAY_MS);
  }
}

// Singleton instance for app-wide use
export const botManager = new BotManager();
