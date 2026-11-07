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

describe('0016 — les gestes d’avant le déplacement entre séries', () => {
    it('restent des changements de statut, sans détail', () => {
        const { db, appliquer } = baseAvant('0016');
        db.prepare(`INSERT INTO contents (id, title, status, created_at, updated_at) VALUES ('c', 'c', 'Prêt', 1, 1)`).run();
        db.prepare(`INSERT INTO gestes (id, content_id, statut, avant, created_at) VALUES ('g', 'c', 'Prêt', 'Brouillon', 2)`).run();
        appliquer();
        expect(db.prepare('SELECT statut, avant, nature, detail FROM gestes').all())
            .toEqual([{ statut: 'Prêt', avant: 'Brouillon', nature: 'statut', detail: null }]);
    });
});

describe('0017 — les séries existantes remises en ordre, 1 à n', () => {
    it('comble un trou, départage un doublon, range un contenu sans rang en fin — sans toucher au reste', () => {
        const { db, appliquer } = baseAvant('0017');
        db.prepare(`INSERT INTO series (id, titre, created_at, updated_at) VALUES ('s', 'S', 1, 1), ('t', 'T', 1, 1)`).run();
        const contenu = (id: string, serie: string | null, rang: number | null, creeLe: number, supprime: number | null = null) =>
            db.prepare(`INSERT INTO contents (id, title, status, serie_id, serie_position, created_at, updated_at, deleted_at)
                        VALUES (?, ?, 'Brouillon', ?, ?, ?, 10, ?)`).run(id, id, serie, rang, creeLe, supprime);
        contenu('un', 's', 1, 1);
        contenu('trois', 's', 3, 2);
        contenu('trois-bis', 's', 3, 3);
        contenu('sans-rang', 's', null, 4);
        contenu('supprime', 's', 2, 5, 99);
        contenu('t1', 't', 1, 6);
        contenu('t2', 't', 2, 7);
        contenu('libre', null, null, 8);
        appliquer();
        const ligne = (id: string) => db.prepare('SELECT serie_position AS rang, updated_at AS le FROM contents WHERE id = ?').get(id) as any;
        expect(['un', 'trois', 'trois-bis', 'sans-rang'].map((id) => ligne(id).rang)).toEqual([1, 2, 3, 4]);
        // Seules les lignes renumérotées avancent : la synchronisation incrémentale les verra passer.
        expect(ligne('un').le).toBe(10);
        expect(ligne('trois').le).toBeGreaterThan(10);
        expect([ligne('supprime').rang, ligne('t1').rang, ligne('t2').rang, ligne('libre').rang]).toEqual([2, 1, 2, null]);
        expect([ligne('t1').le, ligne('t2').le, ligne('libre').le]).toEqual([10, 10, 10]);
    });
});
