const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { execFile } = require("child_process");
const axios = require("axios");
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

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;   // 25 MB

// ====== ffmpeg helper (same idea as your compressVideo) ======
async function makeDiscordSafe(inputPath, outputPath, targetSize = false) {
  const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
  const args = [
    '-y', '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',      // fast, good enough
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-vsync', 'cfr',
    '-r', '30'                   // force 30 fps – safe for Discord
  ];

  if (targetSize) {
    // Size‑targeted compression (like your YouTube bot)
    args.push('-crf', '26');     // slightly more compression
  } else {
    args.push('-crf', '22');     // still great quality, small size
  }

  args.push(outputPath);
  await execFilePromise(ffmpegPath, args, { timeout: 120000 });
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

    // Delete original user message
    try { if (message.deletable) await message.delete(); } catch (e) {}

    let statusMessage = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('⏳ Video Status')
        .setDescription('Fetching video information...')
        .setColor('#ff66b2')
      ]
    });

    try {
      const projectRoot = path.join(__dirname, '..');
      const ytdlpPath = path.join(projectRoot, 'yt-dlp');

      // 1. Get metadata (title, uploader, etc.) via --dump-json
      const { stdout } = await execFilePromise(
        ytdlpPath,
        ['--dump-json', '--no-playlist', tiktokURL],
        { timeout: 30000 }
      );
      const info = JSON.parse(stdout);

      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Downloading raw video...')
          .setColor('#ff66b2')
        ]
      });

      // 2. Get the direct video URL (no watermark, pre-muxed)
      const { stdout: urlStdout } = await execFilePromise(
        ytdlpPath,
        [
          '--print', 'url',
          '--no-playlist',
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          tiktokURL
        ],
        { timeout: 15000 }
      );
      const directURL = urlStdout.trim();

      // 3. Download the raw file
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      const rawPath = path.join(videoDir, `${Date.now()}_raw.mp4`);

      const response = await axios({
        url: directURL,
        method: 'GET',
        responseType: 'stream',
        headers: {
          'Referer': 'https://www.tiktok.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const writer = fs.createWriteStream(rawPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 4. Always convert to a Discord‑safe video (like your YouTube bot’s compressVideo)
      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Processing video for Discord...')
          .setColor('#ff66b2')
        ]
      });

      let safePath = path.join(videoDir, `${Date.now()}_safe.mp4`);
      await makeDiscordSafe(rawPath, safePath, false);
      fs.unlinkSync(rawPath);  // remove raw file

      // 5. Check size – if still too large, compress further (target size)
      let stats = fs.statSync(safePath);
      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle('⏳ Video Status')
            .setDescription('Compressing to fit 25 MB limit...')
            .setColor('#ff66b2')
          ]
        });

        const finalPath = path.join(videoDir, `${Date.now()}_final.mp4`);
        await makeDiscordSafe(safePath, finalPath, true);
        fs.unlinkSync(safePath);
        safePath = finalPath;
        stats = fs.statSync(safePath);

        if (stats.size > DISCORD_MAX_SIZE) {
          // Last resort: downscale to 720p manually using ffmpeg
          await statusMessage.edit({
            embeds: [new EmbedBuilder()
              .setTitle('⏳ Video Status')
              .setDescription('Still too large, downscaling to 720p...')
              .setColor('#ff66b2')
            ]
          });
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');
          await execFilePromise(ffmpegPath, [
            '-y', '-i', safePath,
            '-c:v', 'libx264',
            '-profile:v', 'main',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=-2:720',
            '-preset', 'ultrafast',
            '-crf', '26',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-vsync', 'cfr',
            '-r', '30',
            downscaledPath
          ], { timeout: 90000 });
          fs.unlinkSync(safePath);
          safePath = downscaledPath;
          stats = fs.statSync(safePath);

          if (stats.size > DISCORD_MAX_SIZE) {
            throw new Error('Even 720p version is too large. Discord limit is 25 MB.');
          }
        }
      }

      const fileSize = formatBytes(stats.size);

      // 6. Build embed (just like your YouTube bot’s postDownloadActions)
      let description = info.description || info.title || 'No description';
      if (description.length > 4096) description = description.slice(0, 4093) + '...';

      const responseEmbed = new EmbedBuilder()
        .setTitle('🎵 TikTok Video Downloaded')
        .setURL(tiktokURL)
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

      // 7. Send the final video
      await message.channel.send({
        embeds: [responseEmbed],
        files: [{ attachment: safePath, name: 'tiktok_video.mp4' }]
      });

      // Cleanup
      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(safePath, () => {});

    } catch (err) {
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
