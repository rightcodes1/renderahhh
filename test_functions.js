const { monitoredUsers, loadMonitoredUsers, saveMonitoredUsers, backupDatabase } = require('./utils/db');
const { formatTimeDuration, getStatusEmoji, getUserStats } = require('./utils/helpers');
const { Collection } = require('discord.js');

console.log('--- Testing DB Functions ---');

// Test ensureDatabaseDirectory and loadMonitoredUsers
console.log('Loading monitored users (should create dir if not exists):');
const initialMonitoredUsers = loadMonitoredUsers();
console.log('Initial monitored users size:', initialMonitoredUsers.size);

// Test saveMonitoredUsers
console.log('Adding a dummy user and saving:');
initialMonitoredUsers.set('123456789012345678', {
  lastStatus: 'online',
  lastActiveTime: Date.now(),
  lastNotificationTime: 0,
  channelId: '987654321098765432',
  afk: false,
  lastAvatar: 'default',
  sessionTime: 120000, // 2 minutes
  startTime: Date.now() - 60000, // Started 1 minute ago
  monitoringSince: Date.now() - 3600000, // Monitored for 1 hour
  notifications: 5
});
saveMonitoredUsers();
console.log('Monitored users size after adding:', initialMonitoredUsers.size);

// Reload to verify save
console.log('Reloading monitored users to verify save:');
const reloadedMonitoredUsers = loadMonitoredUsers();
console.log('Reloaded monitored users size:', reloadedMonitoredUsers.size);
console.log('Dummy user data:', reloadedMonitoredUsers.get('123456789012345678'));

// Test backupDatabase
console.log('Performing database backup:');
backupDatabase();

console.log('\n--- Testing Helper Functions ---');

// Test formatTimeDuration
console.log('Formatting 125 seconds:', formatTimeDuration(125000)); // 2m 5s
console.log('Formatting 3661 seconds:', formatTimeDuration(3661000)); // 1h 1m 1s
console.log('Formatting 90000000 seconds:', formatTimeDuration(90000000)); // 1d 0h 0m

// Test getStatusEmoji
console.log('Emoji for online:', getStatusEmoji('online'));
console.log('Emoji for idle:', getStatusEmoji('idle'));
console.log('Emoji for dnd:', getStatusEmoji('dnd'));
console.log('Emoji for offline:', getStatusEmoji('offline'));
console.log('Emoji for unknown:', getStatusEmoji('unknown'));

// Test getUserStats (requires a dummy client for cache, but we can mock it)
console.log('Testing getUserStats with mocked client:');
const mockClient = {
  users: {
    cache: new Collection()
  }
};
mockClient.users.cache.set('123456789012345678', { username: 'TestUser' });

const stats = getUserStats('123456789012345678', reloadedMonitoredUsers, mockClient);
console.log('User stats:', stats);

// Clean up dummy user
console.log('Cleaning up dummy user:');
reloadedMonitoredUsers.delete('123456789012345678');
saveMonitoredUsers();
console.log('Monitored users size after cleanup:', loadMonitoredUsers().size);


