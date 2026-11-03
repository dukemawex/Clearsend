#!/usr/bin/env node
// Registers ClearSend slash commands globally (or for one guild for instant testing).
// Usage: DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/discord-register-commands.mjs [guildId]
// Never prints the token. Command definitions are read from lib/chatbots/discord-commands.json.
import { readFileSync } from "node:fs";
const appId = process.env.DISCORD_APP_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!appId || !botToken) { console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in the environment."); process.exit(1); }
const commands = JSON.parse(readFileSync(new URL("../lib/chatbots/discord-commands.json", import.meta.url), "utf8"));
const guild = process.argv[2];
const url = guild ? `https://discord.com/api/v10/applications/${appId}/guilds/${guild}/commands` : `https://discord.com/api/v10/applications/${appId}/commands`;
const res = await fetch(url, { method: "PUT", headers: { authorization: `Bot ${botToken}`, "content-type": "application/json" }, body: JSON.stringify(commands) });
const body = await res.json().catch(() => ({}));
if (!res.ok) { console.error("Register failed:", res.status, JSON.stringify(body).slice(0, 500)); process.exit(1); }
console.log(`Registered ${body.length} command(s) ${guild ? `in guild ${guild}` : "globally (can take up to an hour to appear)"}: ${body.map((c) => "/" + c.name).join(", ")}`);
const perms = 2048 + 16384 + 32768 + 65536 + 2147483648;
console.log(`Invite URL: https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=${perms}`);
