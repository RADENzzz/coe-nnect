import { Injectable, Logger } from '@nestjs/common';
import {
  RuleRegistry,
  evaluate,
  allRules,
  type RuleContext,
  type EngineResult,
} from '@coe-nnect/constraint-rules';

@Injectable()
export class ConstraintsService {
  private readonly logger = new Logger(ConstraintsService.name);
  private readonly registry = new RuleRegistry();

  constructor() {
    this.registry.registerAll(allRules);
    this.logger.log(
      `Constraint engine ready with ${this.registry.getAll().length} rules.`,
    );
  }

  evaluate(context: RuleContext): EngineResult {
    return evaluate(this.registry.getAll(), context);
  }

  listRules() {
    return this.registry.getAll().map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      category: r.category,
    }));
  }
}