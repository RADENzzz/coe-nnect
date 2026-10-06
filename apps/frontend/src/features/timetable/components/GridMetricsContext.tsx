import { createContext, useContext, useMemo } from 'react';

export type GridDensity = 'compact' | 'comfortable' | 'desktop' | 'fit';

export interface GridMetrics {
  slotHeight: number;
  dayWidth: number;
  axisWidth: number;
  axisLabelEvery: number;
  blockFontSize: number;
  showSecondaryLines: boolean;
  gridHeight: number;
  /** True when columns were stretched to fill the container. */
  fitted: boolean;
}

/** Minimum readable day column width. Below this, we don't shrink further. */
export const MIN_DAY_WIDTH = 88;

/** Minimum readable time-axis width. */
export const MIN_AXIS_WIDTH = 52;

interface DensityPreset {
  slotHeight: number;
  /** Base day width when NOT fitting to container. */
  dayWidth: number;
  axisWidth: number;
  axisLabelEvery: number;
  blockFontSize: number;
  showSecondaryLines: boolean;
  /** Whether this density should stretch columns to fill the container. */
  fit: boolean;
}

const PRESETS: Record<Exclude<GridDensity, 'fit'>, DensityPreset> = {
  compact: {
    slotHeight: 32,
    dayWidth: 120,
    axisWidth: 56,
    axisLabelEvery: 2,
    blockFontSize: 9,
    showSecondaryLines: false,
    fit: false,
  },
  comfortable: {
    slotHeight: 40,
    dayWidth: 140,
    axisWidth: 60,
    axisLabelEvery: 2,
    blockFontSize: 10,
    showSecondaryLines: true,
    fit: false,
  },
  desktop: {
    slotHeight: 48,
    dayWidth: 180,
    axisWidth: 72,
    axisLabelEvery: 2,
    blockFontSize: 10,
    showSecondaryLines: true,
    fit: false,
  },
};

const SLOT_COUNT = 24;
const DAY_COUNT = 6;

interface GridMetricsContextValue extends GridMetrics {
  density: GridDensity;
}

const GridMetricsContext = createContext<GridMetricsContextValue | null>(null);

export function GridMetricsProvider({
  density,
  containerWidth,
  children,
}: {
  density: GridDensity;
  /** Width available for the grid (measured by the parent). Undefined = no fit. */
  containerWidth?: number;
  children: React.ReactNode;
}) {
  const value = useMemo<GridMetricsContextValue>(() => {
    // Pick a base preset. When density === 'fit', derive everything from
    // 'comfortable' but override the fit behavior.
    const baseKey: Exclude<GridDensity, 'fit'> =
      density === 'fit' ? 'comfortable' : density;
    const preset = PRESETS[baseKey];
    const shouldFit = density === 'fit' || preset.fit;

    let dayWidth = preset.dayWidth;
    let axisWidth = preset.axisWidth;
    let fitted = false;

    if (shouldFit && containerWidth && containerWidth > 0) {
      // Reserve axis width first
      const axis = MIN_AXIS_WIDTH;
      const availableForDays = containerWidth - axis;
      const idealDayWidth = availableForDays / DAY_COUNT;

      if (idealDayWidth >= preset.dayWidth) {
        // Container is wide enough — stretch columns to fill it exactly.
        dayWidth = idealDayWidth;
        axisWidth = axis;
        fitted = true;
      } else if (idealDayWidth >= MIN_DAY_WIDTH) {
        // Container is narrower than ideal but still readable — fill it.
        dayWidth = idealDayWidth;
        axisWidth = axis;
        fitted = true;
      } else {
        // Too narrow — stop shrinking and let horizontal scroll take over.
        dayWidth = MIN_DAY_WIDTH;
        axisWidth = axis;
        fitted = false;
      }
    }

    return {
      density,
      slotHeight: preset.slotHeight,
      dayWidth,
      axisWidth,
      axisLabelEvery: preset.axisLabelEvery,
      blockFontSize: preset.blockFontSize,
      showSecondaryLines: preset.showSecondaryLines,
      gridHeight: preset.slotHeight * SLOT_COUNT,
      fitted,
    };
  }, [density, containerWidth]);

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