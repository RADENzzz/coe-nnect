import clsx from 'clsx';
import type { CSSProperties } from 'react';

import { ANIMATED_ICONS } from '../icons/icon-map';

interface IconProps {
  name: string;
  /** Material Symbols weight: 100–700. */
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  /** Fill style (Material Symbols). */
  filled?: boolean;
  className?: string;
  /** Font size in px. */
  size?: number;
  /** Convenience color mapping to Tailwind text-* utilities. */
  color?: 'primary' | 'muted' | 'danger' | 'success' | 'warning' | 'inherit';
  /** Spin continuously (for loaders). */
  spin?: boolean;
  /** When provided, the icon becomes meaningful to AT. */
  label?: string;
  /** Native tooltip. */
  title?: string;
}

const COLOR_CLASSES: Record<NonNullable<IconProps['color']>, string> = {
  primary: 'text-primary',
  muted: 'text-slate-400',
  danger: 'text-red-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  inherit: '',
};

/** Material Symbols weight → Lucide stroke width (400 matches Lucide's default). */
const STROKE_BY_WEIGHT: Record<NonNullable<IconProps['weight']>, number> = {
  100: 1.25,
  200: 1.5,
  300: 1.75,
  400: 2,
  500: 2.25,
  600: 2.5,
  700: 2.75,
};

/**
 * Icon renders an animated icon from lucide-animated.com when the name is
 * mapped in `icon-map.ts`, and otherwise falls back to the Material Symbols
 * font. Both branches keep the same public API and the same font-size
 * inheritance, so callers do not need to change.
 */
export default function Icon({
  name,
  weight,
  filled,
  className,
  size,
  color,
  spin,
  label,
  title,
}: IconProps) {
  // If a label is provided, expose it to AT; else mark decorative.
  const a11yProps = label
    ? { role: 'img' as const, 'aria-label': label, title: title ?? label }
    : { 'aria-hidden': true as const, title };

  const Animated = ANIMATED_ICONS[name];

  if (Animated) {
    const style: CSSProperties = {};
    if (size) style.fontSize = `${size}px`;
    // `filled` has no Lucide equivalent; thicken the stroke so active and
    // emphasis states still read as heavier, like Material Symbols fill.
    const strokeWidth =
      weight != null ? STROKE_BY_WEIGHT[weight] : filled ? 2.5 : undefined;
    if (strokeWidth != null) style.strokeWidth = strokeWidth;

    return (
      <span
        className={clsx(
          'icon-animated inline-flex items-center justify-center align-middle leading-none',
          spin && 'animate-spin',
          color && COLOR_CLASSES[color],
          className,
        )}
        style={Object.keys(style).length > 0 ? style : undefined}
        {...a11yProps}
      >
        <Animated />
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'material-symbols-outlined inline-flex items-center justify-center align-middle leading-none',
        filled && 'icon-fill-1',
        weight != null && `icon-weight-${weight}`,
        spin && 'animate-spin',
        color && COLOR_CLASSES[color],
        className,
      )}
      style={size ? { fontSize: `${size}px` } : undefined}
      {...a11yProps}
    >
      {name}
    </span>
  );
}
