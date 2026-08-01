const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const tiktok = require('tiktok-scraper-without-watermark');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tiktok')
        .setDescription('Downloads a TikTok video without watermark.')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the TikTok video')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();

        const videoUrl = interaction.options.getString('url');

        try {
            const result = await tiktok.tiklydown(videoUrl);

            if (!result || !result.video || !result.video.noWatermark) {
                return interaction.editReply('Could not download the TikTok video. Please check the URL or try again later.');
            }

            const videoLink = result.video.noWatermark;
            const videoTitle = result.title || 'TikTok Video';
            const authorName = result.author ? result.author.unique_id : 'Unknown Creator';

            // Download the video to a temporary file
            const response = await fetch(videoLink);
            if (!response.ok) {
                throw new Error(`Failed to fetch video: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const tempFilePath = path.join(__dirname, `temp_tiktok_${Date.now()}.mp4`);
            fs.writeFileSync(tempFilePath, buffer);

            const embed = new EmbedBuilder()
                .setTitle(videoTitle)
                .setURL(videoUrl)
                .setDescription(`Downloaded by ${interaction.user.username}`)
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Author', value: authorName, inline: true },
                    { name: 'Views', value: result.stats.playCount || 'N/A', inline: true },
                    { name: 'Likes', value: result.stats.diggCount || 'N/A', inline: true }
                )
                .setFooter({ text: 'TikTok Downloader Bot' });

            await interaction.editReply({
                embeds: [embed],
                files: [{ attachment: tempFilePath, name: `${videoTitle}.mp4` }]
            });

            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);

        } catch (error) {
            console.error('Error downloading TikTok:', error);
            await interaction.editReply('There was an error trying to download the TikTok video. Please ensure the URL is valid and try again.');
        }
    },
};
