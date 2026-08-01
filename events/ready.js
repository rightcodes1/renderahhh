const { ActivityType } = require("discord.js");
const CONFIG = require("../config");

module.exports = {
  name: "ready",
  once: true,
  execute(client, commands) {
    console.log(`Logged in as ${client.user.tag}!`);
        // Register slash commands globally
    const commandData = commands.map(command => command.data.toJSON());
    client.application.commands.set(commandData)
      .then(() => console.log("Successfully registered application commands."))
      .catch(console.error);

    console.log(`Serving in ${client.guilds.cache.size} guilds`);
    
    // Set bot status
    client.user.setActivity("downloading TikToks", { type: ActivityType.Watching });
    

  }
};
