require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Configuration du cycle (identique au site web)
const CYCLE_CONFIG = {
  RED_PHASE_DURATION: 120, // 2 heures en minutes
  GREEN_PHASE_DURATION: 60, // 1 heure en minutes
  BLACK_PHASE_DURATION: 5, // 5 minutes
  LIGHTS_COUNT: 5,
  RED_LIGHT_INTERVAL: 24, // minutes par voyant en phase rouge
  GREEN_LIGHT_INTERVAL: 12, // minutes par voyant en phase verte
};

// Référence de temps basée sur l'historique
// Online 02/10/2025 01:05:56 = début phase rouge
const REFERENCE_TIME = new Date('2025-01-02T01:05:56').getTime();

// État
let state = {
  phase: "FERME",
  phaseTimeRemaining: 0,
  currentLightIndex: 0,
  lights: Array(CYCLE_CONFIG.LIGHTS_COUNT).fill("🟥")
};

// Calculer l'état actuel basé sur la référence temporelle
function syncState() {
  const currentTime = Date.now();
  const timeSinceReference = currentTime - REFERENCE_TIME;
  const cycleDuration = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) * 60 * 1000;
  const cyclePosition = timeSinceReference % cycleDuration;
  const cyclePositionMinutes = cyclePosition / 60000;

  let phase, phaseTimeRemaining, currentLightIndex;

  if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION) {
    // Phase rouge
    phase = 'FERME';
    phaseTimeRemaining = CYCLE_CONFIG.RED_PHASE_DURATION - cyclePositionMinutes;
    currentLightIndex = Math.floor(cyclePositionMinutes / CYCLE_CONFIG.RED_LIGHT_INTERVAL);

    // Mise à jour des voyants pour phase rouge
    for (let i = 0; i < CYCLE_CONFIG.LIGHTS_COUNT; i++) {
      if (i < currentLightIndex) {
        state.lights[i] = "🟩";
      } else {
        state.lights[i] = "🟥";
      }
    }
  } else if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION) {
    // Phase verte
    phase = 'OUVERT';
    const greenPhasePosition = cyclePositionMinutes - CYCLE_CONFIG.RED_PHASE_DURATION;
    phaseTimeRemaining = CYCLE_CONFIG.GREEN_PHASE_DURATION - greenPhasePosition;
    currentLightIndex = Math.floor(greenPhasePosition / CYCLE_CONFIG.GREEN_LIGHT_INTERVAL);

    // Mise à jour des voyants pour phase verte (ordre inversé)
    const reversedCurrentIndex = CYCLE_CONFIG.LIGHTS_COUNT - 1 - currentLightIndex;
    for (let i = 0; i < CYCLE_CONFIG.LIGHTS_COUNT; i++) {
      if (i > reversedCurrentIndex) {
        state.lights[i] = "⬛";
      } else {
        state.lights[i] = "🟩";
      }
    }
  } else {
    // Phase noire (restart)
    phase = 'RESTART';
    phaseTimeRemaining = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) - cyclePositionMinutes;
    currentLightIndex = CYCLE_CONFIG.LIGHTS_COUNT;
    state.lights = Array(CYCLE_CONFIG.LIGHTS_COUNT).fill("⬛");
  }

  state.phase = phase;
  state.phaseTimeRemaining = phaseTimeRemaining;
  state.currentLightIndex = currentLightIndex;
}

// Embed Discord
function buildEmbed() {
  const min = Math.floor(state.phaseTimeRemaining);
  const sec = Math.floor((state.phaseTimeRemaining % 1) * 60);

  const countdown = state.phase === "FERME" ? `${min} min` : `${min} min ${sec}s`;

  return new EmbedBuilder()
    .setTitle("Executive Hangar Status :")
    .setColor(state.phase === "FERME" ? "Red" : state.phase === "OUVERT" ? "Green" : "Yellow")
    .addFields(
      { name: "Voyants :", value: state.lights.join(" "), inline: false },
      {
        name: state.phase === "FERME" ? "HANGAR FERMÉ 🔴" : state.phase === "OUVERT" ? "HANGAR OUVERT 🟢" : "RESTART 🟡",
        value: countdown
      }
    );
}

// Client Discord
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
