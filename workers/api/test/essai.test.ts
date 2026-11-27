/**
 * Le jeu d'essai (SPEC §14.8) : ce qu'il contient, qu'il se rejoue à
 * l'identique, et qu'il ne sait écrire que la base locale ou la recette.
 *
 * Le chargement réel passe par wrangler, sur la VM ; ici, le même SQL est joué
 * sur les vraies migrations, dans node:sqlite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jeuDEssai, enSql, EFFECTIFS, aParis, lireDate, type Table } from '../essai/donnees';
import { baseVisee, lireCible, LOCAL } from '../essai/cible';
import { prendrePlace } from '../src/clients/decisions';
import { TestD1, MIGRATIONS_CLIENTS } from './helpers/d1';

const DATE = '2026-12-01';
const charger = (base: TestD1, date = DATE) => (base as any).db.exec(enSql(jeuDEssai(date)));
const nouvelle = () => new TestD1(MIGRATIONS_CLIENTS);
const compter = (base: TestD1, table: string, where = '1 = 1') => Number(base.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0].n);

/** Toutes les tables, ligne par ligne : ce qu'on compare pour dire « même contenu ». */
const contenu = (base: TestD1) => {
  const tables = base.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => String(r.name));
  return Object.fromEntries(tables.map((t) => [t, base.query(`SELECT * FROM ${t} ORDER BY rowid`).map((r) => ({ ...r }))]));
};

describe('le contenu du jeu d’essai', () => {
  const base = nouvelle();
  charger(base);

  it.each(Object.entries(EFFECTIFS))('%s : les effectifs écrits dans le fichier', (table, n) => {
    expect(compter(base, table)).toBe(n);
  });

  it('chaque ligne écrite porte le préfixe essai- ; les données de départ sont intactes', () => {
    for (const table of Object.keys(EFFECTIFS)) expect(compter(base, table, "id NOT LIKE 'essai-%'"), table).toBe(0);
    expect(compter(base, 'types_seance')).toBe(6);
    expect(compter(base, 'horaires')).toBe(6);
  });

  it('des identités fictives : adresses en example.org, téléphones en +33 6 39 98', () => {
    for (const r of base.query('SELECT email, telephone FROM clients')) {
      if (r.email !== null) expect(String(r.email)).toMatch(/@example\.org$/);
      expect(String(r.telephone)).toMatch(/^\+33 6 39 98 /);
    }
  });

  it('une mère et son enfant à la même adresse, deux fiches de même clé, une fiche sans adresse', () => {
    const cle = (id: string) => base.query('SELECT cle_client FROM clients WHERE id = ?', id)[0].cle_client;
    expect(cle('essai-client-emilie')).toBe('emilie.martin@example.org emilie martin');
    expect(cle('essai-client-leo')).toBe('emilie.martin@example.org leo martin');
    expect(cle('essai-client-emilie-double')).toBe(cle('essai-client-emilie'));
    expect(cle('essai-client-sans-adresse')).toBeNull();
    expect(compter(base, 'clients', "cle_client = 'emilie.martin@example.org emilie martin'")).toBe(2);
    expect(cle('essai-client-jp')).toBe('jp.lhote@example.org hote jean l pierre');
  });

  it('une séance à venir de chaque type, sans chevauchement, marge comprise', () => {
    const reference = aParis(lireDate(DATE), '12:00');
    const avenir = base.query("SELECT debut, occupe_jusqua, type_seance_id FROM seances WHERE statut = 'prevue' AND client_id IS NOT NULL") as any[];
    expect(new Set(avenir.map((s) => s.type_seance_id)).size).toBe(6);
    const prevues = base.query("SELECT debut, occupe_jusqua FROM seances WHERE statut = 'prevue' ORDER BY debut") as any[];
    for (const s of prevues) expect(s.debut).toBeGreaterThan(reference);
    for (let i = 1; i < prevues.length; i++) expect(prevues[i].debut).toBeGreaterThanOrEqual(prevues[i - 1].occupe_jusqua);
  });

  it('cinq séances passées pour une fiche, dont une annulée ; une séance sans client avec son identité reçue', () => {
    expect(compter(base, 'seances', "client_id = 'essai-client-emilie' AND statut <> 'prevue'")).toBe(5);
    expect(compter(base, 'seances', "client_id = 'essai-client-emilie' AND statut = 'annulee'")).toBe(1);
    const orpheline = base.query('SELECT identite_recue FROM seances WHERE client_id IS NULL') as any[];
    expect(orpheline).toHaveLength(1);
    expect(JSON.parse(orpheline[0].identite_recue).email).toBe('emilie.martin@example.org');
  });

  it('la journée à une place libre en a bien une, à l’instant de référence : une inscription, pas deux', async () => {
    // Sur une copie : la base partagée par ce bloc doit garder ses effectifs.
    const maintenant = aParis(lireDate(DATE), '12:00');
    const copie = nouvelle();
    charger(copie);
    const db = copie as unknown as D1Database;
    const inscrire = (id: string, evenementId: string, clientId: string) =>
      prendrePlace(db, { id, evenementId, clientId, statut: 'confirmee', reference: id, origine: 'console' }, maintenant);
    expect((await inscrire('x1', 'essai-evenement-une-place', 'essai-client-jp')).faite).toBe(true);
    expect((await inscrire('x2', 'essai-evenement-une-place', 'essai-client-leo')).faite).toBe(false);
    expect((await inscrire('x3', 'essai-evenement-complet', 'essai-client-leo')).faite).toBe(false);
  });

  it('les tables sensibles : une note de séance et un questionnaire, manifestement factices', () => {
    expect(base.query('SELECT seance FROM seances_notes')[0].seance).toBe('Texte d’essai');
    expect(String(base.query('SELECT reponses FROM questionnaires')[0].reponses)).toContain('Texte d’essai');
  });
});

describe('NORMATIF — rejouable', () => {
  it('deux chargements à la même date donnent le même contenu, pas seulement les mêmes nombres', () => {
    expect(enSql(jeuDEssai(DATE))).toBe(enSql(jeuDEssai(DATE)));
    const une = nouvelle();
    charger(une);
    const deux = nouvelle();
    charger(deux);
    charger(deux);
    expect(contenu(deux)).toEqual(contenu(une));
  });

  it('rechargé à une autre date, « à venir » reste à venir — et les effectifs ne bougent pas', () => {
    const base = nouvelle();
    charger(base, DATE);
    charger(base, '2027-06-15');
    const reference = aParis(lireDate('2027-06-15'), '12:00');
    for (const s of base.query("SELECT debut FROM seances WHERE statut = 'prevue'") as any[]) expect(s.debut).toBeGreaterThan(reference);
    for (const [table, n] of Object.entries(EFFECTIFS)) expect(compter(base, table as Table), table).toBe(n);
  });

  it('ne touche à aucune ligne qui ne porte pas le préfixe', async () => {
    const base = nouvelle();
    await base.prepare(`INSERT INTO clients (id, prenom, nom, nom_recherche, email, created_at, updated_at)
      VALUES ('autre-fiche', 'Émilie', 'Martin', 'emilie martin', 'emilie.martin@example.org', 1, 1)`).run();
    const avant = contenu(base).clients;
    charger(base);
    charger(base);
    expect(contenu(base).clients.filter((r: any) => r.id === 'autre-fiche')).toEqual(avant);
  });

  it('la console a de quoi répondre : un couple lié des deux côtés, un professionnel, une recommandation', () => {
    const base = nouvelle();
    charger(base);
    const liens = Object.fromEntries((base.query('SELECT id, couple_client_id, via_client_id, via_professionnel_id FROM clients') as any[])
      .map((r) => [r.id, [r.couple_client_id, r.via_client_id, r.via_professionnel_id]]));
    expect(liens['essai-client-jeanluc'][0]).toBe('essai-client-oenone');
    expect(liens['essai-client-oenone'][0]).toBe('essai-client-jeanluc');
    expect(liens['essai-client-leo'][1]).toBe('essai-client-emilie');
    expect(liens['essai-client-eve'][2]).toBe('essai-pro-cabinet');
    expect(compter(base, 'clients_notes')).toBe(1);
    expect(compter(base, 'clients_confiance')).toBe(1);
  });

  it('les heures sont celles de Paris, de part et d’autre d’un changement d’heure', () => {
    expect(new Date(aParis(lireDate('2026-12-07'), '09:30')).toISOString()).toBe('2026-12-07T08:30:00.000Z');
    expect(new Date(aParis(lireDate('2027-03-29'), '09:30')).toISOString()).toBe('2027-03-29T07:30:00.000Z');
    expect(() => lireDate('2026-13-01')).toThrow(/AAAA-MM-JJ/);
  });
});

describe('NORMATIF — la commande ne vise que la base locale ou la recette', () => {
  const SOURCE = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
  /** Avant le report des identifiants de recette : indépendant de ce que le dépôt porte aujourd'hui. */
  const VIERGE = SOURCE.replace(/(\[\[env\.recette\.d1_databases\]\][\s\S]*?database_id = )"[^"]*"/g, '$1"A_REMPLACER"');

  it('exige une cible, et une seule', () => {
    expect(() => lireCible([])).toThrow(/--local ou --recette/);
    expect(() => lireCible(['--local', '--recette'])).toThrow(/une seule/);
    expect(() => lireCible(['--production'])).toThrow();
    expect(lireCible(['--local'])).toBe('local');
  });

  it('en local, la base aux identifiants fictifs', () => {
    expect(baseVisee(SOURCE, 'local')).toEqual({ nom: LOCAL.nom, id: LOCAL.id });
  });

  it('en recette, refusée tant que ses identifiants ne sont pas reportés', () => {
    expect(() => baseVisee(VIERGE, 'recette')).toThrow(/A_REMPLACER/);
  });

  it('en recette, luminose-clients-recette une fois complétée — et jamais une base de la production', () => {
    let n = 0;
    const completee = VIERGE.replace(/database_id = "A_REMPLACER"/g, () => `database_id = "1111111${n++}-2222-4333-8444-555555555555"`);
    expect(baseVisee(completee, 'recette')).toEqual({ nom: 'luminose-clients-recette', id: '11111111-2222-4333-8444-555555555555' });
    const copiee = completee.replace('11111111-2222-4333-8444-555555555555', 'e9327701-3b46-4f85-9e3f-513df1488118');
    expect(() => baseVisee(copiee, 'recette')).toThrow(/production/);
  });

  it('une autre base sous le nom CLIENTS est refusée', () => {
    const detournee = SOURCE.replace('database_name = "luminose-clients-local"', 'database_name = "luminose-clients"');
    expect(() => baseVisee(detournee, 'local')).toThrow(/luminose-clients-local/);
  });
});

describe('le parcours d’essai d’un questionnaire (phase S2a)', () => {
  it('envoyé deux fois : une ligne, un ordre prévu ; porte coupée : ferme ; l’interrupteur remis', async () => {
    const { essayerUnQuestionnaire } = await import('../essai/parcours-questionnaire');
    const base = nouvelle();
    charger(base);
    const env = { CLIENTS: base, PORTES_SECRET: 'secret-de-test' } as any;
    const r = await essayerUnQuestionnaire(env, aParis(lireDate(DATE), '12:00'));
    expect(r.premiere).toEqual({ ok: true });
    expect(r.seconde).toEqual({ ok: true });
    expect(r.questionnaires).toBe(1);
    expect(r.ordres).toEqual([{ etat: 'prevu' }]);
    expect(r.porteCoupee).toEqual({ ok: false, motif: 'ferme' });
    expect(r.etat).toMatchObject({ ouverte: true, commandesDuJour: 1 });
    expect(base.query("SELECT valeur FROM reglages WHERE cle = 'porte_publique_ouverte'")[0].valeur).toBe(1);
  });
});
