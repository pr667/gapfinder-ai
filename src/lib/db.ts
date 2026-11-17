/**
 * Database access.
 *
 * Production (Vercel): Neon serverless Postgres over HTTP, via DATABASE_URL.
 * Local dev: PGlite, a real Postgres compiled to WASM, stored in ./.data, so
 * `npm run dev` works with zero setup and runs the exact same SQL.
 */
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Run = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = [
  `create table if not exists users (
     id text primary key, email text unique not null, name text not null,
     password_hash text not null, created_at timestamptz not null default now())`,
  `create table if not exists subjects (
     id text primary key, user_id text not null, name text not null,
     plan_days int not null default 5, plan_hours real not null default 2,
     created_at timestamptz not null default now())`,
  `create table if not exists documents (
     id text primary key, subject_id text not null, kind text not null, title text not null,
     page_count int not null default 1, char_count int not null default 0,
     created_at timestamptz not null default now())`,
  `create table if not exists chunks (
     id text primary key, subject_id text not null, document_id text not null, idx int not null,
     page int, heading text, content text not null, embedding jsonb,
     topic_id text, subtopic_id text, topic_score real)`,
  `create table if not exists topics (
     id text primary key, subject_id text not null, parent_id text, name text not null,
     summary text, keywords jsonb not null default '[]'::jsonb, position int not null default 0)`,
  `create table if not exists paper_questions (
     id text primary key, subject_id text not null, document_id text not null, label text not null,
     content text not null, topic_id text, method text)`,
  `create table if not exists attempts (
     id text primary key, subject_id text not null, number int not null, status text not null,
     score real, meta jsonb not null default '{}'::jsonb,
     created_at timestamptz not null default now(), submitted_at timestamptz)`,
  `create table if not exists questions (
     id text primary key, attempt_id text not null, subject_id text not null, topic_id text not null,
     subtopic_id text, position int not null, type text not null, prompt text not null,
     options jsonb, answer text not null, explanation text not null, concept text,
     chunk_id text not null, evidence text not null,
     response text, result text, score real, feedback text)`,
  `create table if not exists reports (
     id text primary key, subject_id text not null, attempt_id text not null, data jsonb not null,
     created_at timestamptz not null default now())`,
  `create table if not exists plans (
     id text primary key, subject_id text not null, attempt_id text, data jsonb not null,
     created_at timestamptz not null default now())`,
  `create index if not exists chunks_subject on chunks (subject_id)`,
  `create index if not exists questions_subject on questions (subject_id)`,
];

async function connect(): Promise<Run> {
  let run: Run;
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    run = async (text, params = []) => (await sql.query(text, params as any[])) as Row[];
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    // Vercel's filesystem is read-only except /tmp (and /tmp is wiped between
    // cold starts), so a deployment without DATABASE_URL only "works" briefly.
    const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? '/tmp/gapfinder-pglite' : '.data/pglite');
    if (dir !== 'memory://') {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dir, { recursive: true });
    }
    const db = new PGlite(dir);
    run = async (text, params = []) => (await db.query(text, params as any[])).rows as Row[];
  }
  // One cheap probe on the newest table; only create the schema if it's missing.
  try {
    await run('select 1 from plans limit 1');
  } catch {
    for (const stmt of SCHEMA) await run(stmt);
  }
  return run;
}

const g = globalThis as unknown as { __gapfinderDb?: Promise<Run> };

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  g.__gapfinderDb ??= connect().catch((e) => {
    g.__gapfinderDb = undefined;
    throw e;
  });
  const run = await g.__gapfinderDb;
  return (await run(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

/** Multi-row insert in batches. `rows` are arrays in column order. */
export async function insertMany(table: string, columns: string[], rows: unknown[][], jsonColumns: string[] = []) {
  const size = 40;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const marks = row.map((value, c) => {
        params.push(jsonColumns.includes(columns[c]) ? JSON.stringify(value ?? null) : value);
        return `$${params.length}${jsonColumns.includes(columns[c]) ? '::jsonb' : ''}`;
      });
      return `(${marks.join(',')})`;
    });
    await q(`insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`, params);
  }
}

export const newId = () => randomUUID();
export const usingPersistentDb = () => Boolean(process.env.DATABASE_URL) || !process.env.VERCEL;
