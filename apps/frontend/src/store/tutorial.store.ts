import { create } from 'zustand';
import { getTour } from '../features/tutorial/tours';

export const TUTORIAL_STORAGE_KEY = 'coe-nnect:tutorial:v1';

export interface TutorialProgress {
  /** ISO timestamp of the first time onboarding was acknowledged. */
  onboardedAt: string | null;
  /** Tour id → ISO timestamp when the user finished it. */
  completed: Record<string, string>;
}

const EMPTY_PROGRESS: TutorialProgress = {
  onboardedAt: null,
  completed: {},
};

function readStoredProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<TutorialProgress> | null;
    const completed: Record<string, string> = {};
    if (parsed?.completed && typeof parsed.completed === 'object') {
      for (const [id, at] of Object.entries(parsed.completed)) {
        if (typeof at === 'string') completed[id] = at;
      }
    }
    return {
      onboardedAt:
        typeof parsed?.onboardedAt === 'string' ? parsed.onboardedAt : null,
      completed,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function persist(progress: TutorialProgress): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* Storage may be unavailable in private mode. */
  }
}

interface TutorialState {
  onboardedAt: string | null;
  completed: Record<string, string>;
  /** Tour currently being shown, or null. */
  activeTourId: string | null;
  stepIndex: number;
  /** First-run welcome dialog. */
  welcomeOpen: boolean;
  /** Guide library opened from the TopBar. */
  guidesOpen: boolean;

  startTour: (id: string) => void;
  closeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  completeActiveTour: () => void;
  markOnboarded: () => void;
  openWelcome: () => void;
  dismissWelcome: () => void;
  openGuides: () => void;
  closeGuides: () => void;
  resetProgress: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => {
  const initial = readStoredProgress();

  const updateProgress = (patch: Partial<TutorialProgress>) => {
    const progress: TutorialProgress = {
      onboardedAt: get().onboardedAt,
      completed: get().completed,
      ...patch,
    };
    persist(progress);
    set(patch);
  };

  return {
    ...initial,
    activeTourId: null,
    stepIndex: 0,
    welcomeOpen: false,
    guidesOpen: false,

    startTour: (id) => {
      if (!getTour(id)) return;
      set({
        activeTourId: id,
        stepIndex: 0,
        welcomeOpen: false,
        guidesOpen: false,
      });
    },

    closeTour: () => set({ activeTourId: null, stepIndex: 0 }),

    nextStep: () => {
      const { activeTourId, stepIndex } = get();
      const tour = getTour(activeTourId);
      if (!tour) {
        set({ activeTourId: null, stepIndex: 0 });
        return;
      }
      if (stepIndex >= tour.steps.length - 1) {
        get().completeActiveTour();
        return;
      }
      set({ stepIndex: stepIndex + 1 });
    },

    prevStep: () => {
      const { stepIndex } = get();
      set({ stepIndex: Math.max(0, stepIndex - 1) });
    },

    goToStep: (index) => {
      const tour = getTour(get().activeTourId);
      if (!tour) return;
      set({ stepIndex: Math.max(0, Math.min(index, tour.steps.length - 1)) });
    },

    completeActiveTour: () => {
      const { activeTourId, completed } = get();
      if (activeTourId) {
        updateProgress({
          completed: {
            ...completed,
            [activeTourId]: new Date().toISOString(),
          },
        });
      }
      set({ activeTourId: null, stepIndex: 0 });
    },

    markOnboarded: () => {
      if (get().onboardedAt) return;
      updateProgress({ onboardedAt: new Date().toISOString() });
    },

    openWelcome: () => set({ welcomeOpen: true, guidesOpen: false }),
    dismissWelcome: () => {
      get().markOnboarded();
      set({ welcomeOpen: false });
    },
    openGuides: () => set({ guidesOpen: true, welcomeOpen: false }),
    closeGuides: () => set({ guidesOpen: false }),

    resetProgress: () => {
      updateProgress({ onboardedAt: null, completed: {} });
      set({
        activeTourId: null,
        stepIndex: 0,
        guidesOpen: false,
        welcomeOpen: true,
      });
    },
  };
});
