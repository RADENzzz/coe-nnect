export type MemberEffectKind =
  | 'confetti'
  | 'sparkle'
  | 'lightning'
  | 'hearts'
  | 'stars'
  | 'bubbles'
  | 'petals'
  | 'snow';

export interface MemberEffect {
  kind: MemberEffectKind;
  color: string;
  color2?: string;
}

/**
 * Map each team member (by exact name) to their effect.
 * Any name NOT in this map gets no effect.
 * Alrhaden A. Javier is intentionally excluded (he has the manga easter egg).
 */
export const MEMBER_EFFECTS: Record<string, MemberEffect> = {
  // Leadership
  'Jazmine Elaiza L. Luis': { kind: 'petals', color: '#f472b6', color2: '#fbcfe8' },

  // Development (Alrhaden has the easter egg — excluded)
  'Giel V. Andales': { kind: 'lightning', color: '#38bdf8', color2: '#0ea5e9' },
  'Edzel Don V. Tio': { kind: 'bubbles', color: '#34d399', color2: '#a7f3d0' },

  // Quality & Training
  'Roland C. Velez': { kind: 'confetti', color: '#f59e0b', color2: '#fde68a' },
  'Andre Aga B. Dacumos': { kind: 'stars', color: '#a78bfa', color2: '#ddd6fe' },

  // Analysis & Documentation
  'Aizzah Arabelle B. Javelosa': { kind: 'sparkle', color: '#facc15', color2: '#fef3c7' },
  'Euwan Tyrone B. Prias': { kind: 'snow', color: '#60a5fa', color2: '#dbeafe' },
};