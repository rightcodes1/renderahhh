const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const CONFIG = require("./config");

const oldDbPath = CONFIG.DB_PATH; // Path to the old JSON database
const newDbPath = path.join(__dirname, "database", "monitored_users.sqlite");

function migrateData() {
  if (!fs.existsSync(oldDbPath)) {
    console.log("Old JSON database not found. No data to migrate.");
    return;
  }

  let oldData;
  try {
    oldData = JSON.parse(fs.readFileSync(oldDbPath, "utf-8"));
    console.log(`Loaded ${Object.keys(oldData).length} users from old JSON database.`);
  } catch (error) {
    console.error("Error reading old JSON database:", error);
    return;
  }

  let db;
  try {
    db = new Database(newDbPath); // Open new SQLite database
    db.pragma("journal_mode = WAL");

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
    console.log("SQLite database initialized for migration.");
  } catch (error) {
    console.error("Error initializing SQLite database for migration:", error);
    return;
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO monitored_users (
      userId, lastStatus, lastActiveTime, lastNotificationTime, channelId, afk, lastAvatar, sessionTime, startTime, monitoringSince, notifications
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const userId in oldData) {
      const userData = oldData[userId];
      // Ensure sessionTime is a number
      if (typeof userData.sessionTime === 'string') {
        userData.sessionTime = parseInt(userData.sessionTime, 10) || 0;
      }
      insertStmt.run(
        userId,
        userData.lastStatus,
        userData.lastActiveTime,
        userData.lastNotificationTime,
        userData.channelId,
        Number(userData.afk), // Convert boolean to 0 or 1
        userData.lastAvatar,
        userData.sessionTime,
        userData.startTime,
        userData.monitoringSince,
        userData.notifications
      );
    }
  })();

  console.log("Data migration to SQLite complete.");
  db.close();

  // Optionally, rename or delete the old JSON file after successful migration
  // fs.renameSync(oldDbPath, oldDbPath + ".bak");
  // console.log("Old JSON database renamed to .bak");
}

migrateData();


