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

// Check if video stream exists
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

// Check if video is already Discord‑compatible (h264 main/baseline, yuv420p, aac audio)
function isDiscordCompatible(filePath) {
  try {
    const videoInfo = execSync(
      `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt -of csv=p=0 "${filePath}"`
    ).toString().trim().split(',');
    const audioInfo = execSync(
      `"${ffprobePath}" -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`
    ).toString().trim();

    if (videoInfo.length < 3) return false;
    const [vcodec, profile, pixFmt] = videoInfo;
    const acodec = audioInfo;

    // Discord demands h264 main or baseline, yuv420p, aac
    if (vcodec !== 'h264') return false;
    if (profile !== 'Main' && profile !== 'Baseline' && profile !== 'Constrained Baseline') return false;
    if (pixFmt !== 'yuv420p') return false;
    if (acodec !== 'aac') return false;

    return true;
  } catch (e) {
    return false;
  }
}

// Fast re‑encode to Discord‑safe format (uses ultrafast preset for speed)
async function makeDiscordCompatible(inputPath, outputPath) {
  const args = [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-crf', '20',                // slightly higher CRF for speed (still great quality)
    '-preset', 'ultrafast',      // 10x faster than 'fast'
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-vsync', 'cfr',
    outputPath
  ];
  await execFilePromise(ffmpegPath, args, { timeout: 60000 });
}

// Compression for file size target
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
    '-preset', 'ultrafast',      // faster
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    '-movflags', '+faststart',
    '-vsync', 'cfr'
  ];
  if (scale) args.push('-vf', `scale=${scale}`);
  args.push(outputPath);
  await execFilePromise(ffmpegPath, args, { timeout: 60000 });
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

      await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading...').setColor('#ff66b2')] });

      // 2. Download best quality
      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      const rawPath = path.join(videoDir, `${Date.now()}_raw.mp4`);

      await execFilePromise(ytdlpPath, [
        '-o', rawPath,
        '--no-playlist',
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegPath,
        tiktokURL
      ], { timeout: 90000 });

      if (!hasVideoStream(rawPath)) {
        fs.unlinkSync(rawPath);
        throw new Error('No video track in download.');
      }

      // 3. Decide if we need to re‑encode
      let currentPath = rawPath;

      if (!isDiscordCompatible(rawPath)) {
        await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Converting for Discord...').setColor('#ff66b2')] });
        const compatiblePath = path.join(videoDir, `${Date.now()}_compatible.mp4`);
        await makeDiscordCompatible(rawPath, compatiblePath);
        fs.unlinkSync(rawPath);
        currentPath = compatiblePath;
      }

      // 4. Check size & compress if needed
      let stats = fs.statSync(currentPath);

      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Compressing...').setColor('#ff66b2')] });
        const duration = info.duration;
        const compressedPath = path.join(videoDir, `${Date.now()}_compressed.mp4`);

        if (duration && duration > 0) {
          await compressVideo(currentPath, compressedPath, TARGET_SIZE, duration);
          stats = fs.statSync(compressedPath);
        }

        if (stats.size > DISCORD_MAX_SIZE && duration) {
          // try downscale
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          await compressVideo(currentPath, downscaledPath, TARGET_SIZE, duration, '-2:720');
          if (fs.statSync(downscaledPath).size <= DISCORD_MAX_SIZE) {
            fs.unlinkSync(compressedPath);
            fs.renameSync(downscaledPath, compressedPath);
            stats = fs.statSync(compressedPath);
          } else {
            fs.unlinkSync(downscaledPath);
          }
        }

        if (fs.existsSync(compressedPath) && stats.size <= DISCORD_MAX_SIZE) {
          fs.unlinkSync(currentPath);
          currentPath = compressedPath;
        } else {
          // fallback: download smaller version
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          fs.unlinkSync(currentPath);
          currentPath = path.join(videoDir, `${Date.now()}_small.mp4`);
          await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading smaller version...').setColor('#ff66b2')] });
          await execFilePromise(ytdlpPath, [
            '-o', currentPath,
            '--no-playlist',
            '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            tiktokURL
          ], { timeout: 60000 });
          // ensure compatibility
          if (!isDiscordCompatible(currentPath)) {
            const finalComp = path.join(videoDir, `${Date.now()}_final.mp4`);
            await makeDiscordCompatible(currentPath, finalComp);
            fs.unlinkSync(currentPath);
            currentPath = finalComp;
          }
          stats = fs.statSync(currentPath);
        }
      }

      // Final guard
      stats = fs.statSync(currentPath);
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
        files: [{ attachment: currentPath, name: 'tiktok_video.mp4' }]
      });

      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(currentPath, () => {});

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
