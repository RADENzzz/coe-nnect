/**
 * Lightweight UI sounds synthesised with the Web Audio API.
 *
 * No audio files means no network round-trip and no binary assets. Browsers
 * only allow audio after a user gesture, so AppShell installs one-time unlock
 * listeners and every play attempt also resumes a suspended context.
 */

export type SoundKind = 'notification' | 'chat';

export interface SoundPreferences {
  notifications: boolean;
  chat: boolean;
  /** 0–1 */
  volume: number;
}

const STORAGE_KEY = 'coe-nnect:sound-preferences';

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  notifications: true,
  chat: true,
  volume: 0.7,
};

let audioContext: AudioContext | null = null;

function clampVolume(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function getSoundPreferences(): SoundPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_SOUND_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
    return {
      notifications: parsed.notifications !== false,
      chat: parsed.chat !== false,
      volume: clampVolume(
        parsed.volume,
        DEFAULT_SOUND_PREFERENCES.volume,
      ),
    };
  } catch {
    return DEFAULT_SOUND_PREFERENCES;
  }
}

export function setSoundPreferences(preferences: SoundPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        notifications: !!preferences.notifications,
        chat: !!preferences.chat,
        volume: clampVolume(
          preferences.volume,
          DEFAULT_SOUND_PREFERENCES.volume,
        ),
      }),
    );
  } catch {
    /* storage disabled — keep the in-memory UI state */
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;

  const Ctor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) return null;

  try {
    audioContext = new Ctor();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Resume the audio context on the first pointer/keyboard interaction.
 * Returns a cleanup function.
 */
export function installSoundUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        /* still blocked until the next gesture */
      });
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function tone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  peak: number,
): void {
  if (peak <= 0) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const safePeak = Math.max(0.0001, peak);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, at);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(safePeak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function play(kind: SoundKind, force: boolean): void {
  const preferences = getSoundPreferences();
  const enabled =
    kind === 'notification' ? preferences.notifications : preferences.chat;
  if (!force && !enabled) return;
  if (preferences.volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      /* gesture still required */
    });
  }

  const now = ctx.currentTime + 0.015;
  const volume = preferences.volume;

  try {
    if (kind === 'notification') {
      // A soft ascending two-note chime.
      tone(ctx, now, 880, 0.34, 0.18 * volume);
      tone(ctx, now + 0.12, 1318.51, 0.42, 0.16 * volume);
    } else {
      // A shorter, lower two-note pop for chat.
      tone(ctx, now, 740, 0.1, 0.13 * volume);
      tone(ctx, now + 0.08, 587.33, 0.14, 0.11 * volume);
    }
  } catch {
    /* audio unavailable */
  }
}

export function playNotificationSound(): void {
  play('notification', false);
}

export function playChatSound(): void {
  play('chat', false);
}

/** Preview a sound from the settings UI, even while it is toggled off. */
export function previewSound(kind: SoundKind): void {
  play(kind, true);
}
