import { useNow } from '../../../hooks/use-now';
import { RollingNumber } from '../../../components/ui/RollingValue';

/**
 * Wall clock that ticks every second. Kept as its own component so the
 * one-second cadence only re-renders the clock, not the whole dashboard.
 */
export default function LiveClock() {
  const now = new Date(useNow(1000));
  const clock = now.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return <RollingNumber value={clock} />;
}
