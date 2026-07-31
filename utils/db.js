const Database = require("better-sqlite3");
const path = require("path");
const { Collection } = require("discord.js");
const fs = require("fs"); // For backup and migration
const CONFIG = require("../config");

const dbPath = path.join(__dirname, "..", "database", "monitored_users.sqlite");
let db;

function initializeDatabase() {
  try {
    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }

    db = new Database(dbPath, { verbose: console.log }); // verbose for logging queries
    db.pragma("journal_mode = WAL"); // Enable Write-Ahead Logging for better concurrency

    db.exec(`
      CREATE TABLE IF NOT EXISTS monitored_users (
        userId TEXT PRIMARY KEY,
        lastStatus TEXT,
        lastActiveTime INTEGER,
        lastNotificationTime INTEGER,
        channelId TEXT,
        afk INTEGER,
        lastAvatar TEXT,
        sessionTime INTEGER,
        startTime INTEGER,
        monitoringSince INTEGER,
        notifications INTEGER
      );
    `);
    console.log("SQLite database initialized and table ensured.");
  } catch (error) {
    console.error("Error initializing SQLite database:", error);
    process.exit(1); // Exit if database cannot be initialized
  }
}

function loadMonitoredUsers() {
  if (!db) initializeDatabase();
  const stmt = db.prepare("SELECT * FROM monitored_users");
  const users = stmt.all();
  const monitoredUsersCollection = new Collection();
  users.forEach(user => {
    // Convert SQLite INTEGER (0 or 1) back to boolean for afk
    user.afk = Boolean(user.afk);
    monitoredUsersCollection.set(user.userId, user);
  });
  console.log(`Loaded ${monitoredUsersCollection.size} monitored users from SQLite database.`);
  return monitoredUsersCollection;
}

function saveMonitoredUser(userData) {
  if (!db) initializeDatabase();
  const { userId, lastStatus, lastActiveTime, lastNotificationTime, channelId, afk, lastAvatar, sessionTime, startTime, monitoringSince, notifications } = userData;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO monitored_users (
      userId, lastStatus, lastActiveTime, lastNotificationTime, channelId, afk, lastAvatar, sessionTime, startTime, monitoringSince, notifications
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    userId, lastStatus, lastActiveTime, lastNotificationTime, channelId, Number(afk), lastAvatar, sessionTime, startTime, monitoringSince, notifications
  );
}

function deleteMonitoredUser(userId) {
  if (!db) initializeDatabase();
  const stmt = db.prepare("DELETE FROM monitored_users WHERE userId = ?");
  stmt.run(userId);
}

function backupDatabase() {
  if (!db) initializeDatabase();
  try {
    const backupDir = path.join(path.dirname(dbPath), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const backupFilePath = path.join(backupDir, `monitored_users_${timestamp}.sqlite`);
    
    // Create a backup of the SQLite database
    db.backup(backupFilePath);

    // Remove old backups (keep only last 10)
    const backups = fs.readdirSync(backupDir)
      .filter(file => file.startsWith("monitored_users_") && file.endsWith(".sqlite"))
      .sort()
      .reverse();
    
    if (backups.length > 10) {
      for (let i = 10; i < backups.length; i++) {
        fs.unlinkSync(path.join(backupDir, backups[i]));
      }
      console.log(`Removed ${backups.length - 10} old SQLite backups.`);
    }
    
    return true;
  } catch (error) {
    console.error("Error backing up database:", error);
    return false;
  }
}

module.exports = {
  initializeDatabase,
  loadMonitoredUsers,
  saveMonitoredUser,
  deleteMonitoredUser,
  backupDatabase
};

