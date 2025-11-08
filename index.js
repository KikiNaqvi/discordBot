import { Client, GatewayIntentBits } from "discord.js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!sparxreader")) return;

  await message.reply("📖 Loading Sparx Reader...");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Go to Sparx Reader
    await page.goto("https://reader.sparx-learning.com", {
      waitUntil: "domcontentloaded",
    });

    // Type the school name into the box
    await page.waitForSelector("input._Input_1573n_4", { timeout: 10000 });
    await page.type("input._Input_1573n_4", "Beal High School");

    // Wait a bit for the UI to update
    await page.waitForTimeout(1500);

    // Screenshot and send to Discord
    const screenshotPath = "sparx.png";
    await page.screenshot({ path: screenshotPath });

    await browser.close();

    await message.channel.send({
      content: "📸 Here’s what I got:",
      files: [screenshotPath],
    });

    fs.unlinkSync(screenshotPath);
  } catch (err) {
    console.error("❌ Puppeteer error:", err);
    await message.reply("❌ Something went wrong while loading the page!");
    if (browser) await browser.close().catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
