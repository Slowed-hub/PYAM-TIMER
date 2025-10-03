const Discord = require('discord.js');
const fs = require('fs');
const express = require('express');
const client = new Discord.Client({ intents: [Discord.IntentsBitField.Flags.Guilds, Discord.IntentsBitField.Flags.GuildMessages] });

const CHANNEL_ID = '1423026396741107772';
const CYCLES_FILE = 'cycles.json';

// Durées des phases en millisecondes
const OFFLINE_DURATION = 2 * 60 * 60 * 1000; // 2 heures
const ONLINE_DURATION = 1 * 60 * 60 * 1000; // 1 heure
const RESTART_DURATION = 5 * 60 * 1000; // 5 minutes
const TOTAL_CYCLE_DURATION = OFFLINE_DURATION + ONLINE_DURATION + RESTART_DURATION;

// Intervalles de changement des voyants
const OFFLINE_LIGHT_INTERVAL = 24 * 60 * 1000; // 24 minutes
const ONLINE_LIGHT_INTERVAL = 12 * 60 * 1000; // 12 minutes

// Emojis pour l'affichage
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
    if (ms < 0 || ms > TOTAL_CYCLE_DURATION) {
        console.error(`Temps restant invalide: ${ms}ms`);
        return '0m 00s';
    }
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
        if (!fs.existsSync(CYCLES_FILE)) {
            console.log('cycles.json n\'existe pas, création d\'un fichier vide');
            fs.writeFileSync(CYCLES_FILE, '[]');
            return null;
        }
        const data = fs.readFileSync(CYCLES_FILE, 'utf8');
        const cycles = JSON.parse(data);
        const validCycles = cycles.filter(c => c.timestamp && !isNaN(new Date(c.timestamp)));
        const lastCycle = validCycles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
        console.log('Dernier cycle lu:', lastCycle);
        return lastCycle;
    } catch (error) {
        console.error('Erreur lors de la lecture de cycles.json:', error);
        return null;
    }
}

// Fonction pour déterminer l'état actuel
function getCurrentState(lastCycle) {
    const now = new Date();
    if (!lastCycle || isNaN(new Date(lastCycle.timestamp))) {
        console.log('Aucun cycle valide, démarrage d\'un nouveau cycle OFFLINE');
        return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION, startTime: now };
    }

    const lastTimestamp = new Date(lastCycle.timestamp);
    const timeDiff = now - lastTimestamp;
    console.log(`TimeDiff: ${timeDiff}ms, Dernier timestamp: ${lastCycle.timestamp}`);

    // Si timeDiff est aberrant, réinitialiser
    if (timeDiff < 0 || timeDiff > TOTAL_CYCLE_DURATION * 10) {
        console.log('TimeDiff aberrant, réinitialisation du cycle');
        return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION, startTime: now };
    }

    const cycleTime = timeDiff % TOTAL_CYCLE_DURATION;
    if (cycleTime < OFFLINE_DURATION) {
        return { phase: 'OFFLINE', timeLeft: OFFLINE_DURATION - cycleTime, startTime: new Date(now - cycleTime) };
    } else if (cycleTime < OFFLINE_DURATION + ONLINE_DURATION) {
        return { phase: 'ONLINE', timeLeft: OFFLINE_DURATION + ONLINE_DURATION - cycleTime, startTime: new Date(now - cycleTime) };
    } else {
        return { phase: 'RESTART', timeLeft: TOTAL_CYCLE_DURATION - cycleTime, startTime: new Date(now - cycleTime) };
    }
}

// Fonction pour générer l'affichage des voyants
function getLightDisplay(phase, timeLeft, phaseStartTime) {
    let lights = [];
    let statusText = '';
    let circle = '';
    let timerText = '';

    if (phase === 'OFFLINE') {
        const elapsed = Date.now() - phaseStartTime;
        const lightsOn = Math.min(5, Math.floor(elapsed / OFFLINE_LIGHT_INTERVAL));
        lights = Array(5).fill(RED_SQUARE).map((light, i) => (i < lightsOn ? GREEN_SQUARE : RED_SQUARE));
        statusText = 'HANGAR CLOSED';
        circle = RED_CIRCLE;
        timerText = `Opening in: ${formatTimeRemaining(timeLeft)}`;
    } else if (phase === 'ONLINE') {
        const elapsed = Date.now() - phaseStartTime;
        const lightsOff = Math.min(5, Math.floor(elapsed / ONLINE_LIGHT_INTERVAL));
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

    // Ajout d'une ligne vide entre chaque élément
    return `${lights.join(' ')}\n\n${circle} ${statusText}\n\n${timerText}`;
}

// Fonction pour écrire un nouveau cycle dans cycles.json
function writeCycle(status) {
    const newCycle = {
        id: Math.floor(Math.random() * 1000),
        status,
        timestamp: new Date().toISOString()
    };
    let cycles = [];
    try {
        if (fs.existsSync(CYCLES_FILE)) {
            cycles = JSON.parse(fs.readFileSync(CYCLES_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Erreur lors de la lecture de cycles.json pour écriture:', error);
    }
    cycles.push(newCycle);
    try {
        fs.writeFileSync(CYCLES_FILE, JSON.stringify(cycles, null, 2));
        console.log(`Nouveau cycle écrit: ${status}, Timestamp: ${newCycle.timestamp}`);
    } catch (error) {
        console.error('Erreur lors de l\'écriture de cycles.json:', error);
    }
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
    let lastMessage = null;

    // Mise à jour toutes les 10 secondes
    setInterval(async () => {
        const lastCycle = getLastCycle();
        const { phase, timeLeft, startTime } = getCurrentState(lastCycle);

        // Écrire un nouveau cycle lors d'une transition de phase
        if (phase !== lastPhase && lastPhase !== null) {
            if (phase === 'OFFLINE') writeCycle('Offline');
            else if (phase === 'ONLINE') writeCycle('Online');
        }
        lastPhase = phase;

        // Générer et envoyer/mettre à jour le message
        const messageContent = getLightDisplay(phase, timeLeft, startTime);
        try {
            if (lastMessage && lastMessage.author.id === client.user.id) {
                await lastMessage.edit(messageContent);
            } else {
                lastMessage = await channel.send(messageContent);
            }
            console.log(`Message mis à jour: ${messageContent}`);
        } catch (error) {
            console.error('Erreur lors de l\'envoi/mise à jour du message:', error);
        }
    }, 10000); // Mise à jour toutes les 10 secondes
});

// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
