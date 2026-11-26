import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const targets = [
  './BottomSheet.tsx',
  '../../features/auth/LoginPage.tsx',
  '../../features/auth/components/SystemStatusBanner.tsx',
  '../../features/timetable/components/ScheduleDetailDrawer.tsx',
] as const;

const marker = 'overlay-backdrop-blur-xs';

// Only full-viewport scrim lines: className begins with fixed/absolute inset-0
// and carries a translucent background tint.
const scrimLines = (source: string): string[] =>
  source
    .split(/\r?\n/)
    .filter(
      (line) =>
        /className=\{?["'`](?:fixed|absolute) inset-0\b/.test(line) &&
        /bg-(?:black|slate-900|white)\//.test(line),
    );

const literalBlur = /(?:^|[\s"'`])backdrop-blur-/;

test('sheet and dialog scrims defer blur to the glass theme', () => {
  for (const relativePath of targets) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const scrims = scrimLines(source);
    assert.equal(scrims.length, 1, `${relativePath} must have one scrim`);
    for (const line of scrims) {
      assert.ok(line.includes(marker), `${relativePath}: ${marker} missing from scrim: ${line}`);
      assert.doesNotMatch(line, literalBlur);
      assert.match(line, /bg-black\//);
      assert.match(line, /animate-backdrop-in/);
    }
  }
});
