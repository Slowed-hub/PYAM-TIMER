require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Configuration du cycle (identique au site)
const CYCLE_CONFIG = {
  RED_PHASE_DURATION: 120, // minutes
  GREEN_PHASE_DURATION: 60, // minutes
  BLACK_PHASE_DURATION: 5, // minutes
  LIGHTS_COUNT: 5,
  RED_LIGHT_INTERVAL: 24, // minutes par voyant en phase rouge
  GREEN_LIGHT_INTERVAL: 12, // minutes par voyant en phase verte
};

// CRUCIAL: Même référence temporelle que le site React
// Online 02/01/2025 01:05:56 = début phase rouge
const REFERENCE_TIME = new Date('2025-01-02T01:05:56').getTime();

// --- État ---
let state = {
  phase: "FERME",
  phaseTimeRemaining: 0,
  lightTimeRemaining: 0,
  currentLightIndex: 0,
  lights: Array(CYCLE_CONFIG.LIGHTS_COUNT).fill("🟥")
};

// --- Calcul de l'état des voyants ---
function getLightState(index, phase, currentLightIndex) {
  if (phase === 'red') {
    if (index < currentLightIndex) return '🟩';
    if (index === currentLightIndex) return '🟥';
    return '🟥';
  }
  if (phase === 'green') {
    // Inverser l'ordre comme sur le site
    const reversedCurrentIndex = CYCLE_CONFIG.LIGHTS_COUNT - 1 - currentLightIndex;
    if (index > reversedCurrentIndex) return '⬛';
    if (index === reversedCurrentIndex) return '🟩';
    return '🟩';
  }
  return '⬛'; // Phase noire
}

// --- Synchronisation avec le site React ---
function syncState() {
  const currentTime = Date.now();
  
  // Calculer la position dans le cycle (identique au site)
  const timeSinceReference = currentTime - REFERENCE_TIME;
  const cycleDuration = (CYCLE_CONFIG.RED_PHASE_DURATION + 
                        CYCLE_CONFIG.GREEN_PHASE_DURATION + 
                        CYCLE_CONFIG.BLACK_PHASE_DURATION) * 60 * 1000;
  const cyclePosition = timeSinceReference % cycleDuration;
  const cyclePositionMinutes = cyclePosition / 60000;

  let phase, phaseTimeRemaining, currentLightIndex, lightTimeRemaining;

  if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION) {
    // Phase rouge - HANGAR FERMÉ
    phase = 'red';
    phaseTimeRemaining = CYCLE_CONFIG.RED_PHASE_DURATION - cyclePositionMinutes;
    currentLightIndex = Math.floor(cyclePositionMinutes / CYCLE_CONFIG.RED_LIGHT_INTERVAL);
    lightTimeRemaining = CYCLE_CONFIG.RED_LIGHT_INTERVAL - (cyclePositionMinutes % CYCLE_CONFIG.RED_LIGHT_INTERVAL);
    state.phase = "FERME";
  } else if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION) {
    // Phase verte - HANGAR OUVERT
    phase = 'green';
    const greenPhasePosition = cyclePositionMinutes - CYCLE_CONFIG.RED_PHASE_DURATION;
    phaseTimeRemaining = CYCLE_CONFIG.GREEN_PHASE_DURATION - greenPhasePosition;
    currentLightIndex = Math.floor(greenPhasePosition / CYCLE_CONFIG.GREEN_LIGHT_INTERVAL);
    lightTimeRemaining = CYCLE_CONFIG.GREEN_LIGHT_INTERVAL - (greenPhasePosition % CYCLE_CONFIG.GREEN_LIGHT_INTERVAL);
    state.phase = "OUVERT";
  } else {
    // Phase noire - RESTART
    phase = 'black';
    phaseTimeRemaining = (CYCLE_CONFIG.RED_PHASE_DURATION + 
                         CYCLE_CONFIG.GREEN_PHASE_DURATION + 
                         CYCLE_CONFIG.BLACK_PHASE_DURATION) - cyclePositionMinutes;
    currentLightIndex = CYCLE_CONFIG.LIGHTS_COUNT;
    lightTimeRemaining = phaseTimeRemaining;
    state.phase = "RESTART";
  }

  // Mise à jour des voyants
  for (let i = 0; i < CYCLE_CONFIG.LIGHTS_COUNT; i++) {
    state.lights[i] = getLightState(i, phase, currentLightIndex);
  }

  state.phaseTimeRemaining = phaseTimeRemaining;
  state.lightTimeRemaining = lightTimeRemaining;
  state.currentLightIndex = currentLightIndex;
}

// --- Formatage du temps ---
function formatTime(minutes, showSeconds = false) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);
  
  if (showSeconds) {
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${hrs}h${mins.toString().padStart(2, '0')}`;
}

// --- Embed Discord ---
function buildEmbed() {
  const countdown = state.phase === "RESTART" 
    ? formatTime(state.phaseTimeRemaining, true)
    : formatTime(state.phaseTimeRemaining, false);

  const statusEmoji = {
    "FERME": "🔴",
    "OUVERT": "🟢",
    "RESTART": "🟡"
  };

  const embedColor = {
    "FERME": "Red",
    "OUVERT": "Green",
    "RESTART": "Yellow"
  };

  return new EmbedBuilder()
    .setTitle("Executive Hangar Status")
    .setColor(embedColor[state.phase])
    .addFields(
      { 
        name: "Voyants", 
        value: state.lights.join(" "), 
        inline: false 
      },
      { 
        name: `HANGAR ${state.phase} ${statusEmoji[state.phase]}`, 
        value: `⏱️ ${countdown}`,
        inline: false
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Synchronisé avec le site PYAM' });
}

// --- Client Discord ---
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

let messageInstance;

client.once("ready", async () => {
  console.log(`✅ Bot Discord connecté: ${client.user.tag}`);
  console.log(`📍 Référence temporelle: ${new Date(REFERENCE_TIME).toLocaleString('fr-FR')}`);
  
  // Synchronisation initiale
  syncState();
  console.log(`🔄 État initial: Phase ${state.phase}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    messageInstance = await channel.send({ embeds: [buildEmbed()] });
    console.log(`✅ Message initial envoyé`);

    // Mise à jour toutes les secondes
    setInterval(() => {
      syncState();
      if (messageInstance) {
        messageInstance.edit({ embeds: [buildEmbed()] }).catch(err => {
          console.error("❌ Erreur lors de la mise à jour du message:", err);
        });
      }
    }, 1000);

  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation:", error);
  }
});

client.on("error", (error) => {
  console.error("❌ Erreur Discord:", error);
});

client.login(TOKEN).catch(err => {
  console.error("❌ Erreur de connexion:", err);
});
