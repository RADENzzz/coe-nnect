import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '../../../components/ui/Icon';
import { useThemeStore } from '../../../store/theme.store';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  SURFACE_TINTS,
  useAppearanceStore,
  type SurfaceTint,
} from '../../../store/appearance.store';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Uploaded images are drawn into a square canvas — never distorted. */
const LOGO_OUTPUT_SIZE = 256;
const LOGO_MAX_BYTES = 10 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/**
 * Fits any image into a 1:1 transparent canvas (letterboxed, not cropped)
 * and returns a compact data URL that fits comfortably in localStorage.
 */
async function toSquareDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, SVG, WebP…).');
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error('That image is larger than 10 MB. Please pick a smaller file.');
  }

  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('That image has no usable pixels.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = LOGO_OUTPUT_SIZE;
  canvas.height = LOGO_OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process that image.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.min(
    LOGO_OUTPUT_SIZE / img.naturalWidth,
    LOGO_OUTPUT_SIZE / img.naturalHeight,
  );
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  ctx.drawImage(
    img,
    Math.round((LOGO_OUTPUT_SIZE - width) / 2),
    Math.round((LOGO_OUTPUT_SIZE - height) / 2),
    width,
    height,
  );

  // WebP keeps transparency and is much smaller; browsers without it fall
  // back to PNG automatically.
  return canvas.toDataURL('image/webp', 0.92);
}

export default function AppearanceSettingsTab() {
  const appearance = useAppearanceStore((s) => s.appearance);
  const logo = useAppearanceStore((s) => s.logo);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const setSurfaceTint = useAppearanceStore((s) => s.setSurfaceTint);
  const resetAppearance = useAppearanceStore((s) => s.resetAppearance);
  const setLogo = useAppearanceStore((s) => s.setLogo);
  const theme = useThemeStore((s) => s.theme);

  const [hexDraft, setHexDraft] = useState(appearance.accent);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHexDraft(appearance.accent);
  }, [appearance.accent]);

  const isDefault =
    appearance.accent === DEFAULT_APPEARANCE.accent &&
    appearance.surfaceTint === 'default';

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    if (HEX_RE.test(value.trim())) setAccent(value.trim());
  };

  const commitHex = () => {
    const value = hexDraft.trim();
    if (!HEX_RE.test(value)) setHexDraft(appearance.accent);
    else setAccent(value);
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      const dataUrl = await toSquareDataUrl(file);
      setLogo(dataUrl);
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Could not process that image.',
      );
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Appearance</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Personalise the colours and branding. Changes apply instantly and
            work in both light and dark mode.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAppearance}
          disabled={isDefault}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-variant text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="restart_alt" size={15} />
          Reset colours
        </button>
      </div>

      {/* ── Accent colour ── */}
      <Section
        title="Accent colour"
        description="Used for buttons, links, active navigation and highlights."
        icon="tune"
      >
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((preset) => {
            const selected =
              appearance.accent.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setAccent(preset.hex)}
                aria-pressed={selected}
                title={preset.name}
                className={`group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? 'border-primary bg-primary/5 text-on-surface'
                    : 'border-surface-variant text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-low'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full ring-1 ring-black/10 shrink-0"
                  style={{ backgroundColor: preset.hex }}
                />
                {preset.name}
                {selected && <Icon name="check" size={13} className="text-primary" />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-surface-variant px-3 py-2 text-xs font-semibold text-on-surface-variant">
            <input
              type="color"
              value={appearance.accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label="Pick a custom accent colour"
            />
            Custom
          </label>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-on-surface-variant font-mono">HEX</span>
            <input
              type="text"
              value={hexDraft}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitHex();
              }}
              spellCheck={false}
              maxLength={7}
              aria-label="Accent colour hex code"
              className="w-28 rounded-lg border border-surface-variant bg-surface-container-lowest px-2.5 py-2 text-xs font-mono uppercase text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      </Section>

      {/* ── Page background ── */}
      <Section
        title="Page background"
        description="A subtle tone behind cards and tables, in both themes."
        icon="grid_on"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {SURFACE_TINTS.map((tint) => {
            const selected = appearance.surfaceTint === tint.key;
            return (
              <button
                key={tint.key}
                type="button"
                onClick={() => setSurfaceTint(tint.key as SurfaceTint)}
                aria-pressed={selected}
                className={`rounded-xl border p-2.5 text-left transition ${
                  selected
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-surface-variant hover:border-primary/40'
                }`}
              >
                <span
                  className="mb-2 flex h-10 w-full items-center justify-center rounded-md ring-1 ring-black/5"
                  style={{
                    background: `linear-gradient(135deg, ${tint.swatchLight} 0 50%, ${tint.swatchDark} 50% 100%)`,
                  }}
                >
                  {selected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </span>
                <span className="block text-xs font-semibold text-on-surface">
                  {tint.label}
                </span>
                <span className="block text-[10px] text-on-surface-variant">
                  {tint.description}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Preview ── */}
      <Section
        title="Live preview"
        description="The same accent and background in both themes."
        icon="visibility"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PreviewPane mode="light" current={theme === 'light'} />
          <PreviewPane mode="dark" current={theme === 'dark'} />
        </div>
      </Section>

      {/* ── Sidebar logo ── */}
      <Section
        title="Sidebar logo"
        description="Replaces the graduation-cap icon next to “CoE-NNECT”."
        icon="upload"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-black/10"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            {logo ? (
              <img
                src={logo}
                alt="Current sidebar logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <Icon name="school" filled className="text-white" size={30} />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-[200px]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90 disabled:opacity-50"
              >
                <Icon
                  name={logoBusy ? 'progress_activity' : 'upload'}
                  size={15}
                  className={logoBusy ? 'animate-spin' : undefined}
                />
                {logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {logo && (
                <button
                  type="button"
                  onClick={() => {
                    setLogo(null);
                    setLogoError(null);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-variant px-3.5 py-2 text-xs font-semibold text-on-surface-variant transition hover:text-on-surface hover:bg-surface-container-low"
                >
                  <Icon name="delete" size={15} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Any image size works. It is fitted into a square (1:1) at{' '}
              {LOGO_OUTPUT_SIZE}&times;{LOGO_OUTPUT_SIZE}px — nothing is
              stretched, and transparent PNGs keep their transparency.
            </p>
            {logoError && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                <Icon name="error" size={13} />
                {logoError}
              </p>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so picking the same file twice still fires onChange.
              e.target.value = '';
              void handleLogoPick(file);
            }}
          />
        </div>
      </Section>

      <p className="text-[11px] text-on-surface-variant">
        Appearance preferences are stored in this browser. They do not change
        other users’ screens.
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-surface-variant bg-surface p-4 md:p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
          {description && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * A miniature of the real shell. It uses the token utilities so the
 * injected `html .light` / `html .dark` variable scopes drive it, meaning
 * both previews are accurate at the same time regardless of the active
 * theme.
 */
function PreviewPane({
  mode,
  current,
}: {
  mode: 'light' | 'dark';
  current: boolean;
}) {
  return (
    <div className={mode === 'dark' ? 'dark' : 'light'}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          {mode === 'dark' ? 'Dark' : 'Light'}
        </span>
        {current && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Active
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-background text-on-background shadow-sm">
        <div className="flex h-[186px]">
          {/* Rail */}
          <div
            className="flex w-[86px] shrink-0 flex-col gap-1.5 p-2.5"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <div className="h-5 w-5 rounded bg-white/20" />
              <div className="h-1.5 w-7 rounded-full bg-white/70" />
            </div>
            <div
              className="flex h-5 items-center gap-1 rounded px-1.5"
              style={{ backgroundColor: '#fff' }}
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: 'rgb(var(--sidebar-active-fg))' }}
              />
              <div
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: 'rgb(var(--sidebar-active-fg))' }}
              />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex h-4 items-center gap-1 px-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <div className="h-1 w-9 rounded-full bg-white/30" />
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div className="h-2 w-16 rounded-full bg-on-surface/70" />
              <div className="h-4 w-4 rounded-full bg-on-surface/15" />
            </div>

            <div className="rounded-lg border border-outline-variant bg-surface p-2">
              <div className="mb-1.5 h-1.5 w-10 rounded-full bg-on-surface/60" />
              <div className="mb-2 h-1.5 w-20 rounded-full bg-on-surface/20" />
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-5 items-center rounded px-2 text-[8px] font-bold"
                  style={{
                    backgroundColor: 'rgb(var(--primary))',
                    color: '#fff',
                  }}
                >
                  Save
                </span>
                <span
                  className="flex h-5 items-center rounded border px-2 text-[8px] font-bold"
                  style={{
                    borderColor: 'rgb(var(--primary))',
                    color: 'rgb(var(--primary))',
                  }}
                >
                  Cancel
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[8px] font-bold"
                style={{
                  backgroundColor: 'rgb(var(--primary) / 0.12)',
                  color: 'rgb(var(--primary))',
                }}
              >
                Active
              </span>
              <div className="h-1.5 w-8 rounded-full bg-on-surface/15" />
              <div className="h-1.5 w-6 rounded-full bg-on-surface/10" />
            </div>

            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-on-surface/10" />
              <div className="h-1.5 w-4/5 rounded-full bg-on-surface/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
