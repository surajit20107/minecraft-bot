export const BOT_CONSTANTS = {
  // Dynamic version: defaults to env MC_VERSION, live version is fetched via getServerStatus() from the ping API
  // No hardcoded Minecraft version here - resolved at runtime from server ping (see serverStatus.service.js)
  VERSION: process.env.MC_VERSION || undefined,
  OFFLINE: process.env.MC_OFFLINE === "true",
  // RakNet pings to remote hosts (especially Aternos) often need more than the
  // 1s default used internally by bedrock-protocol.
  PING_TIMEOUT_MS: Number(process.env.MC_PING_TIMEOUT_MS) || 5000,
  CONNECT_TIMEOUT_MS: Number(process.env.MC_CONNECT_TIMEOUT_MS) || 15000,
  // Modern Bedrock servers expect a player_auth_input packet every tick. Sending it
  // also keeps Aternos from treating the bot as an idle/inactive player.
  INPUT_HEARTBEAT: process.env.MC_INPUT_HEARTBEAT !== "false",
  // If the server sends no packets for this long, treat the session as dead and
  // reconnect. Real clients always receive keepalive/latency packets well within this.
  KEEPALIVE_TIMEOUT_MS: Number(process.env.MC_KEEPALIVE_TIMEOUT_MS) || 300_000,
  RECONNECT_DELAY_MS: 30_000,
  DEFAULT_USERNAME: "surajit_bot",
  DEFAULT_PLATFORM: process.env.MC_PLATFORM || "bedrock",
  DEFAULT_PORT: 3000,
  DEFAULT_AI_MODEL: "auto",
};

export const AI_SYSTEM_PROMPT = `You are a helpful Minecraft assistant. Keep answers short and concise (under 100 characters if possible). Answer based on Minecraft Bedrock edition knowledge (version: ${BOT_CONSTANTS.VERSION}) (dont use special characters in your answers like emoji, markdown, etc use only simple english).`;
