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

const TIKTOK_URL_REGEX = /^https?:\/\/(www|vm|m|vt)\.tiktok\.com\/[\w\-/.]+$/;

function getValidTikTokLink(msg) {
  for (const element of msg.split(' ')) {
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
      validateStatus: function (status) {
        return status < 400;
      }
    });

    if (response.headers['content-type'].indexOf('video') === -1) {
      throw new Error("The link provided does not lead to a video. Please provide a valid TikTok video URL.");
    }

    return response;
  } catch (err) {
    const timestamp = new Date().toISOString();
    
    if (err.response) {
      console.error(`[${timestamp}] Error: Failed to download video from ${url}`);
      console.error(`Status Code: ${err.response.status}`);
      console.error(`Response Data: ${err.response.data}`);
      
      if (err.response.status === 403) {
        throw new Error("This video is restricted and cannot be downloaded. It might be private or blocked in your region.");
      } else if (err.response.status === 404) {
        throw new Error("The video could not be found. Please check the URL and try again.");
      }
    } else {
      console.error(`[${timestamp}] Error: Network or unexpected error while accessing ${url}`);
      console.error(`Error Message: ${err.message}`);
    }
    throw new Error("Failed to download the video. This could be due to an unsupported URL or a network issue.");
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // Check for specific channel ID if needed
    const allowedChannelId = '790218273500168245'; // User-specified channel ID
    if (message.channel.id !== allowedChannelId) return;

    const tiktokURL = getValidTikTokLink(message.content);
    if (!tiktokURL) {
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(':warning: Invalid Link')
          .setColor('#ffcc00')
          .setDescription(
            "Couldn't find a valid TikTok link in your message. Please ensure your link matches one of the following formats:\n" +
            "**Supported formats:**\n" +
            "- `https://www.tiktok.com/`\n" +
            "- `https://vm.tiktok.com/`\n" +
            "- `https://m.tiktok.com/v/`\n" +
            "- `https://vt.tiktok.com/`\n\n" +
            "Make sure the link is public and accessible."
          )]
      });
      return;
    }

    const canSendMessages = message.channel.type === 'dm' ||
      message.channel.permissionsFor(message.client.user).has('SEND_MESSAGES');

    if (!canSendMessages) return;

    let statusMessage;
    statusMessage = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Video Status')
        .setDescription('Downloading the video, please wait...')
        .setColor('#00bfff')
      ]
    });

    try {
      const videoData = await downloadTikTokVideo(tiktokURL);
      const videoDir = path.join(__dirname, '..', 'videos');
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir);
      }
      const videoPath = path.join(videoDir, `${Date.now()}.mp4`);
      const writer = fs.createWriteStream(videoPath);

      videoData.data.pipe(writer);

      writer.on('finish', async () => {
        const requester = {
          avatarURL: message.author.displayAvatarURL(),
          name: message.author.tag
        };

        const responseEmbed = new EmbedBuilder()
          .setTitle('Here is your TikTok video')
          .setDescription(`Requested by: ${requester.name}`)
          .setThumbnail(requester.avatarURL)
          .setColor('#00bfff')
          .addFields(
            { name: 'Original Link', value: tiktokURL, inline: false }
          )
          .setTimestamp();

        await message.channel.send({
          embeds: [responseEmbed],
          files: [{ attachment: videoPath, name: `tiktok_video.mp4` }]
        }).catch(err => {
          console.error(`Error sending video: ${err}`);
        });

        if (statusMessage.deletable) statusMessage.delete();

        fs.unlink(videoPath, (err) => {
          if (err) console.error(`Error deleting video file: ${err}`);
        });
      });

      writer.on('error', (err) => {
        console.error(`Error writing video file: ${err}`);
        if (statusMessage.deletable) statusMessage.delete();
        message.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle(':rotating_light: Error')
            .setColor('#ff0000')
            .setDescription("Couldn't download the video. Please check if the video is public.")
          ]
        });
      });

    } catch (err) {
      console.error(`Error downloading video: ${err}`);
      if (statusMessage.deletable) statusMessage.delete();
      message.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(':rotating_light: Error')
          .setColor('#ff0000')
          .setDescription(err.message)
        ]
      });
    }
  },
};
