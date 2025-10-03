require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const DATA_FILE = "timer.json";

const LIGHTS_COUNT = 5;
const RED_PHASE_DURATION = 120 * 60 * 1000; // 120 min
const GREEN_PHASE_DURATION = 60 * 60 * 1000; // 60 min
const BLACK_PHASE_DURATION = 5 * 60 * 1000; // 5 min
const RED_LIGHT_INTERVAL = 24 * 60 * 1000; // 24 min/voyant
const GREEN_LIGHT_INTERVAL = 12 * 60 * 1000; // 12 min/voyant

const REFERENCE_TIME = new Date("2025-01-02T01:05:56").getTime();

let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(LIGHTS_COUNT).fill("🟥")
};

// --- Charger persistance si disponible ---
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    if (data) state = JSON.parse(data);
  } catch (err) {
    console.error("Erreur lecture JSON, réinitialisation :", err);
  }
}

// --- Sauvegarder l’état ---
function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Erreur écriture JSON :", err);
  }
}

// --- Calcul du cycle actuel ---
function getCurrentCycle() {
  const now = Date.now();
  const totalCycle = RED_PHASE_DURATION + GREEN_PHASE_DURATION + BLACK_PHASE_DURATION;
  const elapsedSinceRef = now - REFERENCE_TIME;
  const cycleStart = REFERENCE_TIME + Math.floor(elapsedSinceRef / totalCycle) * totalCycle;

  const redEnd = cycleStart + RED_PHASE_DURATION;
  const greenEnd = redEnd + GREEN_PHASE_DURATION;
  const blackEnd = greenEnd + BLACK_PHASE_DURATION;

  if (now < redEnd) return { phase: "FERME", startTime: cycleStart, endTime: redEnd };
  if (now < greenEnd) return { phase: "OUVERT", startTime: redEnd, endTime: greenEnd };
  if (now < blackEnd) return { phase: "RESTART", startTime: greenEnd, endTime: blackEnd };
  return { phase: "FERME", startTime: blackEnd, endTime: blackEnd + RED_PHASE_DURATION };
}

// --- Mise à jour fluide des voyants (droite à gauche) ---
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
      const idx = LIGHTS_COUNT - 1 - i; // inverser l'ordre pour commencer à droite
      if (i < currentIndex) state.lights[idx] = "🟩";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "🟩" : "🟥";
      else state.lights[idx] = "🟥";
    }
  } else if (phase === "OUVERT") {
    currentIndex = Math.floor((now - startTime) / GREEN_LIGHT_INTERVAL);
    if (currentIndex > LIGHTS_COUNT) currentIndex = LIGHTS_COUNT;
    progress = ((now - startTime) % GREEN_LIGHT_INTERVAL) / GREEN_LIGHT_INTERVAL;

    for (let i = 0; i < LIGHTS_COUNT; i++) {
      const idx = LIGHTS_COUNT - 1 - i; // inverser l'ordre pour commencer à droite
      if (i < currentIndex) state.lights[idx] = "⬛";
      else if (i === currentIndex && currentIndex < LIGHTS_COUNT) state.lights[idx] = progress > 0.5 ? "⬛" : "🟩";
      else state.lights[idx] = "🟩";
    }
  } else {
    state.lights = Array(LIGHTS_COUNT).fill("⬛");
  }
}

// --- Synchronisation complète ---
function syncState() {
  const cycle = getCurrentCycle();
  state.phase = cycle.phase;
  state.startTime = cycle.startTime;
  state.endTime = cycle.endTime;
  updateLights();
}

// --- Création de l’embed Discord ---
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
  saveState();

  const channel = await client.channels.fetch(CHANNEL_ID);
  messageInstance = await channel.send({ embeds: [buildEmbed()] });

  setInterval(() => {
    syncState();
    saveState();
    if (messageInstance) messageInstance.edit({ embeds: [buildEmbed()] });
  }, 1000);
});

client.login(process.env.DISCORD_TOKEN);



