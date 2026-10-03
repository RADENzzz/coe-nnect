import type { ConstraintRule } from './types/rule.interface';
import type {
  RuleEvaluation,
  RuleResult,
} from './types/rule-result.type';
import type { RuleContext } from './types/rule-context.type';

/**
 * Run every rule against the context and return a labelled evaluation
 * for each. Rules that throw are converted into a 'fail' with the
 * thrown message — a broken rule must never crash the API.
 */
export function runRules(
  rules: ConstraintRule[],
  context: RuleContext,
): RuleEvaluation[] {
  return rules.map((rule) => {
    let result: RuleResult;
    try {
      result = rule.validate(context);
    } catch (err) {
      result = {
        status: 'fail',
        reason:
          err instanceof Error
            ? `Rule ${rule.id} threw: ${err.message}`
            : `Rule ${rule.id} threw an unknown error`,
      };
    }
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      category: rule.category,
      result,
    };
  });
}

export function hasHardFailures(evaluations: RuleEvaluation[]): boolean {
  return evaluations.some(
    (e) => e.type === 'hard' && e.result.status === 'fail',
  );
}

export function getHardFailures(
  evaluations: RuleEvaluation[],
): RuleEvaluation[] {
  return evaluations.filter(
    (e) => e.type === 'hard' && e.result.status === 'fail',
  );
}

export function getSoftWarnings(
  evaluations: RuleEvaluation[],
): RuleEvaluation[] {
  return evaluations.filter(
    (e) => e.type === 'soft' && e.result.status === 'warn',
  );
}

/**
 * Convenience wrapper the API calls directly: runs rules, splits the
 * results, and returns the shape the frontend expects.
 */
export interface EngineResult {
  valid: boolean;
  hardConflicts: Array<{ ruleId: string; ruleName: string; reason: string }>;
  softWarnings: Array<{ ruleId: string; ruleName: string; reason: string }>;
  evaluations: RuleEvaluation[];
}

export function evaluate(
  rules: ConstraintRule[],
  context: RuleContext,
): EngineResult {
  const evaluations = runRules(rules, context);
  const hardFailures = getHardFailures(evaluations);
  const softWarnings = getSoftWarnings(evaluations);

  return {
    valid: hardFailures.length === 0,
    hardConflicts: hardFailures.map((e) => ({
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      reason: (e.result as { reason: string }).reason,
    })),
    softWarnings: softWarnings.map((e) => ({
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      reason: (e.result as { reason: string }).reason,
    })),
    evaluations,
  };
}