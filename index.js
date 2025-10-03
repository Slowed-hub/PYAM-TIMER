const Discord = require('discord.js');
const http = require('http');
const client = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds] });

const CHANNEL_ID = '1423026396741107772';

const OPEN_DURATION = 3900385;
const CLOSE_DURATION = 7200711;
const CYCLE_DURATION = OPEN_DURATION + CLOSE_DURATION;
const INITIAL_OPEN_TIME = new Date('2025-09-21T00:04:27.222-04:00');
const ONLINE_DURATION = 60 * 60 * 1000;
const RESTART_DURATION = 5 * 60 * 1000;

const thresholds = [
    { min: 0, max: 12*60*1000, colors: ['green', 'green', 'green', 'green', 'green'] },
    { min: 12*60*1000, max: 24*60*1000, colors: ['green', 'green', 'green', 'green', 'empty'] },
    { min: 24*60*1000, max: 36*60*1000, colors: ['green', 'green', 'green', 'empty', 'empty'] },
    { min: 36*60*1000, max: 48*60*1000, colors: ['green', 'green', 'empty', 'empty', 'empty'] },
    { min: 48*60*1000, max: 60*60*1000, colors: ['green', 'empty', 'empty', 'empty', 'empty'] },
    { min: 60*60*1000, max: 65*60*1000, colors: ['empty', 'empty', 'empty', 'empty', 'empty'] },
    { min: 65*60*1000, max: 89*60*1000, colors: ['red', 'red', 'red', 'red', 'red'] },
    { min: 89*60*1000, max: 113*60*1000, colors: ['green', 'red', 'red', 'red', 'red'] },
    { min: 113*60*1000, max: 137*60*1000, colors: ['green', 'green', 'red', 'red', 'red'] },
    { min: 137*60*1000, max: 161*60*1000, colors: ['green', 'green', 'green', 'red', 'red'] },
    { min: 161*60*1000, max: 185*60*1000, colors: ['green', 'green', 'green', 'green', 'red'] }
];

function getCurrentPhaseAndNextChange(currentTime) {
    let elapsedTimeSinceInitialOpen = (currentTime - INITIAL_OPEN_TIME.getTime());
    let timeInCurrentCycle = elapsedTimeSinceInitialOpen % CYCLE_DURATION;
    if (timeInCurrentCycle < 0) timeInCurrentCycle += CYCLE_DURATION;

    let status, label, dot, countdownLabel, nextChangeTime;

    if (timeInCurrentCycle < ONLINE_DURATION) {
        status = 'ONLINE';
        label = 'HANGAR OPEN';
        dot = '🟢';
        countdownLabel = 'Close in :';
        nextChangeTime = INITIAL_OPEN_TIME.getTime() + Math.floor(elapsedTimeSinceInitialOpen / CYCLE_DURATION) * CYCLE_DURATION + ONLINE_DURATION;
    } else if (timeInCurrentCycle < OPEN_DURATION) {
        status = 'RESTART';
        label = 'RESTART';
        dot = '🟡';
        countdownLabel = 'Offline in :';
        nextChangeTime = INITIAL_OPEN_TIME.getTime() + Math.floor(elapsedTimeSinceInitialOpen / CYCLE_DURATION) * CYCLE_DURATION + OPEN_DURATION;
    } else {
        status = 'OFFLINE';
        label = 'HANGAR CLOSED';
        dot = '🔴';
        countdownLabel = 'Opening in :';
        nextChangeTime = INITIAL_OPEN_TIME.getTime() + (Math.floor(elapsedTimeSinceInitialOpen / CYCLE_DURATION) + 1) * CYCLE_DURATION;
    }

    return { status, label, dot, countdownLabel, nextChangeTime, timeInCurrentCycle };
}

function formatRemaining(remainingMs, status) {
    let totalSeconds = Math.floor(remainingMs / 1000);
    let seconds = totalSeconds % 60;
    let minutes = Math.floor(totalSeconds / 60);

    if (status === 'OFFLINE') {
        let hours = Math.floor(minutes / 60);
        minutes %= 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function getCircleEmojis(timeInCurrentCycle) {
    const current = thresholds.find(t => timeInCurrentCycle >= t.min && timeInCurrentCycle < t.max);
    if (current) {
        return current.colors.map(color => {
            if (color === 'green') return '🟢';
            if (color === 'red') return '🔴';
            if (color === 'empty') return '⚫';
            return '⚫'; // fallback
        });
    }
    return ['⚫', '⚫', '⚫', '⚫', '⚫']; // fallback
}

let statusMessage;
let updateInterval;

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) {
        console.error('Channel not found');
        return;
    }
    statusMessage = await channel.send('Initializing...');
    updateInterval = setInterval(updateStatusMessage, 10000);
});

async function updateStatusMessage() {
    if (!statusMessage) return;
    const now = new Date().getTime();
    const { status, label, dot, countdownLabel, nextChangeTime, timeInCurrentCycle } = getCurrentPhaseAndNextChange(now);
    const remaining = nextChangeTime - now;
    if (remaining <= 0) return; // Will update on next tick

    const circles = getCircleEmojis(timeInCurrentCycle);
    const countdown = formatRemaining(remaining, status);

    const content = `\`\`\`
${circles.join(' ')}

${label} ${dot}
${countdownLabel} ${countdown}
\`\`\``;

    try {
        await statusMessage.edit(content);
    } catch (error) {
        console.error('Error editing message:', error);
    }
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

server.listen(process.env.PORT || 3000, () => {
    console.log('HTTP server running');
});

client.login(process.env.DISCORD_TOKEN);

