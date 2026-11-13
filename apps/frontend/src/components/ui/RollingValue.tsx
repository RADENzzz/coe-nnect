import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useMotionEnabled } from '../../hooks/use-motion-enabled';

const DIGIT_STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*';

function formatValue(value: number | string): string {
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

/** Random glyphs, keeping the target's spaces so the line keeps its shape. */
function randomText(length: number, target = ''): string {
  return Array.from({ length }, (_, index) =>
    target[index] === ' ' ? ' ' : randomChar(),
  ).join('');
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

/**
 * Odometer-style number. Prefixes, suffixes, and separators stay static.
 *
 * Pass `loading` to hold the value at zero until data arrives; the odometer
 * then rolls up to the target instead of popping in.
 */
export function RollingNumber({
  value,
  className,
  loading = false,
}: {
  value: number | string;
  className?: string;
  loading?: boolean;
}) {
  const animate = useMotionEnabled();
  const text = formatValue(loading ? (animate ? 0 : '—') : value);

  if (!animate) {
    return (
      <span
        className={clsx(
          'inline-flex items-baseline whitespace-nowrap tabular-nums',
          className,
        )}
        aria-busy={loading || undefined}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-baseline whitespace-nowrap tabular-nums',
        className,
      )}
      aria-busy={loading || undefined}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {Array.from(text).map((character, index) =>
          /\d/.test(character) ? (
            <RollingDigit
              key={index}
              digit={Number(character)}
              reduced={false}
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

/**
 * Decodes random glyphs into the real text. While `loading` is true the
 * placeholder keeps shuffling; when data arrives each character resolves into
 * place. Static when the user turns loading animations off or requests
 * reduced motion.
 */
export function ScrambleText({
  value,
  className,
  loading = false,
  loadingLength,
}: {
  value: string;
  className?: string;
  loading?: boolean;
  loadingLength?: number;
}) {
  const animate = useMotionEnabled();
  const target = String(value);
  const length = Math.min(24, Math.max(4, loadingLength ?? target.length));
  const [display, setDisplay] = useState(() =>
    loading ? randomText(length, target) : target,
  );
  const prevLoading = useRef(loading);
  const prevValue = useRef(target);

  useEffect(() => {
    if (!animate) {
      setDisplay(loading ? '—' : target);
      prevLoading.current = loading;
      prevValue.current = target;
      return;
    }

    if (loading) {
      prevLoading.current = true;
      const tick = () => setDisplay(randomText(length, target));
      tick();
      const id = window.setInterval(tick, 80);
      return () => window.clearInterval(id);
    }

    const wasLoading = prevLoading.current;
    const valueChanged = prevValue.current !== target;
    prevLoading.current = false;
    prevValue.current = target;

    if (!wasLoading && !valueChanged) {
      setDisplay(target);
      return;
    }

    let frame = 0;
    const totalFrames = 12;
    const id = window.setInterval(() => {
      frame += 1;
      if (frame >= totalFrames) {
        window.clearInterval(id);
        setDisplay(target);
        return;
      }

      const reveal = Math.floor((frame / totalFrames) * target.length);
      setDisplay(
        Array.from(target, (character, index) =>
          index < reveal || character === ' ' ? character : randomChar(),
        ).join(''),
      );
    }, 40);
    return () => window.clearInterval(id);
  }, [animate, loading, target, length]);

  if (!animate) {
    return (
      <span className={className} aria-busy={loading || undefined}>
        {loading ? '—' : target}
      </span>
    );
  }

  return (
    <span className={className} aria-busy={loading || undefined}>
      <span className="sr-only">{loading ? 'Loading' : target}</span>
      <span aria-hidden="true">{display}</span>
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
  const animate = useMotionEnabled();
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

  if (!animate) {
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
 *
 * Pass `loading` to opt into the load-in treatment: numbers hold at zero and
 * roll up, text shuffles randomly and decodes to the real value.
 */
export default function RollingValue({
  value,
  className,
  loading,
  loadingLength,
}: {
  value: number | string;
  className?: string;
  loading?: boolean;
  loadingLength?: number;
}) {
  const text = formatValue(value);

  if (loading !== undefined) {
    return typeof value === 'number' ? (
      <RollingNumber value={value} loading={loading} className={className} />
    ) : (
      <ScrambleText
        value={text}
        loading={loading}
        loadingLength={loadingLength}
        className={className}
      />
    );
  }

  return /\d/.test(text) ? (
    <RollingNumber value={text} className={className} />
  ) : (
    <RollingText value={text} className={className} />
  );
}
