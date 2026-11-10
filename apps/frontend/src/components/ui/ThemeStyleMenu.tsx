import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  useAppearanceStore,
} from '../../store/appearance.store';

/**
 * Landing-page theme style picker.
 *
 * Sits next to the light/dark toggle and switches the brand accent without
 * touching the theme mode. Every preset is a full accent skin: the runtime
 * token map derives the tints, the dark-mode accent, and the browser chrome
 * from the chosen hex.
 */
export default function ThemeStyleMenu() {
  const accent = useAppearanceStore((s) => s.appearance.accent);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = ACCENT_PRESETS.find(
    (preset) => preset.hex.toLowerCase() === accent.toLowerCase(),
  );

  const pick = (hex: string) => {
    setAccent(hex);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Theme style"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? `Theme style: ${active.name}` : 'Theme style'}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface-variant transition hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Icon name="palette" size={20} />
        <span
          className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-surface"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme style"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-outline-variant bg-surface p-3 shadow-xl"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Theme style
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">
            Switches the accent for the whole app. Dark mode stays on its own
            toggle.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {ACCENT_PRESETS.map((preset) => {
              const isActive =
                preset.hex.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => pick(preset.hex)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${
                    isActive
                      ? 'border-primary bg-primary/5 text-on-surface'
                      : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: preset.hex }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{preset.name}</span>
                  {isActive && (
                    <Icon
                      name="check"
                      size={12}
                      className="ml-auto shrink-0 text-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {accent.toLowerCase() !== DEFAULT_APPEARANCE.accent && (
            <button
              type="button"
              onClick={() => pick(DEFAULT_APPEARANCE.accent)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-outline-variant px-2 py-1.5 text-[11px] font-semibold text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-surface"
            >
              <Icon name="restart_alt" size={13} />
              Reset to CoE Maroon
            </button>
          )}
        </div>
      )}
    </div>
  );
}
