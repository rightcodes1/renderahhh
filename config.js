const path = require('path');

const CONFIG = {
  prefix: '!',
  DB_PATH: path.join(__dirname, 'database', 'monitored_users.sqlite'),
  AFK_TIMEOUT: 300000, // 5 minutes
  NOTIFICATION_COOLDOWN: 10000, // 10 seconds
  AUTO_BACKUP_INTERVAL: 3600000, // 1 hour
  COMMANDS_HELP: {
    monitor: 'Start monitoring a user: !monitor <userId> [#channel]',
    unmonitor: 'Stop monitoring a user: !unmonitor <userId>',
    list: 'List all monitored users: !list',
    stats: 'Get stats for a monitored user: !stats <userId>',
    help: 'Show this help message: !help'
  },
  EMBED_COLORS: {
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFFA500,
    INFO: 0x0099FF
  }
};

module.exports = CONFIG;

