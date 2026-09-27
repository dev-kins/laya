import { nonNegativeMoney } from './modelValidation';
import type { Money } from './Money';

/** The user's current, manually reported money available for their plan. */
export class AvailableMoney {
  private constructor(public readonly amount: Money) { Object.freeze(this); }

  static create(input: Readonly<{ amount: Money }>): AvailableMoney {
    return new AvailableMoney(nonNegativeMoney(input.amount));
  }
}
