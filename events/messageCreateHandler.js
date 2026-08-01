const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { execFile, execSync } = require("child_process");
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

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;
const TARGET_SIZE = 24 * 1024 * 1024;

// ====== FFMPEG HELPERS ======
const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
const ffprobePath = path.join(__dirname, '..', 'bin', 'ffprobe');

// Check if file has a video stream
function hasVideoStream(filePath) {
  try {
    const probe = execSync(
      `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    ).toString().trim();
    return probe === 'video';
  } catch (e) {
    return false;
  }
}

/**
 * Re‑encode video to be 100% Discord‑compatible.
 * Keeps quality high (CRF 18) and ensures correct profile/level/pix_fmt.
 */
async function makeDiscordCompatible(inputPath, outputPath) {
  const args = [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',              // near‑lossless quality
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-vsync', 'cfr',           // force constant frame rate
    outputPath
  ];
  await execFilePromise(ffmpegPath, args, { timeout: 120000 });
}

/**
 * Compress video to fit a target file size (in bytes).
 * Already uses Discord‑safe settings.
 */
async function compressVideo(inputPath, outputPath, targetBytes, durationSec, scale = null) {
  const audioBitrateK = 128;
  const targetTotalBitrateK = (targetBytes * 8) / durationSec / 1000;
  let videoBitrateK = targetTotalBitrateK - audioBitrateK;
  if (videoBitrateK < 50) videoBitrateK = 50;

  const args = [
    '-y', '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-b:v', `${Math.floor(videoBitrateK)}k`,
    '-maxrate', `${Math.floor(videoBitrateK * 1.2)}k`,
    '-bufsize', `${Math.floor(videoBitrateK * 2)}k`,
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    '-movflags', '+faststart',
    '-vsync', 'cfr'
  ];
  if (scale) args.push('-vf', `scale=${scale}`);
  args.push(outputPath);
  await execFilePromise(ffmpegPath, args, { timeout: 120000 });
}

// ====== MAIN EVENT ======
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

    // Delete original message
    try { if (message.deletable) await message.delete(); } catch (e) {}

    let statusMessage = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('⏳ Video Status')
        .setDescription('Scraping video info...')
        .setColor('#ff66b2')]
    });

    try {
      const projectRoot = path.join(__dirname, '..');
      const ytdlpPath = path.join(projectRoot, 'yt-dlp');

      // 1. Metadata
      const { stdout } = await execFilePromise(ytdlpPath, ['--dump-json', '--no-playlist', tiktokURL], { timeout: 30000 });
      const info = JSON.parse(stdout);

      await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading best quality...').setColor('#ff66b2')] });

      // 2. Download best quality (merged)
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      const rawPath = path.join(videoDir, `${Date.now()}_raw.mp4`);
      const compatiblePath = path.join(videoDir, `${Date.now()}_compatible.mp4`);

      await execFilePromise(ytdlpPath, [
        '-o', rawPath,
        '--no-playlist',
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegPath,
        tiktokURL
      ], { timeout: 90000 });

      // Validate raw file has video
      if (!hasVideoStream(rawPath)) {
        fs.unlinkSync(rawPath);
        throw new Error('Downloaded file lacks video. Link may be audio‑only.');
      }

      await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Making Discord‑compatible...').setColor('#ff66b2')] });

      // 3. Always re‑encode for Discord compatibility (CRF 18)
      await makeDiscordCompatible(rawPath, compatiblePath);
      fs.unlinkSync(rawPath);  // we only need the compatible version

      let finalPath = compatiblePath;
      let stats = fs.statSync(finalPath);

      // 4. If still too large, compress further (target size)
      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Compressing to fit Discord limits...').setColor('#ff66b2')] });

        const compressedPath = path.join(videoDir, `${Date.now()}_compressed.mp4`);
        const duration = info.duration;

        if (duration && duration > 0) {
          // Try smart bitrate compression (no scaling)
          await compressVideo(finalPath, compressedPath, TARGET_SIZE, duration);
          stats = fs.statSync(compressedPath);
        }

        // If still too large, try downscale to 720p
        if (duration && stats.size > DISCORD_MAX_SIZE) {
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          await compressVideo(finalPath, downscaledPath, TARGET_SIZE, duration, '-2:720');
          if (fs.statSync(downscaledPath).size <= DISCORD_MAX_SIZE) {
            fs.unlinkSync(compressedPath);
            fs.renameSync(downscaledPath, compressedPath);
            stats = fs.statSync(compressedPath);
          } else {
            fs.unlinkSync(downscaledPath);
          }
        }

        // Adopt compressed version if it fits
        if (fs.existsSync(compressedPath) && stats.size <= DISCORD_MAX_SIZE) {
          fs.unlinkSync(finalPath);
          finalPath = compressedPath;
        } else {
          // Failed to compress enough – last resort: download 720p from TikTok
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          fs.unlinkSync(finalPath);
          const smallPath = path.join(videoDir, `${Date.now()}_small.mp4`);
          await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading smaller version...').setColor('#ff66b2')] });
          await execFilePromise(ytdlpPath, [
            '-o', smallPath,
            '--no-playlist',
            '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            tiktokURL
          ], { timeout: 60000 });
          // Still make it compatible (in case the smaller download also has weird codecs)
          const finalSmallCompatible = path.join(videoDir, `${Date.now()}_small_compatible.mp4`);
          await makeDiscordCompatible(smallPath, finalSmallCompatible);
          fs.unlinkSync(smallPath);
          finalPath = finalSmallCompatible;
          stats = fs.statSync(finalPath);
        }
      }

      // Final guard
      stats = fs.statSync(finalPath);
      if (stats.size > DISCORD_MAX_SIZE) {
        throw new Error(`Video too large (${formatBytes(stats.size)}) after all optimisations.`);
      }

      // 5. Embed
      const fileSize = formatBytes(stats.size);
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

      await message.channel.send({
        embeds: [responseEmbed],
        files: [{ attachment: finalPath, name: 'tiktok_video.mp4' }]
      });

      // Cleanup
      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(finalPath, () => {});

    } catch (err) {
      console.error(err);
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
  }
};
