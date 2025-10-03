require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const CYCLE_CONFIG = {
  RED_PHASE_DURATION: 120,
  GREEN_PHASE_DURATION: 60,
  BLACK_PHASE_DURATION: 5,
  LIGHTS_COUNT: 5,
  RED_LIGHT_INTERVAL: 24,
  GREEN_LIGHT_INTERVAL: 12,
};

const REFERENCE_TIME = new Date('2025-01-02T01:05:56Z').getTime();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function getLightState(index, phase, currentLightIndex) {
  if (phase === 'red') {
    if (index < currentLightIndex) return 'green';
    if (index === currentLightIndex) return 'red';
    return 'red';
  }
  if (phase === 'green') {
    const reversedCurrentIndex = CYCLE_CONFIG.LIGHTS_COUNT - 1 - currentLightIndex;
    if (index > reversedCurrentIndex) return 'black';
    if (index === reversedCurrentIndex) return 'green';
    return 'green';
  }
  return 'black';
}

function formatTime(minutes, showSeconds = false) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);

  if (showSeconds) {
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${hrs}h${mins.toString().padStart(2, '0')}`;
}

function getTimerState() {
  const currentTime = Date.now();
  const timeSinceReference = currentTime - REFERENCE_TIME;
  const cycleDuration = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) * 60 * 1000;
  const cyclePosition = timeSinceReference % cycleDuration;
  const cyclePositionMinutes = cyclePosition / 60000;

  let phase, phaseTimeRemaining, currentLightIndex, lightTimeRemaining, statusText, statusColor;

  if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION) {
    phase = 'red';
    phaseTimeRemaining = CYCLE_CONFIG.RED_PHASE_DURATION - cyclePositionMinutes;
    currentLightIndex = Math.floor(cyclePositionMinutes / CYCLE_CONFIG.RED_LIGHT_INTERVAL);
    lightTimeRemaining = CYCLE_CONFIG.RED_LIGHT_INTERVAL - (cyclePositionMinutes % CYCLE_CONFIG.RED_LIGHT_INTERVAL);
    statusText = 'HANGAR FERMÉ';
    statusColor = 0xEF4444;
  } else if (cyclePositionMinutes < CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION) {
    phase = 'green';
    const greenPhasePosition = cyclePositionMinutes - CYCLE_CONFIG.RED_PHASE_DURATION;
    phaseTimeRemaining = CYCLE_CONFIG.GREEN_PHASE_DURATION - greenPhasePosition;
    currentLightIndex = Math.floor(greenPhasePosition / CYCLE_CONFIG.GREEN_LIGHT_INTERVAL);
    lightTimeRemaining = CYCLE_CONFIG.GREEN_LIGHT_INTERVAL - (greenPhasePosition % CYCLE_CONFIG.GREEN_LIGHT_INTERVAL);
    statusText = 'HANGAR OUVERT';
    statusColor = 0x10B981;
  } else {
    phase = 'black';
    phaseTimeRemaining = (CYCLE_CONFIG.RED_PHASE_DURATION + CYCLE_CONFIG.GREEN_PHASE_DURATION + CYCLE_CONFIG.BLACK_PHASE_DURATION) - cyclePositionMinutes;
    currentLightIndex = CYCLE_CONFIG.LIGHTS_COUNT;
    lightTimeRemaining = phaseTimeRemaining;
    statusText = 'RESTART';
    statusColor = 0xF59E0B;
  }

  const lights = Array.from({ length: CYCLE_CONFIG.LIGHTS_COUNT }).map((_, index) => {
    const state = getLightState(index, phase, currentLightIndex);
    const emoji = state === 'red' ? '🔴' : state === 'green' ? '🟢' : '⚫';
    return emoji;
  });

  return {
    phase,
    phaseTimeRemaining,
    currentLightIndex,
    lightTimeRemaining,
    statusText,
    statusColor,
    lights,
  };
}

function createTimerEmbed() {
  const state = getTimerState();

  const embed = new EmbedBuilder()
    .setColor(state.statusColor)
    .setTitle('⏱️ Timer Hangar PYAM')
    .setDescription(`**Statut:** ${state.statusText}`)
    .addFields(
      {
        name: '🕐 Temps restant phase',
        value: `\`${state.phase === 'black' ? formatTime(state.phaseTimeRemaining, true) : formatTime(state.phaseTimeRemaining, false)}\``,
        inline: true
      },
      {
        name: '💡 Voyant actif',
        value: `\`${formatTime(state.lightTimeRemaining, true)}\``,
        inline: true
      },
      {
        name: '🚦 Voyants',
        value: state.lights.join(' '),
        inline: false
      }
    )
    .setTimestamp()
    .setFooter({ text: '404 Unit - Timer synchronisé' });

  return embed;
}

let updateInterval = null;
let lastMessageId = null;
let channelId = null;

async function startAutoUpdate(channel) {
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  channelId = channel.id;

  const message = await channel.send({ embeds: [createTimerEmbed()] });
  lastMessageId = message.id;

  updateInterval = setInterval(async () => {
    try {
      const fetchedChannel = await client.channels.fetch(channelId);
      const fetchedMessage = await fetchedChannel.messages.fetch(lastMessageId);
      await fetchedMessage.edit({ embeds: [createTimerEmbed()] });
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      if (error.code === 10008) {
        clearInterval(updateInterval);
        const fetchedChannel = await client.channels.fetch(channelId);
        const newMessage = await fetchedChannel.send({ embeds: [createTimerEmbed()] });
        lastMessageId = newMessage.id;
        startAutoUpdate(fetchedChannel);
      }
    }
  }, 1000);
}

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  console.log(`📅 Temps de référence: ${new Date(REFERENCE_TIME).toISOString()}`);
  console.log(`⏰ Le bot est maintenant en ligne et prêt à recevoir des commandes!`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!timer') {
    await message.reply({ embeds: [createTimerEmbed()] });
  }

  if (message.content === '!timer-auto') {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
      await message.reply('⏹️ Mise à jour automatique arrêtée.');
    } else {
      await startAutoUpdate(message.channel);
      await message.reply('▶️ Mise à jour automatique démarrée (1 seconde).');
    }
  }

  if (message.content === '!timer-help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Commandes du Timer Hangar PYAM')
      .setDescription('Liste des commandes disponibles:')
      .addFields(
        { name: '!timer', value: 'Affiche l\'état actuel du timer', inline: false },
        { name: '!timer-auto', value: 'Active/désactive la mise à jour automatique (1 sec)', inline: false },
        { name: '!timer-help', value: 'Affiche ce message d\'aide', inline: false }
      )
      .setFooter({ text: '404 Unit' });

    await message.reply({ embeds: [helpEmbed] });
  }
});

client.on('error', (error) => {
  console.error('Erreur Discord:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Rejet de promesse non géré:', error);
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('❌ ERREUR: Le token Discord (DISCORD_TOKEN) n\'est pas défini dans les variables d\'environnement!');
  process.exit(1);
}

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('❌ Échec de la connexion au bot Discord:', error);
  process.exit(1);
});

client.login(process.env.TOKEN);


