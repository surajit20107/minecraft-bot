import { Router } from "express";
import { getServerStatus } from "../../services/serverStatus.service.js";
import { botManager } from "../../bot/BotManager.js";
import { renderDashboard } from "../views/dashboard.view.js";
import { logger } from "../../utils/logger.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_, res) => {
  try {
    const status = await getServerStatus();
    const html = renderDashboard({
      isConnected: botManager.isConnected,
      status,
      sessionInputActive: botManager.sessionInputActive,
      lastPacketAt: botManager.lastPacketAt,
    });
    res.send(html);
  } catch (err) {
    logger.error("Failed to fetch server status:", err.message ?? err);
    res.status(500).send("Failed to fetch server status");
  }
});
