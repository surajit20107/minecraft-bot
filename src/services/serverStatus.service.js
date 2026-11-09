import net from "node:net";
import bedrockProtocol from "bedrock-protocol";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// bedrock-protocol's default ping timeout is 1s, which is often too short for
// remote servers. Allow overriding via env (see config.mc.pingTimeout).
const PING_TIMEOUT_MS = config.mc.pingTimeout;

const GAMEMODES = ["Survival", "Creative", "Adventure"];

// Bedrock MOTDs may contain formatting codes like "§a". Strip them so the
// dashboard shows plain, readable text.
function cleanMotd(motd) {
  if (!motd) return null;
  return String(motd).replace(/§[0-9a-fk-orx]/gi, "").trim();
}

function hostForUrl(host) {
  return net.isIP(host) === 6 ? `[${host}]` : host;
}

// NetherNet (Bedrock 1.26.60+) no longer answers RakNet pings. Direct servers
// expose HTTP(S) signalling instead: GET /v1/join. Aternos redirects plain
// HTTP to HTTPS, and redirects are rejected by nethernet, so try HTTPS first.
function signallingUrls(host, port) {
  const urls = [];
  if (config.mc.signallingUrl) urls.push(config.mc.signallingUrl);
  const address = hostForUrl(host);
  urls.push(`https://${address}:${port}`, `http://${address}:${port}`);
  return [...new Set(urls)];
}

async function pingNetherNetHttp({ host, port, timeout }) {
  let lastError;
  for (const url of signallingUrls(host, port)) {
    try {
      const advertisement = await bedrockProtocol.ping({
        host,
        port,
        timeout,
        transport: "nethernet",
        nethernet: { signalling: "http", url },
      });
      return Object.assign(advertisement, { signallingUrl: url });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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
    signalling: null,
    signallingUrl: null,
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
    // Query both transports in parallel: legacy RakNet servers answer the UDP
    // ping, while modern servers answer NetherNet's HTTP signalling endpoint.
    const advertisement = await Promise.any([
      pingNetherNetHttp({ host, port: Number(port), timeout: PING_TIMEOUT_MS }),
      bedrockProtocol.ping({
        host,
        port: Number(port),
        timeout: PING_TIMEOUT_MS,
        transport: "raknet",
      }),
    ]);

    const ping = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Dynamic versioning: prefer the live version from the ping response,
    // fallback to the configured version (env MC_VERSION) when unavailable.
    // NetherNet advertisements use gameVersion; RakNet ones use version.
    const liveVersion = advertisement?.gameVersion ?? advertisement?.version;
    const version =
      (liveVersion ? String(liveVersion) : undefined) ??
      (configuredVersion ? String(configuredVersion) : undefined);

    const gamemodeId = advertisement?.gamemodeId;
    const gamemode =
      advertisement?.gamemode ??
      (gamemodeId != null ? GAMEMODES[Number(gamemodeId)] ?? null : null);

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
      gamemode,
      protocol: advertisement?.protocol ?? null,
      transport: advertisement?.transport ?? "raknet",
      signalling: advertisement?.signalling ?? null,
      signallingUrl: advertisement?.signallingUrl ?? null,
    };
  } catch (err) {
    logger.error("Failed to ping server:", err?.message ?? err);
    return offlineStatus(configuredVersion);
  }
}
