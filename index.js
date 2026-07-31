const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Import database functions
const { initializeDatabase, loadMonitoredUsers, saveMonitoredUser, deleteMonitoredUser, backupDatabase } = require("./utils/db");

// Initialize the database
initializeDatabase();

// Load monitored users on startup
const monitoredUsers = loadMonitoredUsers();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageTyping
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.User
  ]
});

// Create a collection to store commands
const commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  commands.set(command.name, command);
}

// Load events
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => {
      if (event.name === "ready") {
        event.execute(client, monitoredUsers, saveMonitoredUser, backupDatabase);
      } else {
        event.execute(...args, client, monitoredUsers, saveMonitoredUser, commands);
      }
    });
  } else {
    client.on(event.name, (...args) => {
      event.execute(...args, client, monitoredUsers, saveMonitoredUser, commands);
    });
  }
}

// Error handling
client.on("error", (error) => {
  console.error("Client error:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});



// Login to Discord
client.login(process.env.DISCORD_TOKEN);



// Keep the bot alive on Replit
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


