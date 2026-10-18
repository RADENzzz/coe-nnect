#!/usr/bin/env node
process.noDeprecation = true;  // suppress DEP0190 for shell:true (dev-only)

// scripts/dev.mjs
//
// Runs all four dev services in parallel with colored prefixes.
// Ctrl+C kills all of them cleanly.
//
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const COLORS = {
  backend: '\x1b[36m',
  frontend: '\x1b[35m',
  solver: '\x1b[33m',
  parser: '\x1b[32m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  box: '\x1b[90m',
};

const LABELS = {
  backend: '[BACKEND]  ',
  frontend: '[FRONTEND] ',
  solver: '[SOLVER]    ',
  parser: '[PARSER]    ',
};

const args = process.argv.slice(2);
const skipSolver = args.includes('--no-solver');
const skipParser = args.includes('--no-parser');
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

function resolveVenvPython(pkgDir) {
  const candidates =
    process.platform === 'win32'
      ? [
          resolve(root, pkgDir, '.venv', 'Scripts', 'python.exe'),
          resolve(root, pkgDir, 'venv', 'Scripts', 'python.exe'),
        ]
      : [
          resolve(root, pkgDir, '.venv', 'bin', 'python'),
          resolve(root, pkgDir, 'venv', 'bin', 'python'),
        ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const solverPython = resolveVenvPython('packages/solver-service');
const parserPython = resolveVenvPython('packages/prospectus-parser');

const services = [
  {
    name: 'solver',
    cwd: resolve(root, 'packages', 'solver-service'),
    command: solverPython ?? 'python',
    args: ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'],
    skip: skipSolver,
    missing: solverPython ? null : 'packages/solver-service/.venv not found',
    shellWrapper: false,
    readyMarker: 'Uvicorn running on',
    url: 'http://localhost:8000',
    boxLabel: 'Solver  ',
  },
  {
    name: 'parser',
    cwd: resolve(root, 'packages', 'prospectus-parser'),
    command: parserPython ?? 'python',
    args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8001'],
    skip: skipParser,
    missing: parserPython ? null : 'packages/prospectus-parser/.venv not found',
    shellWrapper: false,
    readyMarker: 'Uvicorn running on',
    url: 'http://localhost:8001',
    boxLabel: 'Parser  ',
  },
  {
    name: 'frontend',
    cwd: root,
    command: 'pnpm',
    args: ['--filter', '@coe-nnect/frontend', 'dev'],
    shellWrapper: true,
    readyMarker: 'Local:',
    url: 'http://localhost:5173/',
    boxLabel: 'Frontend',
  },
  {
    name: 'backend',
    cwd: root,
    command: 'pnpm',
    args: ['--filter', '@coe-nnect/backend', 'dev'],
    shellWrapper: true,
    readyMarker: 'Backend running on port',
    url: 'http://localhost:3000/api',
    boxLabel: 'Backend ',
  },
];

const visible = services.filter((s) => {
  if (only) return s.name === only;
  if (s.skip) return false;
  return true;
});

for (const s of visible) {
  if (s.missing) {
    console.warn(
      `${COLORS.solver}⚠ skipping ${s.name}: ${s.missing}` +
        ` — run "pnpm setup:venvs" first${COLORS.reset}`,
    );
  }
}

const runnable = visible.filter((s) => !s.missing);
if (runnable.length === 0) {
  console.error('No services to run. Check --only / --no-* flags.');
  process.exit(1);
}

const children = [];
const shell = process.platform === 'win32';

const NOISE_PATTERNS = [
  '[RouterExplorer]',
  '[RoutesResolver]',
  '[InstanceLoader]',
  'query: ',
  'query failed: ',
  'Starting compilation in watch mode',
  'Found 0 errors. Watching for file changes',
  '[DEP0190]',
  'node --trace-deprecation',
];

/**
 * Strip ANSI escape codes so `.includes()` works on the visible text.
 * Nest and Vite colorize log labels, which breaks naive substring matching.
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Boot tracking ──
const bootStart = Date.now();
const readyFlags = {};
for (const svc of runnable) {
  readyFlags[svc.name] = false;
}

let summaryPrinted = false;

function printSummary() {
  if (summaryPrinted) return;
  summaryPrinted = true;

  const elapsed = ((Date.now() - bootStart) / 1000).toFixed(1);

  const BOX_WIDTH = 58;
  const BOX = {
    tl: '╔', tr: '╗', bl: '╚', br: '╝',
    h: '═', v: '║', ml: '╠', mr: '╣',
  };

  function visibleLength(str) {
    return stripAnsi(str).length;
  }

  function padToWidth(colored, targetWidth) {
    const visible = visibleLength(colored);
    const pad = Math.max(0, targetWidth - visible);
    return colored + ' '.repeat(pad);
  }

  function boxRow(content) {
    return `${COLORS.box}${BOX.v}${COLORS.reset} ${padToWidth(content, BOX_WIDTH)} ${COLORS.box}${BOX.v}${COLORS.reset}`;
  }

  function boxBorder(left, right) {
    const inner = BOX.h.repeat(BOX_WIDTH + 2);
    return `${COLORS.box}${left}${inner}${right}${COLORS.reset}`;
  }

  const titleText = `All services ready in ${elapsed}s`;
  const titleWidth = visibleLength(titleText);
  const titlePadLeft = Math.floor((BOX_WIDTH - titleWidth) / 2);
  const titlePadRight = BOX_WIDTH - titleWidth - titlePadLeft;
  const titleRow =
    ' '.repeat(titlePadLeft) +
    `${COLORS.bold}${titleText}${COLORS.reset}` +
    ' '.repeat(titlePadRight);

  const serviceRows = runnable.map((svc) => {
    const color = COLORS[svc.name];
    const label = `${COLORS.bold}${color}${svc.boxLabel}${COLORS.reset}`;
    const url = `${COLORS.dim}${svc.url}${COLORS.reset}`;
    return `  ${label}   ${url}`;
  });

  const docsRow = runnable.find((s) => s.name === 'backend')
    ? `  ${COLORS.bold}${COLORS.backend}API Docs${COLORS.reset}   ${COLORS.dim}http://localhost:3000/api/docs${COLORS.reset}`
    : null;

  console.log('');
  console.log(boxBorder(BOX.tl, BOX.tr));
  console.log(boxRow(titleRow));
  console.log(boxBorder(BOX.ml, BOX.mr));
  for (const row of serviceRows) {
    console.log(boxRow(row));
  }
  if (docsRow) {
    console.log(boxRow(docsRow));
  }
  console.log(boxBorder(BOX.bl, BOX.br));
  console.log(`  ${COLORS.dim}Press Ctrl+C to stop all services${COLORS.reset}`);
  console.log('');
}

function checkAllReady() {
  const expected = runnable.map((s) => s.name);
  const ready = expected.filter((n) => readyFlags[n]);
  if (ready.length === expected.length) {
    setTimeout(printSummary, 400);
  }
}

function markReadyIfMatched(svc, line) {
  if (readyFlags[svc.name]) return;
  if (svc.readyMarker && stripAnsi(line).includes(svc.readyMarker)) {
    readyFlags[svc.name] = true;
    checkAllReady();
  }
}

function prefixStream(stream, svc) {
  const color = COLORS[svc.name];
  const label = LABELS[svc.name];
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      markReadyIfMatched(svc, line);
      const stripped = stripAnsi(line);
      if (NOISE_PATTERNS.some((p) => stripped.includes(p))) continue;
      process.stdout.write(`${color}${label}${COLORS.reset} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      markReadyIfMatched(svc, buffer);
      process.stdout.write(`${color}${label}${COLORS.reset} ${buffer}\n`);
    }
  });
}

for (const svc of runnable) {
  const child = spawn(svc.command, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  prefixStream(child.stdout, svc);
  prefixStream(child.stderr, svc);

  child.on('exit', (code, signal) => {
    const isCleanExit =
      signal === 'SIGTERM' ||
      signal === 'SIGINT' ||
      code === 0 ||
      code === -1073741510;
    if (!isCleanExit) {
      console.error(
        `${COLORS[svc.name]}${LABELS[svc.name]} exited with code ${code}${COLORS.reset}`,
      );
    }
  });

  children.push({ name: svc.name, child, shellWrapper: svc.shellWrapper });
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${COLORS.backend}Shutting down all services…${COLORS.reset}`);

  for (const { child, shellWrapper } of children) {
    try {
      if (process.platform === 'win32') {
        const taskArgs = shellWrapper
          ? ['/pid', String(child.pid), '/T', '/F']
          : ['/pid', String(child.pid), '/T'];
        spawn('taskkill', taskArgs);
      } else {
        child.kill(shellWrapper ? 'SIGKILL' : 'SIGINT');
      }
    } catch {
      /* ignore */
    }
  }

  setTimeout(() => {
    for (const { child } of children) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => process.exit(0), 300);
  }, 2000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => shutdown('SIGINT'));

console.log(
  `\n${COLORS.backend}▶ Starting ${runnable.length} services: ${runnable
    .map((s) => s.name)
    .join(', ')}${COLORS.reset}\n`,
);