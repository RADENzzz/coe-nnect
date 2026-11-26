import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const KEYS = {
  loading: 'coe-nnect:loading-animations',
  text: 'coe-nnect:text-loading-animations',
  intro: 'coe-nnect:landing-intro-animations',
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function installStorage(storage: StorageLike) {
  (globalThis as { localStorage?: StorageLike }).localStorage = storage;
}

async function freshMotionStore(storage: StorageLike = memoryStorage()) {
  installStorage(storage);
  const tag = `${Date.now()}-${Math.random()}`;
  return import(`./motion.store.ts?test=${tag}`);
}

test('fresh browsers start with text off, numbers off, and the landing intro on', async () => {
  const { useMotionStore } = await freshMotionStore();
  const state = useMotionStore.getState();

  assert.equal(state.loadingAnimations, false);
  assert.equal(state.textLoadingAnimations, false);
  assert.equal(state.landingIntroAnimations, true);
});

test('stored preferences are read independently', async () => {
  const storage = memoryStorage({
    [KEYS.loading]: 'true',
    [KEYS.text]: 'true',
    [KEYS.intro]: 'false',
  });
  const { useMotionStore } = await freshMotionStore(storage);
  const state = useMotionStore.getState();

  assert.equal(state.loadingAnimations, true);
  assert.equal(state.textLoadingAnimations, true);
  assert.equal(state.landingIntroAnimations, false);
});

test('storage failures keep the documented defaults', async () => {
  const blocked: StorageLike = {
    getItem() {
      throw new Error('storage blocked');
    },
    setItem() {
      throw new Error('storage blocked');
    },
  };
  const { useMotionStore } = await freshMotionStore(blocked);
  const state = useMotionStore.getState();

  assert.equal(state.loadingAnimations, false);
  assert.equal(state.textLoadingAnimations, false);
  assert.equal(state.landingIntroAnimations, true);
});

test('each setter writes only its own storage key', async () => {
  const storage = memoryStorage();
  const { useMotionStore } = await freshMotionStore(storage);

  useMotionStore.getState().setTextLoadingAnimations(true);
  assert.equal(storage.getItem(KEYS.text), 'true');
  assert.equal(storage.getItem(KEYS.loading), null);
  assert.equal(storage.getItem(KEYS.intro), null);
  assert.equal(useMotionStore.getState().textLoadingAnimations, true);

  useMotionStore.getState().setLandingIntroAnimations(false);
  assert.equal(storage.getItem(KEYS.intro), 'false');
  assert.equal(storage.getItem(KEYS.loading), null);
  assert.equal(useMotionStore.getState().landingIntroAnimations, false);
});

test('motion is allowed only when the preference is on and reduced motion is off', async () => {
  const { motionAllowed } = await freshMotionStore();

  assert.equal(motionAllowed(true, false), true);
  assert.equal(motionAllowed(true, true), false);
  assert.equal(motionAllowed(false, false), false);
  assert.equal(motionAllowed(false, true), false);
});

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('scramble text is wired to the text preference only', () => {
  const rolling = source('../components/ui/RollingValue.tsx');
  const scrambleBody = rolling.slice(
    rolling.indexOf('export function ScrambleText'),
    rolling.indexOf('/** Short text that trades places'),
  );

  assert.match(scrambleBody, /const animate = useTextMotionEnabled\(\)/);
  assert.doesNotMatch(scrambleBody, /useMotionEnabled\(\)/);
  assert.match(scrambleBody, /if \(!animate\) return loading \? '—' : target/);
});

test('appearance exposes three independent motion switches', () => {
  const settings = source(
    '../features/settings/components/AppearanceSettingsTab.tsx',
  );

  assert.match(
    settings,
    /const textLoadingAnimations = useMotionStore\(\(s\) => s\.textLoadingAnimations\)/,
  );
  assert.match(
    settings,
    /const landingIntroAnimations = useMotionStore\(\(s\) => s\.landingIntroAnimations\)/,
  );
  assert.match(settings, /setTextLoadingAnimations\(e\.target\.checked\)/);
  assert.match(settings, /setLandingIntroAnimations\(e\.target\.checked\)/);
  assert.match(settings, /aria-label="Enable text loading animations"/);
  assert.match(settings, /aria-label="Enable the landing intro"/);
  assert.match(settings, /Text loading animation/);
  assert.match(settings, /Landing intro/);
  assert.match(settings, /Off by default/);
  assert.match(settings, /On by default/);
  assert.match(settings, /aria-label="Enable loading animations"/);
  assert.doesNotMatch(settings, /text decodes into place/);
});

test('landing intro follows only the landing intro switch', () => {
  const intro = source('../features/landing/components/WmsuIntro.tsx');

  assert.match(
    intro,
    /import \{ useLandingIntroEnabled \} from '\.\.\/\.\.\/\.\.\/hooks\/use-motion-enabled'/,
  );
  assert.match(intro, /const motion = useLandingIntroEnabled\(\)/);
  assert.doesNotMatch(intro, /useMotionEnabled\(\)/);
});
