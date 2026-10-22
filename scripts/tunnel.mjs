#!/usr/bin/env node
// scripts/tunnel.mjs
//
// Publishes the already-running dev server through a temporary Cloudflare
// quick tunnel. Typical use:
//
//   terminal 1:  pnpm dev       (local only)
//   terminal 2:  pnpm online    (adds the public trycloudflare.com link)
//
// The tunnel forwards to the Vite dev server, which proxies /api and
// /socket.io to the backend, so the whole app works behind one URL.
import { spawn } from 'node:child_process';

const DEFAULT_TARGET = 'http://localhost:5173';
const target = process.argv[2] ?? process.env.TUNNEL_TARGET ?? DEFAULT_TARGET;

const URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  box: '\x1b[90m',
};

function banner(url) {
  const rule = `${C.box}${'─'.repeat(58)}${C.reset}`;
  console.log('');
  console.log(`  ${rule}`);
  console.log(
    `  ${C.box}│${C.reset} ${C.bold}Online — temporary public link${C.reset}`,
  );
  console.log(`  ${C.box}│${C.reset} ${C.bold}${C.blue}${url}${C.reset}`);
  console.log(
    `  ${C.box}│${C.reset} ${C.dim}Share it with anyone. It works while this command runs.${C.reset}`,
  );
  console.log(
    `  ${C.box}│${C.reset} ${C.dim}The URL changes every time you restart it.${C.reset}`,
  );
  console.log(`  ${rule}`);
  console.log('');
}

async function isReachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Any HTTP answer means something is listening.
    await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (!(await isReachable(target))) {
  console.error(`\n${C.red}✖ Nothing is answering on ${target}${C.reset}`);
  console.error(
    `  Start the local app first:  ${C.bold}pnpm dev${C.reset}   (in another terminal)`,
  );
  console.error(
    `  Or start both at once:      ${C.bold}pnpm dev:online${C.reset}\n`,
  );
  process.exit(1);
}

console.log(
  `\n${C.blue}▶ Requesting a temporary Cloudflare tunnel to ${target}…${C.reset}\n`,
);

const child = spawn(
  'cloudflared',
  ['tunnel', '--url', target, '--no-autoupdate'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

let announced = false;
const recent = [];

function handleOutput(chunk) {
  const plain = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');

  if (!announced) {
    const match = URL_RE.exec(plain);
    if (match) {
      announced = true;
      banner(match[0]);
    }
  }

  // cloudflared is chatty (version banner, connectivity pre-checks that often
  // report harmless region2 failures). After the link is up, surface only real
  // warnings/errors so the command stays readable.
  for (const line of plain.split('\n')) {
    if (!line.trim() || URL_RE.test(line)) continue;
    recent.push(line);
    if (recent.length > 25) recent.shift();
    if (announced && /\s(ERR|WRN|FTL)\s/.test(line)) {
      console.log(`${C.dim}${line}${C.reset}`);
    }
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('error', (err) => {
  console.error(
    `\n${C.red}✖ Could not start cloudflared (${err.message}).${C.reset}`,
  );
  console.error('  Install it, then reopen the terminal:');
  console.error(
    `    Windows: ${C.bold}winget install --id Cloudflare.cloudflared${C.reset}`,
  );
  console.error(`    macOS:   ${C.bold}brew install cloudflared${C.reset}`);
  console.error(
    `    Linux:   ${C.bold}https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/${C.reset}\n`,
  );
  process.exit(1);
});

child.on('exit', (code) => {
  if (code) {
    if (!announced && recent.length) {
      console.error(`\n${C.dim}cloudflared said:${C.reset}`);
      for (const line of recent) console.error(`  ${C.dim}${line}${C.reset}`);
    }
    console.error(
      `\n${C.yellow}cloudflared exited with code ${code}.${C.reset}\n`,
    );
  }
  process.exit(code ?? 0);
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log(`\n${C.dim}Closing the tunnel…${C.reset}`);
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* already gone */
  }
  setTimeout(() => process.exit(0), 700);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
