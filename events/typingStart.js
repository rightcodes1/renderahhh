const CONFIG = require("../config");
const { sendRateLimitedNotification, formatTimeDuration } = require("../utils/helpers");

module.exports = {
  name: "typingStart",
  execute(typing, client, monitoredUsers, saveFunction) {
    if (!typing.user || !typing.channel) return;
    
    const userId = typing.user.id;
    const userData = monitoredUsers.get(userId);
    if (!userData) return;

    if (userData.afk) {
      sendRateLimitedNotification(client, userId, {
        color: CONFIG.EMBED_COLORS.SUCCESS,
        author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
        fields: [
          { name: "Username:", value: typing.user.username, inline: true },
          { name: "Status", value: `is no longer AFK and started typing in ${typing.channel.name}.`, inline: true },
          { name: "AFK Duration:", value: formatTimeDuration(Date.now() - (userData.afkSince || userData.lastActiveTime || Date.now())), inline: true }
        ],
        footer: { text: "AFK Detection System" }
      }, monitoredUsers, saveFunction);
    }
    
    userData.lastActiveTime = Date.now();
    userData.afk = false;
    monitoredUsers.set(userId, userData);
    saveFunction(userData);
    
    console.log(`User ${typing.user.username} started typing in channel ${typing.channel.name}`);
  }
};

