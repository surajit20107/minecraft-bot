import bedrockProtocol from "bedrock-protocol";
import express from "express";

const app = express();

const client = bedrockProtocol.createClient({
  host: "163.5.201.2",
  port: 10368,
  username: "bot7833", // Your bot name
  offline: true, // Don't use Microsoft/Xbox authentication
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

const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
  res.send("Server is up and running... 🚀");
});

app.head("/health", (_, res) => {
  res.sendStatus(200);
});

app.get("/health", (_, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
