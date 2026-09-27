import clsx from 'clsx';

interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
}

export default function Icon({ name, filled, className, size }: IconProps) {
  return (
    <span
      className={clsx(
        'material-symbols-outlined',
        filled && 'icon-fill-1',
        className,
      )}
      style={size ? { fontSize: `${size}px` } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}