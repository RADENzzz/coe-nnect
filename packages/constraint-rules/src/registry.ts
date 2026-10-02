import type { ConstraintRule } from './types/rule.interface';
import type { RuleCategory } from './types/rule-result.type';

/**
 * Holds every rule the engine knows about.
 * The backend constructs one of these at boot and registers all rules.
 */
export class RuleRegistry {
  private rules: ConstraintRule[] = [];

  register(rule: ConstraintRule): this {
    if (this.rules.some((r) => r.id === rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    this.rules.push(rule);
    return this;
  }

  registerAll(rules: ConstraintRule[]): this {
    rules.forEach((r) => this.register(r));
    return this;
  }

  getAll(): ConstraintRule[] {
    return [...this.rules];
  }

  getById(id: string): ConstraintRule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  getByType(type: 'hard' | 'soft'): ConstraintRule[] {
    return this.rules.filter((r) => r.type === type);
  }

  getByCategory(category: RuleCategory): ConstraintRule[] {
    return this.rules.filter((r) => r.category === category);
  }

  clear(): void {
    this.rules = [];
  }
}