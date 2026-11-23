import test from 'node:test';
import assert from 'node:assert/strict';

import * as modalBackdrop from './modal-backdrop.ts';

test('modal backdrop can dim without blurring the content behind it', () => {
  const getClassName = Reflect.get(modalBackdrop, 'getModalBackdropClassName');

  assert.equal(typeof getClassName, 'function');
  if (typeof getClassName !== 'function') return;

  const blurred = Reflect.apply(getClassName, null, [true]);
  const unblurred = Reflect.apply(getClassName, null, [false]);

  assert.match(blurred, /backdrop-blur-sm/);
  assert.match(unblurred, /bg-black\/60/);
  assert.equal(unblurred.includes('backdrop-blur-sm'), false);
});
