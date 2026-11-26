import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as modalBackdrop from './modal-backdrop.ts';

test('modal backdrop defers blur to the glass theme', () => {
  const getClassName = Reflect.get(modalBackdrop, 'getModalBackdropClassName');
  assert.equal(typeof getClassName, 'function');
  if (typeof getClassName !== 'function') return;

  const className = Reflect.apply(getClassName, null, []);
  assert.match(className, /absolute inset-0 bg-black\/60/);
  assert.match(className, /animate-backdrop-in/);
  assert.match(className, /overlay-backdrop-blur-sm/);
  assert.doesNotMatch(className, /(?:^|\s)backdrop-blur-/);

  const css = readFileSync(
    new URL('../../styles/globals.css', import.meta.url),
    'utf8',
  );
  const rules = [
    ['html.glass .overlay-backdrop-blur-xs', '2px'],
    ['html.glass .overlay-backdrop-blur-sm', '4px'],
  ] as const;

  for (const [selector, amount] of rules) {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} must exist`);
    const rule = css.slice(start, css.indexOf('}', start));
    assert.match(
      rule,
      new RegExp(`-webkit-backdrop-filter:\\s*blur\\(${amount}\\)`),
    );
    assert.match(
      rule,
      new RegExp(`(?:^|[\\s;])backdrop-filter:\\s*blur\\(${amount}\\)`),
    );
  }
});
