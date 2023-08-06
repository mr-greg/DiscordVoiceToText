import 'dotenv/config';
import { Client, IntentsBitField } from 'discord.js';
import { joinVoiceChannel, EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - node-wit's types are not up to date
import { Wit } from 'node-wit';
import { Readable } from 'node:stream';

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is not defined');
if (!process.env.WIT_AI_TOKEN) throw new Error('WIT_AI_TOKEN is not defined');

const witClient = new Wit({ accessToken: process.env.WIT_AI_TOKEN });
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

// Drop 2 bytes every 2 bytes to convert stereo to mono
const convertStereoToMono = (stereoData: Buffer): Buffer =>
  Buffer.from(stereoData.filter((_, index) => index % 4 < 2));

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot || !message.member) return;
  if (message.content === '!record') {
    const member = message.member;
    if (!member.voice.channelId) {
      message.reply('You must be in a voice channel to use this command!');
      return;
    }

    const connection = joinVoiceChannel({
      channelId: member.voice.channelId,
      guildId: member.guild.id,
      adapterCreator: member.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    const receiver = connection.receiver;
    message.reply('Recording started! Say "!stop" to stop recording.');

    // Check for "!stop" to stop recording
    const collector = message.channel.createMessageCollector({
      filter: (m) => m.content === '!stop',
      max: 1,
      time: 60000, // Recording will stop after 60 seconds of inactivity
    });

    receiver.speaking.on('start', (userId) => {
      const user = client.users.cache.get(userId)?.username ?? userId;
      console.log(`User ${user} started speaking`);
      const opusStream = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 300,
        },
      });
      const audioBuffers: Buffer[] = [];
      opusStream
        .pipe(
          new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 }),
        )
        .on('data', (chunk) => {
          audioBuffers.push(chunk);
        })
        .on('end', async () => {
          const resultBuffer = Buffer.concat(audioBuffers);
          try {
            const voiceDuration = resultBuffer.length / 48_000 / 2;
            if (voiceDuration < 1) return; // Ignore environment noises
            const witResponse = await witClient.speech(
              'audio/raw;endian=little;encoding=signed-integer;rate=48k;bits=16',
              Readable.from(convertStereoToMono(resultBuffer)),
            );
            console.log(
              `${user}: ${witResponse.text}`,
              witResponse,
              witResponse?.speech?.tokens,
            );
            if (witResponse.text)
              message.reply(`<@${userId}> : ${witResponse.text}`);
          } catch (error) {
            console.error(error);
          }
        });
    });

    collector.on('end', () => {
      connection.destroy();
      message.reply('Recording stopped!');
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
