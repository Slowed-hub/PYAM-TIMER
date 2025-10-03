const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Configuration du client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Variables globales
let currentStatus = 'OFFLINE';
let currentPhaseStart = null;
let lights = ['🟥', '🟥', '🟥', '🟥', '🟥']; // Utilisation de carrés rouges
let timerMessageId = null;
const channelId = '1423026396741107772'; // Remplacez par l'ID du canal Discord
const cyclesFile = 'cycles.json';
const cycleDurations = {
  OFFLINE: 2 * 60 * 60 * 1000, // 2 heures
  ONLINE: 1 * 60 * 60 * 1000, // 1 heure
  RESTART: 5 * 60 * 1000 // 5 minutes
};

// Charger les cycles depuis cycles.json
async function loadCycles() {
  try {
    const data = await fs.readFile(cyclesFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erreur lors du chargement de cycles.json:', error);
    return [];
  }
}

// Trouver le prochain changement de statut
function getNextStatusChange(cycles, currentTime) {
  const now = new Date(currentTime);
  let nextChange = null;
  let nextStatus = null;

  for (const cycle of cycles) {
    const cycleTime = new Date(cycle.timestamp);
    if (cycleTime > now && (!nextChange || cycleTime < new Date(nextChange.timestamp))) {
      nextChange = cycle;
      nextStatus = cycle.status;
    }
  }

  return { nextChange, nextStatus };
}

// Formatter le temps restant
function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingSeconds = seconds % 60;
  const remainingMinutes = minutes % 60;

  if (currentStatus === 'OFFLINE') {
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`; // Heures, minutes, secondes pour OFFLINE
  } else {
    return `${remainingMinutes}m ${remainingSeconds}s`; // Minutes et secondes pour ONLINE et RESTART
  }
}

// Mettre à jour les voyants
function updateLights(phaseProgress) {
  if (currentStatus === 'OFFLINE') {
    const lightsToTurnGreen = Math.floor(phaseProgress / (24 * 60 * 1000)); // 24 minutes par voyant
    lights = lights.map((light, index) => index < lightsToTurnGreen ? '🟩' : '🟥'); // Carré vert pour Online
  } else if (currentStatus === 'ONLINE') {
    const lightsToTurnOff = Math.floor(phaseProgress / (12 * 60 * 1000)); // 12 minutes par voyant
    lights = lights.map((light, index) => index >= (5 - lightsToTurnOff) ? '⬛' : '🟩'); // Carré noir pour éteint
  } else if (currentStatus === 'RESTART') {
    lights = ['⬛', '⬛', '⬛', '⬛', '⬛']; // Tous carrés noirs
  }
}

// Générer le message Discord
function generateMessage(remainingTime) {
  const statusText = {
    OFFLINE: 'HANGAR CLOSED',
    ONLINE: 'HANGAR OPEN',
    RESTART: 'RESTART'
  };
  const timerText = {
    OFFLINE: `Opening in: ${formatTimeRemaining(remainingTime)}`,
    ONLINE: `Close in: ${formatTimeRemaining(remainingTime)}`,
    RESTART: `Restart in: ${formatTimeRemaining(remainingTime)}`
  };

  return `${lights.join(' ')}\n${statusText[currentStatus]}\n${timerText[currentStatus]}`;
}

// Mettre à jour le minuteur
async function updateTimer() {
  const now = new Date();
  const cycles = await loadCycles();
  const { nextChange, nextStatus } = getNextStatusChange(cycles, now);

  if (!nextChange) {
    console.log('Aucun changement de statut prévu.');
    return;
  }

  const nextChangeTime = new Date(nextChange.timestamp);
  const timeUntilNextChange = nextChangeTime - now;

  // Déterminer la phase actuelle
  if (currentStatus === 'OFFLINE' && timeUntilNextChange <= 0 && nextStatus === 'Online') {
    currentStatus = 'ONLINE';
    currentPhaseStart = now;
  } else if (currentStatus === 'ONLINE' && timeUntilNextChange <= 0 && nextStatus === 'Offline') {
    currentStatus = 'RESTART';
    currentPhaseStart = now;
  } else if (currentStatus === 'RESTART' && (now - currentPhaseStart) >= cycleDurations.RESTART) {
    currentStatus = 'OFFLINE';
    currentPhaseStart = now;
  }

  // Calculer le temps restant dans la phase actuelle
  const phaseProgress = now - currentPhaseStart;
  let remainingTime;
  if (currentStatus === 'RESTART') {
    remainingTime = cycleDurations.RESTART - phaseProgress;
  } else if (currentStatus === 'ONLINE') {
    remainingTime = cycleDurations.ONLINE - phaseProgress;
  } else {
    remainingTime = cycleDurations.OFFLINE - phaseProgress;
  }

  // Mettre à jour les voyants
  updateLights(phaseProgress);

  // Envoyer ou mettre à jour le message Discord
  const channel = await client.channels.fetch(channelId);
  const messageContent = generateMessage(remainingTime);

  if (timerMessageId) {
    try {
      const message = await channel.messages.fetch(timerMessageId);
      await message.edit(messageContent);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du message:', error);
      const newMessage = await channel.send(messageContent);
      timerMessageId = newMessage.id;
    }
  } else {
    const newMessage = await channel.send(messageContent);
    timerMessageId = newMessage.id;
  }
}

// Événement de démarrage du bot
client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  currentPhaseStart = new Date();
  setInterval(updateTimer, 1000); // Mettre à jour toutes les secondes
});

// Serveur HTTP pour Render
app.get('/', (req, res) => {
  res.send('Bot Discord est en cours d\'exécution !');
});

app.listen(port, () => {
  console.log(`Serveur HTTP en écoute sur le port ${port}`);
});

// Connexion du bot Discord
client.login(process.env.DISCORD_TOKEN); // Utilisation de la variable d'environnement
