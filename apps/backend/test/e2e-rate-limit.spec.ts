import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

describe('E2E rate-limit contract', () => {
  it('gives the browser suite global throttle headroom', () => {
    const playwrightConfig = read('e2e', 'playwright.config.ts');
    const override = playwrightConfig.match(/^\s*THROTTLE_LIMIT:\s*'(\d+)'/m);

    assert.ok(
      override,
      'playwright webServerEnv must override THROTTLE_LIMIT for the browser suite',
    );
    assert.ok(
      Number(override[1]) > 300,
      `E2E throttle limit ${override[1]} must exceed the 300 requests/minute production default`,
    );
  });

  it('keeps the production global throttle default at 300', () => {
    const rateLimitConfig = read(
      'apps',
      'backend',
      'src',
      'config',
      'rate-limit.config.ts',
    );

    assert.match(
      rateLimitConfig,
      /env\.THROTTLE_LIMIT,\s*300/,
      'the production global throttle default must stay at 300',
    );
  });
});
