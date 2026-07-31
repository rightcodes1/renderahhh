const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");

module.exports = {
  name: "monitor",
  description: "Start monitoring a user",
  execute(message, args, client, monitoredUsers, saveFunction) {
    const userId = args[0];
    const channel = message.mentions.channels.first() || message.channel;

    if (!userId || isNaN(userId)) {
      return message.reply("Please provide a valid user ID.");
    }

    if (monitoredUsers.has(userId)) {
      return message.reply(`User ${userId} is already being monitored. Use \`!unmonitor ${userId}\` to stop monitoring first.`);
    }

    client.users.fetch(userId)
      .then(user => {
        monitoredUsers.set(userId, {
          lastStatus: user.presence?.status || "offline",
          lastActiveTime: Date.now(),
          lastNotificationTime: 0,
          channelId: channel.id,
          afk: false,
          lastAvatar: user.avatarURL({ dynamic: true }) || "default",
          sessionTime: 0,
          startTime: null,
          monitoringSince: Date.now(),
          notifications: 0
        });

        if (saveFunction(monitoredUsers.get(userId))) {
          const embed = new EmbedBuilder()
            .setColor(CONFIG.EMBED_COLORS.SUCCESS)
            .setTitle("Monitoring Started")
            .setDescription(`Now monitoring ${user.username} (${userId})`)
            .addFields(
              { name: "Notification Channel", value: channel.toString(), inline: true },
              { name: "Current Status", value: user.presence?.status || "offline", inline: true }
            )
            .setFooter({ text: "Use !stats to check monitoring statistics" })
            .setTimestamp();
            
          message.channel.send({ embeds: [embed] });
        } else {
          message.reply("Failed to save monitoring data. Please try again.");
        }
      })
      .catch(error => {
        console.error("Error fetching user:", error);
        message.reply("Invalid user ID or user not found.");
      });
  }
};

