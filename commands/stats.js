const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");
const { getUserStats, getStatusEmoji } = require("../utils/helpers");

module.exports = {
  name: "stats",
  description: "Get stats for a monitored user",
  execute(message, args, client, monitoredUsers, saveFunction) {
    const userId = args[0];
    
    if (!userId || isNaN(userId)) {
      return message.reply("Please provide a valid user ID.");
    }
    
    if (!monitoredUsers.has(userId)) {
      return message.reply(`User ${userId} is not being monitored.`);
    }
    
    const stats = getUserStats(userId, monitoredUsers, client);
    if (!stats) {
      return message.reply("Failed to get user statistics.");
    }
    
    const statusEmoji = getStatusEmoji(stats.status);
    
    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLORS.INFO)
      .setTitle(`User Monitoring Stats: ${stats.username}`)
      .setDescription(`User ID: ${stats.userId}`)
      .addFields(
        { name: "Current Status", value: `${statusEmoji} ${stats.status}`, inline: true },
        { name: "AFK Status", value: stats.afk ? "⚠️ AFK" : "✅ Active", inline: true },
        { name: "Total Session Time", value: stats.totalSessionTime, inline: true },
        { name: "Last Active", value: stats.lastActiveTime, inline: true },
        { name: "Notifications Sent", value: stats.notifications.toString(), inline: true },
        { name: "Monitored Since", value: stats.monitoringSince, inline: false },
        { name: "Monitoring Duration", value: stats.monitoringDuration, inline: false }
      )
      .setFooter({ text: "Pixe. APP Monitoring System" })
      .setTimestamp();
    
    message.channel.send({ embeds: [embed] });
  }
};

