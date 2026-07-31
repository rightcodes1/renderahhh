# Discord Bot Project - Railway Deployment Guide

This guide provides instructions on how to deploy your Discord bot to Railway, ensuring it runs continuously and its SQLite database persists.

## Project Structure

Your project includes the following key files for Railway deployment:

- `Dockerfile`: Defines the environment for your bot, ensuring all dependencies are installed.
- `railway.toml`: Configures Railway-specific settings, including the start command and a persistent volume for your SQLite database.
- `.env.example`: A template for your environment variables, specifically for your `DISCORD_TOKEN`.
- `index.js`: The main entry point of your bot.
- `utils/db.js`: Manages the SQLite database, located at `database/monitored_users.sqlite`.

## Deployment Steps

Follow these steps to deploy your Discord bot on Railway:

### 1. Sign up or Log in to Railway

If you don't have a Railway account, sign up at [Railway.app](https://railway.app/). Otherwise, log in to your existing account.

### 2. Create a New Project

1.  Once logged in, click on `New Project`.
2.  Choose `Deploy from GitHub Repo` if your code is in a GitHub repository, or `Deploy from a private Git repository` if it's hosted elsewhere. If you prefer to deploy directly, you can use the Railway CLI.

### 3. Configure Environment Variables

Your bot requires a `DISCORD_TOKEN` to function. This token should be kept secret and managed as an environment variable on Railway.

1.  In your Railway project dashboard, navigate to the `Variables` tab.
2.  Add a new variable:
    -   **Name**: `DISCORD_TOKEN`
    -   **Value**: Your Discord bot token (e.g., `YOUR_BOT_TOKEN_HERE`). You can obtain this from the [Discord Developer Portal](https://discord.com/developers/applications).

### 4. Understand Persistent Storage

Your bot uses an SQLite database located at `database/monitored_users.sqlite`. To ensure that your bot's data (e.g., monitored users) persists across deployments and restarts, a persistent volume has been configured in `railway.toml`.

-   The `railway.toml` file maps the `/app/database` directory within your container to a persistent volume named `sqlite_data`. This means any data written to `/app/database` (where your `monitored_users.sqlite` file resides) will be saved and restored automatically by Railway.

### 5. Deployment

Railway will automatically detect your `Dockerfile` and `railway.toml` files and use them for deployment. If you've connected a GitHub repository, changes pushed to your main branch will trigger automatic redeployments.

-   Ensure your `startCommand` in `railway.toml` is set to `node index.js`.

### 6. Monitoring Your Bot

After deployment, you can monitor your bot's logs and status directly from the Railway dashboard to ensure it's running correctly.

## Local Development

For local development, create a `.env` file in the root of your project (next to `package.json`) and add your Discord token:

```
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
```

Then, install dependencies and start the bot:

```bash
npm install
node index.js
```

## Important Notes

-   **Security**: Never commit your actual `DISCORD_TOKEN` to version control. Use environment variables for sensitive information.
-   **Database Backups**: The bot includes a backup mechanism for the SQLite database. While Railway's persistent volumes provide data durability, regular backups are always recommended.

By following these steps, your Discord bot should be successfully deployed and running on Railway with persistent data storage.
