/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import 'dotenv/config';
import { Client, Guild, IntentsBitField } from 'discord.js';
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
let mav: Guild | undefined;
client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  mav = client.guilds.cache.get('537073420207259668');
  if (!mav) return;
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
      time: 2147483647, // Recording will stop after 60 seconds of inactivity
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

            if (!mav) return;
            const mafiou = await mav.members.fetch('156432016714366976');
            const ftefane = await mav.members.fetch('207146898845335552');
            // Actions associées à chaque phrase
            interface Actions {
              [key: string]: (guild: Guild) => Promise<void>;
            }

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

    collector.on('end', () => {
      connection.destroy();
      message.reply('Recording stopped!');
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
