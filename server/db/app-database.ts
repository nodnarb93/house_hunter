import BetterSqlite3 from 'better-sqlite3'

export type RawSqliteDatabase = InstanceType<typeof BetterSqlite3>

export interface SqlRunResult {
  meta: { last_row_id: number; changes: number }
}

export interface SqlPreparedStatement {
  bind(...values: unknown[]): SqlPreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<SqlRunResult>
}

export interface AppDatabase {
  prepare(sql: string): SqlPreparedStatement
}

class PreparedStatement implements SqlPreparedStatement {
  private params: unknown[] = []

  constructor(
    private readonly db: RawSqliteDatabase,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): SqlPreparedStatement {
    this.params = values
    return this
  }

  run(): Promise<SqlRunResult> {
    return Promise.resolve().then(() => {
      const stmt = this.db.prepare(this.sql)
      const result = stmt.run(...this.params)
      return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } }
    })
  }

  first<T>(): Promise<T | null> {
    return Promise.resolve().then(() => {
      const stmt = this.db.prepare(this.sql)
      const row = stmt.get(...this.params) as T | undefined
      return row === undefined ? null : row
    })
  }

  all<T>(): Promise<{ results: T[] }> {
    return Promise.resolve().then(() => {
      const stmt = this.db.prepare(this.sql)
      const results = stmt.all(...this.params) as T[]
      return { results }
    })
  }
}

export function wrapDatabase(db: RawSqliteDatabase): AppDatabase {
  return {
    prepare(sql: string) {
      return new PreparedStatement(db, sql)
    },
  }
}
