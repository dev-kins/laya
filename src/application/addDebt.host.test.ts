/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { FinancialConnection, SqlValue } from '../persistence/sqlite/connection';
import { createDebtRepository } from '../persistence/sqlite/debtRepository';
import { initializeDatabase } from '../persistence/sqlite/initialize';
import { createAddDebtOperation } from './addDebt';
import { emptyDebtForm } from './debtForm';

test('application saves to real host SQLite, closes, reopens, and retries without a duplicate', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-add-debt-'));
  let closes = 0;
  let failFirstClose = true;
  const open = async (): Promise<FinancialConnection> => {
    const native = new DatabaseSync(join(directory, 'synthetic.db'));
    const db: FinancialConnection = {
      async execAsync(sql) { native.exec(sql); },
      async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
      async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
      async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
      async closeAsync() {
        native.close(); closes++;
        if (failFirstClose) { failFirstClose = false; throw new Error('synthetic close failure after commit'); }
      },
    };
    try { await initializeDatabase(db); } catch (error) { native.close(); throw error; }
    return db;
  };
  try {
    const operation = createAddDebtOperation({ open, generateId: () => 'synthetic-id', repository: createDebtRepository });
    const form = { ...emptyDebtForm, name: 'Synthetic debt', provider: 'Synthetic provider', balance: '10584.78',
      scheduledPayment: '0', nextDueDate: '2028-02-29', interestChoice: 'known' as const,
      interestRate: '1.25', interestPeriod: 'monthly' as const, recurrence: 'twice-monthly' as const, firstDay: '30', secondDay: '31' };
    await expect(operation(form)).rejects.toThrow('synthetic close failure after commit');
    const saved = await operation(form);
    expect(closes).toBe(2);
    const reopened = await open();
    try {
      const repo = createDebtRepository(reopened);
      await expect(repo.getById(saved.id)).resolves.toEqual(saved);
      await expect(repo.list()).resolves.toEqual([saved]);
      expect(saved.balance.minorUnits).toBe(1058478);
      expect(saved.scheduledPayment?.minorUnits).toBe(0);
      expect(saved.nextDueDate?.toString()).toBe('2028-02-29');
      expect(saved.interest).toEqual({ kind: 'known', basisPoints: 125, period: 'monthly' });
      expect(saved.recurrence?.requestedDays).toEqual([30, 31]);
    } finally { await reopened.closeAsync(); }
    expect(closes).toBe(3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
