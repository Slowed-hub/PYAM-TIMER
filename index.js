require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// --- Configuration du cycle ---
const CYCLE_CONFIG = {
  RED_PHASE_DURATION: 120 * 60 * 1000, // 120 minutes en millisecondes
  GREEN_PHASE_DURATION: 60 * 60 * 1000, // 60 minutes en millisecondes
  BLACK_PHASE_DURATION: 5 * 60 * 1000, // 5 minutes en millisecondes
  LIGHTS_COUNT: 5,
  RED_LIGHT_INTERVAL: 24 * 60 * 1000, // 24 minutes par voyant en phase rouge
  GREEN_LIGHT_INTERVAL: 12 * 60 * 1000, // 12 minutes par voyant en phase verte
};

// Temps de référence (début de la phase rouge : 2 janvier 2025, 01:05:56)
const REFERENCE_TIME = new Date("2025-01-02T01:05:56").getTime();
const TOTAL_CYCLE = CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION;

// --- État ---
let state = {
  phase: "FERME",
  startTime: Date.now(),
  endTime: Date.now(),
  lights: Array(CYCLE_CONFIG.LIGHTS_COUNT).fill("🟥"),
};

// --- Calcul de l'état des voyants ---
function getLightState(index, phase, currentLightIndex) {
  if (phase === "FERME") {
    if (index < currentLightIndex) return "🟩"; // Voyant vert
    if (index === currentLightIndex) return "🟥"; // Voyant actif reste rouge
    return "🟥"; // Voyants restants rouges
  }
  if (phase === "OUVERT") {
    // Inverser l'ordre : commencer par le voyant 5 (index 4) et finir par le voyant 1 (index 0)
    const reversedCurrentIndex = CYCLE_CONFIG.LIGHTS_COUNT - 1 - currentLightIndex;
    if (index > reversedCurrentIndex) return "⬛"; // Voyants à droite du voyant actif sont noirs
    if (index === reversedCurrentIndex) return "🟩"; // Voyant actif est vert
    return "🟩"; // Voyants à gauche sont verts
  }
  return "⬛"; // Tous les voyants noirs en phase de restart
}

// --- Formatage du temps ---
function formatTime(minutes, showSeconds = false) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);

  if (showSeconds) {
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${hrs}h${mins.toString().padStart(2, "0")}`;
}

// --- Calcul du cycle basé sur l'heure actuelle ---
function getCurrentCycle() {
  const now = Date.now();
  const timeSinceReference = now - REFERENCE_TIME;
  const cyclePosition = timeSinceReference % TOTAL_CYCLE;
  const cyclePositionMinutes = cyclePosition / 60000;

  let phase, phaseTimeRemaining, currentLightIndex, lightTimeRemaining;

  if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION / 60000) {
    // Phase rouge
    phase = "FERME";
    phaseTimeRemaining = CYCLE_CONFIG.RED_PHASE_DURATION / 60000 - cyclePositionMinutes;
    currentLightIndex = Math.floor(cyclePositionMinutes / (CYCLE_CONFIG.RED_LIGHT_INTERVAL / 60000));
    lightTimeRemaining = CYCLE_CONFIG.RED_LIGHT_INTERVAL / 60000 - (cyclePositionMinutes % (CYCLE_CONFIG.RED_LIGHT_INTERVAL / 60000));
  } else if (cyclePositionMinutes < (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION) / 60000) {
    // Phase verte
    phase = "OUVERT";
    const greenPhasePosition = cyclePositionMinutes - CYCLE_CONFIG.RED_PHASE_DURATION / 60000;
    phaseTimeRemaining = CYCLE_CONFIG.GREEN_PHASE_DURATION / 60000 - greenPhasePosition;
    currentLightIndex = Math.floor(greenPhasePosition / (CYCLE_CONFIG.GREEN_LIGHT_INTERVAL / 60000));
    lightTimeRemaining = CYCLE_CONFIG.GREEN_LIGHT_INTERVAL / 60000 - (greenPhasePosition % (CYCLE_CONFIG.GREEN_LIGHT_INTERVAL / 60000));
  } else {
    // Phase noire (restart)
    phase = "RESTART";
    phaseTimeRemaining = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) / 60000 - cyclePositionMinutes;
    currentLightIndex = CYCLE_CONFIG.LIGHTS_COUNT; // Tous les voyants noirs
    lightTimeRemaining = phaseTimeRemaining;
  }

  return { phase, phaseTimeRemaining, currentLightIndex, lightTimeRemaining };
}

// --- Mise à jour des voyants ---
function updateLights(phase, currentLightIndex) {
  state.lights = Array(CYCLE_CONFIG.LIGHTS_COUNT)
    .fill()
    .map((_, index) => getLightState(index, phase, currentLightIndex));
}

// --- Synchronisation ---
function syncState() {
  const { phase, phaseTimeRemaining, currentLightIndex, lightTimeRemaining } = getCurrentCycle();
  state.phase = phase;
  state.startTime = Date.now() - (TOTAL_CYCLE - (phaseTimeRemaining * 60000));
  state.endTime = Date.now() + (phaseTimeRemaining * 60000);
  updateLights(phase, currentLightIndex);
}

// --- Embed Discord ---
function buildEmbed() {
  const { phase, phaseTimeRemaining } = getCurrentCycle();
  const countdown = phase === "RESTART" ? formatTime(phaseTimeRemaining, true) : formatTime(phaseTimeRemaining, false);

  return new EmbedBuilder()
    .setTitle("Statut du Hangar Exécutif :")
    .setColor(phase === "FERME" ? "Red" : phase === "OUVERT" ? "Green" : "Yellow")
    .addFields(
      { name: "Voyants :", value: state.lights.join(" "), inline: false },
      {
        name:
          phase === "FERME"
            ? "HANGAR FERMÉ 🔴"
            : phase === "OUVERT"
            ? "HANGAR OUVERT 🟢"
            : "RESTART 🟡",
        value: countdown,
      }
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

client.login(process.env.TOKEN);


