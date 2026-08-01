const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const CONFIG = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows a list of available commands."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(CONFIG.EMBED_COLORS.INFO)
      .setTitle("Available Commands")
      .setDescription("Here are the commands you can use:");

    for (const commandName in CONFIG.COMMANDS_HELP) {
      embed.addFields({ name: `/${commandName}`, value: CONFIG.COMMANDS_HELP[commandName] });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
