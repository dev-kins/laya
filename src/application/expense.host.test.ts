/// <reference types="node" />
// Real file-backed host SQLite; native Expo persistence still needs device validation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { EssentialObligation } from '../domain/EssentialObligation';
import type { FinancialConnection, SqlValue } from '../persistence/sqlite/connection';
import { createEssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';
import { initializeDatabase } from '../persistence/sqlite/initialize';
import { createAddExpenseOperation } from './addExpense';
import { emptyExpenseForm, type ExpenseForm } from './expenseForm';
import { listExpenses } from './listExpenses';

test.each([0, 1, 2])('application write, close, reopen, get and list: %s expense records', async count => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-expense-'));
  let closes = 0;
  let failClose = false;
  const open = async (): Promise<FinancialConnection> => {
    const native = new DatabaseSync(join(directory, 'synthetic.db'));
    const db: FinancialConnection = {
      async execAsync(sql) { native.exec(sql); },
      async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
      async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
      async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
      async closeAsync() {
        native.close(); closes++;
        if (failClose) { failClose = false; throw new Error('synthetic post-commit close failure'); }
      },
    };
    try { await initializeDatabase(db); } catch (error) { native.close(); throw error; }
    return db;
  };
  const forms: ExpenseForm[] = [
    { ...emptyExpenseForm, name: 'Synthetic recurring obligation', amount: '25000.50', date: '2028-02-29',
      recurrence: 'twice-monthly', firstDay: '30', secondDay: '31' },
    { ...emptyExpenseForm, name: 'Synthetic zero obligation', amount: '0', date: '2026-09-27',
      recurrence: 'none' },
  ];
  const saved: EssentialObligation[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const operation = createAddExpenseOperation({ open, generateId: () => i === 0 ? 'b' : 'A', repository: createEssentialObligationRepository });
      failClose = true;
      await expect(operation(forms[i])).rejects.toThrow('synthetic post-commit close failure');
      saved.push(await operation(forms[i]));
    }
    const reader = await open();
    try {
      for (const record of saved) await expect(createEssentialObligationRepository(reader).getById(record.id)).resolves.toEqual(record);
      if (count > 0) {
        expect(saved[0].amount.minorUnits).toBe(2500050);
        expect(saved[0].recurrence?.requestedDays).toEqual([30, 31]);
        expect(saved[0].date.toString()).toBe('2028-02-29');
      }
      if (count === 2) {
        expect(saved[1].amount.minorUnits).toBe(0);
        expect(saved[1].recurrence).toBeUndefined();
        expect(await reader.getFirstAsync('SELECT recurrence_kind, recurrence_day_1, recurrence_day_2 FROM essential_obligations WHERE id = ?', 'A'))
          .toEqual({ recurrence_kind: null, recurrence_day_1: null, recurrence_day_2: null });
      }
    } finally { await reader.closeAsync(); }
    const result = await listExpenses({ open, repository: createEssentialObligationRepository });
    // Existing binary ID ordering, independent of date and insertion.
    expect(result).toEqual([...saved].reverse());
    expect(result).toHaveLength(count); // Post-commit retry upserts the same identity.
    result.forEach(record => { expect(record).toBeInstanceOf(EssentialObligation); expect(Object.isFrozen(record)).toBe(true); });
    expect(closes).toBe(count * 2 + 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
