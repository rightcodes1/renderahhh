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

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;   // 25 MB

// ====== ffmpeg helper – makes any video Discord‑compatible ======
async function makeDiscordSafe(inputPath, outputPath, crf = 22) {
  const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
  const args = [
    '-y', '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-crf', `${crf}`,               // lower = better quality, larger file
    '-preset', 'ultrafast',         // fast enough for free‑tier Render
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-vsync', 'cfr',
    '-r', '30'
  ];
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
      const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');

      // 1. Get metadata (title, uploader, views, etc.)
      const { stdout } = await execFilePromise(
        ytdlpPath,
        ['--dump-json', '--no-playlist', tiktokURL],
        { timeout: 30000 }
      );
      const info = JSON.parse(stdout);

      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Downloading with yt‑dlp...')
          .setColor('#ff66b2')
        ]
      });

      // 2. Use yt‑dlp to download the best video+audio merged file directly
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      const rawPath = path.join(videoDir, `${Date.now()}_raw.mp4`);

      // Format string: prefer a single MP4 with H.264 + AAC, then merge streams, then any MP4
      const format = 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best';
      await execFilePromise(
        ytdlpPath,
        [
          '-o', rawPath,
          '--no-playlist',
          '--format', format,
          '--merge-output-format', 'mp4',
          '--ffmpeg-location', ffmpegPath,
          tiktokURL
        ],
        { timeout: 90000 }
      );

      // 3. Re‑encode to be 100% Discord‑safe (always)
      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Making Discord‑compatible...')
          .setColor('#ff66b2')
        ]
      });

      let safePath = path.join(videoDir, `${Date.now()}_safe.mp4`);
      await makeDiscordSafe(rawPath, safePath, 22);   // good quality
      fs.unlinkSync(rawPath);   // we no longer need the raw file

      // 4. If the safe video is still > 25 MB, compress it further
      let stats = fs.statSync(safePath);

      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle('⏳ Video Status')
            .setDescription('Compressing to fit 25 MB limit...')
            .setColor('#ff66b2')
          ]
        });

        const compressedPath = path.join(videoDir, `${Date.now()}_compressed.mp4`);
        // Use a higher CRF (lower quality) and optionally downscale
        const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');
        // Try a two‑pass approach: first, just compress harder; if that fails, downscale to 720p
        await execFilePromise(ffmpegPath, [
          '-y', '-i', safePath,
          '-c:v', 'libx264',
          '-profile:v', 'main',
          '-level', '4.0',
          '-pix_fmt', 'yuv420p',
          '-crf', '28',                // more aggressive compression
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-vsync', 'cfr',
          '-r', '30',
          compressedPath
        ], { timeout: 120000 });

        stats = fs.statSync(compressedPath);
        if (stats.size > DISCORD_MAX_SIZE) {
          // Downscale to 720p and compress again
          await statusMessage.edit({
            embeds: [new EmbedBuilder()
              .setTitle('⏳ Video Status')
              .setDescription('Downscaling to 720p...')
              .setColor('#ff66b2')
            ]
          });
          fs.unlinkSync(compressedPath);
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          await execFilePromise(ffmpegPath, [
            '-y', '-i', safePath,
            '-c:v', 'libx264',
            '-profile:v', 'main',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=-2:720',
            '-crf', '28',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-vsync', 'cfr',
            '-r', '30',
            downscaledPath
          ], { timeout: 120000 });
          fs.unlinkSync(safePath);
          safePath = downscaledPath;
          stats = fs.statSync(safePath);

          if (stats.size > DISCORD_MAX_SIZE) {
            throw new Error('Even 720p version is too large for Discord (25 MB).');
          }
        } else {
          // Compressed version fits, replace
          fs.unlinkSync(safePath);
          safePath = compressedPath;
        }
      }

      const fileSize = formatBytes(stats.size);

      // 5. Build embed (like your YouTube bot’s postDownloadActions)
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

      // 6. Send the final video
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
