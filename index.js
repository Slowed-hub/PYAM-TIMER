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

// --- Charger le planning exact ---
const rawCycles = fs.readFileSync("./cycles.json");
const cycles = JSON.parse(rawCycles).map(c => ({
  phase: c.phase,
  startTime: new Date(c.start).getTime(),
  endTime: new Date(c.end).getTime()
}));

const LIGHTS_COUNT = 5;

// --- État ---
let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(LIGHTS_COUNT).fill("⬛")
};

// --- Détection du cycle courant ---
function getCurrentCycle() {
  const now = Date.now();
  for (const c of cycles) {
    if (now >= c.startTime && now < c.endTime) return c;
  }
  return cycles[cycles.length - 1]; // si on est après le dernier cycle
}

// --- Mise à jour des voyants ---
function updateLights() {
  const now = Date.now();
  const { phase, startTime, endTime } = state;
  const duration = endTime - startTime;
  const interval = duration / LIGHTS_COUNT;
  let currentIndex = Math.floor((now - startTime) / interval);
  if (currentIndex >= LIGHTS_COUNT) currentIndex = LIGHTS_COUNT - 1;
  const progress = ((now - startTime) % interval) / interval;

  for (let i = 0; i < LIGHTS_COUNT; i++) {
    const idx = LIGHTS_COUNT - 1 - i;
    if (i < currentIndex) state.lights[idx] = phase === "OUVERT" ? "🟩" : "🟥";
    else if (i === currentIndex) state.lights[idx] = progress > 0.5 ? (phase === "OUVERT" ? "🟩" : "🟥") : "⬛";
    else state.lights[idx] = "⬛";
  }
}

// --- Synchronisation ---
function syncState() {
  const cycle = getCurrentCycle();
  state.phase = cycle.phase;
  state.startTime = cycle.startTime;
  state.endTime = cycle.endTime;
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








