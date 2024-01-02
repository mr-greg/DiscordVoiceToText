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
            if (witResponse.text) {
              const searchArray = [
                'ferme ta gueule mafiou',
                'ferme ta gueule matthew',
                'ferme ta gueule mafieux',
                'ferme ta gueule stéphane',
                "ferme ta gueule t'es fan",
                'ferme ta gueule téphane',
              ];
              for (const searchText of searchArray) {
                if (
                  isSimilarText(witResponse.text.toLowerCase(), searchText, 3)
                ) {
                  if (!mav) return;
                  const mafiou = await mav.members.fetch('278646068290256904');
                  // console.log(mafiou);
                  if (mafiou) {
                    console.log('trouvé mafiou');
                    console.log(mafiou.voice);

                    mafiou.voice.disconnect();
                  } else {
                    console.log('nope');
                  }
                  message.reply('Bêêê');
                }
              }
              message.reply(`${user} : ${witResponse.text}`);
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
