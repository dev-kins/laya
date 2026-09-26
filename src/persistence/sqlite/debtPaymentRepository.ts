import { DebtPayment } from '../../domain/DebtPayment';
import { debtId, paymentId, type PaymentId } from '../../domain/identifiers';
import type { FinancialConnection } from './connection';
import { guardedInteger, storedDate, storedMoney, type FinancialRow } from './financialMapping';

export interface DebtPaymentRepository {
  save(payment: DebtPayment): Promise<void>;
  getById(id: PaymentId): Promise<DebtPayment | null>;
  list(): Promise<readonly DebtPayment[]>;
}

const selection = `SELECT id, debt_id, currency, financial_date, ${guardedInteger('amount_minor_units', 1)},
  EXISTS(SELECT 1 FROM debts WHERE debts.id = debt_payments.debt_id) AS debt_exists FROM debt_payments`;

function fromRow(row: FinancialRow): DebtPayment {
  if (row.debt_exists !== 1) throw new TypeError('Stored payment references a missing debt.');
  return DebtPayment.create({ id: paymentId(row.id), debtId: debtId(row.debt_id),
    amount: storedMoney(row.amount_minor_units, row.currency), date: storedDate(row.financial_date) });
}

export function createDebtPaymentRepository(db: FinancialConnection): DebtPaymentRepository {
  return {
    async save(value) {
      if (!(value instanceof DebtPayment)) throw new TypeError('Expected a DebtPayment entity.');
      const payment = DebtPayment.create(value);
      await db.runAsync(`INSERT INTO debt_payments (id, debt_id, amount_minor_units, currency, financial_date)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET debt_id = excluded.debt_id,
        amount_minor_units = excluded.amount_minor_units, currency = excluded.currency,
        financial_date = excluded.financial_date`,
      payment.id, payment.debtId, payment.amount.minorUnits, payment.amount.currency, payment.date.toString());
    },
    async getById(id) {
      const row = await db.getFirstAsync<FinancialRow>(`${selection} WHERE id = ?`, paymentId(id));
      return row === null ? null : fromRow(row);
    },
    async list() {
      return (await db.getAllAsync<FinancialRow>(`${selection} ORDER BY id COLLATE BINARY`)).map(fromRow);
    },
  };
}
