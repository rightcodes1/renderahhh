const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");

function formatTimeDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case "online": return "🟢";
    case "idle": return "🟡";
    case "dnd": return "🔴";
    case "offline": return "⚫";
    case "invisible": return "⚪";
    default: return "❓";
  }
}

function sendRateLimitedNotification(client, userId, embedData, monitoredUsers, saveFunction) {
  const userData = monitoredUsers.get(userId);
  if (!userData) return false;

  const currentTime = Date.now();
  if (currentTime - userData.lastNotificationTime > CONFIG.NOTIFICATION_COOLDOWN) {
    try {
      const embed = new EmbedBuilder()
        .setColor(embedData.color)
        .setAuthor({ name: embedData.author.name, iconURL: embedData.author.iconURL })
        .setTitle("Notification log:");
      
      for (const field of embedData.fields) {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline });
      }
      
      embed.setFooter({ text: embedData.footer.text })
        .setTimestamp();

      const channel = client.channels.cache.get(userData.channelId);
      if (!channel) {
        console.warn(`Channel ${userData.channelId} not found for user ${userId}.`);
        return false;
      }

      channel.send({ embeds: [embed] }).catch(error => {
        console.error(`Error sending notification for user ${userId} to channel ${userData.channelId}:`, error);
      });

      userData.lastNotificationTime = currentTime;
      userData.notifications = (userData.notifications || 0) + 1;
      monitoredUsers.set(userId, userData);
      saveFunction();
      return true;
    } catch (error) {
      console.error(`Error creating notification for user ${userId}:`, error);
      return false;
    }
  }
  return false;
}

function getUserStats(userId, monitoredUsers, client) {
  const userData = monitoredUsers.get(userId);
  if (!userData) return null;
  
  const user = client.users.cache.get(userId);
  const username = user?.username || "Unknown User";
  
  let currentSessionTime = userData.sessionTime || 0;
  if (userData.startTime) {
    currentSessionTime += Date.now() - userData.startTime;
  }
  
  return {
    username,
    userId,
    status: userData.lastStatus || "unknown",
    afk: userData.afk || false,
    totalSessionTime: formatTimeDuration(currentSessionTime),
    lastActiveTime: new Date(userData.lastActiveTime).toLocaleString(),
    notifications: userData.notifications || 0,
    monitoringSince: userData.monitoringSince ? new Date(userData.monitoringSince).toLocaleString() : "Unknown",
    monitoringDuration: userData.monitoringSince ? formatTimeDuration(Date.now() - userData.monitoringSince) : "Unknown"
  };
}

module.exports = {
  formatTimeDuration,
  getStatusEmoji,
  sendRateLimitedNotification,
  getUserStats
};

