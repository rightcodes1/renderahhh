const CONFIG = require("../config");

module.exports = {
  name: "messageCreate",
  execute(message, client, monitoredUsers, saveFunction, commands) {
    // Ignore messages from bots or non-command messages
    if (message.author.bot || !message.content.startsWith(CONFIG.prefix)) return;
    
    const args = message.content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    console.log(`Command received: ${commandName} with args: ${args.join(", ")}`);
    
    const command = commands.get(commandName);
    if (!command) return;
    
    try {
      command.execute(message, args, client, monitoredUsers, saveFunction);
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      message.reply("There was an error executing that command!");
    }
  }
};

