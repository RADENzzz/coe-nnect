import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const DIGIT_STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function formatValue(value: number | string): string {
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return reduced;
}

/**
 * A single odometer wheel. The strip holds 0–9 vertically and slides to the
 * requested digit; on mount it starts one notch off so the first value rolls
 * into place instead of appearing abruptly.
 */
function RollingDigit({
  digit,
  reduced,
}: {
  digit: number;
  reduced: boolean;
}) {
  const [position, setPosition] = useState(() =>
    reduced ? digit : (digit + 1) % 10,
  );

  useEffect(() => {
    if (reduced) {
      setPosition(digit);
      return;
    }

    const frame = requestAnimationFrame(() => setPosition(digit));
    return () => cancelAnimationFrame(frame);
  }, [digit, reduced]);

  return (
    <span
      className="relative inline-flex h-[1em] w-[1ch] shrink-0 items-start justify-center overflow-hidden align-baseline"
      aria-hidden="true"
    >
      <span
        className={clsx(
          'flex flex-col will-change-transform',
          !reduced && 'rolling-digit-track',
        )}
        style={{ transform: `translateY(-${position}em)` }}
      >
        {DIGIT_STRIP.map((value) => (
          <span
            key={value}
            className="flex h-[1em] items-center justify-center leading-none"
          >
            {value}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Odometer-style number. Prefixes, suffixes, and separators stay static. */
export function RollingNumber({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const text = formatValue(value);
  const reduced = useReducedMotion();

  return (
    <span
      className={clsx(
        'inline-flex items-baseline whitespace-nowrap tabular-nums',
        className,
      )}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {Array.from(text).map((character, index) =>
          /\d/.test(character) ? (
            <RollingDigit
              key={index}
              digit={Number(character)}
              reduced={reduced}
            />
          ) : (
            <span key={index} className="whitespace-pre">
              {character}
            </span>
          ),
        )}
      </span>
    </span>
  );
}

/** Short text that trades places vertically when its value changes. */
export function RollingText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const currentRef = useRef(value);
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (value === currentRef.current) return;

    setPrevious(currentRef.current);
    currentRef.current = value;
    setCurrent(value);
  }, [value]);

  useEffect(() => {
    if (previous === null) return;

    const timeout = window.setTimeout(() => setPrevious(null), 380);
    return () => window.clearTimeout(timeout);
  }, [previous]);

  if (reduced) {
    return <span className={className}>{current}</span>;
  }

  return (
    <span
      className={clsx(
        'relative inline-grid overflow-hidden align-bottom',
        className,
      )}
    >
      <span className="sr-only">{current}</span>
      {previous !== null && (
        <span
          key={`out-${previous}`}
          aria-hidden="true"
          className="col-start-1 row-start-1 animate-roll-out whitespace-nowrap"
        >
          {previous}
        </span>
      )}
      <span
        key={`in-${current}`}
        aria-hidden="true"
        className="col-start-1 row-start-1 animate-roll-in whitespace-nowrap"
      >
        {current}
      </span>
    </span>
  );
}

/**
 * Convenience wrapper: numeric-ish values use the odometer, word-like values
 * use the vertical text roll. Safe to drop in wherever a stat is rendered.
 */
export default function RollingValue({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const text = formatValue(value);

  return /\d/.test(text) ? (
    <RollingNumber value={text} className={className} />
  ) : (
    <RollingText value={text} className={className} />
  );
}
