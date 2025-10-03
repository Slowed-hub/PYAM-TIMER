const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const http = require('http');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const CHANNEL_ID = '1423026396741107772';

let cyclePhase = 'Offline';
let lights = [false, false, false, false, false];
let cycleData = JSON.parse(fs.readFileSync('cycles.json', 'utf8'));

function updateLights() {
    const now = new Date();
    let nextEvent = cycleData.find(entry => new Date(entry.timestamp) > now);
    if (!nextEvent) nextEvent = cycleData[0]; // Loop back if at end

    if (cyclePhase === 'Offline') {
        const timeDiff = (new Date(nextEvent.timestamp) - now) / 1000 / 60;
        if (timeDiff <= 120) { // 2 hours
            const interval = 24;
            lights.forEach((light, index) => {
                if (timeDiff <= 120 - (index * interval) && !light) lights[index] = true;
            });
            client.channels.cache.get(CHANNEL_ID).send(`🟥🟥🟥🟥🟥\n🟥 HANGAR CLOSED\nOpening in: ${Math.floor(timeDiff / 60)}h ${Math.floor(timeDiff % 60)}m`);
        }
        if (timeDiff > 120) cyclePhase = 'Online'; // Transition to next phase
    } else if (cyclePhase === 'Online') {
        const timeDiff = (new Date(nextEvent.timestamp) - now) / 1000;
        if (timeDiff <= 3600) { // 1 hour
            const interval = 12 * 60;
            lights.forEach((light, index) => {
                if (timeDiff <= 3600 - ((4 - index) * interval) && light) lights[4 - index] = false;
            });
            client.channels.cache.get(CHANNEL_ID).send(`🟩🟩🟩🟩🟩\n🟩 HANGAR OPEN\nClose in: ${Math.floor(timeDiff / 60)}m ${Math.floor(timeDiff % 60)}s`);
        }
        if (timeDiff > 3600) cyclePhase = 'Restart'; // Transition to next phase
    } else if (cyclePhase === 'Restart') {
        const timeDiff = (new Date(nextEvent.timestamp) - now) / 1000;
        if (timeDiff <= 300) { // 5 minutes
            lights = [false, false, false, false, false];
            client.channels.cache.get(CHANNEL_ID).send(`⬜⬜⬜⬜⬜\n🟨 RESTART\nRestart in: ${Math.floor(timeDiff / 60)}m ${Math.floor(timeDiff % 60)}s`);
        }
        if (timeDiff > 300) cyclePhase = 'Offline'; // Back to start
    }
}

client.once('ready', () => {
    console.log('Bot is online!');
    setInterval(updateLights, 60000); // Update every minute
    updateLights(); // Initial update
});

client.login(process.env.DISCORD_TOKEN);

// HTTP server for Render
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
}).listen(process.env.PORT || 3000);
