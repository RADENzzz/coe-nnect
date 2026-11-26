import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOUND_PREFERENCES, getSoundPreferences, setSoundPreferences } from './sound.ts';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  clear() { this.map.clear(); }
}

test('feedback sound defaults on and persists off', () => {
  (globalThis as any).localStorage = new MemoryStorage();
  assert.equal(getSoundPreferences().feedback, true);

  setSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, feedback: false });
  assert.equal(getSoundPreferences().feedback, false);
});

test('stored preferences without feedback keep the default', () => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).localStorage.setItem(
    'coe-nnect:sound-preferences',
    JSON.stringify({ notifications: true, chat: false, volume: 0.4 }),
  );
  const prefs = getSoundPreferences();
  assert.equal(prefs.feedback, true);
  assert.equal(prefs.chat, false);
  assert.equal(prefs.volume, 0.4);
});
