/// <reference types="node" />
// Real host SQLite; does not substitute for native Expo validation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Debt } from '../domain/Debt';
import { FinancialDate } from '../domain/FinancialDate';
import { debtId } from '../domain/identifiers';
import { Money } from '../domain/Money';
import { Recurrence } from '../domain/Recurrence';
import type { FinancialConnection, SqlValue } from '../persistence/sqlite/connection';
import { createDebtRepository } from '../persistence/sqlite/debtRepository';
import { initializeDatabase } from '../persistence/sqlite/initialize';
import { listDebts } from './listDebts';

test.each([0, 1, 2])('save, close, reopen and application read: %s debts', async (count) => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-list-debts-'));
  let closes = 0;
  const open = async (): Promise<FinancialConnection> => {
    const native = new DatabaseSync(join(directory, 'synthetic.db'));
    const db: FinancialConnection = {
      async execAsync(sql) { native.exec(sql); },
      async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
      async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
      async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
      async closeAsync() { native.close(); closes++; },
    };
    try { await initializeDatabase(db); } catch (error) { native.close(); throw error; }
    return db;
  };
  const records = [
    Debt.create({ id: debtId('A'), name: 'Synthetic debt', provider: 'Synthetic provider', balance: Money.fromMinorUnits(1058478, 'PHP'),
      scheduledPayment: Money.fromMinorUnits(176400, 'PHP'), nextDueDate: FinancialDate.parse('2026-10-10'),
      recurrence: Recurrence.monthly(10), interest: { kind: 'unknown' } }),
    Debt.create({ id: debtId('b'), name: 'Synthetic zero', balance: Money.zero('PHP'),
      interest: { kind: 'known', basisPoints: 0, period: 'annual' }, recurrence: Recurrence.twiceMonthly(30, 31) }),
  ].slice(0, count);
  try {
    const writer = await open();
    try { for (const debt of [...records].reverse()) await createDebtRepository(writer).save(debt); }
    finally { await writer.closeAsync(); }
    const result = await listDebts({ open, repository: createDebtRepository });
    expect(result).toEqual(records);
    result.forEach(value => { expect(value).toBeInstanceOf(Debt); expect(Object.isFrozen(value)).toBe(true); });
    expect(closes).toBe(2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
