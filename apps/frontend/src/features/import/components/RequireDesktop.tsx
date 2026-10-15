import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const MIN_WIDTH_PX = 1024;
const TABLET_MIN_PX = 768;

type Viewport = 'ok' | 'tablet-portrait' | 'phone';

function detectViewport(): Viewport {
  if (typeof window === 'undefined') return 'ok';
  // Testing bypass
  const url = new URL(window.location.href);
  if (url.searchParams.get('force') === '1') return 'ok';

  const w = window.innerWidth;
  if (w >= MIN_WIDTH_PX) return 'ok';
  if (w >= TABLET_MIN_PX) return 'tablet-portrait';
  return 'phone';
}

interface RequireDesktopProps {
  children: ReactNode;
}

/**
 * Blocks the wrapped page on viewports narrower than 1024px.
 * - Phones (< 768px): generic "use a larger screen" message.
 * - Tablets in portrait (768–1023px): "rotate to landscape" message.
 * - Tablets in landscape / desktops (>= 1024px): render the page.
 *
 * Reacts to resize / orientation change, no manual refresh needed.
 */
export default function RequireDesktop({ children }: RequireDesktopProps) {
  const [viewport, setViewport] = useState<Viewport>(() =>
    detectViewport(),
  );

  useEffect(() => {
    const update = () => setViewport(detectViewport());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (viewport === 'ok') return <>{children}</>;

  if (viewport === 'tablet-portrait') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mx-auto">
            <Icon name="screen_rotation" size={40} className="text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-on-surface">
            Rotate to landscape
          </h1>

          <p className="text-on-surface-variant text-sm">
            The prospectus import editor works best in landscape on a
            tablet. Turn your device sideways to continue.
          </p>

          <div className="pt-2">
            <Link
              to="/import"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition"
            >
              <Icon name="arrow_back" size={16} />
              Back to Import list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // viewport === 'phone'
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
          <Icon name="desktop_windows" size={32} className="text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-on-surface">
          Use a larger screen
        </h1>

        <p className="text-on-surface-variant text-sm">
          The prospectus import editor needs more space than a phone can
          provide. Please open this page on a desktop, laptop, or tablet
          in landscape mode.
        </p>

        <div className="pt-2">
          <Link
            to="/import"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition"
          >
            <Icon name="arrow_back" size={16} />
            Back to Import list
          </Link>
        </div>
      </div>
    </div>
  );
}