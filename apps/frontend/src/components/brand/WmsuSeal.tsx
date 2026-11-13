import clsx from 'clsx';
import wmsuSeal from '../../assets/brand/wmsu-seal.svg';
import { useMotionEnabled } from '../../hooks/use-motion-enabled';

type WmsuSealProps = {
  className?: string;
  /** Turn off the seal-stamp entrance for a specific placement. */
  animated?: boolean;
  /** Accessible name. Omit for decorative seals that sit beside text. */
  label?: string;
};

/**
 * The official WMSU seal. The vector is loaded as an image because its 164
 * paths are far heavier than the rest of the brand lockup; the wrapper handles
 * the stamp-in and gentle float so the seal still feels alive.
 */
export default function WmsuSeal({
  className,
  animated = true,
  label,
}: WmsuSealProps) {
  const motion = useMotionEnabled();

  return (
    <span
      className={clsx(
        'wmsu-seal inline-flex shrink-0',
        motion && animated && 'wmsu-seal--animate',
        className,
      )}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img
        src={wmsuSeal}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
