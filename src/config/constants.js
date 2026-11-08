export const BOT_CONSTANTS = {
  // Dynamic version: defaults to env MC_VERSION, live version is fetched via getServerStatus() from the ping API
  // No hardcoded Minecraft version here - resolved at runtime from server ping (see serverStatus.service.js)
  VERSION: process.env.MC_VERSION || undefined,
  OFFLINE: process.env.MC_OFFLINE === "true",
  RECONNECT_DELAY_MS: 30_000,
  DEFAULT_USERNAME: "surajit_bot",
  DEFAULT_PLATFORM: process.env.MC_PLATFORM || "bedrock",
  DEFAULT_PORT: 3000,
  DEFAULT_AI_MODEL: "auto",
};

export const AI_SYSTEM_PROMPT = `You are a helpful Minecraft assistant. Keep answers short and concise (under 100 characters if possible). Answer based on Minecraft Bedrock edition knowledge (version: ${BOT_CONSTANTS.VERSION}) (dont use special characters in your answers like emoji, markdown, etc use only simple english).`;
