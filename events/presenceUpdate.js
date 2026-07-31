const CONFIG = require("../config");
const { sendRateLimitedNotification, getStatusEmoji } = require("../utils/helpers");

module.exports = {
  name: "presenceUpdate",
  execute(oldPresence, newPresence, client, monitoredUsers, saveFunction) {
    if (!newPresence || !newPresence.user) return;
    
    const userId = newPresence.user.id;
    const userData = monitoredUsers.get(userId);
    if (!userData) return;

    const oldStatus = oldPresence?.status || "offline";
    const newStatus = newPresence.status || "offline";
    
    // Only notify if status actually changed
    if (oldStatus !== newStatus) {
      const oldEmoji = getStatusEmoji(oldStatus);
      const newEmoji = getStatusEmoji(newStatus);
      
      sendRateLimitedNotification(client, userId, {
        color: CONFIG.EMBED_COLORS.INFO,
        author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
        fields: [
          { name: "Username:", value: newPresence.user.username, inline: true },
          { name: "Status Change:", value: `${oldEmoji} ${oldStatus} → ${newEmoji} ${newStatus}`, inline: true },
          { name: "Time:", value: new Date().toLocaleTimeString(), inline: true }
        ],
        footer: { text: "Presence Monitor" }
      }, monitoredUsers, saveFunction);
      
      // Update user data
      userData.lastStatus = newStatus;
      userData.lastActiveTime = Date.now();
      
      // Reset AFK if user comes online
      if (newStatus !== "offline" && userData.afk) {
        userData.afk = false;
      }
      
      // Start session time tracking if user comes online
      if (oldStatus === "offline" && newStatus !== "offline") {
        userData.startTime = Date.now();
      }
      // Stop session time tracking if user goes offline
      else if (oldStatus !== "offline" && newStatus === "offline") {
        if (userData.startTime) {
          userData.sessionTime += Date.now() - userData.startTime;
          userData.startTime = null;
        }
      }
      
      monitoredUsers.set(userId, userData);
      saveFunction(userData);
    }
  }
};

