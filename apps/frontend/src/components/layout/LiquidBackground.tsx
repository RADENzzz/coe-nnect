import { useAppearanceStore } from '../../store/appearance.store';

/**
 * Decorative backdrop for the experimental glass theme.
 *
 * It is a fixed, inert layer behind all app content. The four blurred blobs
 * drift on long, offset animations so the glass surfaces above them catch
 * slowly moving colour. Hidden entirely when glass is off, and frozen by
 * `prefers-reduced-motion` (see globals.css).
 */
export default function LiquidBackground() {
  const glass = useAppearanceStore((s) => s.appearance.glass);
  if (!glass) return null;

  return (
    <div className="liquid-bg" aria-hidden="true">
      <span className="liquid-blob liquid-blob-a" />
      <span className="liquid-blob liquid-blob-b" />
      <span className="liquid-blob liquid-blob-c" />
      <span className="liquid-blob liquid-blob-d" />
    </div>
  );
}
