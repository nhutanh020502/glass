/* eslint-disable @typescript-eslint/no-explicit-any */
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config();
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wowjlldnblegwbdoqtrf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Supabase REST client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Postgres client connection singleton
let pgClient: postgres.Sql | null = null;

export function getPg(): postgres.Sql {
  if (!pgClient) {
    const connStr = process.env.DATABASE_URL || process.env.DIRECT_URL;
    if (!connStr || connStr.includes('[YOUR_PASSWORD]')) {
      throw new Error(
        'Vui lòng cấu hình mật khẩu Supabase trong biến DATABASE_URL ở file .env.local.'
      );
    }
    pgClient = postgres(connStr, {
      ssl: 'require',
      max: 20,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return pgClient;
}

export function translateSql(rawSql: string, params: unknown[] = []): { query: string; params: unknown[] } {
  let query = rawSql.trim();

  // 1. PRAGMA table_info(tableName)
  const pragmaMatch = query.match(/PRAGMA\s+table_info\(([^)]+)\)/i);
  if (pragmaMatch) {
    const table = pragmaMatch[1].trim().replace(/['"`]/g, '');
    return {
      query: `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}'`,
      params: [],
    };
  }

  // 2. PRAGMA optimize
  if (/PRAGMA\s+optimize/i.test(query)) {
    return { query: 'SELECT 1', params: [] };
  }

  // 3. INSERT OR REPLACE INTO app_migrations
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+app_migrations/i.test(query)) {
    query = query.replace(
      /INSERT\s+OR\s+REPLACE\s+INTO\s+app_migrations\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      'INSERT INTO "app_migrations" ($1) VALUES ($2) ON CONFLICT ("key") DO UPDATE SET "completed_at" = EXCLUDED."completed_at", "note" = EXCLUDED."note"'
    );
  }

  // 4. INSERT OR IGNORE INTO
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(query)) {
    query = query.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(query)) {
      query += ' ON CONFLICT DO NOTHING';
    }
  }

  // 5. GROUP_CONCAT -> STRING_AGG
  query = query.replace(/GROUP_CONCAT\s*\(\s*DISTINCT\s+([^),]+)\s*,\s*('[^']*'|"[^"]*")\s*\)/gi, "STRING_AGG(DISTINCT ($1)::text, $2)");
  query = query.replace(/GROUP_CONCAT\s*\(\s*DISTINCT\s+([^)]+)\s*\)/gi, "STRING_AGG(DISTINCT ($1)::text, ', ')");
  query = query.replace(/GROUP_CONCAT\s*\(\s*([^),]+)\s*,\s*('[^']*'|"[^"]*")\s*\)/gi, "STRING_AGG(($1)::text, $2)");
  query = query.replace(/GROUP_CONCAT\s*\(\s*([^)]+)\s*\)/gi, "STRING_AGG(($1)::text, ', ')");

  // 6. INSTR(a, b) -> STRPOS(a, b)
  query = query.replace(/INSTR\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi, "STRPOS($1, $2)");

  // 7. substr(date('now'), 1, 7) or date('now')
  query = query.replace(/substr\s*\(\s*date\s*\(\s*['"]now['"]\s*\)\s*,\s*1\s*,\s*7\s*\)/gi, "to_char(CURRENT_DATE, 'YYYY-MM')");
  query = query.replace(/date\s*\(\s*['"]now['"]\s*\)/gi, "CURRENT_DATE::text");

  // 8. Replace rowid with id
  query = query.replace(/\browid\b/gi, 'id');

  // 9. Replace '?' with '$1, $2, ...'
  let paramIndex = 1;
  query = query.replace(/\?/g, () => `$${paramIndex++}`);

  return { query, params };
}

export interface PreparedStatement {
  bind(...params: any[]): PreparedStatement;
  all<T = any>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
  first<T = any>(col?: string): Promise<T | null>;
  raw(): Promise<any>;
}

export interface DatabaseAdapter {
  prepare(rawQuery: string): PreparedStatement;
  batch(statements: any[]): Promise<any[]>;
}

export function createDbAdapter(): DatabaseAdapter {
  const sql = getPg();

  return {
    prepare(rawQuery: string): PreparedStatement {
      let boundParams: any[] = [];

      const statement: PreparedStatement = {
        bind(...params: any[]) {
          boundParams = params;
          return statement;
        },
        async all<T = any>() {
          const { query, params } = translateSql(rawQuery, boundParams);
          const rows = await sql.unsafe(query, params as never);
          return { results: (rows as unknown) as T[], success: true };
        },
        async run() {
          const { query, params } = translateSql(rawQuery, boundParams);
          const result = await sql.unsafe(query, params as never);
          const count = typeof (result as unknown as { count?: number }).count === 'number'
            ? (result as unknown as { count?: number }).count
            : 1;
          return { success: true, meta: { changes: count } };
        },
        async first<T = any>(col?: string) {
          const { query, params } = translateSql(rawQuery, boundParams);
          const rows = await sql.unsafe(query, params as never);
          if (!rows || rows.length === 0) return null;
          if (col) return (rows[0] as Record<string, unknown>)[col] as T;
          return (rows[0] as unknown) as T;
        },
        async raw() {
          const { query, params } = translateSql(rawQuery, boundParams);
          return await sql.unsafe(query, params as never);
        },
      };

      return statement;
    },

    async batch(statements: any[]): Promise<any[]> {
      const results: any[] = [];
      for (const stmt of statements) {
        const res = await stmt.all();
        results.push(res);
      }
      return results;
    },
  };
}

export function getDb(): DatabaseAdapter {
  return createDbAdapter();
}
