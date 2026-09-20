import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('mcp-config.json', root), 'utf8'));
for (const server of Object.values(config.mcpServers)) {
  server.command = process.execPath;
  server.args[0] = fileURLToPath(new URL('dist/servers/main.js', root));
  server.env.DATA_MODE = process.argv.includes('--demo') ? 'demo' : 'live';
  for (const key of ['NEWS_FEEDS', 'LME_PRICE_FILE', 'LME_PRICE_URL', 'ALLOWED_HOSTS']) {
    if (process.env[key]) server.env[key] = process.env[key];
  }
}
const output = new URL('mcp-config.local.json', root);
await writeFile(output, JSON.stringify(config, null, 2) + '\n');
console.log(`Ready for Claude Desktop or Cursor: ${fileURLToPath(output)}`);
