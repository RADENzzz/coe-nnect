import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import clsx from "clsx";

export interface AlignCenterIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

type AlignCenterIconProps = HTMLAttributes<HTMLSpanElement>;

const AlignCenterIcon = forwardRef<AlignCenterIconHandle, AlignCenterIconProps>(
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
            d="M17 12H7"
            variants={{
              normal: { translateX: 0 },
              animate: {
                translateX: [0, 3, -3, 2, -2, 0],
                transition: {
                  ease: "linear",
                  translateX: {
                    duration: 1,
                  },
                },
              },
            }}
          />
          <path d="M19 18H5" />
          <path d="M21 6H3" />
        </svg>
      </span>
    );
  }
);

AlignCenterIcon.displayName = "AlignCenterIcon";

export { AlignCenterIcon };
