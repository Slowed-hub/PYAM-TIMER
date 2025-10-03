require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
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

// Premier créneau connu
const START_TIME = new Date("2025-10-03T11:01:11").getTime(); 

// Durées exactes en millisecondes
const ONLINE_DURATION  = 65 * 60 * 1000; // 65 min Online
const OFFLINE_DURATION = 65 * 60 * 1000; // 65 min Offline
const TOTAL_CYCLE = ONLINE_DURATION + OFFLINE_DURATION;

const ONLINE_LIGHT_INTERVAL  = ONLINE_DURATION / LIGHTS_COUNT;
const OFFLINE_LIGHT_INTERVAL = OFFLINE_DURATION / LIGHTS_COUNT;

// --- État ---
let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(LIGHTS_COUNT).fill("⬛")
};

// --- Calcul automatique du cycle en cours ---
function getCurrentCycleRobust() {
  const now = Date.now();
  const elapsed = now - START_TIME;
  const cycleIndex = Math.floor(elapsed / TOTAL_CYCLE);
  const cycleStart = START_TIME + cycleIndex * TOTAL_CYCLE;

  // Détermination du cycle courant
  if (now < cycleStart + ONLINE_DURATION) {
    return {
      phase: "OUVERT",
      startTime: cycleStart,
      endTime: cycleStart + ONLINE_DURATION
    };
  } else {
    return {
      phase: "FERME",
      startTime: cycleStart + ONLINE_DURATION,
      endTime: cycleStart + TOTAL_CYCLE
    };
  }
}

// --- Mise à jour fluide des voyants ---
function updateLights() {
  const now = Date.now();
  const { phase, startTime } = state;
  let currentIndex = 0;
  let progress = 0;

  if (phase === "FERME") {
    currentIndex = Math.floor((now - startTime) / OFFLINE_LIGHT_INTERVAL);
    if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;
    progress = ((now - startTime) % OFFLINE_LIGHT_INTERVAL) / OFFLINE_LIGHT_INTERVAL;

    for (let i = 0; i < LIGHTS_COUNT; i++) {
      const idx = LIGHTS_COUNT - 1 - i;
      if (i < currentIndex) state.lights[idx] = "🟥";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "🟥" : "⬛";
      else state.lights[idx] = "⬛";
    }
  } else if (phase === "OUVERT") {
    currentIndex = Math.floor((now - startTime) / ONLINE_LIGHT_INTERVAL);
    if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;
    progress = ((now - startTime) % ONLINE_LIGHT_INTERVAL) / ONLINE_LIGHT_INTERVAL;

    for (let i = 0; i < LIGHTS_COUNT; i++) {
      const idx = LIGHTS_COUNT - 1 - i;
      if (i < currentIndex) state.lights[idx] = "🟩";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "🟩" : "⬛";
      else state.lights[idx] = "⬛";
    }
  }
}

// --- Synchronisation robuste ---
function syncState() {
  const cycle = getCurrentCycleRobust();
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

  // Mise à jour toutes les secondes
  setInterval(() => {
    syncState();
    if (messageInstance) messageInstance.edit({ embeds: [buildEmbed()] });
  }, 1000);
});

client.login(process.env.DISCORD_TOKEN);






