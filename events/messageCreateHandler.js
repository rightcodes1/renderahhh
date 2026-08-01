const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { execFile } = require("child_process");
const response = await axios({
  url: videoLink,
  method: 'GET',
  responseType: 'stream',
  headers: {
    'Referer': 'https://www.tiktok.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});
const fs = require("fs");
const path = require("path");
const util = require("util");
const execFilePromise = util.promisify(execFile);

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

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    const allowedChannelId = '790218273500168245';
    if (message.channel.id !== allowedChannelId) return;

    const tiktokURL = getValidTikTokLink(message.content);
    if (!tiktokURL) return;

    const canSendMessages =
      message.channel.type === ChannelType.DM ||
      message.channel.permissionsFor(message.client.user).has('SendMessages');
    if (!canSendMessages) return;

    let statusMessage = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Video Status')
          .setDescription('Scraping video link...')
          .setColor('#00bfff')
      ]
    });

    try {
      // 1. Use yt-dlp to get the video info (no‑watermark by default)
      const { stdout } = await execFilePromise(
        path.join(__dirname, '..', 'yt-dlp'),   // path to the binary
        [
          '--dump-json',          // output JSON metadata
          '--no-warnings',
          '--no-playlist',
          '--format', 'best',     // get best available (no watermark)
          tiktokURL
        ],
        { timeout: 30000 }        // 30 seconds timeout
      );

      const info = JSON.parse(stdout);
      const videoLink = info.requested_formats
        ? info.requested_formats[0].url   // sometimes split formats
        : info.url;
      
      if (!videoLink) throw new Error("Could not extract video URL.");

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
        const responseEmbed = new EmbedBuilder()
          .setTitle(info.title || 'TikTok Video Ready')
          .setURL(tiktokURL)
          .setDescription(`Requested by: ${message.author.tag}`)
          .addFields(
            { name: 'Author', value: info.uploader || 'Unknown', inline: true },
            { name: 'Likes', value: String(info.like_count || 'N/A'), inline: true }
          )
          .setColor('#00bfff')
          .setTimestamp();

        await message.channel.send({
          embeds: [responseEmbed],
          files: [{ attachment: videoPath, name: 'tiktok_video.mp4' }]
        });

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
