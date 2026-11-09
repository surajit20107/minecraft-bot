import "dotenv/config";
import { BOT_CONSTANTS } from "./constants.js";
import { logger } from "../utils/logger.js";

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    logger.warn(`Missing env ${name}`);
  }
  return val;
}

export const config = {
  mc: {
    host: process.env.MC_HOST,
    port: Number(process.env.MC_PORT) || 19132,
    username: process.env.MC_USERNAME || BOT_CONSTANTS.DEFAULT_USERNAME,
    platform: process.env.MC_PLATFORM || BOT_CONSTANTS.DEFAULT_PLATFORM,
    version: process.env.MC_VERSION || BOT_CONSTANTS.VERSION,
    offline: BOT_CONSTANTS.OFFLINE,
    pingTimeout: BOT_CONSTANTS.PING_TIMEOUT_MS,
    connectTimeout: BOT_CONSTANTS.CONNECT_TIMEOUT_MS,
    // Optional explicit NetherNet signalling origin, e.g.
    // https://example.aternos.me:19132. Derived from MC_HOST/MC_PORT if unset.
    signallingUrl: process.env.MC_SIGNALLING_URL || undefined,
  },
  ai: {
    baseURL: requireEnv("OPENAI_BASE_URL"),
    apiKey: requireEnv("OPENAI_API_KEY"),
    model: process.env.AI_MODEL || BOT_CONSTANTS.DEFAULT_AI_MODEL,
  },
  server: {
    port: Number(process.env.PORT) || BOT_CONSTANTS.DEFAULT_PORT,
    host: process.env.HOST || "0.0.0.0",
  },
};

export function validateAiConfig() {
  if (!config.ai.baseURL || !config.ai.apiKey) {
    logger.error("Missing OpenAI API key or base URL. Check .env");
    return false;
  }
  return true;
}
