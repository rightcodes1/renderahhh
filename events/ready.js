const { ActivityType } = require("discord.js");

module.exports = {
  name: "ready",
  once: true,
  execute(client, commands) {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // FIX: Convert Collection to Array before mapping
    const commandData = Array.from(commands.values()).map(command => command.data.toJSON());
    
    client.application.commands.set(commandData)
      .then(() => console.log("Successfully registered application commands."))
      .catch(console.error);

    console.log(`Serving in ${client.guilds.cache.size} guilds`);
    client.user.setActivity("downloading TikToks", { type: ActivityType.Watching });
  }
};
