require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const express = require("express");

// --- Serveur HTTP pour Render ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot Discord actif ✅"));
app.listen(PORT, () => console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`));

// --- Variables Discord ---
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// --- Paramètres du cycle ---
const LIGHTS_COUNT = 5;
const cycles = JSON.parse(fs.readFileSync("./cycles.json", "utf8"));

// --- État ---
let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(LIGHTS_COUNT).fill("🟥"),
  currentCycleIndex: 0
};

// --- Récupérer le cycle actuel depuis le JSON ---
function getCurrentCycleFromJSON() {
  const now = Date.now();
  for (let i = 0; i < cycles.length; i++) {
    const start = new Date(cycles[i].timestamp).getTime();
    if (cycles[i].status === "Online") {
      const end = new Date(cycles[i + 1]?.timestamp || now).getTime();
      if (now >= start && now < end) {
        return { phase: "OUVERT", startTime: start, endTime: end, index: i };
      }
    }
    if (cycles[i].status === "Offline") {
      const end = new Date(cycles[i + 1]?.timestamp || now).getTime();
      if (now >= start && now < end) {
        return { phase: "FERME", startTime: start, endTime: end, index: i };
      }
    }
  }
  // Si aucune correspondance, retourner le dernier cycle
  const last = cycles[cycles.length - 1];
  return {
    phase: last.status === "Online" ? "OUVERT" : "FERME",
    startTime: new Date(last.timestamp).getTime(),
    endTime: new Date(last.timestamp).getTime() + 3600000, // fallback 1h
    index: cycles.length - 1
  };
}

// --- Mise à jour fluide des voyants ---
function updateLights() {
  const now = Date.now();
  const { phase, startTime, endTime } = state;
  const duration = endTime - startTime;
  const interval = duration / LIGHTS_COUNT;
  const elapsed = now - startTime;

  let currentIndex = Math.floor(elapsed / interval);
  if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;

  for (let i = 0; i < LIGHTS_COUNT; i++) {
    const idx = LIGHTS_COUNT - 1 - i;
    if (i < currentIndex) state.lights[idx] = phase === "OUVERT" ? "🟩" : "🟥";
    else state.lights[idx] = "⬛";
  }
}

// --- Synchronisation ---
function syncState() {
  const cycle = getCurrentCycleFromJSON();
  state.phase = cycle.phase;
  state.startTime = cycle.startTime;
  state.endTime = cycle.endTime;
  state.currentCycleIndex = cycle.index;
  updateLights();
}

// --- Embed Discord ---
function buildEmbed() {
  const remainingMs = state.endTime - Date.now();
  const min = Math.floor(remainingMs / 60000);
  const sec = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${min} min ${sec}s`;

  return new EmbedBuilder()
    .setTitle("Executive Hangar Status :")
    .setColor(state.phase === "FERME" ? "Red" : "Green")
    .addFields(
      { name: "Voyants :", value: state.lights.join(" "), inline: false },
      { name: state.phase === "FERME" ? "HANGAR FERMÉ 🔴" : "HANGAR OUVERT 🟢", value: countdown }
    );
}

// --- Client Discord ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let messageInstance;

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  syncState();

  const channel = await client.channels.fetch(CHANNEL_ID);
  messageInstance = await channel.send({ embeds: [buildEmbed()] });

  setInterval(() => {
    syncState();
    if (messageInstance) messageInstance.edit({ embeds: [buildEmbed()] });
  }, 1000);
});

client.login(process.env.DISCORD_TOKEN);









