const { Events, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const STARTERS = [
  'https://vm.tiktok.com/', 'http://vm.tiktok.com/',
  'https://www.tiktok.com/', 'http://www.tiktok.com/',
  'https://m.tiktok.com/v/', 'http://m.tiktok.com/v/',
  'https://vt.tiktok.com/', 'http://vt.tiktok.com/'
];

// Updated Regex to support @, dots, and query parameters
const TIKTOK_URL_REGEX = /^https?:\/\/(www|vm|m|vt )\.tiktok\.com\/[^\s]+$/;

function getValidTikTokLink(msg) {
  for (const element of msg.split(/\s+/)) {
    if (STARTERS.some(starter => element.startsWith(starter)) && TIKTOK_URL_REGEX.test(element)) {
      return element;
    }
  }
  return undefined;
}

async function downloadTikTokVideo(url) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      validateStatus: function (status) {
        return status < 400;
      }
    });

    if (!response.headers['content-type'] || response.headers['content-type'].indexOf('video') === -1) {
      throw new Error("The link provided does not lead directly to a video file. If this is a standard TikTok page link, the bot might need a scraper to extract the video source.");
    }

    return response;
  } catch (err) {
    const timestamp = new Date().toISOString();
    if (err.response) {
      console.error(`[${timestamp}] Error: Failed to download video from ${url}`);
      if (err.response.status === 403) {
        throw new Error("This video is restricted or the request was blocked. Try using a direct video URL.");
      }
    }
    throw new Error(err.message || "Failed to download the video.");
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // Channel restriction
    const allowedChannelId = '790218273500168245'; 
    if (message.channel.id !== allowedChannelId) return;

    const tiktokURL = getValidTikTokLink(message.content);
    if (!tiktokURL) return; // Silent return if no link found to avoid spamming

    const canSendMessages = message.channel.type === 'dm' ||
      message.channel.permissionsFor(message.client.user).has('SEND_MESSAGES');

    if (!canSendMessages) return;

    let statusMessage = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Video Status')
        .setDescription('Processing TikTok link...')
        .setColor('#00bfff')
      ]
    });

    try {
      const videoData = await downloadTikTokVideo(tiktokURL);
      const videoDir = path.join(__dirname, '..', 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      
      const videoPath = path.join(videoDir, `${Date.now()}.mp4`);
      const writer = fs.createWriteStream(videoPath);

      videoData.data.pipe(writer);

      writer.on('finish', async () => {
        const responseEmbed = new EmbedBuilder()
          .setTitle('TikTok Video Ready')
          .setDescription(`Requested by: ${message.author.tag}`)
          .setColor('#00bfff')
          .setTimestamp();

        await message.channel.send({
          embeds: [responseEmbed],
          files: [{ attachment: videoPath, name: `tiktok_video.mp4` }]
        });

        if (statusMessage.deletable) statusMessage.delete();
        fs.unlink(videoPath, (err) => { if (err) console.error(err); });
      });

      writer.on('error', (err) => {
        throw err;
      });

    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (statusMessage.deletable) {
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle(':rotating_light: Error')
            .setColor('#ff0000')
            .setDescription(err.message)
          ]
        });
      }
    }
  },
};
