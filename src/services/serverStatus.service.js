import bedrockProtocol from "bedrock-protocol";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// bedrock-protocol's default ping timeout is 1s, which is often too short for
// remote servers. Allow overriding via env.
const PING_TIMEOUT_MS = Number(process.env.MC_PING_TIMEOUT_MS) || 3000;

// Bedrock MOTDs may contain formatting codes like "§a". Strip them so the
// dashboard shows plain, readable text.
function cleanMotd(motd) {
  if (!motd) return null;
  return String(motd).replace(/§[0-9a-fk-orx]/gi, "").trim();
}

function offlineStatus(configuredVersion) {
  return {
    online: false,
    players: { online: 0, max: 0 },
    version: configuredVersion ? String(configuredVersion) : undefined,
    motd: null,
    favicon: null,
    ping: null,
    levelName: null,
    gamemode: null,
    protocol: null,
    transport: null,
  };
}

export async function getServerStatus() {
  const { host, port, version: configuredVersion } = config.mc;

  if (!host) {
    logger.warn("MC_HOST is not set; cannot ping server");
    return offlineStatus(configuredVersion);
  }

  const startedAt = process.hrtime.bigint();

  try {
    // Uses the RakNet (and nethernet) ping from bedrock-protocol instead of a
    // third-party HTTP ping API. This talks directly to the server.
    const advertisement = await bedrockProtocol.ping({
      host,
      port: Number(port),
      timeout: PING_TIMEOUT_MS,
    });

    const ping = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Dynamic versioning: prefer the live version from the ping response,
    // fallback to the configured version (env MC_VERSION) when unavailable.
    const liveVersion = advertisement?.version
      ? String(advertisement.version)
      : undefined;
    const version =
      liveVersion ??
      (configuredVersion ? String(configuredVersion) : undefined);

    return {
      online: true,
      players: {
        online: Number(advertisement?.playersOnline ?? 0),
        max: Number(advertisement?.playersMax ?? 0),
      },
      version,
      motd: cleanMotd(advertisement?.motd),
      favicon: null,
      ping: Math.round(ping),
      levelName: advertisement?.levelName ?? null,
      gamemode: advertisement?.gamemode ?? null,
      protocol: advertisement?.protocol ?? null,
      transport: advertisement?.transport ?? "raknet",
    };
  } catch (err) {
    logger.error("Failed to ping server:", err?.message ?? err);
    return offlineStatus(configuredVersion);
  }
}
