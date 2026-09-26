// The small async surface used here is structurally implemented by Expo SQLite.
export type SqlValue = string | number | null;

export interface SQLiteConnection {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<unknown>;
  closeAsync(): Promise<void>;
}

export interface FinancialConnection extends SQLiteConnection {
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}
