/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import 'dotenv/config';
import { Client, Guild, IntentsBitField } from 'discord.js';
import {
  joinVoiceChannel,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
} from '@discordjs/voice';
import prism from 'prism-media';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - node-wit's types are not up to date
import { Wit } from 'node-wit';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createReadStream } from 'node:fs';

for (const envVar of [
  'DISCORD_TOKEN',
  'WIT_AI_TOKEN',
  'GUILD_ID',
  'MAFIOU_ID',
  'FTEFANE_ID',
]) {
  if (!process.env[envVar]) throw new Error(`${envVar} is not defined`);
}

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

client.on('voiceStateUpdate', (oldMember, newMember) => {
  const mav = client.guilds.cache.get(process.env.GUILD_ID!);
  if (!mav) return;
  if (
    oldMember.id !== process.env.MAFIOU_ID ||
    newMember.id !== process.env.MAFIOU_ID
  )
    return;
  const newUserChannel = newMember.channelId;
  const oldUserChannel = oldMember.channelId;
  console.log(`new channel : ${newUserChannel}`);
  console.log(`old channel : ${oldUserChannel}`);

  if (newUserChannel == null) {
    console.log('déco');
    const connection = getVoiceConnection(oldMember.guild.id);
    if (!connection) return;
    connection.disconnect();
    connection.destroy();
  }

  if (newUserChannel && newUserChannel != '') {
    const connection = joinVoiceChannel({
      channelId: newUserChannel,
      guildId: newMember.guild.id,
      adapterCreator: newMember.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    const content = createAudioResource(
      createReadStream(path.resolve(__dirname + '/../sounds/content.mp3')),
    );

    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(content);

    const receiver = connection.receiver;

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

            const mafiou = await mav.members.fetch(process.env.MAFIOU_ID!);
            const ftefane = await mav.members.fetch(process.env.FTEFANE_ID!);
            // Actions associées à chaque phrase
            interface Actions {
              [key: string]: (guild: Guild) => Promise<void>;
            }

            const aboie = createAudioResource(
              createReadStream(
                path.resolve(__dirname + '/../sounds/aboie.mp3'),
              ),
            );

            const actions: Actions = {
              // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
              'ferme ta gueule mafiou': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'ferme ta gueule matthew': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'ferme ta gueule mafieux': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'ferme ta gueule ma fille': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'eh mafiou ferme ta gueule': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'eh matthew ferme ta gueule': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'eh mafieux ferme ta gueule': async (guild: Guild) => {
                mafiou.voice.disconnect();
              },
              'ferme ta gueule stéphane': async (guild: Guild) => {
                ftefane.voice.disconnect();
              },
              "ferme ta gueule t'es fan": async (guild: Guild) => {
                ftefane.voice.disconnect();
              },
              'ferme ta gueule téphane': async (guild: Guild) => {
                ftefane.voice.disconnect();
              },
              'aboie matthew': async (guild: Guild) => {
                const player = createAudioPlayer();
                connection.subscribe(player);
                player.play(aboie);
              },
              aboie: async (guild: Guild) => {
                const player = createAudioPlayer();
                connection.subscribe(player);
                player.play(aboie);
              },
              'aboie mafieux': async (guild: Guild) => {
                const player = createAudioPlayer();
                connection.subscribe(player);
                player.play(aboie);
              },
              'aboa mafiou': async (guild: Guild) => {
                console.log('oe');
                const player = createAudioPlayer();
                connection.subscribe(player);
                player.play(aboie);
              },
            };

            // Code principal
            if (witResponse.text) {
              for (const searchText of Object.keys(actions)) {
                if (
                  isSimilarText(witResponse.text.toLowerCase(), searchText, 3)
                ) {
                  const action = actions[searchText];
                  await action(mav); // Passer la variable appropriée en fonction de l'action
                }
              }
              // message.reply(`${user} : ${witResponse.text}`);
            }
          } catch (error) {
            console.error(error);
          }
        });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function removePunctuation(str: string) {
  // eslint-disable-next-line no-useless-escape
  return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '');
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function isSimilarText(str1: string, str2: string, tolerance: number) {
  const cleanStr1 = removePunctuation(str1);
  const cleanStr2 = removePunctuation(str2);

  const len1 = cleanStr1.length;
  const len2 = cleanStr2.length;

  if (Math.abs(len1 - len2) > tolerance) {
    return false; // Les longueurs diffèrent de plus que la tolérance
  }

  let differences = 0;

  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (cleanStr1[i].toLowerCase() !== cleanStr2[i].toLowerCase()) {
      differences++;

      if (differences > tolerance) {
        return false; // Nombre de différences dépassé la tolérance
      }
    }
  }

  return true;
}
