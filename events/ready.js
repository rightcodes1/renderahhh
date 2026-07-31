const { ActivityType } = require("discord.js");
const CONFIG = require("../config");

module.exports = {
  name: "ready",
  once: true,
  execute(client, monitoredUsers, saveFunction, backupFunction) {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Serving in ${client.guilds.cache.size} guilds`);
    
    // Set bot status
    client.user.setActivity("monitoring users", { type: ActivityType.Watching });
    
    const { sendRateLimitedNotification, formatTimeDuration } = require("../utils/helpers");

    // Start automatic database backup
    setInterval(() => {
      backupFunction();
    }, CONFIG.AUTO_BACKUP_INTERVAL);
    
    // Start monitoring interval
    setInterval(() => {
      monitoredUsers.forEach((userData, userId) => {
        // Check AFK status
        const currentTime = Date.now();
        if (currentTime - userData.lastActiveTime >= CONFIG.AFK_TIMEOUT && !userData.afk) {
          const user = client.users.cache.get(userId);
          
          sendRateLimitedNotification(client, userId, {
            color: CONFIG.EMBED_COLORS.WARNING,
            author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
            fields: [
              { name: "Username:", value: user?.username || "User", inline: true },
              { name: "Status", value: "is AFK!", inline: true },
              { name: "Idle for:", value: formatTimeDuration(currentTime - userData.lastActiveTime), inline: true }
            ],
            footer: { text: "AFK Detection System" }
          }, monitoredUsers, saveFunction);
          
          userData.afk = true;
          monitoredUsers.set(userId, userData);
          saveFunction(userData);
        }
        
        // Update session time
        if (userData.startTime) {
          userData.sessionTime += currentTime - userData.startTime;
          userData.startTime = currentTime;
          monitoredUsers.set(userId, userData);
          saveFunction(userData);
        }
      });
    }, 60000); // Check every minute
  }
};
