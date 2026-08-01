const path = require('path');

const CONFIG = {
  prefix: '!',

  COMMANDS_HELP: {
    tiktok: 'Downloads a TikTok video without watermark: /tiktok <url>',
    help: 'Show this help message: /help'
  },
  EMBED_COLORS: {
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFFA500,
    INFO: 0x0099FF
  }
};

module.exports = CONFIG;

