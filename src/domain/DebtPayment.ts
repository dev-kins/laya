import { FinancialDate } from './FinancialDate';
import { debtId, paymentId, type DebtId, type PaymentId } from './identifiers';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import { Money } from './Money';

/** External historical payment; today's balance cannot bound a past payment. */
export class DebtPayment {
  private constructor(
    public readonly id: PaymentId,
    public readonly debtId: DebtId,
    public readonly amount: Money,
    public readonly date: FinancialDate,
  ) { Object.freeze(this); }

  static create(input: Readonly<{ id: PaymentId; debtId: DebtId; amount: Money; date: FinancialDate }>): DebtPayment {
    const amount = nonNegativeMoney(input.amount);
    if (amount.minorUnits === 0) throw new RangeError('Payment amount must be positive.');
    return new DebtPayment(paymentId(input.id), debtId(input.debtId), amount, calendarDate(input.date));
  }
}
