import { askAI } from "../../services/ai.service.js";
import { logger } from "../../utils/logger.js";
import { addMessage } from "../../services/conversation.service.js";

export function createChatHandler(getClient, sendChat) {
  return async (packet) => {
    try {
      const client = getClient();
      // Bedrock servers often append formatting codes (e.g. "§r") to names.
      const sourceName = String(packet.source_name ?? "")
        .replace(/§[0-9a-fk-orx]/gi, "")
        .trim();

      logger.debug(
        `Text event: type=${packet.type} from=${sourceName} msg=${packet.message}`
      );

      if (packet.type !== "chat") return;
      if (client && sourceName === client.username) return;

      const msg = packet.message?.trim() || "";
      if (!msg.toLowerCase().startsWith("bot ")) return;

      const question = msg.slice(4).trim();
      if (!question) {
        sendChat("Usage: bot <question>");
        return;
      }

      logger.game(`${sourceName} asked: ${question}`);

      addMessage("user", question);
      const answer = await askAI(question);
      logger.game(`AI answer: ${answer}`);

      sendChat(answer);
      logger.game(`Replied to ${sourceName}: ${answer}`);
    } catch (err) {
      logger.error("Error handling text event:", err?.message ?? err);
    }
  };
}
