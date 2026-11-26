import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('feedback popup renders as one top-center portal item', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /createPortal\(/);
  assert.match(source, /fixed left-1\/2/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /feedback-sheen/);
  assert.match(source, /feedback-result-icon/);
  assert.doesNotMatch(source, /feedback-outline/);
  assert.doesNotMatch(source, /sm:right-6/);
});

test('feedback popup is width-capped with mobile margins', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /max-w-\[720px\]/);
  assert.match(source, /w-full/);
});

test('feedback popup clears the sticky shell top bar', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const css = read('apps/frontend/src/styles/globals.css');
  const shell = read('apps/frontend/src/components/layout/AppShell.tsx');
  const topBar = read('apps/frontend/src/components/layout/TopBar.tsx');

  // Public/auth routes keep the small top-3 offset from the portal itself.
  assert.match(source, /feedback-portal/);
  assert.match(source, /top-3/);
  assert.match(shell, /className="app-shell/);
  assert.match(topBar, /height: '48px'/);

  assert.match(css, /body:has\(\.app-shell\)\s+\.feedback-portal\s*\{/);
  const start = css.indexOf('body:has(.app-shell) .feedback-portal');
  const rule = css.slice(start, start + 240);
  // 48px sticky top bar + a 12px breathing gap.
  assert.match(rule, /top:\s*60px/);
});

test('feedback popup calls the right sounds', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /playSuccessSound\(\)/);
  assert.match(source, /playErrorSound\(\)/);
});

test('provider is mounted once at the app root', () => {
  const app = read('apps/frontend/src/App.tsx');
  const shell = read('apps/frontend/src/components/layout/AppShell.tsx');
  assert.match(app, /<FeedbackProvider>/);
  assert.doesNotMatch(shell, /<FeedbackProvider>/);
});

test('popup is a sharp tinted box, not a rounded white outline', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const meta = source.slice(
    source.indexOf('const VARIANT_META'),
    source.indexOf('const MIN_DURATION_MS'),
  );
  const banner = source.slice(
    source.indexOf('const bannerClass'),
    source.indexOf('const body'),
  );

  assert.match(banner, /border-2/);
  assert.match(banner, /meta\.toneClass/);
  assert.doesNotMatch(banner, /rounded-xl/);
  assert.doesNotMatch(banner, /bg-white/);
  assert.match(meta, /toneClass: 'text-emerald-600 border-emerald-500 bg-emerald-50'/);
  assert.match(meta, /toneClass: 'text-red-600 border-red-500 bg-red-50'/);
  assert.match(meta, /toneClass: 'text-red-700 border-red-600 bg-red-50'/);
  assert.match(source, /rounded-none/);
});

test('new feedback replaces the active popup instead of queueing it', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const becomeActive = source.slice(
    source.indexOf('const becomeActive'),
    source.indexOf('const push'),
  );
  const push = source.slice(source.indexOf('const push'), source.indexOf('const pauseTimer'));

  assert.match(becomeActive, /setPaused\(false\)/);
  assert.match(push, /becomeActive\(item\)/);
  assert.doesNotMatch(source, /queueRef/);
  assert.doesNotMatch(source, /updateQueue/);
  assert.doesNotMatch(source, /userId/);
});

test('sheen uses the active duration and pauses with the banner', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /'--feedback-duration': `\$\{item\.durationMs\}ms`/);
  assert.match(source, /const playState = paused \? 'paused' : 'running'/);
  const sheen = source.slice(
    source.indexOf('className="feedback-sheen'),
    source.indexOf('className="flex gap-3'),
  );
  const resultPath = source.slice(
    source.indexOf('className="feedback-result-path'),
    source.indexOf('</svg>', source.indexOf('className="feedback-result-path')),
  );
  assert.match(sheen, /animationPlayState: playState/);
  assert.match(resultPath, /animationPlayState: playState/);
  assert.match(source, /key=\{item\.id\}/);
  assert.match(source, /onMouseEnter=\{onBannerEnter\}/);
  assert.match(source, /onMouseLeave=\{onBannerLeave\}/);
});

test('success draws a check and error/failed draw an X', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const meta = source.slice(
    source.indexOf('const VARIANT_META'),
    source.indexOf('const MIN_DURATION_MS'),
  );
  const success = meta.slice(meta.indexOf('success:'), meta.indexOf('error:'));
  const error = meta.slice(meta.indexOf('error:'), meta.indexOf('failed:'));
  const failed = meta.slice(meta.indexOf('failed:'));

  assert.match(source, /M4 12\.5 9\.5 18 20 6\.5/);
  assert.match(source, /M5 5 19 19M19 5 5 19/);
  assert.match(success, /result: 'check'/);
  assert.match(success, /text-emerald-600/);
  assert.match(error, /result: 'cross'/);
  assert.match(error, /border-red-500/);
  assert.match(failed, /result: 'cross'/);
  assert.match(failed, /border-red-600/);
  assert.match(source, /aria-label="Dismiss message"/);
  assert.match(source, /<Icon name="close" size=\{14\}/);
});

test('sheen shrinks around the square edge over the active duration', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  const propertyStart = css.indexOf('@property --feedback-sheen-angle');
  const layerStart = css.indexOf('@layer utilities');
  assert.ok(propertyStart >= 0 && propertyStart < layerStart);

  assert.match(css, /@property --feedback-sheen-angle\s*\{/);
  assert.match(css, /@property --feedback-sheen-length\s*\{/);
  assert.match(css, /@keyframes feedback-sheen\s*\{/);
  assert.match(css, /--feedback-sheen-angle:\s*360deg;/);
  assert.match(css, /--feedback-sheen-length:\s*0deg;/);
  assert.match(css, /@supports \(color: color-mix\(in srgb, red 50%, white\)\)/);

  const start = css.indexOf('.feedback-sheen {');
  const rule = css.slice(start, start + 1100);
  assert.match(rule, /conic-gradient\(/);
  assert.match(rule, /var\(--feedback-sheen-angle\)/);
  assert.match(rule, /var\(--feedback-sheen-length\)/);
  assert.match(rule, /mask-composite:\s*exclude/);
  assert.match(css, /calc\(var\(--feedback-sheen-length\) \* 1\.08\)/);
  assert.doesNotMatch(css, /\+ 12deg/);
  assert.match(rule, /animation:\s*feedback-sheen var\(--feedback-duration, 6000ms\) linear forwards/);
  assert.doesNotMatch(css, /@keyframes feedback-outline-trace/);
  assert.doesNotMatch(css, /\.feedback-outline-progress\s*\{/);
});

test('reduced motion hides sheen and completes the icon', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  const start = css.indexOf(
    '@media (prefers-reduced-motion: reduce) {',
    css.indexOf('.feedback-result-path'),
  );
  assert.ok(start >= 0);
  const block = css.slice(start, start + 420);
  assert.match(block, /\.feedback-sheen\s*\{\s*display: none;/);
  assert.match(block, /\.feedback-result-path\s*\{[\s\S]*animation: none;/);
  assert.match(block, /\.feedback-result-path\s*\{[\s\S]*stroke-dashoffset: 0;/);
});

test('leaving the tab or window hides the popup', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /const hideOnAway = useCallback\(\(\) => \{/);
  assert.match(source, /clearTimer\(\);/);
  assert.match(source, /activeRef\.current = null;/);
  assert.match(source, /remainingRef\.current = 0;/);
  assert.match(source, /setPaused\(false\);/);
  assert.match(source, /setActive\(null\);/);
  assert.match(source, /window\.addEventListener\('blur', hideOnAway\)/);
  assert.match(source, /document\.addEventListener\('mouseleave', hideOnAway\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisibility\)/);

  const visibility = source.slice(
    source.indexOf('const onVisibility'),
    source.indexOf("document.addEventListener('visibilitychange'"),
  );
  assert.match(visibility, /document\.visibilityState === 'hidden'/);
  assert.match(visibility, /hideOnAway\(\)/);
  assert.doesNotMatch(visibility, /resumeTimer/);
  assert.doesNotMatch(source, /setPaused\(hidden\)/);
});
