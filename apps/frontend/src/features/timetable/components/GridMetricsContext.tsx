import { createContext, useContext, useMemo } from 'react';

export type GridDensity = 'compact' | 'comfortable' | 'desktop';

export interface GridMetrics {
  slotHeight: number;
  dayWidth: number;
  axisWidth: number;
  /** Show every Nth time label on the axis. 1 = every label. */
  axisLabelEvery: number;
  /** Base font size for block text. */
  blockFontSize: number;
  /** Show secondary lines (faculty / time) in ClassBlock. */
  showSecondaryLines: boolean;
  /** Total grid height in px. */
  gridHeight: number;
}

const DENSITY_PRESETS: Record<GridDensity, Omit<GridMetrics, 'gridHeight'>> = {
  compact: {
    slotHeight: 32,
    dayWidth: 120,
    axisWidth: 56,
    axisLabelEvery: 2,
    blockFontSize: 9,
    showSecondaryLines: false,
  },
  comfortable: {
    slotHeight: 40,
    dayWidth: 140,
    axisWidth: 60,
    axisLabelEvery: 2,
    blockFontSize: 10,
    showSecondaryLines: true,
  },
  desktop: {
    slotHeight: 48,
    dayWidth: 180,
    axisWidth: 72,
    axisLabelEvery: 2,
    blockFontSize: 10,
    showSecondaryLines: true,
  },
};

const SLOT_COUNT = 24; // 07:00–19:00 at 30-min slots

interface GridMetricsContextValue extends GridMetrics {
  density: GridDensity;
}

const GridMetricsContext = createContext<GridMetricsContextValue | null>(null);

export function GridMetricsProvider({
  density,
  children,
}: {
  density: GridDensity;
  children: React.ReactNode;
}) {
  const value = useMemo<GridMetricsContextValue>(() => {
    const preset = DENSITY_PRESETS[density];
    return {
      density,
      ...preset,
      gridHeight: preset.slotHeight * SLOT_COUNT,
    };
  }, [density]);

  return (
    <GridMetricsContext.Provider value={value}>
      {children}
    </GridMetricsContext.Provider>
  );
}

export function useGridMetrics(): GridMetricsContextValue {
  const ctx = useContext(GridMetricsContext);
  if (!ctx) {
    throw new Error('useGridMetrics must be used inside <GridMetricsProvider>');
  }
  return ctx;
}   