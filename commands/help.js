const { EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");

module.exports = {
  name: "help",
  description: "Show help message",
  execute(message, args, client, monitoredUsers, saveFunction) {
    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLORS.INFO)
      .setTitle("Pixe. APP Monitor - Help")
      .setDescription("Commands available:")
      .setFooter({ text: "Pixe. APP Monitoring System" })
      .setTimestamp();
    
    for (const [command, description] of Object.entries(CONFIG.COMMANDS_HELP)) {
      embed.addFields({ name: `${CONFIG.prefix}${command}`, value: description, inline: false });
    }
    
    message.channel.send({ embeds: [embed] });
  }
};

