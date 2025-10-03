const Discord = require('discord.js');
const fs = require('fs');
const express = require('express');
const client = new Discord.Client({ intents: [Discord.IntentsBitField.Flags.Guilds, Discord.IntentsBitField.Flags.GuildMessages] });

const CHANNEL_ID = '1423026396741107772';
const CYCLES_FILE = 'cycles.json';

// Configuration des durées des phases en millisecondes
const OFFLINE_DURATION = 2 * 60 * 60 * 1000; // 2 heures
const ONLINE_DURATION = 1 * 60 * 60 * 1000; // 1 heure
const RESTART_DURATION = 5 * 60 * 1000; // 5 minutes

// Configuration des intervalles de changement des voyants
const OFFLINE_LIGHT_INTERVAL = 24 * 60 * 1000; // 24 minutes
const ONLINE_LIGHT_INTERVAL = 12 * 60 * 1000; // 12 minutes

// Emojis pour les voyants
const RED_SQUARE = '🟥';
const GREEN_SQUARE = '🟩';
const BLACK_SQUARE = '⬛';
const RED_CIRCLE = '🔴';
const GREEN_CIRCLE = '🟢';
const YELLOW_CIRCLE = '🟡';

// Serveur HTTP pour Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Fonction pour formater le temps restant
function formatTimeRemaining(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

// Fonction pour lire le dernier cycle
function getLastCycle() {
    try {
        const data = fs.readFileSync(CYCLES_FILE, 'utf8');
        const cycles = JSON.parse(data);
        return cycles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    } catch (error) {
        console.error('Erreur lors de la lecture de cycles.json:', error);
        return null;
    }
}

// Fonction pour déterminer l'état actuel
function getCurrentState(lastCycle) {
    const now = new Date();
    const lastTimestamp = lastCycle ? new Date(lastCycle.timestamp) : new Date(0);
    const timeDiff = now - lastTimestamp;

    if (!lastCycle || lastCycle.status === 'Offline') {
        if (timeDiff < OFFLINE_DURATION) {
            return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION - timeDiff };
        } else if (timeDiff < OFFLINE_DURATION + ONLINE_DURATION) {
            return { phase: 'ONLINE', timeLeft: OFFLINE_DURATION + ONLINE_DURATION - timeDiff };
        } else if (timeDiff < OFFLINE_DURATION + ONLINE_DURATION + RESTART_DURATION) {
            return { phase: 'RESTART', timeLeft: OFFLINE_DURATION + ONLINE_DURATION + RESTART_DURATION - timeDiff };
        } else {
            return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION };
        }
    } else if (lastCycle.status === 'Online') {
        if (timeDiff < ONLINE_DURATION) {
            return { phase: 'ONLINE', timeLeft: ONLINE_DURATION - timeDiff };
        } else if (timeDiff < ONLINE_DURATION + RESTART_DURATION) {
            return { phase: 'RESTART', timeLeft: ONLINE_DURATION + RESTART_DURATION - timeDiff };
        } else {
            return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION };
        }
    } else {
        if (timeDiff < RESTART_DURATION) {
            return { phase: 'RESTART', timeLeft: RESTART_DURATION - timeDiff };
        } else {
            return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION };
        }
    }
}

// Fonction pour générer l'affichage des voyants
function getLightDisplay(phase, timeLeft) {
    let lights = [];
    let statusText = '';
    let circle = '';
    let timerText = '';

    if (phase === 'OFFLINE') {
        const lightsOn = Math.floor((OFFLINE_DURATION - timeLeft) / OFFLINE_LIGHT_INTERVAL);
        lights = Array(5).fill(RED_SQUARE).map((light, i) => (i < lightsOn ? GREEN_SQUARE : RED_SQUARE));
        statusText = 'HANGAR CLOSED';
        circle = RED_CIRCLE;
        timerText = `Opening in: ${formatTimeRemaining(timeLeft)}`;
    } else if (phase === 'ONLINE') {
        const lightsOff = Math.floor((ONLINE_DURATION - timeLeft) / ONLINE_LIGHT_INTERVAL);
        lights = Array(5).fill(GREEN_SQUARE).map((light, i) => (i >= 5 - lightsOff ? BLACK_SQUARE : GREEN_SQUARE));
        statusText = 'HANGAR OPEN';
        circle = GREEN_CIRCLE;
        timerText = `Close in: ${formatTimeRemaining(timeLeft)}`;
    } else {
        lights = Array(5).fill(BLACK_SQUARE);
        statusText = 'RESTART';
        circle = YELLOW_CIRCLE;
        timerText = `Restart in: ${formatTimeRemaining(timeLeft)}`;
    }

    return `${lights.join(' ')}\n${circle} ${statusText}\n${timerText}`;
}

// Fonction pour écrire un nouveau cycle dans cycles.json
function writeCycle(status) {
    const newCycle = {
        id: Math.floor(Math.random() * 1000), // ID aléatoire pour l'exemple
        status,
        timestamp: new Date().toISOString()
    };
    let cycles = [];
    try {
        cycles = JSON.parse(fs.readFileSync(CYCLES_FILE, 'utf8'));
    } catch (error) {
        console.error('Erreur lors de la lecture de cycles.json:', error);
    }
    cycles.push(newCycle);
    fs.writeFileSync(CYCLES_FILE, JSON.stringify(cycles, null, 2));
}

// Événement déclenché quand le bot est prêt
client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) {
        console.error('Canal non trouvé!');
        return;
    }

    let lastPhase = null;

    // Mise à jour toutes les 10 secondes
    setInterval(async () => {
        const lastCycle = getLastCycle();
        const { phase, timeLeft } = getCurrentState(lastCycle);

        // Si la phase change, écrire un nouveau cycle
        if (phase !== lastPhase) {
            if (phase === 'OFFLINE' && lastPhase !== null) writeCycle('Offline');
            else if (phase === 'ONLINE') writeCycle('Online');
            lastPhase = phase;
        }

        // Envoyer ou mettre à jour le message
        const messageContent = getLightDisplay(phase, timeLeft);
        try {
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();
            if (lastMessage && lastMessage.author.id === client.user.id) {
                await lastMessage.edit(messageContent);
            } else {
                await channel.send(messageContent);
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message:', error);
        }
    }, 10000); // Mise à jour toutes les 10 secondes
});

// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
