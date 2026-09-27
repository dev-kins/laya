/// <reference types="node" />
// Real file-backed host SQLite; native Expo persistence still needs device validation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Income } from '../domain/Income';
import type { FinancialConnection, SqlValue } from '../persistence/sqlite/connection';
import { createIncomeRepository } from '../persistence/sqlite/incomeRepository';
import { initializeDatabase } from '../persistence/sqlite/initialize';
import { createAddIncomeOperation } from './addIncome';
import { emptyIncomeForm, type IncomeForm } from './incomeForm';
import { listIncome } from './listIncome';

test.each([0, 1, 2])('application write, close, reopen, get and list: %s income records', async count => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-income-'));
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
  const forms: IncomeForm[] = [
    { ...emptyIncomeForm, name: 'Synthetic expected', amount: '25000.50', date: '2028-02-29', status: 'expected',
      recurrence: 'twice-monthly', firstDay: '30', secondDay: '31' },
    // Stale recurrence must never reach received storage, even outside the UI.
    { ...emptyIncomeForm, name: 'Synthetic received', amount: '8500', date: '2026-09-27', status: 'received',
      recurrence: 'monthly', firstDay: '31' },
  ];
  const saved: Income[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const operation = createAddIncomeOperation({ open, generateId: () => i === 0 ? 'b' : 'A', repository: createIncomeRepository });
      failClose = true;
      await expect(operation(forms[i])).rejects.toThrow('synthetic post-commit close failure');
      saved.push(await operation(forms[i]));
    }
    const reader = await open();
    try {
      for (const record of saved) await expect(createIncomeRepository(reader).getById(record.id)).resolves.toEqual(record);
      if (count > 0) {
        expect(saved[0].amount.minorUnits).toBe(2500050);
        expect(saved[0].recurrence?.requestedDays).toEqual([30, 31]);
        expect(saved[0].date.toString()).toBe('2028-02-29');
      }
      if (count === 2) {
        expect(saved[1].amount.minorUnits).toBe(850000);
        expect(saved[1].recurrence).toBeUndefined();
        expect(await reader.getFirstAsync('SELECT recurrence_kind, recurrence_day_1, recurrence_day_2 FROM incomes WHERE id = ?', 'A'))
          .toEqual({ recurrence_kind: null, recurrence_day_1: null, recurrence_day_2: null });
      }
    } finally { await reader.closeAsync(); }
    const result = await listIncome({ open, repository: createIncomeRepository });
    // Existing binary ID ordering, independent of status, date and insertion.
    expect(result).toEqual([...saved].reverse());
    expect(result).toHaveLength(count); // Post-commit retry upserts the same identity.
    result.forEach(record => { expect(record).toBeInstanceOf(Income); expect(Object.isFrozen(record)).toBe(true); });
    expect(closes).toBe(count * 2 + 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
