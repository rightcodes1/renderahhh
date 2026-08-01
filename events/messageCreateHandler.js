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

const DISCORD_MAX_SIZE = 25 * 1024 * 1024;      // 25 MB
const TARGET_SIZE = 24 * 1024 * 1024;           // 24 MB

// ====== CHECK IF FILE HAS A VIDEO STREAM ======
function hasVideoStream(filePath) {
  const ffprobePath = path.join(__dirname, '..', 'bin', 'ffprobe');
  try {
    const probe = execSync(
      `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    ).toString().trim();
    return probe === 'video';
  } catch (err) {
    console.warn('ffprobe check failed:', err.message);
    return false;
  }
}

// ====== FFMPEG COMPRESSION ======
async function compressVideo(inputPath, outputPath, targetBytes, durationSec, scale = null) {
  const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
  const audioBitrateK = 128;
  const targetTotalBitrateK = (targetBytes * 8) / durationSec / 1000;
  let videoBitrateK = targetTotalBitrateK - audioBitrateK;
  if (videoBitrateK < 50) videoBitrateK = 50;

  const args = [
    '-y', '-i', inputPath,
    '-c:v', 'libx264',
    '-b:v', `${Math.floor(videoBitrateK)}k`,
    '-maxrate', `${Math.floor(videoBitrateK * 1.2)}k`,
    '-bufsize', `${Math.floor(videoBitrateK * 2)}k`,
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    '-movflags', '+faststart'
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
      const ffmpegPath = path.join(projectRoot, 'bin', 'ffmpeg');

      // 1. Metadata
      const { stdout } = await execFilePromise(ytdlpPath, ['--dump-json', '--no-playlist', tiktokURL], { timeout: 30000 });
      const info = JSON.parse(stdout);

      // 2. Download best quality (video+audio)
      await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading best quality...').setColor('#ff66b2')] });

      const videoDir = path.join(projectRoot, 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);
      let videoPath = path.join(videoDir, `${Date.now()}.mp4`);

      // Download using the format that forces merging
      await execFilePromise(ytdlpPath, [
        '-o', videoPath,
        '--no-playlist',
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegPath,
        tiktokURL
      ], { timeout: 90000 });

      // ✅ VALIDATE VIDEO STREAM EXISTS
      if (!hasVideoStream(videoPath)) {
        console.warn('Downloaded file lacks video – retrying with combined format...');
        // Delete the broken file
        fs.unlinkSync(videoPath);
        videoPath = path.join(videoDir, `${Date.now()}_retry.mp4`);
        // Use a format that TikTok always provides as a single stream (contains both)
        await execFilePromise(ytdlpPath, [
          '-o', videoPath,
          '--no-playlist',
          '--format', 'mp4',               // forces a single mp4 container
          '--merge-output-format', 'mp4',
          '--ffmpeg-location', ffmpegPath,
          tiktokURL
        ], { timeout: 90000 });

        if (!hasVideoStream(videoPath)) {
          throw new Error('Downloaded video has no visual track. The TikTok link may be audio-only.');
        }
      }

      // 3. Size check & compression
      let stats = fs.statSync(videoPath);

      if (stats.size > DISCORD_MAX_SIZE) {
        await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Compressing video...').setColor('#ff66b2')] });
        const duration = info.duration;
        const compressedPath = path.join(videoDir, `${Date.now()}_compressed.mp4`);

        if (duration && duration > 0) {
          // First attempt: smart bitrate compression
          await compressVideo(videoPath, compressedPath, TARGET_SIZE, duration);
          stats = fs.statSync(compressedPath);
        }

        // If still too large, downscale to 720p
        if (duration && fs.existsSync(compressedPath) && stats.size > DISCORD_MAX_SIZE) {
          const downscaledPath = path.join(videoDir, `${Date.now()}_720p.mp4`);
          await compressVideo(videoPath, downscaledPath, TARGET_SIZE, duration, '-2:720');
          stats = fs.statSync(downscaledPath);
          if (stats.size <= DISCORD_MAX_SIZE) {
            fs.unlinkSync(compressedPath);
            fs.renameSync(downscaledPath, compressedPath);
            stats = fs.statSync(compressedPath);
          } else {
            fs.unlinkSync(downscaledPath);
          }
        }

        // Use compressed file if it fits
        if (fs.existsSync(compressedPath) && stats.size <= DISCORD_MAX_SIZE) {
          fs.unlinkSync(videoPath);
          videoPath = compressedPath;
        } else {
          // Final fallback: download smaller version
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          fs.unlinkSync(videoPath);
          videoPath = path.join(videoDir, `${Date.now()}_small.mp4`);
          await statusMessage.edit({ embeds: [new EmbedBuilder().setTitle('⏳ Video Status').setDescription('Downloading smaller version...').setColor('#ff66b2')] });
          await execFilePromise(ytdlpPath, [
            '-o', videoPath,
            '--no-playlist',
            '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            tiktokURL
          ], { timeout: 60000 });
          stats = fs.statSync(videoPath);
        }
      }

      // Final size guard
      stats = fs.statSync(videoPath);
      if (stats.size > DISCORD_MAX_SIZE) {
        throw new Error(`Video too large (${formatBytes(stats.size)}). Cannot be compressed under 25 MB.`);
      }

      // 4. Embed
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
        files: [{ attachment: videoPath, name: 'tiktok_video.mp4' }]
      });

      // Cleanup
      if (statusMessage.deletable) statusMessage.delete();
      fs.unlink(videoPath, () => {});

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
