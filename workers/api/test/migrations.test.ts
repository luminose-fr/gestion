/**
 * Les migrations qui RÉPARENT des données, et pas seulement le schéma.
 *
 * Le helper D1 les applique toutes sur une base vide, où une réparation n'a
 * rien à réparer : il passe sans rien prouver. Ici on s'arrête juste avant,
 * on pose les lignes abîmées, puis on applique la migration seule.
 */
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** Une base migrée jusqu'à `numero` exclu, et de quoi appliquer `numero`. */
function baseAvant(numero: string) {
    const db = new DatabaseSync(':memory:');
    const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    const cible = fichiers.find((f) => f.startsWith(numero));
    if (!cible) throw new Error(`Migration ${numero} introuvable`);
    for (const f of fichiers.filter((f) => f < cible)) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    return { db, appliquer: () => db.exec(readFileSync(join(MIGRATIONS, cible), 'utf8')) };
}

describe('0009 — la date d’analyse effacée par le tiroir d’une idée', () => {
    const contenu = (db: DatabaseSync, id: string, verdict: string | null, analyzedAt: number | null) =>
        db.prepare(`INSERT INTO contents (id, title, status, verdict, analyzed_at, created_at, updated_at)
                    VALUES (?, ?, 'Idée', ?, ?, 1, 1)`).run(id, id, verdict, analyzedAt);
    const analyse = (db: DatabaseSync, id: string, contentId: string, le: number) =>
        db.prepare(`INSERT INTO generations (id, content_id, kind, model_label, payload, created_at)
                    VALUES (?, ?, 'analysis', 'Modèle', '{}', ?)`).run(id, contentId, le);
    const date = (db: DatabaseSync, id: string) =>
        (db.prepare('SELECT analyzed_at FROM contents WHERE id = ?').get(id) as any).analyzed_at;

    it('reprend la plus récente analyse du journal', () => {
        const { db, appliquer } = baseAvant('0009');
        contenu(db, 'abimee', 'Valide', null);
        analyse(db, 'g1', 'abimee', 1000);
        analyse(db, 'g2', 'abimee', 2000);
        appliquer();
        expect(date(db, 'abimee')).toBe(2000);
    });

    it('ne touche ni une idée jamais analysée, ni une date déjà posée, ni une idée sans trace', () => {
        const { db, appliquer } = baseAvant('0009');
        contenu(db, 'vierge', null, null);
        contenu(db, 'saine', 'Trop lisse', 500);
        analyse(db, 'g1', 'saine', 9000);
        contenu(db, 'sans-trace', 'À revoir', null);
        // Une autre production au journal n'est pas une analyse.
        db.prepare(`INSERT INTO generations (id, content_id, kind, model_label, payload, created_at)
                    VALUES ('g2', 'sans-trace', 'draft', 'Modèle', '{}', 3000)`).run();
        appliquer();
        expect(date(db, 'vierge')).toBeNull();
        expect(date(db, 'saine')).toBe(500);
        expect(date(db, 'sans-trace')).toBeNull();
    });
});
