require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// --- Vérification des variables d'environnement ---
if (!TOKEN || !CHANNEL_ID) {
  console.error("Erreur : DISCORD_TOKEN ou CHANNEL_ID manquant dans les variables d'environnement.");
  process.exit(1);
}

// --- Configuration du cycle ---
const CYCLE_CONFIG = {
  RED_PHASE_DURATION: 120 * 60 * 1000, // 120 minutes
  GREEN_PHASE_DURATION: 60 * 60 * 1000, // 60 minutes
  BLACK_PHASE_DURATION: 5 * 60 * 1000, // 5 minutes
  LIGHTS_COUNT: 5,
  RED_LIGHT_INTERVAL: 24 * 60 * 1000, // 24 minutes
  GREEN_LIGHT_INTERVAL: 12 * 60 * 1000, // 12 minutes
};

const REFERENCE_TIME = new Date("2025-01-02T01:05:56Z").getTime();
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
    if (index < currentLightIndex) return "🟩";
    return "🟥";
  }
  if (phase === "OUVERT") {
    const reversedCurrentIndex = CYCLE_CONFIG.LIGHTS_COUNT - 1 - currentLightIndex;
    if (index > reversedCurrentIndex) return "⬛";
    return "🟩";
  }
  return "⬛";
}

// --- Formatage du temps ---
function formatTime(minutes, showSeconds = false) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);
  return showSeconds
    ? `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${hrs}h${mins.toString().padStart(2, "0")}`;
}

// --- Calcul du cycle basé sur l'heure actuelle ---
function getCurrentCycle() {
  const now = Date.now();
  const timeSinceReference = now - REFERENCE_TIME;
  const cyclePosition = (timeSinceReference % TOTAL_CYCLE + TOTAL_CYCLE) % TOTAL_CYCLE;
  const cyclePositionMinutes = cyclePosition / 60000;

  let phase, phaseTimeRemaining, currentLightIndex;

  if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION / 60000) {
    phase = "FERME";
    phaseTimeRemaining = CYCLE_CONFIG.RED_PHASE_DURATION / 60000 - cyclePositionMinutes;
    currentLightIndex = Math.floor(cyclePositionMinutes / (CYCLE_CONFIG.RED_LIGHT_INTERVAL / 60000));
  } else if (cyclePositionMinutes < (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION) / 60000) {
    phase = "OUVERT";
    const greenPhasePosition = cyclePositionMinutes - CYCLE_CONFIG.RED_PHASE_DURATION / 60000;
    phaseTimeRemaining = CYCLE_CONFIG.GREEN_PHASE_DURATION / 60000 - greenPhasePosition;
    currentLightIndex = Math.floor(greenPhasePosition / (CYCLE_CONFIG.GREEN_LIGHT_INTERVAL / 60000));
  } else {
    phase = "RESTART";
    phaseTimeRemaining = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) / 60000 - cyclePositionMinutes;
    currentLightIndex = CYCLE_CONFIG.LIGHTS_COUNT;
  }

  return { phase, phaseTimeRemaining, currentLightIndex };
}

// --- Mise à jour des voyants ---
function updateLights(phase, currentLightIndex) {
  state.lights = Array(CYCLE_CONFIG.LIGHTS_COUNT)
    .fill()
    .map((_, index) => getLightState(index, phase, currentLightIndex));
}

// --- Synchronisation ---
function syncState() {
  try {
    const { phase, phaseTimeRemaining, currentLightIndex } = getCurrentCycle();
    state.phase = phase;
    state.startTime = Date.now() - (cyclePositionMinutes * 60000);
    state.endTime = Date.now() + (phaseTimeRemaining * 60000);
    updateLights(phase, currentLightIndex);
  } catch (error) {
    console.error("Erreur dans syncState:", error);
  }
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
        name: phase === "FERME" ? "HANGAR FERMÉ 🔴" : phase === "OUVERT" ? "HANGAR OUVERT 🟢" : "RESTART 🟡",
        value: countdown,
      }
    );
}

// --- Client Discord ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("error", (error) => {
  console.error("Erreur du client Discord:", error);
});

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  try {
    syncState();
    const channel = await client.channels.fetch(CHANNEL_ID).catch((error) => {
      console.error("Erreur lors de la récupération du canal:", error);
      throw error;
    });
    const messageInstance = await channel.send({ embeds: [buildEmbed()] }).catch((error) => {
      console.error("Erreur lors de l'envoi du message:", error);
      throw error;
    });

    setInterval(async () => {
      try {
        syncState();
        await messageInstance.edit({ embeds: [buildEmbed()] }).catch((error) => {
          console.error("Erreur lors de la modification du message:", error);
        });
      } catch (error) {
        console.error("Erreur dans l'intervalle de mise à jour:", error);
      }
    }, 1000);
  } catch (error) {
    console.error("Erreur dans l'événement ready:", error);
  }
});

client.login(TOKEN).catch((error) => {
  console.error("Erreur lors de la connexion au client Discord:", error);
  process.exit(1);
});



