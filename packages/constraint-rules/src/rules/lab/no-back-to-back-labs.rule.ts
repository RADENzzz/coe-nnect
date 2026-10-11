import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * H-6: Back-to-back laboratory sessions — DISABLED.
 *
 * Per PM feedback (2026-10):
 *   "Ndi na required 'yung back to back lab"
 *   (Back-to-back labs are no longer required/prohibited.)
 *
 * This rule is retained in the registry for historical reference
 * but always returns `pass`. It is deliberately NOT enforced by the
 * solver, the engine, or the auto-generate soft-rules list.
 *
 * To re-enable: restore the original logic (see git history) and
 * change the rule type back to 'hard'.
 */
export const noBackToBackLabsRule: ConstraintRule = {
  id: 'H-6',
  name: 'No Back-to-Back Labs (disabled)',
  description:
    'Disabled per PM feedback — back-to-back laboratory sessions are now allowed.',
  type: 'soft',
  category: 'time',

  validate(_ctx: RuleContext): RuleResult {
    return { status: 'pass' };
  },
};