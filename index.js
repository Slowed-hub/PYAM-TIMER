const { Client, GatewayIntentBits } = require('discord.js');

// Discord client setup
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const CHANNEL_ID = '1423026396741107772';

// Timing constants (in milliseconds)
const OPEN_DURATION = 3600000; // 1 hour
const CLOSE_DURATION = 7200000; // 2 hours
const RESTART_DURATION = 300000; // 5 minutes
const CYCLE_DURATION = OPEN_DURATION + CLOSE_DURATION + RESTART_DURATION;
const INITIAL_OPEN_TIME = new Date('2025-09-21T00:04:27.222-04:00');

// Indicator transition timings
const OFFLINE_INDICATOR_INTERVAL = 24 * 60 * 1000; // 24 minutes
const ONLINE_INDICATOR_INTERVAL = 12 * 60 * 1000; // 12 minutes

// Indicator states for each phase
const INDICATOR_STATES = {
    OFFLINE: [
        ['red', 'red', 'red', 'red', 'red'], // 0-24 min
        ['green', 'red', 'red', 'red', 'red'], // 24-48 min
        ['green', 'green', 'red', 'red', 'red'], // 48-72 min
        ['green', 'green', 'green', 'red', 'red'], // 72-96 min
        ['green', 'green', 'green', 'green', 'red'] // 96-120 min
    ],
    ONLINE: [
        ['green', 'green', 'green', 'green', 'green'], // 0-12 min
        ['green', 'green', 'green', 'green', 'empty'], // 12-24 min
        ['green', 'green', 'green', 'empty', 'empty'], // 24-36 min
        ['green', 'green', 'empty', 'empty', 'empty'], // 36-48 min
        ['green', 'empty', 'empty', 'empty', 'empty'] // 48-60 min
    ],
    RESTART: [['empty', 'empty', 'empty', 'empty', 'empty']] // All black
};

// Function to get current phase and next change time
function getCurrentPhase(currentTime) {
    const elapsedTime = currentTime - INITIAL_OPEN_TIME;
    const timeInCycle = elapsedTime % CYCLE_DURATION;

    if (timeInCycle < OPEN_DURATION) {
        return {
            phase: 'ONLINE',
            nextChangeTime: new Date(currentTime.getTime() + (OPEN_DURATION - timeInCycle)),
            timeInPhase: timeInCycle
        };
    } else if (timeInCycle < OPEN_DURATION + CLOSE_DURATION) {
        return {
            phase: 'OFFLINE',
            nextChangeTime: new Date(currentTime.getTime() + (OPEN_DURATION + CLOSE_DURATION - timeInCycle)),
            timeInPhase: timeInCycle - OPEN_DURATION
        };
    } else {
        return {
            phase: 'RESTART',
            nextChangeTime: new Date(currentTime.getTime() + (OPEN_DURATION + CLOSE_DURATION + RESTART_DURATION - timeInCycle)),
            time
