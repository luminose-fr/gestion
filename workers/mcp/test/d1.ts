/**
 * Adaptateur D1 minimal au-dessus de node:sqlite — même principe que celui de
 * workers/api, sans partage de code (SPEC §1.1) : les tests s'exécutent contre
 * le VRAI fichier de migration. Ils vérifient donc aussi le schéma, et
 * d'abord l'unicité de `jeton_empreinte`, qui porte l'usage unique du jeton.
 *
 * Ne couvre que ce que journal.ts utilise : prepare / bind / run / first.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

class Requete {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Requete(this.db, this.sql, params);
  }

  async run() {
    const resultat = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, results: [], meta: { changes: Number(resultat.changes), last_row_id: Number(resultat.lastInsertRowid) } };
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...(this.params as never[])) as T) ?? null;
  }
}

export class D1Test {
  readonly db = new DatabaseSync(':memory:');

  constructor() {
    for (const fichier of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(join(MIGRATIONS, fichier), 'utf8'));
    }
  }

  prepare(sql: string) {
    return new Requete(this.db, sql);
  }

  /** Les lignes du journal, telles que la base les tient. */
  lignes(): Record<string, unknown>[] {
    return this.db.prepare('SELECT * FROM ads_ecritures ORDER BY id').all() as Record<string, unknown>[];
  }
}

/** Une base qui tombe à chaque requête : pour vérifier que Google n'est pas appelé sans journal. */
export const d1EnPanne = () => ({
  prepare: () => ({
    bind: () => ({
      run: async () => { throw new Error('D1_ERROR: base indisponible'); },
      first: async () => { throw new Error('D1_ERROR: base indisponible'); },
    }),
  }),
});
