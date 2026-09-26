declare const entityId: unique symbol;
export type DebtId = string & { readonly [entityId]: 'Debt' };
export type IncomeId = string & { readonly [entityId]: 'Income' };
export type ObligationId = string & { readonly [entityId]: 'Obligation' };
export type PaymentId = string & { readonly [entityId]: 'Payment' };

/** Opaque, case-sensitive strings. Reject padding rather than changing identity. */
export function validateIdentifier(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value.trim() !== value) {
    throw new RangeError('Identifier must be unpadded text of 1-128 characters.');
  }
  return value;
}
export const debtId = (value: unknown): DebtId => validateIdentifier(value) as DebtId;
export const incomeId = (value: unknown): IncomeId => validateIdentifier(value) as IncomeId;
export const obligationId = (value: unknown): ObligationId => validateIdentifier(value) as ObligationId;
export const paymentId = (value: unknown): PaymentId => validateIdentifier(value) as PaymentId;
