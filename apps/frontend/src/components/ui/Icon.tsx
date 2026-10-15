import clsx from 'clsx';

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