import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const STORAGE_KEY = 'coe-nnect:appearance';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function installStorage(storage: StorageLike) {
  (globalThis as { localStorage?: StorageLike }).localStorage = storage;
}

async function freshAppearanceStore(storage: StorageLike = memoryStorage()) {
  installStorage(storage);
  const tag = `${Date.now()}-${Math.random()}`;
  return import(`./appearance.store.ts?test=${tag}`);
}

test('fresh browsers keep the sidebar scroll default', async () => {
  const { DEFAULT_APPEARANCE } = await freshAppearanceStore();
  assert.equal(DEFAULT_APPEARANCE.sidebarFitAllContent, false);
});

test('old appearance JSON without the new key keeps scrolling', async () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ accent: '#a16207', glass: true }),
  });
  const { useAppearanceStore } = await freshAppearanceStore(storage);
  assert.equal(
    useAppearanceStore.getState().appearance.sidebarFitAllContent,
    false,
  );
});

test('stored fit preference is restored', async () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ sidebarFitAllContent: true }),
  });
  const { useAppearanceStore } = await freshAppearanceStore(storage);
  assert.equal(
    useAppearanceStore.getState().appearance.sidebarFitAllContent,
    true,
  );
});

test('setter persists the fit preference and reset preserves non-colour preferences', async () => {
  const storage = memoryStorage();
  const { useAppearanceStore } = await freshAppearanceStore(storage);

  useAppearanceStore.getState().setSidebarFitAllContent(true);
  useAppearanceStore.getState().setGlass(true);
  useAppearanceStore.getState().setShow3dBuilding(false);
  useAppearanceStore.getState().setAccent('#a16207');
  useAppearanceStore.getState().resetAppearance();

  const state = useAppearanceStore.getState().appearance;
  assert.equal(state.sidebarFitAllContent, true);
  assert.equal(state.glass, true);
  assert.equal(state.show3dBuilding, false);
  assert.equal(
    JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').sidebarFitAllContent,
    true,
  );
});

test('applyAppearance toggles the root fit class', () => {
  const source = readFileSync(
    new URL('./appearance.store.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /classList\.toggle\(\s*['"]sidebar-fit-all['"]\s*,\s*a\.sidebarFitAllContent\s*\)/,
  );
});

test('appearance settings exposes the labelled sidebar fit switch', () => {
  const settings = readFileSync(
    new URL(
      '../features/settings/components/AppearanceSettingsTab.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(settings, /title="Sidebar"/);
  assert.match(settings, /Fit all sidebar links/);
  assert.match(settings, /aria-label="Fit all sidebar links"/);
  assert.match(settings, /checked=\{appearance\.sidebarFitAllContent\}/);
  assert.match(settings, /setSidebarFitAllContent\(e\.target\.checked\)/);
  assert.match(settings, /short windows/i);
});

test('sidebar keeps its tour hook and exposes compact CSS hooks', () => {
  const sidebar = readFileSync(
    new URL('../components/layout/Sidebar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(sidebar, /data-tour="sidebar"/);
  assert.match(sidebar, /handleTogglePin/);
  assert.match(sidebar, /filterNavByRole/);
  assert.match(sidebar, /resolveActiveNavPath/);
  assert.match(sidebar, /app-sidebar__brand/);
  assert.match(sidebar, /app-sidebar__logo/);
  assert.match(sidebar, /app-sidebar__main-nav/);
  assert.match(sidebar, /app-sidebar__footer/);
});

test('fit mode removes inner scroll on normal heights and restores it on short windows', () => {
  const css = readFileSync(
    new URL('../styles/globals.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /Sidebar fit-all/);
  assert.match(css, /@media \(min-height:\s*600px\)/);
  assert.match(
    css,
    /html\.sidebar-fit-all\s+\.app-sidebar\s+\.app-sidebar__main-nav/,
  );
  assert.match(css, /overflow:\s*visible/);
  assert.match(css, /@media \(max-height:\s*599px\)/);
  assert.match(css, /overflow-y:\s*auto/);
});
