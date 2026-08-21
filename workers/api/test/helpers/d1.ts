/**
 * Adaptateur D1 minimal au-dessus de node:sqlite.
 *
 * Pourquoi pas @cloudflare/vitest-pool-workers : ces tests s'exécutent contre
 * le VRAI fichier de migration, dans un SQLite réel, sans démarrer de runtime
 * Workers. Ils vérifient donc aussi le schéma — contraintes, index, valeurs par
 * défaut — et tournent en quelques millisecondes.
 *
 * Ne couvre que la surface de D1 réellement utilisée par les routes :
 * prepare / bind / run / first / all, et batch.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations');

type Row = Record<string, unknown>;

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }

  /**
   * D1 rend la MÊME forme pour une écriture et une lecture : `results` est vide
   * pour un INSERT, peuplé pour un SELECT. C'est ce qui permet à un batch de
   * mêler les deux — et ce que fait l'export (§9.4), qui lit six tables dans
   * une seule transaction. `node:sqlite`, lui, sépare `run` et `all`.
   */
  async run() {
    const stmt = this.db.prepare(this.sql);
    if (/^\s*SELECT/i.test(this.sql)) {
      return { success: true, results: stmt.all(...(this.params as any[])) as Row[], meta: { changes: 0, last_row_id: 0 } };
    }
    const res = stmt.run(...(this.params as any[]));
    return { success: true, results: [] as Row[], meta: { changes: Number(res.changes), last_row_id: Number(res.lastInsertRowid) } };
  }

  async first(): Promise<Row | null> {
    return (this.db.prepare(this.sql).get(...(this.params as any[])) as Row) ?? null;
  }

  async all(): Promise<{ results: Row[]; success: boolean }> {
    return { results: this.db.prepare(this.sql).all(...(this.params as any[])) as Row[], success: true };
  }
}

export class TestD1 {
  private db = new DatabaseSync(':memory:');

  constructor() {
    // Les clés étrangères ne sont PAS actives par défaut en SQLite : sans ça,
    // les ON DELETE CASCADE des migrations ne seraient jamais exercés.
    this.db.exec('PRAGMA foreign_keys = ON');
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
  }

  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }

  /** D1 exécute un batch dans une transaction implicite : tout ou rien. */
  async batch(statements: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Raccourci de lecture directe, pour les assertions de test. */
  query(sql: string, ...params: unknown[]): Row[] {
    return this.db.prepare(sql).all(...(params as any[])) as Row[];
  }
}

export const makeEnv = () => ({
  DB: new TestD1() as unknown as D1Database,
  SESSION_SECRET: 'secret-de-test',
  AUTH_USERNAME: 'florent',
  AUTH_PASSWORD: 'mot-de-passe',
  ONE_MIN_API_KEY: 'cle-1min',
  NOTION_API_KEY: 'cle-notion',
});
