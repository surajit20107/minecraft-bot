import "dotenv/config";
import bedrockProtocol from "bedrock-protocol";
import express from "express";

const app = express();

const client = bedrockProtocol.createClient({
  host: process.env.MC_HOST,
  port: Number(process.env.MC_PORT),
  profilesFolder: "./profiles", // stores login tokens
});

client.on("connect", () => {
  console.log("Connected to the server!");
});

client.on("join", () => {
  console.log("Joined!");
});

client.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

client.on("error", console.error);

app.get("/", (_, res) => {
  res.send("Server is up and running... 🚀");
});

app.head("/health", (_, res) => {
  res.sendStatus(200);
});

app.get("/health", (_, res) => {
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
