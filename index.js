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

// --- Durées du cycle ---
const LIGHTS_COUNT = 5;
const RED_PHASE_DURATION = 120 * 60 * 1000;   // 120 min
const GREEN_PHASE_DURATION = 60 * 60 * 1000;  // 60 min
const BLACK_PHASE_DURATION = 5 * 60 * 1000;   // 5 min
const TOTAL_CYCLE = RED_PHASE_DURATION + GREEN_PHASE_DURATION + BLACK_PHASE_DURATION;

const RED_LIGHT_INTERVAL = RED_PHASE_DURATION / LIGHTS_COUNT;
const GREEN_LIGHT_INTERVAL = GREEN_PHASE_DURATION / LIGHTS_COUNT;

// --- État ---
let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(LIGHTS_COUNT).fill("🟥")
};

// --- Calcul du cycle basé sur l'heure actuelle ---
function getCurrentCycle() {
  const now = Date.now();
  const elapsedInCycle = now % TOTAL_CYCLE;

  if (elapsedInCycle < RED_PHASE_DURATION) {
    return {
      phase: "FERME",
      startTime: now - elapsedInCycle,
      endTime: now - elapsedInCycle + RED_PHASE_DURATION
    };
  }
  if (elapsedInCycle < RED_PHASE_DURATION + GREEN_PHASE_DURATION) {
    return {
      phase: "OUVERT",
      startTime: now - (elapsedInCycle - RED_PHASE_DURATION),
      endTime: now - (elapsedInCycle - RED_PHASE_DURATION) + GREEN_PHASE_DURATION
    };
  }
  return {
    phase: "RESTART",
    startTime: now - (elapsedInCycle - RED_PHASE_DURATION - GREEN_PHASE_DURATION),
    endTime: now - (elapsedInCycle - RED_PHASE_DURATION - GREEN_PHASE_DURATION) + BLACK_PHASE_DURATION
  };
}

// --- Mise à jour fluide des voyants ---
function updateLights() {
  const now = Date.now();
  const { phase, startTime } = state;
  let currentIndex = 0;
  let progress = 0;

  if (phase === "FERME") {
    currentIndex = Math.floor((now - startTime) / RED_LIGHT_INTERVAL);
    if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;
    progress = ((now - startTime) % RED_LIGHT_INTERVAL) / RED_LIGHT_INTERVAL;

    for (let i = 0; i < LIGHTS_COUNT; i++) {
      const idx = LIGHTS_COUNT - 1 - i;
      if (i < currentIndex) state.lights[idx] = "🟩";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "🟩" : "🟥";
      else state.lights[idx] = "🟥";
    }
  } else if (phase === "OUVERT") {
    currentIndex = Math.floor((now - startTime) / GREEN_LIGHT_INTERVAL);
    if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;
    progress = ((now - startTime) % GREEN_LIGHT_INTERVAL) / GREEN_LIGHT_INTERVAL;

    for (let i = 0; i < LIGHTS_COUNT; i++) {
      const idx = LIGHTS_COUNT - 1 - i;
      if (i < currentIndex) state.lights[idx] = "⬛";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "⬛" : "🟩";
      else state.lights[idx] = "🟩";
    }
  } else {
    state.lights = Array(LIGHTS_COUNT).fill("⬛");
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

  const countdown = state.phase === "FERME" ? `${min} min` : `${min} min ${sec}s`;

  return new EmbedBuilder()
    .setTitle("Executive Hangar Status :")
    .setColor(state.phase === "FERME" ? "Red" : state.phase === "OUVERT" ? "Green" : "Yellow")
    .addFields(
      { name: "Voyants :", value: state.lights.join(" "), inline: false },
      { name: state.phase === "FERME" ? "HANGAR FERMÉ 🔴" : state.phase === "OUVERT" ? "HANGAR OUVERT 🟢" : "RESTART 🟡", value: countdown }
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




