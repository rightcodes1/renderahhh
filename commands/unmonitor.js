const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");
const { formatTimeDuration } = require("../utils/helpers");

module.exports = {
  name: "unmonitor",
  description: "Stop monitoring a user",
  execute(message, args, client, monitoredUsers, saveFunction) {
    const userId = args[0];
    
    if (!userId || isNaN(userId)) {
      return message.reply("Please provide a valid user ID.");
    }
    
    if (!monitoredUsers.has(userId)) {
      return message.reply(`User ${userId} is not being monitored.`);
    }
    
    const userData = monitoredUsers.get(userId);
    client.users.fetch(userId)
      .then(user => {
        deleteMonitoredUser(userId);
        
        if (true) { // saveFunction is now deleteMonitoredUser, which is called above
          let totalSessionTime = userData.sessionTime || 0;
          if (userData.startTime) {
            totalSessionTime += Date.now() - userData.startTime;
          }
          
          const embed = new EmbedBuilder()
            .setColor(CONFIG.EMBED_COLORS.ERROR)
            .setTitle("Monitoring Stopped")
            .setDescription(`Stopped monitoring ${user.username} (${userId})`)
            .addFields(
              { name: "Total Session Time", value: formatTimeDuration(totalSessionTime), inline: true },
              { name: "Total Notifications", value: (userData.notifications || 0).toString(), inline: true },
              { name: "Monitoring Duration", value: formatTimeDuration(Date.now() - (userData.monitoringSince || Date.now())), inline: true }
            )
            .setFooter({ text: "Monitoring data has been removed" })
            .setTimestamp();
            
          message.channel.send({ embeds: [embed] });
        } else {
          message.reply("Failed to save changes. Please try again.");
        }
      })
      .catch(error => {
        console.error("Error fetching user for unmonitor:", error);
        message.reply(`Removed user ${userId} from monitoring, but could not fetch user details.`);
        deleteMonitoredUser(userId);
        
      });
  }
};

