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

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;      // 25 MB
const TARGET_SIZE = 24 * 1024 * 1024;           // aim for 24 MB to stay safe

// -------------------- ffmpeg compression logic --------------------
async function compressVideo(inputPath, outputPath, targetBytes, durationSec, scale = null) {
  const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
  const audioBitrateK = 128; // 128 kbps audio
  const targetTotalBitrateK = (targetBytes * 8) / durationSec / 1000; // kbps
  let videoBitrateK = targetTotalBitrateK - audioBitrateK;
  // Safety – video bitrate shouldn’t go below 50 kbps
  if (videoBitrateK < 50) videoBitrateK = 50;

  const args = [
    '-y',                                 // overwrite output
    '-i', inputPath,
    '-c:v', 'libx264',
    '-b:v', `${Math.floor(videoBitrateK)}k`,
    '-maxrate', `${Math.floor(videoBitrateK * 1.2)}k`,
    '-bufsize', `${Math.floor(videoBitrateK * 2)}k`,
    '-preset', 'fast',                    // faster encoding, still decent compression
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    '-movflags', '+faststart'             // optimise for streaming
  ];

  // Apply scaling if requested (e.g., scale to 720p)
  if (scale) {
    args.push('-vf', `scale=${scale}`);
  }

  args.push(outputPath);

  await execFilePromise(ffmpegPath, args, { timeout: 120000 }); // 2 min max
}
// ------------------------------------------------------------------

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

    // Delete the original user message
    try {
      if (message.deletable) await message.delete();
    } catch (err) {
      console.warn('Could not delete original message:', err.message);
    }

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
      const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');

      // 1. Get metadata (we need duration for bitrate calculation)
      const { stdout } = await execFilePromise(
        ytdlpPath,
        ['--dump-json', '--no-playlist', tiktokURL],
        { timeout: 30000 }
      );
      const info = JSON.parse(stdout);

      await statusMessage.edit({
        embeds: [new EmbedBuilder()
          .setTitle('⏳ Video Status')
          .setDescription('Downloading best quality...')
          .setColor('#ff66b2')
        ]
      });

      // 2. Download best quality (video+audio merged)
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      let videoPath = path.join(videoDir, `${Date.now()}.mp4`);

      await execFilePromise(
        ytdlpPath,
        [
          '-o', videoPath,
          '--no-playlist',
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4',
          '--ffmpeg-location', ffmpegPath,
          tiktokURL
        ],
        { timeout: 90000 }
      );

      // 3. Check file size – compress if needed
      let stats = fs.statSync(videoPath);

      if (stats.size > DISCORD_MAX_SIZE) {
        // Need compression
        await statusMessage.edit({
          embeds: [new EmbedBuilder()
            .setTitle('⏳ Video Status')
            .setDescription('Compressing video... (may take a few moments)')
            .setColor('#ff66b2')
          ]
        });

        const duration = info.duration; // seconds
        const compressedPath = path.join(videoDir, `${Date.now()}_compressed.mp4`);

        try {
          if (duration && duration > 0) {
            // First attempt: smart bitrate compression without downscaling
            await compressVideo(videoPath, compressedPath, TARGET_SIZE, duration);
            stats = fs.statSync(compressedPath);
          } else {
            throw new Error('No duration info, cannot calculate bitrate');
          }
        } catch (compressErr) {
          console.warn('Compression failed or file still too large:', compressErr.message);
          // Clean up partial compressed file if exists
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          // We'll try a lower quality download later
        }

        // If after compression the file is still over the limit, try downscaling to 720p
        if (fs.existsSync(compressedPath) && stats.size > DISCORD_MAX_SIZE && duration) {
          console.log('Still too large, downscaling to 720p...');
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          try {
            await compressVideo(videoPath, downscaledPath, TARGET_SIZE, duration, '-2:720');
            stats = fs.statSync(downscaledPath);
            // Replace with downscaled version
            if (stats.size <= DISCORD_MAX_SIZE) {
              fs.unlinkSync(compressedPath);
              fs.renameSync(downscaledPath, compressedPath);
              stats = fs.statSync(compressedPath);
            } else {
              fs.unlinkSync(downscaledPath);
              throw new Error('Still too large after downscaling');
            }
          } catch (scaleErr) {
            console.warn('720p downscale failed:', scaleErr.message);
            if (fs.existsSync(downscaledPath)) fs.unlinkSync(downscaledPath);
          }
        }

        // If we have a valid compressed file that fits, use it
        if (fs.existsSync(compressedPath) && stats.size <= DISCORD_MAX_SIZE) {
          // Remove original large file
          fs.unlinkSync(videoPath);
          videoPath = compressedPath;
        } else {
          // Compression didn't work – fallback: download a lower quality version from yt-dlp
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          fs.unlinkSync(videoPath);
          videoPath = path.join(videoDir, `${Date.now()}_small.mp4`);

          await statusMessage.edit({
            embeds: [new EmbedBuilder()
              .setTitle('⏳ Video Status')
              .setDescription('Downloading smaller version (720p)...')
              .setColor('#ff66b2')
            ]
          });

          await execFilePromise(
            ytdlpPath,
            [
              '-o', videoPath,
              '--no-playlist',
              '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
              '--merge-output-format', 'mp4',
              '--ffmpeg-location', ffmpegPath,
              tiktokURL
            ],
            { timeout: 60000 }
          );

          stats = fs.statSync(videoPath);

          // If the 720p download is still too large, try one final compression
          if (stats.size > DISCORD_MAX_SIZE && info.duration) {
            const finalCompressed = path.join(videoDir, `${Date.now()}_final.mp4`);
            await compressVideo(videoPath, finalCompressed, TARGET_SIZE, info.duration, '-2:720');
            if (fs.existsSync(finalCompressed) && fs.statSync(finalCompressed).size <= DISCORD_MAX_SIZE) {
              fs.unlinkSync(videoPath);
              videoPath = finalCompressed;
              stats = fs.statSync(videoPath);
            }
          }
        }
      }

      // Final size check – if still too large, give clear error
      stats = fs.statSync(videoPath);
      if (stats.size > DISCORD_MAX_SIZE) {
        throw new Error(`Video is too large (${formatBytes(stats.size)}) and could not be compressed enough. Discord limit is 25 MB.`);
      }

      const fileSize = formatBytes(stats.size);

      // 4. Build embed description
      let description = info.description || info.title || 'No description';
      if (description.length > 4096) description = description.slice(0, 4093) + '...';

      // 5. Final embed
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

      // 6. Send the video
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
