import { useId, useMemo } from 'react';
import clsx from 'clsx';
import cetLogoSvg from '../../assets/brand/cet-logo.svg?raw';
import cetMarkSvg from '../../assets/brand/cet-mark.svg?raw';
import { useMotionEnabled } from '../../hooks/use-motion-enabled';

type CetLogoProps = {
  /** Full circular badge or the compact octagon mark. */
  variant?: 'full' | 'mark';
  className?: string;
  /** Turn off the entrance animation for a specific placement. */
  animated?: boolean;
  /** Accessible name. Omit for decorative logos that sit beside text. */
  label?: string;
};

/**
 * The College of Engineering and Technology badge, inlined so its ring,
 * octagon, and arrows can be animated independently. The raw SVG keeps the
 * artwork in one place; ids are namespaced per instance to avoid collisions.
 */
export default function CetLogo({
  variant = 'full',
  className,
  animated = true,
  label,
}: CetLogoProps) {
  const motion = useMotionEnabled();
  const reactId = useId();
  const uid = reactId.replace(/[^a-zA-Z0-9_-]/g, '');

  const markup = useMemo(() => {
    let svg = variant === 'mark' ? cetMarkSvg : cetLogoSvg;

    // The inline SVG is decorative; the wrapper carries the accessible name.
    svg = svg.replace(
      /\s+role="img"\s+aria-labelledby="[^"]*"/,
      ' aria-hidden="true" focusable="false"',
    );

    // Namespace every id and fragment reference for this instance.
    svg = svg.replace(/\bid="cet-/g, `id="${uid}-cet-`);
    svg = svg.replace(/\bhref="#cet-/g, `href="#${uid}-cet-`);

    return svg;
  }, [uid, variant]);

  return (
    <span
      className={clsx(
        'cet-logo inline-flex shrink-0',
        variant === 'mark' ? 'cet-logo--mark' : 'cet-logo--full',
        motion && animated && 'cet-logo--animate',
        className,
      )}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
