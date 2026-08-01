const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { execFile } = require("child_process");
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
      embeds: [new EmbedBuilder()
        .setTitle('Video Status')
        .setDescription('Scraping video info...')
        .setColor('#00bfff')
      ]
    });

    try {
      // 1. Get metadata (title, uploader, likes)
      const { stdout } = await execFilePromise(
        path.join(__dirname, '..', 'yt-dlp'),
        ['--dump-json', '--no-playlist', tiktokURL],
        { timeout: 30000 }
      );
      const info = JSON.parse(stdout);

      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('Video Status')
          .setDescription('Downloading video...')
          .setColor('#00bfff')
        ]
      });

      // 2. Download the video directly with yt-dlp (handles all headers, no 403)
      const videoDir = path.join(__dirname, '..', 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      const videoPath = path.join(videoDir, `${Date.now()}.mp4`);

      await execFilePromise(
        path.join(__dirname, '..', 'yt-dlp'),
        ['-o', videoPath, '--no-playlist', '--format', 'best', tiktokURL],
        { timeout: 60000 }
      );

      // 3. Build the embed
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

      // 4. Send the video
      await message.channel.send({
        embeds: [responseEmbed],
        files: [{ attachment: videoPath, name: 'tiktok_video.mp4' }]
      });

      // Cleanup
      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(videoPath, (err) => { if (err) console.error(err); });

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
