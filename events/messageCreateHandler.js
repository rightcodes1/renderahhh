const { Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const tiktok = require("tiktok-scraper-without-watermark");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
 

 
 
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const STARTERS = [
  "https://vm.tiktok.com/", "http://vm.tiktok.com/",
  "https://www.tiktok.com/", "http://www.tiktok.com/",
  "https://m.tiktok.com/v/", "http://m.tiktok.com/v/",
  "https://vt.tiktok.com/", "http://vt.tiktok.com/",
];

const TIKTOK_URL_REGEX = /^https?:\/\/(www|vm|m|vt)\.tiktok\.com\/[^\s]+$/;

function getValidTikTokLink(msg) {
  for (const element of msg.split(/\s+/)) {
    if (STARTERS.some((s) => element.startsWith(s)) && TIKTOK_URL_REGEX.test(element)) {
      return element;
    }
  }
  return null;
}

async function getChannelForGuild(guildId) {
  const { data, error } = await supabase
    .from("tiktok_bot_config")
    .select("channel_id")
    .eq("guild_id", guildId)
    .maybeSingle();
  if (error) throw error;
  return data?.channel_id ?? null;
}

async function setChannelForGuild(guildId, channelId) {
  const { error } = await supabase
    .from("tiktok_bot_config")
    .upsert(
      { guild_id: guildId, channel_id: channelId, updated_at: new Date().toISOString() },
      { onConflict: "guild_id" }
    );
  if (error) throw error;
}

async function clearChannelForGuild(guildId) {
  const { error } = await supabase.from("tiktok_bot_config").delete().eq("guild_id", guildId);
  if (error) throw error;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const processing = new Set();

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(`Invite: https://discord.com/api/oauth2/authorize?client_id=${c.user.id}&permissions=277025770560&scope=bot%20applications.commands`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (message.content.trim().toLowerCase().startsWith("!tiktok")) {
    await handleCommand(message);
    return;
  }

  const channelId = await getChannelForGuild(message.guild.id).catch((e) => {
    console.error("Config read error:", e);
    return null;
  });
  if (!channelId || message.channelId !== channelId) return;

  const url = getValidTikTokLink(message.content);
  if (!url) return;

  const key = `${message.guild.id}:${message.id}`;
  if (processing.has(key)) return;
  processing.add(key);

  await processTikTokLink(message, url).catch((e) => console.error("Process error:", e));
  processing.delete(key);
});

async function handleCommand(message) {
  const args = message.content.trim().slice("!tiktok".length).trim().split(/\s+/);
  const sub = (args[0] || "").toLowerCase();

  if (sub === "set" || sub === "channel" || sub === "config") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply("You need the **Manage Channels** permission to set the TikTok channel.");
      return;
    }
    const target = message.mentions.channels.first();
    if (!target) {
      await message.reply("Usage: `!tiktok set #channel`");
      return;
    }
    try {
      await setChannelForGuild(message.guild.id, target.id);
      await message.reply(`Done! TikTok links posted in ${target} will be auto-downloaded and re-sent.`);
    } catch (e) {
      console.error(e);
      await message.reply("Failed to save the setting.");
    }
    return;
  }

  if (sub === "clear" || sub === "remove" || sub === "stop") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply("You need the **Manage Channels** permission.");
      return;
    }
    try {
      await clearChannelForGuild(message.guild.id);
      await message.reply("TikTok auto-download turned off.");
    } catch (e) {
      console.error(e);
      await message.reply("Failed to clear the setting.");
    }
    return;
  }

  if (sub === "status") {
    try {
      const id = await getChannelForGuild(message.guild.id);
      await message.reply(id ? `Currently set to <#${id}>.` : "Not configured. Use `!tiktok set #channel`.");
    } catch (e) {
      await message.reply("Failed to read the setting.");
    }
    return;
  }

  if (sub === "help" || sub === "" || sub === "commands") {
    const embed = new EmbedBuilder()
      .setTitle("TikTok Bot — Commands")
      .setColor("#00bfff")
      .setDescription(
        [
          "`!tiktok set #channel` — Set the channel to watch for TikTok links. (Manage Channels)",
          "`!tiktok status` — Show the current channel.",
          "`!tiktok clear` — Turn off auto-download. (Manage Channels)",
          "`!tiktok help` — Show this message.",
        ].join("\n\n")
      );
    await message.reply({ embeds: [embed] });
    return;
  }

  await message.reply("Unknown command. Try `!tiktok help`.");
}

async function processTikTokLink(message, tiktokURL) {
  await message.channel.sendTyping().catch(() => {});

  const statusMessage = await message.channel.send({
    embeds: [new EmbedBuilder().setTitle("Video Status").setDescription("Scraping video link...").setColor("#00bfff")],
  });

  const videoDir = path.join(__dirname, "videos");
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
  const videoPath = path.join(videoDir, `${Date.now()}.mp4`);

  try {
    const result = await tiktok.tiktokdownload(tiktokURL);

    if (!result || !result.nowm) {
      throw new Error("Could not extract the video. It might be private or region-locked.");
    }

    const videoLink = result.nowm;

    await statusMessage.edit({
      embeds: [new EmbedBuilder().setTitle("Video Status").setDescription("Downloading video...").setColor("#00bfff")],
    });

    const response = await axios({ url: videoLink, method: "GET", responseType: "stream", timeout: 60000 });
    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const stats = fs.statSync(videoPath);
    if (stats.size > MAX_FILE_SIZE) {
      fs.unlinkSync(videoPath);
      await statusMessage.edit({
        embeds: [new EmbedBuilder().setTitle("Video Status").setDescription(`Video too large (${(stats.size / 1048576).toFixed(1)} MB). Discord's limit is ~25 MB.`).setColor("#ff0000")],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("TikTok Video")
      .setURL(tiktokURL)
      .setDescription(`Requested by: ${message.author.tag}`)
      .setColor("#00bfff")
      .setTimestamp();

    await message.channel.send({
      embeds: [embed],
      files: [{ attachment: videoPath, name: "tiktok_video.mp4" }],
    });

    if (statusMessage.deletable) await statusMessage.delete().catch(() => {});
  } catch (err) {
    console.error(`Error: ${err.message || err}`);
    if (statusMessage.deletable) {
      await statusMessage.edit({
        embeds: [new EmbedBuilder().setTitle("Error").setColor("#ff0000").setDescription(err.message || "Failed to download the video.")],
      });
    }
  } finally {
    if (fs.existsSync(videoPath)) {
      fs.unlink(videoPath, (err) => { if (err) console.error("Cleanup error:", err); });
    }
  }
}
