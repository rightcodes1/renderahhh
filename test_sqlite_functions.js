const { initializeDatabase, loadMonitoredUsers, saveMonitoredUser, deleteMonitoredUser, backupDatabase } = require("./utils/db");
const { formatTimeDuration, getStatusEmoji, getUserStats } = require("./utils/helpers");
const { Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");

console.log("--- Testing SQLite DB Functions ---");

// Ensure database is initialized
initializeDatabase();

// Clean up previous test data if any
const dbPath = path.join(__dirname, "database", "monitored_users.sqlite");
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("Cleaned up existing SQLite database for fresh test.");
  initializeDatabase(); // Re-initialize after deleting
}

let monitoredUsersCollection;

// Test loadMonitoredUsers (should be empty initially)
console.log("Loading monitored users (should be empty initially):");
monitoredUsersCollection = loadMonitoredUsers();
console.log("Initial monitored users size:", monitoredUsersCollection.size);

// Test saveMonitoredUser
console.log("Adding a dummy user and saving:");
const dummyUser1 = {
  userId: "123456789012345678",
  lastStatus: "online",
  lastActiveTime: Date.now(),
  lastNotificationTime: 0,
  channelId: "987654321098765432",
  afk: false,
  lastAvatar: "default",
  sessionTime: 120000, // 2 minutes
  startTime: Date.now() - 60000, // Started 1 minute ago
  monitoringSince: Date.now() - 3600000, // Monitored for 1 hour
  notifications: 5
};
monitoredUsersCollection.set(dummyUser1.userId, dummyUser1);
saveMonitoredUser(dummyUser1);
console.log("Monitored users size after adding:", monitoredUsersCollection.size);

const dummyUser2 = {
  userId: "987654321098765432",
  lastStatus: "idle",
  lastActiveTime: Date.now(),
  lastNotificationTime: 0,
  channelId: "111111111111111111",
  afk: true,
  lastAvatar: "default",
  sessionTime: 300000, // 5 minutes
  startTime: null,
  monitoringSince: Date.now() - 7200000, // Monitored for 2 hours
  notifications: 10
};
monitoredUsersCollection.set(dummyUser2.userId, dummyUser2);
saveMonitoredUser(dummyUser2);
console.log("Monitored users size after adding second user:", monitoredUsersCollection.size);

// Reload to verify save
console.log("Reloading monitored users to verify save:");
monitoredUsersCollection = loadMonitoredUsers();
console.log("Reloaded monitored users size:", monitoredUsersCollection.size);
console.log("Dummy user 1 data:", monitoredUsersCollection.get(dummyUser1.userId));
console.log("Dummy user 2 data:", monitoredUsersCollection.get(dummyUser2.userId));

// Test update
console.log("Updating dummy user 1 status to dnd:");
dummyUser1.lastStatus = "dnd";
dummyUser1.afk = true;
monitoredUsersCollection.set(dummyUser1.userId, dummyUser1);
saveMonitoredUser(dummyUser1);
monitoredUsersCollection = loadMonitoredUsers();
console.log("Dummy user 1 data after update:", monitoredUsersCollection.get(dummyUser1.userId));

// Test backupDatabase
console.log("Performing database backup:");
backupDatabase();

// Test deleteMonitoredUser
console.log("Deleting dummy user 1:");
deleteMonitoredUser(dummyUser1.userId);
monitoredUsersCollection = loadMonitoredUsers();
console.log("Monitored users size after deleting user 1:", monitoredUsersCollection.size);
console.log("Dummy user 1 exists:", monitoredUsersCollection.has(dummyUser1.userId));

console.log("\n--- Testing Helper Functions (with mocked client) ---");

// Test formatTimeDuration
console.log("Formatting 125 seconds:", formatTimeDuration(125000)); // 2m 5s
console.log("Formatting 3661 seconds:", formatTimeDuration(3661000)); // 1h 1m 1s
console.log("Formatting 90000000 seconds:", formatTimeDuration(90000000)); // 1d 1h 0m

// Test getStatusEmoji
console.log("Emoji for online:", getStatusEmoji("online"));
console.log("Emoji for idle:", getStatusEmoji("idle"));
console.log("Emoji for dnd:", getStatusEmoji("dnd"));
console.log("Emoji for offline:", getStatusEmoji("offline"));
console.log("Emoji for unknown:", getStatusEmoji("unknown"));

// Test getUserStats (requires a dummy client for cache, but we can mock it)
console.log("Testing getUserStats with mocked client:");
const mockClient = {
  users: {
    cache: new Collection()
  }
};
mockClient.users.cache.set(dummyUser2.userId, { username: "TestUser2" });

const stats = getUserStats(dummyUser2.userId, monitoredUsersCollection, mockClient);
console.log("User stats for dummyUser2:", stats);

// Clean up remaining dummy user
console.log("Cleaning up remaining dummy user:");
deleteMonitoredUser(dummyUser2.userId);
monitoredUsersCollection = loadMonitoredUsers();
console.log("Monitored users size after cleanup:", monitoredUsersCollection.size);


