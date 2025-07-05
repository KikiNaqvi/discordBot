import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';

const CREDENTIALS_FILE = './credentials.json';

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) return {};
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
}

function saveCredentials(data) {
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
} = process.env;


const commands = [
  new SlashCommandBuilder()
    .setName('checksrp')
    .setDescription('Find out how much SRP you have completed for your current homework.'),
  new SlashCommandBuilder()
  .setName('sparxdetails')
  .setDescription('Store your Sparx username and password securely.')
  .addStringOption(option =>
    option.setName('username')
      .setDescription('Your Sparx username')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('password')
      .setDescription('Your Sparx password')
      .setRequired(true)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function registerCommands() {
  try {
    console.log('🚀 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

function buildEmbed(title, content, color = 0x7289DA, footerText = 'Sparx Learning Bot') {
  const now = new Date();
  const hours = now.getHours() % 12 || 12;
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  const formattedTime = `${hours}:${minutes} ${ampm}`;

  return {
    color,
    title,
    description: content.length > 2048 ? content.slice(0, 2045) + '...' : content,
    footer: { text: `${footerText} • Today at ${formattedTime}` },
  };
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'sparxdetails') {
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');

    const allCreds = loadCredentials();
    allCreds[interaction.user.id] = { username, password };
    saveCredentials(allCreds);

    await interaction.reply({
      embeds: [
        buildEmbed('🔐 Credentials Saved', `Your Sparx login details were saved successfully.`)
      ],
      ephemeral: true
    });
    return;
  }

  if (interaction.commandName !== 'checksrp') return;

  await interaction.deferReply();

  const creds = loadCredentials();
  const userCreds = creds[interaction.user.id];

  if (!userCreds) {
    await interaction.editReply({
      embeds: [
        buildEmbed('🔑 Missing Credentials', `You need to run \`/sparxdetails\` first to set your Sparx username and password.`)
      ]
    });
    return;
  }

  let browser
  const { username: USERNAME, password: PASSWORD } = userCreds;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const totalStart = Date.now();

    // Step 1: Open login page
    await interaction.editReply({ embeds: [buildEmbed('🌐 Step 1: Navigating', 'Opening Sparx login page...')] });
    await page.goto('https://auth.sparx-learning.com/oauth2/auth?client_id=sparx-learning&hd=48503347-b17f-435b-9e7c-a48be1428762&p=2&redirect_uri=https%3A%2F%2Fapi.sparx-learning.com%2Foauth2%2Fcallback%2Fsparx&response_type=code&scope=openid+profile+email&state=state123&ts=1234567890', { waitUntil: 'networkidle2' });
    try {
      await page.waitForSelector('#cookiescript_accept', { timeout: 5000 });
      await page.click('#cookiescript_accept');
      console.log('✅ Accepted cookies via #cookiescript_accept');
    } catch (e) {
      console.log('ℹ️ No cookie banner found or already accepted.');
    }
    await delay(500); // wait for page to load

    // Step 2: Type credentials
    await interaction.editReply({ embeds: [buildEmbed('⌨️ Step 2: Entering Credentials', 'Typing username & password...', 0xF5A623)] });
    await page.type('input[name="username"], input[id="username"]', USERNAME, { delay: 100 });
    await page.type('input[name="password"], input[id="password"]', PASSWORD, { delay: 100 });
    await delay(500)

    // Step 3: Click login
    await interaction.editReply({ embeds: [buildEmbed('🖱️ Step 3: Clicking Login', 'Logging in...', 0xF5A623)] });
    await page.waitForSelector('button.sm-button.login-button:not([disabled])', { visible: true, timeout: 10000 });
    await delay(300);
    await page.click('button.sm-button.login-button');
    await delay(2500); // wait for redirect


    // 🌐 Navigate to reader site after login
    await interaction.editReply({ embeds: [buildEmbed('🔀 Redirecting', 'Heading to reader.sparx-learning.com...', 0x00BFFF)] });

    await page.goto('https://reader.sparx-learning.com', { waitUntil: 'networkidle2' });

    // 📸 Optional: take a screenshot
    await delay(500); // wait for page to load

    // Step 5: Find SRP text
    await interaction.editReply({ embeds: [buildEmbed('🔍 Step 5: SRP Scan', 'Looking for SRP status...')] });
    await delay(2500); // let page finish rendering
    const pageText = await page.evaluate(() => document.body.innerText);
    const srpMatch = pageText.match(/(\d+)\s*\/\s*(\d+)\s*SRP/);
    const srpResult = srpMatch
      ? `You've completed ${srpMatch[1]} out of ${srpMatch[2]} SRP.`
      : '❌ Could not find SRP status in the page text.';


    await interaction.editReply({
      embeds: [
      buildEmbed(
        '✅ SRP Status',
        srpResult,
        0x57F287,
        `Fetched in ${Math.ceil((Date.now() - totalStart) / 1000)} seconds`
      ),
      ]
    });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Error in /autosparxreader:', error);
    await interaction.editReply({ embeds: [buildEmbed('⚠️ Error', 'Something went wrong while fetching SRP data.')] });
  }
});

client.once('ready', () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);
  registerCommands();
});

client.login(DISCORD_TOKEN);
