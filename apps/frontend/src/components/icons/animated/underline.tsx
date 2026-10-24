import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import clsx from "clsx";

export interface UnderlineIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

type UnderlineIconProps = HTMLAttributes<HTMLSpanElement>;

const VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
  },
};

const UnderlineIcon = forwardRef<UnderlineIconHandle, UnderlineIconProps>(
  ({ onMouseEnter, onMouseLeave, className, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <span
        className={clsx(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height="1em"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            d="M6 4v6a6 6 0 0 0 12 0V4"
            transition={{ duration: 0.3 }}
            variants={VARIANTS}
          />
          <motion.line
            animate={controls}
            transition={{
              delay: 0.2,
              duration: 0.4,
            }}
            variants={VARIANTS}
            x1="4"
            x2="20"
            y1="20"
            y2="20"
          />
        </svg>
      </span>
    );
  }
);

UnderlineIcon.displayName = "UnderlineIcon";

export { UnderlineIcon };
