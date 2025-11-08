import { Client, GatewayIntentBits } from "discord.js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";
import fs from "fs";
import express from "express";

dotenv.config();

// ---------------- Discord Bot Setup ----------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!sparxreader")) return;

  let browser;
  try {
    await message.channel.send("📖 Loading Sparx Reader...");

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Go to Sparx Reader
    await page.goto("https://reader.sparx-learning.com", { waitUntil: "domcontentloaded" });

    // --- Debug screenshot immediately ---
    const debugPath = "debug.png";
    await page.screenshot({ path: debugPath, fullPage: true });
    await message.channel.send({
      content: "📸 Page loaded — here’s what Puppeteer sees:",
      files: [debugPath],
    });
    fs.unlinkSync(debugPath);

    // Optional: wait for input if you want to type after seeing screenshot
    try {
      await page.waitForSelector('input[placeholder="Start typing your school\'s name..."]', { timeout: 15000 });
      await page.type('input[placeholder="Start typing your school\'s name..."]', "Beal High School");
      await page.waitForTimeout(1500);

      const screenshotPath = "sparx.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await message.channel.send({
        content: "📸 Here’s the school input screenshot:",
        files: [screenshotPath],
      });
      fs.unlinkSync(screenshotPath);
    } catch {
      await message.channel.send("⚠️ Input box not found — check the first screenshot.");
    }

    await browser.close();
  } catch (err) {
    console.error("❌ Puppeteer error:", err);
    if (message.channel) {
      await message.channel.send("❌ Something went wrong while loading the page!");
    }
    if (browser) await browser.close().catch(() => {});
  }
});

// ---------------- Discord Login ----------------
client.login(process.env.DISCORD_TOKEN);

// ---------------- Express Server for Render ----------------
const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => res.send("Discord bot is running!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
