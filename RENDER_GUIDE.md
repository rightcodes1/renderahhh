# Easy Hosting Guide: Render + UptimeRobot (24/7 Free)

Since Railway isn't working out, we'll use **Render**. It's much more user-friendly.

## Step 1: Prepare Your GitHub Repository
The error you saw (`MODULE_NOT_FOUND`) happens when the folder structure is wrong. 
**DO NOT upload files one by one.** 

1.  Extract the new `discord-bot-render.7z` I sent you.
2.  Ensure you see these folders: `commands`, `events`, `utils`.
3.  Upload the **entire contents** to a new GitHub repository.
    *   *Tip: Use the [GitHub Desktop app](https://desktop.github.com/) to simply drag the whole folder and click "Publish". This guarantees the structure is correct.*

## Step 2: Deploy on Render
1.  Go to [Render.com](https://render.com/) and log in with GitHub.
2.  Click **New +** > **Web Service**.
3.  Connect your Discord bot repository.
4.  Use these settings:
    *   **Name**: `my-discord-bot`
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `npm start`
    *   **Instance Type**: `Free`
5.  Click **Advanced** > **Add Environment Variable**:
    *   Key: `DISCORD_TOKEN`
    *   Value: `your_actual_token_here`
6.  Click **Create Web Service**.

## Step 3: Keep it Awake 24/7 (Crucial!)
Render's free tier "sleeps" after 15 minutes of no activity. To keep your bot running 24/7:
1.  In your Render dashboard, copy the **URL** of your service (e.g., `https://my-discord-bot.onrender.com`).
2.  Go to [UptimeRobot.com](https://uptimerobot.com/) (Free).
3.  Click **Add New Monitor**.
4.  Monitor Type: **HTTP(s)**.
5.  Friendly Name: `Discord Bot`.
6.  URL: Paste your Render URL.
7.  Monitoring Interval: **5 minutes**.
8.  Click **Create Monitor**.

*UptimeRobot will now "ping" your bot every 5 minutes, preventing Render from putting it to sleep.*

## A Note on Data (SQLite)
Render's free tier is "ephemeral," meaning if the bot restarts, the SQLite database resets. 
*   **For 24/7 with permanent data for free**, you would need to use a free database like **MongoDB Atlas** or **Supabase**, which requires changing the code. 
*   If you just need it to work for now, this Render setup is the easiest path!
