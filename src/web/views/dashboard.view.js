export function renderDashboard({
  isConnected,
  status,
  sessionInputActive = false,
  lastPacketAt = 0,
}) {
  const botStatus = isConnected
    ? "Bot is connected 🤖"
    : "Bot is disconnected ❌";

  const serverOnline = status?.online ?? false;
  const lastPacket = lastPacketAt
    ? `${Math.max(0, Math.round((Date.now() - lastPacketAt) / 1000))}s ago`
    : "never";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Minecraft Bot Status</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
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
        .container { width: 100%; max-width: 600px; }
        h1 { text-align: center; margin-bottom: 25px; font-size: 32px; }
        .card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        }
        .card h2 { margin-bottom: 18px; font-size: 20px; }
        .status {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: bold;
        }
        .online { color: #22c55e; }
        .offline { color: #ef4444; }
        .info {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #334155;
        }
        .info:last-child { border-bottom: none; }
        .label { color: #94a3b8; }
        .value { font-weight: bold; text-align: right; }
        .motd { white-space: pre-line; }
        .refresh { text-align: center; color: #64748b; font-size: 14px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎮 Minecraft Server</h1>
        <div class="card">
          <h2>🤖 Bot Status</h2>
          <div class="status ${isConnected ? "online" : "offline"}">
            <span>${botStatus}</span>
          </div>
          <div class="info">
            <span class="label">Session heartbeat</span>
            <span class="value ${sessionInputActive ? "online" : "offline"}">
              ${sessionInputActive ? "🟢 Active" : "🔴 Inactive"}
            </span>
          </div>
          <div class="info">
            <span class="label">Last server packet</span>
            <span class="value">${lastPacket}</span>
          </div>
        </div>
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
            <span class="value">${status?.players?.online ?? 0} / ${status?.players?.max ?? 0}</span>
          </div>
          <div class="info">
            <span class="label">Version</span>
            <span class="value">${status?.version ?? "Unknown"}</span>
          </div>
          <div class="info">
            <span class="label">Ping</span>
            <span class="value">${status?.ping ?? "N/A"} ms</span>
          </div>
          <div class="info">
            <span class="label">MOTD</span>
            <span class="value motd">${status?.motd ?? "Unknown"}</span>
          </div>
        </div>
        <div class="refresh">
          Page generated at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}
        </div>
      </div>
    </body>
    </html>
  `;
}
