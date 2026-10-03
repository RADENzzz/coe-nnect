import type { RuleContext } from './rule-context.type';
import type { RuleResult, RuleCategory } from './rule-result.type';

/**
 * Every rule implements this shape. Rules must be pure:
 * - Same input => same output.
 * - No I/O, no DB, no fetch.
 * - Never throw; return a RuleResult.
 */
export interface ConstraintRule {
  /** Stable ID referenced by the SRS, e.g. 'H-1', 'R-1'. */
  id: string;
  /** Human-readable name shown in the UI, e.g. 'Faculty Overlap'. */
  name: string;
  /** One-line description used in reports and tooltips. */
  description: string;
  /** Hard rules reject; soft rules warn. */
  type: 'hard' | 'soft';
  /** Used for grouping in the UI and for rule-registry lookups. */
  category: RuleCategory;
  /** The actual check. Must be synchronous and side-effect free. */
  validate(context: RuleContext): RuleResult;
}