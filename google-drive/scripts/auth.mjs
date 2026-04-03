#!/usr/bin/env node
/**
 * One-time OAuth setup. Run with:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node auth.js
 *
 * Two modes:
 *   - If running locally with a browser: auto-catches the callback on port 3456
 *   - If running on a remote server:     pass --manual, visit the URL, paste the code
 */
import { google } from 'googleapis';
import http from 'http';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, 'config');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');
const PORT = 3456;
const MANUAL = process.argv.includes('--manual');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Required: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables');
  process.exit(1);
}

const REDIRECT = MANUAL ? 'urn:ietf:wg:oauth:2.0:oob' : `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
  redirect_uri: REDIRECT,
});

async function saveToken(code) {
  const { tokens } = await oauth2.getToken({ code, redirect_uri: REDIRECT });
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('\nToken saved to', TOKEN_PATH);
}

if (MANUAL) {
  // ── Manual mode: user pastes the code ──────────────────────────────────
  console.log(`\nVisit this URL and grant access:\n\n${authUrl}\n`);
  console.log('After approving, Google will show an authorisation code (or redirect to a URL containing ?code=...).');
  console.log('Paste the code below:\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Code: ', async (input) => {
    rl.close();
    // Accept either a bare code or a full redirect URL
    let code = input.trim();
    if (code.includes('code=')) {
      code = new URL(code).searchParams.get('code') || code;
    }
    try {
      await saveToken(code);
    } catch (err) {
      console.error('Token exchange failed:', err.message);
      process.exit(1);
    }
    process.exit(0);
  });
} else {
  // ── Auto mode: local HTTP callback ─────────────────────────────────────
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error</h1><p>No authorisation code received.</p>');
      return;
    }

    try {
      await saveToken(code);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authenticated</h1><p>Token saved. You can close this tab.</p>');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><p>${err.message}</p>`);
      console.error('Token exchange failed:', err.message);
    }

    server.close();
    setTimeout(() => process.exit(0), 500);
  });

  server.listen(PORT, async () => {
    console.log(`\nVisit this URL to authorise:\n\n${authUrl}\n`);
    try {
      const open = (await import('open')).default;
      await open(authUrl);
    } catch {
      // No browser — user copies URL manually
    }
  });
}
