import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');
const stylesheet = postcss.parse(css);
const expectedSelectors = [
  'html.theme-transition body',
  'html.theme-transition .app-shell',
  'html.theme-transition .app-sidebar',
  'html.theme-transition .app-shell > div > header',
  'html.theme-transition .app-shell > div > main',
];

function findTransitionRule(root, parentAtRuleName) {
  let match;
  root.walkRules((rule) => {
    const expectedParent = parentAtRuleName
      ? rule.parent.type === 'atrule' && rule.parent.name === parentAtRuleName
      : rule.parent.type === 'root';
    if (
      rule.selectors?.includes('html.theme-transition .app-shell') &&
      expectedParent
    ) {
      match = rule;
    }
  });
  return match;
}

test('theme transition is limited to the main app surfaces', () => {
  const rule = findTransitionRule(stylesheet);

  assert.ok(rule, 'expected a scoped theme transition rule');
  assert.deepEqual([...rule.selectors].sort(), [...expectedSelectors].sort());

  const declarations = new Map(
    rule.nodes
      .filter((node) => node.type === 'decl')
      .map((node) => [node.prop, node.value]),
  );
  assert.equal(declarations.get('transition-duration'), '120ms');
});

test('reduced-motion users do not receive a theme transition', () => {
  let reducedMotionRule;
  stylesheet.walkAtRules('media', (atRule) => {
    if (atRule.params === '(prefers-reduced-motion: reduce)') {
      reducedMotionRule ??= findTransitionRule(atRule, 'media');
    }
  });

  assert.ok(reducedMotionRule, 'expected a reduced-motion theme rule');
  assert.deepEqual(
    [...reducedMotionRule.selectors].sort(),
    [...expectedSelectors].sort(),
  );
  assert.equal(
    reducedMotionRule.nodes.find((node) => node.prop === 'transition')?.value,
    'none',
  );
});
