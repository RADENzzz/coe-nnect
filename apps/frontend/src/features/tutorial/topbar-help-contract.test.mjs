import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('PageHelpButton exposes the page-help tour target', () => {
  assert.ok(
    source('../help/components/PageHelpButton.tsx').includes('data-tour="page-help"'),
    'PageHelpButton must expose data-tour="page-help"',
  );
});

test('TutorialLauncher no longer renders a separate tutorial-help button', () => {
  assert.ok(
    !source('./TutorialLauncher.tsx').includes('data-tour="tutorial-help"'),
    'TutorialLauncher must not render a data-tour="tutorial-help" button',
  );
});

test('the welcome tour targets the page-help control', () => {
  assert.ok(
    source('./tours.ts').includes('target: \'[data-tour="page-help"]\''),
    'The welcome tour must target [data-tour="page-help"]',
  );
});
