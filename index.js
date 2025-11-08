// index.js (Render web service + puppeteer-extra stealth)
import { Client, GatewayIntentBits } from "discord.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";
import fs from "fs";
import express from "express";

dotenv.config();

// Use stealth plugin
puppeteer.use(StealthPlugin());

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

async function launchChromium() {
  // Use @sparticuz/chromium executable (Render/Linux)
  const execPath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args.concat([
      // helpful args for stability in container env
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ]),
    defaultViewport: chromium.defaultViewport,
    executablePath: execPath,
    headless: chromium.headless,
  });
}

client.on("messageCreate", async (message) => {
  try {
    if (!message.content.startsWith("!sparxreader")) return;

    // parse optional school name: !sparxreader My School Name
    const raw = message.content.slice("!sparxreader".length).trim();
    const schoolName = raw.length ? raw.replace(/(^["']|["']$)/g, "") : "Beal High School";

    await message.channel.send(`📖 Loading Sparx Reader for **${schoolName}**...`);

    const browser = await launchChromium();
    const page = await browser.newPage();

    // try to appear more like a real browser
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
      );
    } catch {}

    // navigate
    await page.goto("https://reader.sparx-learning.com", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

    // Debug screenshot immediately (unique filename to avoid collisions)
    const ts = Date.now();
    const debugPath = `debug-${ts}.png`;
    try {
      await page.screenshot({ path: debugPath, fullPage: true });
      await message.channel.send({
        content: "📸 Page loaded — here’s what Puppeteer sees (debug):",
        files: [debugPath],
      });
    } catch (screenshotErr) {
      console.error("Screenshot failed:", screenshotErr);
      await message.channel.send("⚠️ Could not take debug screenshot.");
    } finally {
      try { fs.unlinkSync(debugPath); } catch {}
    }

    // Now try to find the input by placeholder and type
    try {
      const placeholder = `Start typing your school's name...`;
      await page.waitForSelector(`input[placeholder="${placeholder}"]`, { timeout: 15000 });
      await page.type(`input[placeholder="${placeholder}"]`, schoolName, { delay: 80 });
      await page.waitForTimeout(1500);

      const resultPath = `result-${ts}.png`;
      await page.screenshot({ path: resultPath, fullPage: true });
      await message.channel.send({
        content: `📸 Screenshot after typing **${schoolName}**:`,
        files: [resultPath],
      });
      try { fs.unlinkSync(resultPath); } catch {}
    } catch (findErr) {
      console.warn("Input not found or could not type:", findErr);
      await message.channel.send("⚠️ Input box not found — check the debug screenshot to see why.");
    }

    await browser.close();
  } catch (err) {
    console.error("❌ Uncaught handler error:", err);
    try {
      if (message.channel) await message.channel.send("❌ Unexpected error — check logs.");
    } catch {}
  }
});

// login
client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error("Discord login failed:", e);
  process.exit(1);
});

// express server for Render web service
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Discord bot (puppeteer-extra stealth) is running!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
