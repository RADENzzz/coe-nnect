/**
 * The result of running a single rule against a context.
 * Hard rules may only return 'pass' | 'fail'.
 * Soft rules may only return 'pass' | 'warn'.
 * (There is deliberately no 'error' — rules must not throw.)
 */
export type RuleResult =
  | { status: 'pass' }
  | { status: 'fail'; reason: string; metadata?: Record<string, unknown> }
  | { status: 'warn'; reason: string; metadata?: Record<string, unknown> };

/**
 * The result of a rule plus the rule's identifying metadata.
 * This is what the engine returns and what the API surfaces to the frontend.
 */
export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  type: 'hard' | 'soft';
  category: RuleCategory;
  result: RuleResult;
}

export type RuleCategory =
  | 'workload'
  | 'room'
  | 'time'
  | 'subject'
  | 'priority'
  | 'faculty';