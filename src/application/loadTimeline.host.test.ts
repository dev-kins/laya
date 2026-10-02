/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AvailableMoney } from '../domain/AvailableMoney';
import { FinancialDate } from '../domain/FinancialDate';
import { incomeId } from '../domain/identifiers';
import { Income } from '../domain/Income';
import { Money } from '../domain/Money';
import { createAvailableMoneyRepository } from '../persistence/sqlite/availableMoneyRepository';
import type { FinancialConnection, SqlValue } from '../persistence/sqlite/connection';
import { createDebtRepository } from '../persistence/sqlite/debtRepository';
import { createDebtPaymentRepository } from '../persistence/sqlite/debtPaymentRepository';
import { createEssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';
import { createIncomeRepository } from '../persistence/sqlite/incomeRepository';
import { initializeDatabase } from '../persistence/sqlite/initialize';
import { loadTimeline } from './loadTimeline';

test('file-backed snapshot stays coherent across a concurrent write; next load sees persisted changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-timeline-'));
  const owned = new Set<FinancialConnection>();
  let closes = 0;
  const open = async (): Promise<FinancialConnection> => {
    const native = new DatabaseSync(join(directory, 'synthetic.db'));
    const db: FinancialConnection = {
      async execAsync(sql) { native.exec(sql); },
      async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
      async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
      async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
      async closeAsync() { native.close(); owned.delete(db); closes++; },
    };
    owned.add(db);
    try { await initializeDatabase(db); } catch (error) { await db.closeAsync(); throw error; }
    return db;
  };
  const today = () => FinancialDate.parse('2026-10-02');
  const amount = (n: number) => Money.fromMinorUnits(n, 'PHP');
  const salary = Income.create({ id: incomeId('synthetic'), name: 'Synthetic original salary', amount: amount(450000),
    date: FinancialDate.parse('2026-10-04'), status: 'expected' });
  try {
    await expect(loadTimeline({ open, today })).resolves.toMatchObject({ kind: 'missing-available-money' });
    const writer = await open();
    await createAvailableMoneyRepository(writer).save(AvailableMoney.create({ amount: amount(0) }));
    await createIncomeRepository(writer).save(salary);
    const snapshot = await loadTimeline({ open, today, repositories: db => {
      const availableMoney = createAvailableMoneyRepository(db);
      return {
        availableMoney: { async get() {
          const original = await availableMoney.get(); // Establish the WAL read snapshot.
          await writer.execAsync('BEGIN IMMEDIATE');
          await createAvailableMoneyRepository(writer).save(AvailableMoney.create({ amount: amount(10000) }));
          await createIncomeRepository(writer).save(Income.create({ ...salary, status: 'expected', name: 'Synthetic revised salary', amount: amount(500000) }));
          await writer.execAsync('COMMIT');
          return original;
        } },
        debts: createDebtRepository(db), incomes: createIncomeRepository(db),
        essentialObligations: createEssentialObligationRepository(db), debtPayments: createDebtPaymentRepository(db),
      };
    } });
    if (snapshot.kind !== 'ready') throw Error('Expected ready');
    expect(snapshot.projection.start.balance.minorUnits).toBe(0);
    expect(snapshot.groups[0].entries[0].sourceName).toBe('Synthetic original salary');
    expect(snapshot.projection.endingBalance.minorUnits).toBe(450000);
    await writer.closeAsync();
    const refreshed = await loadTimeline({ open, today });
    if (refreshed.kind !== 'ready') throw Error('Expected ready');
    expect(refreshed.projection.start.balance.minorUnits).toBe(10000);
    expect(refreshed.groups[0].entries[0].sourceName).toBe('Synthetic revised salary');
    expect(refreshed.projection.endingBalance.minorUnits).toBe(510000);
    expect(owned.size).toBe(0); expect(closes).toBe(4);
  } finally {
    for (const db of owned) await db.closeAsync();
    rmSync(directory, { recursive: true, force: true });
  }
});
