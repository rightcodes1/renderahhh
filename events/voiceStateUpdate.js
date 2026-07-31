const CONFIG = require("../config");
const { sendRateLimitedNotification } = require("../utils/helpers");

module.exports = {
  name: "voiceStateUpdate",
  execute(oldState, newState, client, monitoredUsers, saveFunction) {
    if (!newState.member) return;
    const userId = newState.member.id;
    const userData = monitoredUsers.get(userId);
    if (!userData) return;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      sendRateLimitedNotification(client, userId, {
        color: CONFIG.EMBED_COLORS.SUCCESS,
        author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
        fields: [
          { name: "Username:", value: newState.member.user.username, inline: true },
          { name: "Status", value: `joined voice channel ${newState.channel.name}.`, inline: true },
          { name: "Channel Type:", value: newState.channel.type === 2 ? "Voice" : "Unknown", inline: true }
        ],
        footer: { text: "Voice Activity Monitor" }
      }, monitoredUsers, saveFunction);
      
      userData.lastActiveTime = Date.now();
      userData.afk = false;
      userData.startTime = Date.now();
      monitoredUsers.set(userId, userData);
      saveFunction(userData);
    }
    
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
      sendRateLimitedNotification(client, userId, {
        color: CONFIG.EMBED_COLORS.WARNING,
        author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
        fields: [
          { name: "Username:", value: newState.member.user.username, inline: true },
          { name: "Status", value: `left voice channel ${oldState.channel.name}.`, inline: true },
          { name: "Channel Type:", value: oldState.channel.type === 2 ? "Voice" : "Unknown", inline: true }
        ],
        footer: { text: "Voice Activity Monitor" }
      }, monitoredUsers, saveFunction);
      
      userData.lastActiveTime = Date.now();
      if (userData.startTime) {
        userData.sessionTime += Date.now() - userData.startTime;
        userData.startTime = null;
      }
      monitoredUsers.set(userId, userData);
      saveFunction(userData);
    }
    
    // User switched voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      sendRateLimitedNotification(client, userId, {
        color: CONFIG.EMBED_COLORS.INFO,
        author: { name: "Pixe. APP", iconURL: client.user.avatarURL({ dynamic: true }) },
        fields: [
          { name: "Username:", value: newState.member.user.username, inline: true },
          { name: "Status", value: `moved from ${oldState.channel.name} to ${newState.channel.name}.`, inline: true },
          { name: "Channel Type:", value: newState.channel.type === 2 ? "Voice" : "Unknown", inline: true }
        ],
        footer: { text: "Voice Activity Monitor" }
      }, monitoredUsers, saveFunction);
      
      userData.lastActiveTime = Date.now();
      userData.afk = false;
      monitoredUsers.set(userId, userData);
      saveFunction(userData);
    }
  }
};

