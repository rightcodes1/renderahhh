const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");
const { getStatusEmoji } = require("../utils/helpers");

module.exports = {
  name: "list",
  description: "List all monitored users",
  execute(message, args, client, monitoredUsers, saveFunction) {
    if (monitoredUsers.size === 0) {
      return message.reply("No users are currently being monitored.");
    }
    
    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLORS.INFO)
      .setTitle("Monitored Users")
      .setDescription(`Total: ${monitoredUsers.size} users`)
      .setFooter({ text: "Use !stats <userId> for detailed information" })
      .setTimestamp();
    
    const channelGroups = {};
    
    monitoredUsers.forEach((userData, userId) => {
      const channelId = userData.channelId;
      if (!channelGroups[channelId]) {
        channelGroups[channelId] = [];
      }
      
      const user = client.users.cache.get(userId);
      const username = user ? user.username : "Unknown User";
      const status = userData.lastStatus || "unknown";
      
      channelGroups[channelId].push({userId, username, status});
    });
    
    for (const [channelId, users] of Object.entries(channelGroups)) {
      const channel = client.channels.cache.get(channelId);
      const channelName = channel ? channel.name : "Unknown Channel";
      
      let userList = "";
      users.forEach(user => {
        const statusEmoji = getStatusEmoji(user.status);
        userList += `${statusEmoji} **${user.username}** (${user.userId})\n`;
      });
      
      embed.addFields({ name: `#${channelName} (${users.length})`, value: userList || "No users", inline: false });
    }
    
    message.channel.send({ embeds: [embed] });
  }
};

