const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ===== Dynamic import helper for the ESM-only package =====
let downloadFn = null;
async function getDownloadFunction() {
  if (!downloadFn) {
    const mod = await import('tiktok-scraper-without-watermark');
    // musicallydown is one of the named exports (confirmed by your debug log)
    downloadFn = mod.musicallydown;
  }
  return downloadFn;
}

// ===== TikTok URL validation =====
const STARTERS = [
  'https://vm.tiktok.com/', 'http://vm.tiktok.com/',
  'https://www.tiktok.com/', 'http://www.tiktok.com/',
  'https://m.tiktok.com/v/', 'http://m.tiktok.com/v/',
  'https://vt.tiktok.com/', 'http://vt.tiktok.com/'
];

const TIKTOK_URL_REGEX = /^https?:\/\/(www|vm|m|vt)\.tiktok\.com\/[^\s]+$/;

function getValidTikTokLink(msg) {
  for (const element of msg.split(/\s+/)) {
    if (STARTERS.some(starter => element.startsWith(starter)) && TIKTOK_URL_REGEX.test(element)) {
      return element;
    }
  }
  return undefined;
}

// ===== Main event =====
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // Restrict to one channel
    const allowedChannelId = '790218273500168245';
    if (message.channel.id !== allowedChannelId) return;

    const tiktokURL = getValidTikTokLink(message.content);
    if (!tiktokURL) return;

    // Permission check
    const canSendMessages =
      message.channel.type === ChannelType.DM ||
      message.channel.permissionsFor(message.client.user).has('SendMessages');
    if (!canSendMessages) return;

    // Status message
    let statusMessage = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Video Status')
          .setDescription('Scraping video link...')
          .setColor('#00bfff')
      ]
    });

    try {
      // 1. Get the no-watermark video link using musicallydown
      const download = await getDownloadFunction();
      const result = await download(tiktokURL);

      // The result structure may vary – adjust if needed
      // For musicallydown, it typically has { video: { noWatermark: "..." } }
      if (!result || !result.video || !result.video.noWatermark) {
        throw new Error("Could not extract the video. It might be private or region-locked.");
      }

      const videoLink = result.video.noWatermark;

      await statusMessage.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle('Video Status')
            .setDescription('Downloading video...')
            .setColor('#00bfff')
        ]
      });

      // 2. Download the video file
      const response = await axios({
        url: videoLink,
        method: 'GET',
        responseType: 'stream'
      });

      const videoDir = path.join(__dirname, '..', 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

      const videoPath = path.join(videoDir, `${Date.now()}.mp4`);
      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);

      writer.on('finish', async () => {
        // 3. Build embed
        const responseEmbed = new EmbedBuilder()
          .setTitle(result.title || 'TikTok Video Ready')
          .setURL(tiktokURL)
          .setDescription(`Requested by: ${message.author.tag}`)
          .addFields(
            { name: 'Author', value: result.author?.unique_id || 'Unknown', inline: true },
            { name: 'Likes', value: String(result.stats?.diggCount || 'N/A'), inline: true }
          )
          .setColor('#00bfff')
          .setTimestamp();

        // 4. Send the video
        await message.channel.send({
          embeds: [responseEmbed],
          files: [{ attachment: videoPath, name: 'tiktok_video.mp4' }]
        });

        // Cleanup
        if (statusMessage.deletable) statusMessage.delete();
        fs.unlink(videoPath, (err) => { if (err) console.error(err); });
      });

    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (statusMessage.deletable) {
        await statusMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle(':rotating_light: Error')
              .setColor('#ff0000')
              .setDescription(err.message)
          ]
        });
      }
    }
  },
};
