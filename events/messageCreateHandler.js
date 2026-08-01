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

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;  // 25 MB

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

    // Delete the original message (if possible)
    try { if (message.deletable) await message.delete(); } catch (e) {}

    let statusMessage = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('⏳ Video Status')
        .setDescription('Scraping video info...')
        .setColor('#ff66b2')
      ]
    });

    try {
      const projectRoot = path.join(__dirname, '..');
      const ytdlpPath = path.join(projectRoot, 'yt-dlp');
      const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');   // only for merging, if needed

      // 1. Get video metadata
      const { stdout } = await execFilePromise(
        ytdlpPath,
        ['--dump-json', '--no-playlist', tiktokURL],
        { timeout: 30000 }
      );
      const info = JSON.parse(stdout);

      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Downloading video...')
          .setColor('#ff66b2')
        ]
      });

      // 2. Prepare to download – use a Discord‑safe format
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      let videoPath = path.join(videoDir, `${Date.now()}.mp4`);

      // Format: prefer a single MP4 with H.264 video + AAC audio, then merge separate streams, then any MP4
      const FORMAT_SAFE = [
        'best[ext=mp4][vcodec^=avc1][acodec=aac]',                      // single file, perfect
        'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]',           // merge best parts
        'best[ext=mp4]',                                                 // any single mp4
        'best'                                                           // last resort
      ].join('/');

      await execFilePromise(
        ytdlpPath,
        [
          '-o', videoPath,
          '--no-playlist',
          '--format', FORMAT_SAFE,
          '--merge-output-format', 'mp4',
          '--ffmpeg-location', ffmpegPath,
          tiktokURL
        ],
        { timeout: 90000 }
      );

      // 3. Check file size and fallback to 720p if necessary
      let stats = fs.statSync(videoPath);

      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle('⏳ Video Status')
            .setDescription('File too large, downloading 720p version...')
            .setColor('#ff66b2')
          ]
        });

        // Delete the oversized file
        fs.unlinkSync(videoPath);
        videoPath = path.join(videoDir, `${Date.now()}_720p.mp4`);

        const FORMAT_720P_SAFE = [
          'bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]',
          'best[height<=720][ext=mp4][vcodec^=avc1]',
          'best[height<=720][ext=mp4]',
          'best[height<=720]'
        ].join('/');

        await execFilePromise(
          ytdlpPath,
          [
            '-o', videoPath,
            '--no-playlist',
            '--format', FORMAT_720P_SAFE,
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            tiktokURL
          ],
          { timeout: 60000 }
        );

        stats = fs.statSync(videoPath);
        if (stats.size > DISCORD_MAX_SIZE) {
          throw new Error(`Even 720p version is too large (${formatBytes(stats.size)}). Discord limit is 25 MB.`);
        }
      }

      const fileSize = formatBytes(stats.size);

      // 4. Prepare the embed (truncate description to 4096 characters)
      let description = info.description || info.title || 'No description';
      if (description.length > 4096) description = description.slice(0, 4093) + '...';

      const responseEmbed = new EmbedBuilder()
        .setTitle('🎵 TikTok Video Downloaded')
        .setURL(tiktokURL)                        // clickable title
        .setDescription(description)
        .addFields(
          { name: '👤 Creator', value: info.uploader || 'Unknown', inline: true },
          { name: '📁 File Size', value: fileSize, inline: true },
          { name: '👀 Views', value: (info.view_count || 0).toLocaleString(), inline: true },
          { name: '❤️ Likes', value: (info.like_count || 0).toLocaleString(), inline: true }
        )
        .setColor('#ff66b2')
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

      // 5. Send the video
      await message.channel.send({
        embeds: [responseEmbed],
        files: [{ attachment: videoPath, name: 'tiktok_video.mp4' }]
      });

      // Cleanup
      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(videoPath, () => {});

    } catch (err) {
      // Ensure the error message never exceeds Discord embed limits
      console.error(err);
      let errorMsg = err.message || 'Unknown error';
      if (errorMsg.length > 4000) errorMsg = errorMsg.slice(0, 4000) + '...';

      if (statusMessage.deletable) {
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle(':rotating_light: Error')
            .setColor('#ff0000')
            .setDescription(errorMsg)
          ]
        });
      }
    }
  },
};
