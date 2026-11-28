/**
 * Les routes de la console des clients (SPEC §15.3, §15.5) — identités fictives.
 *
 * Ce que la suite ne voit pas : deux requêtes VRAIMENT simultanées. Ici,
 * `Promise.all` les fait passer l'une après l'autre dans la même base ; ce
 * qu'elle prouve, c'est qu'aucune lecture d'avant ne décide à la place de
 * l'écriture. La simultanéité réelle se constate en recette.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { MESSAGE_NON_RELIEE } from '../src/clients/base';
import { CODE_INCIDENT } from '../src/routes/clients-commun';
import { MESSAGE_NOTE_MODIFIEE } from '../src/routes/clients';
import { MESSAGE_CHEVAUCHEMENT } from '../src/routes/seances';
import { MESSAGE_COMPLET, MESSAGE_DEJA_INSCRITE, MESSAGE_INSCRITS } from '../src/routes/evenements';
import { makeEnv, type TestD1 } from './helpers/d1';
import { ajouterClient, ajouterEvenement, compter, TYPES, MINUTE, HEURE } from './helpers/clients';

// ─── L'outillage ────────────────────────────────────────────────────────────

const JETON_MCP = 'jeton-du-serveur-mcp-de-test';
const empreinte = async (jeton: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton)))]
    .map((o) => o.toString(16).padStart(2, '0')).join('');

type EnvTest = ReturnType<typeof makeEnv> & { MCP_JETON_EMPREINTE?: string };

let env: EnvTest;
let base: TestD1;
let jeton: string;

const appeler = async (methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}, e: EnvTest = env) =>
  app.fetch(new Request(`https://api.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': await createSessionToken(e), ...entetes },
    body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
  }), e as any);

const json = async (res: Response) => res.json() as Promise<any>;

/** Compte les instructions préparées sur la base des clients. */
const espionner = (db: D1Database) => {
  const preparees: string[] = [];
  const prepare = db.prepare.bind(db);
  (db as any).prepare = (sql: string) => { preparees.push(sql); return prepare(sql); };
  return preparees;
};

let journaux: ReturnType<typeof vi.spyOn>[];
beforeEach(async () => {
  env = makeEnv({ clients: true });
  base = env.CLIENTS as unknown as TestD1;
  jeton = await createSessionToken(env);
  journaux = (['error', 'warn', 'log', 'info', 'debug'] as const).map((n) => vi.spyOn(console, n).mockImplementation(() => {}));
});
afterEach(() => { for (const j of journaux) j.mockRestore(); vi.restoreAllMocks(); });
const toutJournal = () => journaux.flatMap((j) => j.mock.calls.map((a: unknown[]) => JSON.stringify(a))).join('\n');

/** Lundi 11 janvier 2027, 9 h 30 à Paris. */
const LUNDI = Date.UTC(2027, 0, 11, 8, 30);
const isoParis = (t: number) => {
  // Janvier : Paris est à +01:00.
  const d = new Date(t + HEURE);
  return `${d.toISOString().slice(0, 19)}+01:00`;
};

const poser = (clientId: string, debut: number, typeSeanceId: string = TYPES.seance, extra: Record<string, unknown> = {}) =>
  appeler('POST', '/api/seances', { clientId, typeSeanceId, debut: isoParis(debut), ...extra });

const seanceBrute = (id: string, debut: number, champs: Record<string, unknown> = {}) => {
  const s = { client_id: 'client-a', type_seance_id: TYPES.seance, duree_min: 90, statut: 'realisee', identite_recue: null, libelle_importe: null, ...champs };
  return base.prepare(`INSERT INTO seances (id, client_id, type_seance_id, identite_recue, debut, duree_min, occupe_jusqua, statut,
    etat_paiement, origine, libelle_importe, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'a_payer', 'console', ?, 0, 0)`)
    .bind(id, s.client_id, s.type_seance_id, s.identite_recue, debut, s.duree_min, debut + Number(s.duree_min) * MINUTE, s.statut, s.libelle_importe).run();
};

// ─── Chaque famille : la session, le serveur MCP, la liaison, l'origine ────

/** Une lecture et une écriture par famille. */
const FAMILLES = [
  { nom: 'clients', lecture: '/api/clients/etat', ecriture: ['POST', '/api/clients', { prenom: 'Origine' }], table: 'clients' },
  { nom: 'seances', lecture: '/api/seances?du=2027-01-11&au=2027-01-17', ecriture: ['POST', '/api/seances', { clientId: 'client-a', typeSeanceId: TYPES.seance, debut: '2027-01-11T09:30:00+01:00' }], table: 'seances' },
  { nom: 'evenements', lecture: '/api/evenements', ecriture: ['POST', '/api/evenements', { nom: 'Journée', debut: '2027-01-16T10:00:00+01:00' }], table: 'evenements' },
  { nom: 'inscriptions', lecture: null, ecriture: ['PATCH', '/api/inscriptions/ins-1', { statut: 'annulee' }], table: "inscriptions WHERE statut = 'annulee'" },
  { nom: 'professionnels', lecture: '/api/professionnels', ecriture: ['POST', '/api/professionnels', { nom: 'Cabinet' }], table: 'professionnels' },
  { nom: 'reservation', lecture: '/api/reservation', ecriture: ['PATCH', '/api/reservation/reglages', { retenue_carte_h: 2 }], table: 'reglages WHERE valeur = 2' },
] as const;

const preparer = async () => {
  await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
  await ajouterEvenement(base, 'ev-1', 4);
  await base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
    VALUES ('ins-1', 'ev-1', 'client-a', 'confirmee', 'REF-1', 'console', 0, 0)`).run();
};

const compterTable = (table: string) => Number(base.query(`SELECT COUNT(*) AS n FROM ${table}`)[0].n);

describe.each(FAMILLES)('NORMATIF — famille $nom', (f) => {
  it('sans session : 401', async () => {
    const res = await app.fetch(new Request(`https://api.test${f.lecture ?? f.ecriture[1]}`, { method: f.lecture ? 'GET' : f.ecriture[0] }), env as any);
    expect(res.status).toBe(401);
  });

  it.each([true, false])('jeton du serveur MCP : 403, liaison présente : %s', async (avecClients) => {
    const e: EnvTest = { ...makeEnv({ clients: avecClients }), MCP_JETON_EMPREINTE: await empreinte(JETON_MCP) };
    const espion = e.CLIENTS ? espionner(e.CLIENTS) : [];
    for (const [methode, chemin] of [['GET', f.lecture], [f.ecriture[0], f.ecriture[1]]] as const) {
      if (!chemin) continue;
      const res = await app.fetch(new Request(`https://api.test${chemin}`, { method: methode, headers: { Authorization: `Bearer ${JETON_MCP}` } }), e as any);
      expect(res.status).toBe(403);
    }
    expect(espion).toEqual([]);
  });

  it('sans liaison CLIENTS : 409, le message dans error, rien dans les journaux', async () => {
    const e = makeEnv();
    for (const [methode, chemin, corps] of [['GET', f.lecture, undefined], f.ecriture] as const) {
      if (!chemin) continue;
      const res = await appeler(methode, chemin, corps, {}, e);
      expect(res.status).toBe(409);
      expect(await json(res)).toEqual({ error: MESSAGE_NON_RELIEE });
    }
    expect(toutJournal()).toBe('');
  });

  it('une écriture venue d’une autre origine, session valable : 403, base intacte', async () => {
    await preparer();
    const avant = compterTable(f.table);
    const res = await appeler(f.ecriture[0], f.ecriture[1], f.ecriture[2], { Origin: 'https://ailleurs.example' });
    expect(res.status).toBe(403);
    expect(compterTable(f.table)).toBe(avant);
    // Le témoin : la même écriture, de la bonne origine, passe.
    const bonne = await appeler(f.ecriture[0], f.ecriture[1], f.ecriture[2], { Origin: 'https://api.test' });
    expect(bonne.status).toBeLessThan(300);
    expect(compterTable(f.table)).not.toBe(avant);
  });

  it('Cache-Control: no-store sur une réussite et sur un refus', async () => {
    await preparer();
    const reussite = await appeler(f.ecriture[0], f.ecriture[1], f.ecriture[2]);
    expect(reussite.status).toBeLessThan(300);
    expect(reussite.headers.get('Cache-Control')).toBe('no-store');
    const refus = await appeler(f.ecriture[0], f.ecriture[1], { inconnu: 1 });
    expect(refus.status).toBe(400);
    expect(refus.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('NORMATIF — un refus de validation ne recopie rien ; une panne ne journalise qu’un code', () => {
  it('une clé inconnue portant une valeur repère n’apparaît ni dans la réponse, ni dans les journaux', async () => {
    const res = await appeler('POST', '/api/clients', { prenom: 'Émilie', 'repere.nom@example.org': 'REPERE-VALEUR' });
    expect(res.status).toBe(400);
    const texte = await res.text();
    expect(JSON.parse(texte)).toEqual({ error: 'Entrée invalide', champs: ['champ_inconnu'] });
    expect(texte).not.toMatch(/repere/i);
    expect(toutJournal()).not.toMatch(/repere/i);
    expect(compter(base, 'clients')).toBe(0);
  });

  it('un champ connu en défaut est nommé, sans sa valeur', async () => {
    const res = await appeler('POST', '/api/clients', { prenom: 'Émilie', email: 'REPERE-pas-une-adresse' });
    expect(await json(res)).toEqual({ error: 'Entrée invalide', champs: ['email'] });
  });

  it('un corps qui n’est pas du JSON : « corps »', async () => {
    const res = await appeler('POST', '/api/clients/recherche', '{pas du json');
    expect(await json(res)).toEqual({ error: 'Entrée invalide', champs: ['corps'] });
  });

  it('une exception dont le message porte une valeur repère : 500, le code d’incident seul', async () => {
    (env.CLIENTS as any).prepare = () => { throw new Error('REPERE-PANNE emilie.martin@example.org'); };
    const res = await appeler('POST', '/api/clients/recherche', { q: '' });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/REPERE|emilie/);
    expect(toutJournal()).not.toMatch(/REPERE|emilie/);
    expect(toutJournal()).toContain(CODE_INCIDENT);
  });
});

// ─── Les fiches ─────────────────────────────────────────────────────────────

describe('Les fiches', () => {
  it('crée une fiche : nom de recherche et clé calculés par packages/pratique', async () => {
    const res = await appeler('POST', '/api/clients', { prenom: ' émilie ', nom: 'MARTIN', email: ' Emilie.Martin@Example.org ' });
    expect(res.status).toBe(201);
    const { id } = await json(res);
    const ligne = base.query('SELECT * FROM clients WHERE id = ?', id)[0] as any;
    expect(ligne.prenom).toBe('Émilie');
    expect(ligne.nom).toBe('Martin');
    expect(ligne.email).toBe('emilie.martin@example.org');
    expect(ligne.nom_recherche).toBe('emilie martin');
    expect(ligne.cle_client).toBe('emilie.martin@example.org emilie martin');
  });

  it('le prénom est obligatoire', async () => {
    expect(await json(await appeler('POST', '/api/clients', { nom: 'Martin' }))).toEqual({ error: 'Entrée invalide', champs: ['prenom'] });
  });

  it.each([
    ['un identifiant Stancer', { stancerCustomerId: 'cus_x' }],
    ['la clé', { cleClient: 'x' }],
    ['le nom de recherche', { nomRecherche: 'x' }],
    ['une trace d’envoi', { brevoAjouteLe: 1 }],
    ['le clic d’annonce', { clicAnnonce: 'x' }],
  ])('créer ou modifier une fiche avec %s : refusé', async (_, champ) => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
    expect((await appeler('POST', '/api/clients', { prenom: 'Ève', ...champ })).status).toBe(400);
    expect((await appeler('PATCH', '/api/clients/client-a', champ)).status).toBe(400);
    expect(compter(base, 'clients')).toBe(1);
  });

  it('modifier recalcule le nom de recherche et la clé', async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
    expect((await appeler('PATCH', '/api/clients/client-a', { nom: 'Dupont-Lévêque', ville: 'Ville d’essai' })).status).toBe(200);
    const l = base.query('SELECT nom_recherche, cle_client, ville FROM clients WHERE id = ?', 'client-a')[0];
    expect(l).toEqual({ nom_recherche: 'emilie dupont-leveque', cle_client: 'emilie.martin@example.org dupont emilie leveque', ville: 'Ville d’essai' });
    expect((await appeler('PATCH', '/api/clients/inconnue', { ville: 'x' })).status).toBe(404);
  });

  it('la fiche : ses liens, ses séances numérotées hors annulées, ses inscriptions', async () => {
    await base.prepare(`INSERT INTO professionnels (id, nom, created_at, updated_at) VALUES ('pro-1', 'Cabinet d’essai', 0, 0)`).run();
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
    await ajouterClient(base, 'client-b', 'Léo', 'Martin');
    await base.prepare(`UPDATE clients SET via_professionnel_id = 'pro-1', date_naissance = '1988-04-12' WHERE id = 'client-a'`).run();
    await base.prepare(`UPDATE clients SET via_client_id = 'client-a' WHERE id = 'client-b'`).run();
    await seanceBrute('s1', LUNDI - 21 * 24 * HEURE);
    await seanceBrute('s2', LUNDI - 14 * 24 * HEURE, { statut: 'annulee' });
    await seanceBrute('s3', LUNDI - 7 * 24 * HEURE);
    await ajouterEvenement(base, 'ev-1', 4);
    await base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
      VALUES ('ins-1', 'ev-1', 'client-a', 'confirmee', 'REF-1', 'console', 0, 0)`).run();
    const f = await json(await appeler('GET', '/api/clients/client-a'));
    expect(f.viaProfessionnel).toEqual({ id: 'pro-1', nom: 'Cabinet d’essai' });
    expect(f.aRecommande).toEqual([{ id: 'client-b', prenom: 'Léo', nom: 'Martin' }]);
    expect(f.dateNaissance).toBe('1988-04-12');
    expect(typeof f.age).toBe('number');
    expect(f.seances.map((s: any) => [s.id, s.numero])).toEqual([['s3', 2], ['s2', null], ['s1', 1]]);
    expect(f.seances[0].debut).toBe('2027-01-04T09:30:00+01:00');
    expect(f.inscriptions.map((i: any) => [i.id, i.evenement.id])).toEqual([['ins-1', 'ev-1']]);
    expect((await appeler('GET', '/api/clients/inconnue')).status).toBe(404);
  });

  it('NORMATIF — d’un questionnaire, la fiche ne rend que les clés annoncées (règle 4)', async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
    await base.prepare(`INSERT INTO questionnaires (id, contexte, version, client_id, identite, reponses, a_revoir, created_at, updated_at)
      VALUES ('q-1', 'seance', 'complet', 'client-a', '{"prenom":"REPERE"}', '{"REPERE":"oui"}', 1, ?, ?)`).bind(LUNDI, LUNDI).run();
    const res = await appeler('GET', '/api/clients/client-a');
    const f = JSON.parse(await res.text());
    expect(f.listeQuestionnaires).toHaveLength(1);
    expect(Object.keys(f.listeQuestionnaires[0]).sort()).toEqual(['aRevoir', 'date', 'id', 'relu', 'version']);
    expect(f.listeQuestionnaires[0]).toEqual({ id: 'q-1', date: '2027-01-11T09:30:00+01:00', version: 'complet', relu: false, aRevoir: true });
    expect(JSON.stringify(f)).not.toContain('REPERE');
  });
});

describe('La recherche', () => {
  beforeEach(async () => {
    await ajouterClient(base, 'c-emilie', 'Émilie', 'Martin', 'emilie.martin@example.org');
    await ajouterClient(base, 'c-eve', 'Ève', 'Dupont', 'eve.dupont@example.org');
    await ajouterClient(base, 'c-oenone', 'Œnone', 'Roux', 'oenone.roux@example.org');
    await base.prepare(`UPDATE clients SET nom_recherche = 'emilie martin' WHERE id = 'c-emilie'`).run();
    await base.prepare(`UPDATE clients SET nom_recherche = 'eve dupont' WHERE id = 'c-eve'`).run();
    await base.prepare(`UPDATE clients SET nom_recherche = 'oenone roux' WHERE id = 'c-oenone'`).run();
  });
  const ids = async (q: string) => (await json(await appeler('POST', '/api/clients/recherche', { q }))).fiches.map((f: any) => f.id);

  it('sans accents, par un morceau de nom, par l’adresse', async () => {
    expect(await ids('ÉMILIE')).toEqual(['c-emilie']);
    expect(await ids('Ève')).toEqual(['c-eve']);
    expect(await ids('œnone')).toEqual(['c-oenone']);
    expect(await ids('mart')).toEqual(['c-emilie']);
    expect(await ids('dupont@exam')).toEqual(['c-eve']);
    expect(await ids('')).toEqual(['c-emilie', 'c-eve', 'c-oenone']);
  });

  it('une saisie « % » ou « _ » ne rend pas tout', async () => {
    expect(await ids('%')).toEqual([]);
    expect(await ids('_')).toEqual([]);
    expect(await ids('e%e')).toEqual([]);
  });

  it('50 par page, et la suite', async () => {
    for (let k = 0; k < 60; k++) await ajouterClient(base, `c-${String(k).padStart(2, '0')}`, 'Zoe', `Essai${k}`);
    const p0 = await json(await appeler('POST', '/api/clients/recherche', { q: 'zoe', page: 0 }));
    const p1 = await json(await appeler('POST', '/api/clients/recherche', { q: 'zoe', page: 1 }));
    expect([p0.fiches.length, p0.suite, p1.fiches.length, p1.suite]).toEqual([50, true, 10, false]);
  });

  it('NORMATIF — aucune route ne prend q dans son adresse (règle 3)', async () => {
    expect((await appeler('GET', '/api/clients/recherche?q=emilie')).status).not.toBe(200);
    expect((await appeler('GET', '/api/clients?q=emilie')).status).not.toBe(200);
    const routes = join(import.meta.dirname, '..', 'src', 'routes');
    const fautifs = readdirSync(routes).filter((f) => /clients|seances|evenements|professionnels|reservation/.test(f))
      .filter((f) => /query\(\s*['"]q['"]|searchParams\.get\(\s*['"]q['"]/.test(readFileSync(join(routes, f), 'utf8')));
    expect(fautifs).toEqual([]);
  });
});

describe('Les fiches semblables', () => {
  beforeEach(async () => {
    await ajouterClient(base, 'avec-adresse', 'Émilie', 'Martin', 'emilie.martin@example.org');
    await ajouterClient(base, 'homonyme', 'Émilie', 'Martin');
    await ajouterClient(base, 'autre-nom', 'Émilie', 'Durand');
    await base.prepare(`UPDATE clients SET nom_recherche = 'emilie martin', cle_client = 'emilie.martin@example.org emilie martin' WHERE id = 'avec-adresse'`).run();
    await base.prepare(`UPDATE clients SET nom_recherche = 'emilie martin' WHERE id = 'homonyme'`).run();
    await base.prepare(`UPDATE clients SET nom_recherche = 'emilie durand' WHERE id = 'autre-nom'`).run();
  });
  const semblables = async (corps: object) => (await json(await appeler('POST', '/api/clients/semblables', corps))).fiches.map((f: any) => f.id).sort();

  it('le prénom seul ne rend pas toutes les fiches sans adresse', async () => {
    expect(await semblables({ prenom: 'Émilie' })).toEqual([]);
    expect(await semblables({ prenom: 'Émilie', nom: '', email: '' })).toEqual([]);
  });

  it('même prénom et nom, même adresse, même clé', async () => {
    expect(await semblables({ prenom: 'emilie', nom: 'MARTIN' })).toEqual(['avec-adresse', 'homonyme']);
    expect(await semblables({ prenom: 'Zoé', email: 'Emilie.Martin@example.org' })).toEqual(['avec-adresse']);
  });

  it('deux homonymes se distinguent par leur identifiant, et chacun ouvre la bonne fiche', async () => {
    const fiches = (await json(await appeler('POST', '/api/clients/semblables', { prenom: 'Émilie', nom: 'Martin' }))).fiches;
    expect(new Set(fiches.map((f: any) => f.id)).size).toBe(2);
    for (const f of fiches) {
      const fiche = await json(await appeler('GET', `/api/clients/${f.id}`));
      expect(fiche.id).toBe(f.id);
      expect(fiche.email).toBe(f.id === 'avec-adresse' ? 'emilie.martin@example.org' : null);
    }
  });
});

describe('Le couple', () => {
  beforeEach(async () => {
    for (const [id, prenom] of [['a', 'Ana'], ['b', 'Bea'], ['c', 'Cyr'], ['d', 'Dan']]) await ajouterClient(base, id, prenom, 'Essai');
  });
  const couples = () => Object.fromEntries(base.query('SELECT id, couple_client_id FROM clients ORDER BY id').map((r: any) => [r.id, r.couple_client_id]));

  it('posé des deux côtés, remplacé (l’ancien conjoint est délié), défait des deux côtés', async () => {
    await appeler('PATCH', '/api/clients/a', { coupleClientId: 'b' });
    expect(couples()).toEqual({ a: 'b', b: 'a', c: null, d: null });
    await appeler('PATCH', '/api/clients/c', { coupleClientId: 'd' });
    await appeler('PATCH', '/api/clients/a', { coupleClientId: 'c' });
    expect(couples()).toEqual({ a: 'c', b: null, c: 'a', d: null });
    await appeler('PATCH', '/api/clients/a', { coupleClientId: null });
    expect(couples()).toEqual({ a: null, b: null, c: null, d: null });
  });

  it('à la création aussi, et jamais vers soi-même ni vers une fiche absente', async () => {
    const { id } = await json(await appeler('POST', '/api/clients', { prenom: 'Eli', coupleClientId: 'a' }));
    expect(couples()[id]).toBe('a');
    expect(couples().a).toBe(id);
    expect((await appeler('PATCH', '/api/clients/b', { coupleClientId: 'b' })).status).toBe(400);
    expect((await appeler('PATCH', '/api/clients/b', { viaClientId: 'absente' })).status).toBe(400);
  });
});

// ─── Le nombre d'instructions ne dépend pas du volume (règle 2) ─────────────

describe('NORMATIF — un écran, un nombre fixe d’instructions', () => {
  const peupler = async (n: number) => {
    for (let k = 0; k < n; k++) await ajouterClient(base, `c-${k}`, 'Zoé', `Essai${k}`);
    await ajouterEvenement(base, 'ev-x', 1000);
    for (let k = 0; k < n; k++) {
      await seanceBrute(`s-${k}`, LUNDI + k * 2 * HEURE, { client_id: 'c-0' });
      await base.prepare(`INSERT INTO evenements (id, nom, debut, places_totales, created_at, updated_at) VALUES (?, 'Ev', 0, 10, 0, 0)`).bind(`ev-${k}`).run();
      await base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
        VALUES (?, 'ev-x', ?, 'confirmee', ?, 'console', 0, 0)`).bind(`i-${k}`, `c-${k}`, `R-${k}`).run();
    }
  };
  const mesurer = async () => {
    const espion = espionner(env.CLIENTS!);
    const chemins = [
      ['POST', '/api/clients/recherche', { q: '' }], ['GET', '/api/clients/c-0'],
      ['GET', '/api/seances?du=2027-01-11&au=2027-02-28'], ['GET', '/api/evenements'], ['GET', '/api/evenements/ev-x'],
      ['GET', '/api/professionnels'], ['GET', '/api/reservation'],
    ] as const;
    const comptes: number[] = [];
    for (const [m, c, b] of chemins) {
      const avant = espion.length;
      expect((await appeler(m, c, b)).status).toBe(200);
      comptes.push(espion.length - avant);
    }
    return comptes;
  };

  it('3 lignes puis 300 : le même nombre', async () => {
    await peupler(3);
    const petit = await mesurer();
    env = makeEnv({ clients: true });
    base = env.CLIENTS as unknown as TestD1;
    await peupler(300);
    expect(await mesurer()).toEqual(petit);
    // La liste, une instruction ; la fiche, cinq dans un lot ; la semaine, une ; les évènements, une.
    expect(petit.slice(0, 4)).toEqual([1, 5, 1, 1]);
  });
});

describe('NORMATIF — rien des tables sensibles dans la liste, la fiche, la semaine, un évènement', () => {
  it('valeurs repères à l’appui', async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
    await seanceBrute('s1', LUNDI);
    await ajouterEvenement(base, 'ev-1', 4);
    await base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
      VALUES ('ins-1', 'ev-1', 'client-a', 'confirmee', 'REF-1', 'console', 0, 0)`).run();
    await base.prepare(`INSERT INTO clients_notes (id, client_id, texte, created_at, updated_at) VALUES ('n', 'client-a', 'REPERE-NOTE', 0, 0)`).run();
    await base.prepare(`INSERT INTO clients_confiance (id, client_id, prenom, created_at, updated_at) VALUES ('k', 'client-a', 'REPERE-CONFIANCE', 0, 0)`).run();
    await base.prepare(`INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES ('sn', 's1', 'REPERE-SEANCE', 0, 0)`).run();
    await base.prepare(`INSERT INTO seances_reponses (id, seance_id, rang, question, reponse, created_at, updated_at) VALUES ('sr', 's1', 1, 'REPERE-Q', 'REPERE-R', 0, 0)`).run();
    await base.prepare(`INSERT INTO questionnaires (id, contexte, client_id, reponses, created_at, updated_at) VALUES ('q', 'seance', 'client-a', 'REPERE-QUEST', 0, 0)`).run();
    for (const [m, c, b] of [
      ['POST', '/api/clients/recherche', { q: '' }], ['GET', '/api/clients/client-a'], ['GET', '/api/seances?du=2027-01-11&au=2027-01-17'],
      ['GET', '/api/seances/s1'], ['GET', '/api/evenements'], ['GET', '/api/evenements/ev-1'],
    ] as const) {
      const texte = await (await appeler(m, c, b)).text();
      expect(texte, c).not.toContain('REPERE');
    }
  });
});

// ─── La personne de confiance et les notes ─────────────────────────────────

describe('La personne de confiance', () => {
  it('se lit et s’écrit à part ; une seconde écriture met à jour', async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
    expect(await json(await appeler('GET', '/api/clients/client-a/confiance'))).toEqual({ confiance: null });
    expect((await appeler('PUT', '/api/clients/client-a/confiance', { prenom: 'Paul', telephone: '+33 6 39 98 00 50' })).status).toBe(200);
    expect((await appeler('PUT', '/api/clients/client-a/confiance', { prenom: 'Paule', email: 'paule@example.org' })).status).toBe(200);
    const { confiance } = await json(await appeler('GET', '/api/clients/client-a/confiance'));
    expect([confiance.prenom, confiance.telephone, confiance.email]).toEqual(['Paule', null, 'paule@example.org']);
    expect(compter(base, 'clients_confiance')).toBe(1);
    expect((await appeler('PUT', '/api/clients/absente/confiance', { prenom: 'x' })).status).toBe(404);
  });
});

describe('NORMATIF — une note ne s’écrase pas en silence (règle 7)', () => {
  const T = Date.UTC(2026, 11, 1, 10, 0);
  beforeEach(async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
    await seanceBrute('s1', LUNDI);
  });

  it('fiche : première écriture, écriture normale, version périmée → 409 et base intacte', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T);
    const v1 = (await json(await appeler('PUT', '/api/clients/client-a/notes', { texte: 'Texte d’essai 1', version: null }))).version;
    expect(v1).toBe(T);
    const v2 = (await json(await appeler('PUT', '/api/clients/client-a/notes', { texte: 'Texte d’essai 2', version: v1 }))).version;
    const perime = await appeler('PUT', '/api/clients/client-a/notes', { texte: 'Écrasement', version: v1 });
    expect(perime.status).toBe(409);
    expect(await json(perime)).toEqual({ error: MESSAGE_NOTE_MODIFIEE });
    expect(await json(await appeler('GET', '/api/clients/client-a/notes'))).toEqual({ texte: 'Texte d’essai 2', version: v2 });
  });

  it('deux écritures dans la même milliseconde : deux versions distinctes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T);
    const v1 = (await json(await appeler('PUT', '/api/seances/s1/notes', { texte: 'a', version: null }))).version;
    const v2 = (await json(await appeler('PUT', '/api/seances/s1/notes', { texte: 'b', version: v1 }))).version;
    expect(v2).toBeGreaterThan(v1);
    expect((await appeler('PUT', '/api/seances/s1/notes', { texte: 'c', version: v1 })).status).toBe(409);
  });

  it('deux premières écritures simultanées : une seule aboutit', async () => {
    const trame = (texte: string) => ({ texte, version: null });
    const [a, b] = await Promise.all([
      appeler('PUT', '/api/seances/s1/notes', trame('premiere')), appeler('PUT', '/api/seances/s1/notes', trame('seconde')),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [x, y] = await Promise.all([
      appeler('PUT', '/api/clients/client-a/notes', { texte: 'un', version: null }), appeler('PUT', '/api/clients/client-a/notes', { texte: 'deux', version: null }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('la séance : ses notes, ses réponses et la copie de Notion en lecture seule', async () => {
    await base.prepare(`INSERT INTO seances_reponses (id, seance_id, rang, question, reponse, created_at, updated_at) VALUES ('r1', 's1', 1, 'Qu’est-ce qui vous amène ?', 'Texte d’essai', 0, 0)`).run();
    const n = await json(await appeler('GET', '/api/seances/s1/notes'));
    expect(n).toEqual({ texte: null, version: null, importNotion: null, reponses: [{ rang: 1, question: 'Qu’est-ce qui vous amène ?', reponse: 'Texte d’essai' }] });
    expect((await appeler('PUT', '/api/seances/s1/notes', { importNotion: 'x', version: null })).status).toBe(400);
    expect((await appeler('PUT', '/api/seances/s1/notes', { demande: 'x', texte: null, version: null })).status).toBe(400);
  });

  it('les notes d’une séance : un seul texte ; une note de l’ancienne trame se lit en un texte, et s’écrit ainsi', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T);
    await base.prepare(`INSERT INTO seances_notes (id, seance_id, demande, seance, reponse_sms, created_at, updated_at)
      VALUES ('n1', 's1', 'Texte d’essai — demande', 'Texte d’essai — séance', 'Texte d’essai — SMS', 1, 1)`).run();
    const n = await json(await appeler('GET', '/api/seances/s1/notes'));
    expect(n.texte).toBe('## Demande\n\nTexte d’essai — demande\n\n## Séance\n\nTexte d’essai — séance\n\n## Réponse SMS\n\nTexte d’essai — SMS');
    const v = (await json(await appeler('PUT', '/api/seances/s1/notes', { texte: n.texte, version: n.version }))).version;
    expect(await base.prepare(`SELECT demande, seance, reponse_sms FROM seances_notes WHERE seance_id = 's1'`).first())
      .toEqual({ demande: null, seance: n.texte, reponse_sms: null });
    expect((await json(await appeler('GET', '/api/seances/s1/notes'))).texte).toBe(n.texte);
    // Un texte vide s'enregistre comme rien.
    await appeler('PUT', '/api/seances/s1/notes', { texte: '   ', version: v });
    expect((await json(await appeler('GET', '/api/seances/s1/notes'))).texte).toBeNull();
  });
});

// ─── L'agenda (règles 6 et 11) ──────────────────────────────────────────────

describe('NORMATIF — l’agenda ne se modifie que par ses décisions', () => {
  beforeEach(async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
    await ajouterClient(base, 'client-b', 'Ève', 'Dupont');
  });
  const mouvements = (id: string) => base.query('SELECT nature FROM seances_mouvements WHERE seance_id = ? ORDER BY created_at, nature', id).map((r: any) => r.nature);

  it('poser : la durée, le montant et le paiement du type ; refusé sur une heure prise, rien d’écrit', async () => {
    const res = await poser('client-a', LUNDI);
    expect(res.status).toBe(201);
    const { id } = await json(res);
    expect(base.query('SELECT duree_min, montant_centimes, etat_paiement, mode, origine, agenda_etat FROM seances WHERE id = ?', id)[0])
      .toEqual({ duree_min: 90, montant_centimes: 8000, etat_paiement: 'a_payer', mode: 'sur_place', origine: 'console', agenda_etat: 'a_ecrire' });
    const refus = await poser('client-b', LUNDI + 30 * MINUTE);
    expect(refus.status).toBe(409);
    // Le refus dit avec qui (refonte, lot 4) : le nom de l'autre personne et ses heures, à Paris.
    expect(await json(refus)).toEqual({ error: 'Ce créneau chevauche le rendez-vous de Émilie Martin, de 9 h 30 à 11 h.' });
    expect(MESSAGE_CHEVAUCHEMENT).toMatch(/^Ce créneau chevauche/);
    expect([compter(base, 'seances'), compter(base, 'seances_mouvements')]).toEqual([1, 1]);
  });

  it('poser hors fenêtre et hors horaires : accepté — Florent passe outre', async () => {
    // Un dimanche à 3 h du matin, dans deux heures : ni dans la fenêtre, ni dans la semaine type.
    expect((await poser('client-a', Date.UTC(2026, 11, 6, 2, 0))).status).toBe(201);
    expect((await poser('client-a', Date.now() + 2 * HEURE)).status).toBe(201);
  });

  it('déplacer sur une heure prise : 409, rien d’écrit ; ailleurs : fait', async () => {
    const a = (await json(await poser('client-a', LUNDI))).id;
    await poser('client-b', LUNDI + 3 * HEURE);
    const refus = await appeler('POST', `/api/seances/${a}/deplacer`, { debut: isoParis(LUNDI + 2 * HEURE), revision: 0 });
    expect(refus.status).toBe(409);
    expect(mouvements(a)).toEqual(['creee']);
    expect((await appeler('POST', `/api/seances/${a}/deplacer`, { debut: isoParis(LUNDI + 6 * HEURE), revision: 0 })).status).toBe(200);
    const perimee = await appeler('POST', `/api/seances/${a}/deplacer`, { debut: isoParis(LUNDI + 8 * HEURE), revision: 0 });
    expect(perimee.status).toBe(409);
    expect((await json(perimee)).error).toMatch(/changé/);
  });

  it('annuler : statut et mouvement ; deux fois : un seul mouvement', async () => {
    const a = (await json(await poser('client-a', LUNDI))).id;
    expect(await json(await appeler('POST', `/api/seances/${a}/annuler`))).toEqual({ id: a, fait: true });
    expect(await json(await appeler('POST', `/api/seances/${a}/annuler`))).toEqual({ id: a, fait: false });
    expect(base.query('SELECT statut FROM seances WHERE id = ?', a)[0]).toEqual({ statut: 'annulee' });
    expect(mouvements(a).sort()).toEqual(['annulee', 'creee']);
  });

  it.each(['annulee', 'realisee', 'absent'])('remettre à « prévue » une séance %s : sur une heure prise → 409, rien d’écrit', async (statut) => {
    await seanceBrute('ancienne', LUNDI, { statut });
    await poser('client-b', LUNDI + 30 * MINUTE);
    const refus = await appeler('POST', '/api/seances/ancienne/prevoir');
    expect(refus.status).toBe(409);
    expect(base.query('SELECT statut FROM seances WHERE id = ?', 'ancienne')[0]).toEqual({ statut });
    expect(mouvements('ancienne')).toEqual([]);
  });

  it('remettre à « prévue » sur une heure libre : fait, avec son mouvement', async () => {
    await seanceBrute('ancienne', LUNDI, { statut: 'absent' });
    expect((await appeler('POST', '/api/seances/ancienne/prevoir')).status).toBe(200);
    expect(mouvements('ancienne')).toEqual(['retablie']);
    expect((await appeler('POST', '/api/seances/ancienne/prevoir')).status).toBe(409);
  });

  it('changer le type d’une séance prévue quand seule la marge du nouveau type chevauche la suivante : 409', async () => {
    const a = (await json(await poser('client-a', LUNDI))).id;                  // 9 h 30 – 11 h
    await poser('client-b', LUNDI + 100 * MINUTE);                               // 11 h 10
    const refus = await appeler('PATCH', `/api/seances/${a}`, { typeSeanceId: TYPES.breathwork, etatPaiement: 'payee' });
    expect(refus.status).toBe(409);
    expect(base.query('SELECT type_seance_id, occupe_jusqua, etat_paiement FROM seances WHERE id = ?', a)[0])
      .toEqual({ type_seance_id: TYPES.seance, occupe_jusqua: LUNDI + 90 * MINUTE, etat_paiement: 'a_payer' });
    // Une durée plus courte libère la marge : 75 + 15 = 90 minutes.
    expect((await appeler('PATCH', `/api/seances/${a}`, { typeSeanceId: TYPES.breathwork, dureeMin: 75 })).status).toBe(200);
    expect(base.query('SELECT occupe_jusqua FROM seances WHERE id = ?', a)[0]).toEqual({ occupe_jusqua: LUNDI + 90 * MINUTE });
  });

  it('sur une séance qui n’est pas prévue : simple mise à jour, borne recalculée', async () => {
    await seanceBrute('passee', LUNDI);
    await poser('client-b', LUNDI + 100 * MINUTE);
    expect((await appeler('PATCH', '/api/seances/passee', { typeSeanceId: TYPES.breathwork, statut: 'absent' })).status).toBe(200);
    expect(base.query('SELECT occupe_jusqua, statut FROM seances WHERE id = ?', 'passee')[0]).toEqual({ occupe_jusqua: LUNDI + 105 * MINUTE, statut: 'absent' });
  });

  it('jamais le début, jamais « prévue » ni « annulée » par une modification', async () => {
    const a = (await json(await poser('client-a', LUNDI))).id;
    for (const corps of [{ debut: isoParis(LUNDI) }, { statut: 'prevue' }, { statut: 'annulee' }]) {
      expect((await appeler('PATCH', `/api/seances/${a}`, corps)).status).toBe(400);
    }
  });

  it('une date sans décalage est refusée', async () => {
    const res = await appeler('POST', '/api/seances', { clientId: 'client-a', typeSeanceId: TYPES.seance, debut: '2027-01-11T09:30:00' });
    expect(await json(res)).toEqual({ error: 'Entrée invalide', champs: ['debut'] });
  });
});

describe('NORMATIF — une séance sans fiche ou sans type se voit quand même (règle 13)', () => {
  it('dans la semaine, avec le prénom et le nom reçus, sans l’adresse ni le téléphone', async () => {
    await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
    await seanceBrute('sans-fiche', LUNDI, {
      client_id: null, statut: 'prevue',
      identite_recue: JSON.stringify({ prenom: 'Ève', nom: 'Dupont', email: 'repere.adresse@example.org', telephone: 'REPERE-TEL' }),
    });
    await seanceBrute('sans-type', LUNDI + 3 * HEURE, { type_seance_id: null, libelle_importe: 'Séance 4 (Séance à distance)' });
    const res = await appeler('GET', '/api/seances?du=2027-01-11&au=2027-01-11');
    const texte = await res.text();
    const { seances } = JSON.parse(texte);
    expect(seances.map((s: any) => [s.id, s.personne, s.type?.cle ?? null, s.libelleImporte])).toEqual([
      ['sans-fiche', { clientId: null, prenom: 'Ève', nom: 'Dupont' }, 'seance', null],
      ['sans-type', { clientId: 'client-a', prenom: 'Émilie', nom: 'Martin' }, null, 'Séance 4 (Séance à distance)'],
    ]);
    expect(texte).not.toMatch(/REPERE|repere/);
  });

  it('la période : 62 jours au plus', async () => {
    expect((await appeler('GET', '/api/seances?du=2027-01-01&au=2027-03-03')).status).toBe(200);
    expect((await appeler('GET', '/api/seances?du=2027-01-01&au=2027-03-05')).status).toBe(400);
    expect((await appeler('GET', '/api/seances?du=2027-01-10&au=2027-01-01')).status).toBe(400);
  });
});

// ─── Les évènements et les places (règle 12) ────────────────────────────────

describe('NORMATIF — une place ne se prend que par sa décision', () => {
  beforeEach(async () => {
    for (const [id, p] of [['a', 'Ana'], ['b', 'Bea'], ['c', 'Cyr']]) await ajouterClient(base, id, p, 'Essai');
    await ajouterEvenement(base, 'ev', 1);
  });
  const inscrire = (client: string, ev = 'ev') => appeler('POST', `/api/evenements/${ev}/inscriptions`, { clientId: client });
  const poserInscription = (id: string, client: string, statut: string, champs = '') =>
    base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at${champs ? ', mode_paiement, retenue_jusqua' : ''})
      VALUES (?, 'ev', ?, ?, ?, 'console', 0, 0${champs})`).bind(id, client, statut, `R-${id}`).run();

  it('journée complète → 409 ; double inscription → 409', async () => {
    expect((await inscrire('a')).status).toBe(201);
    const complet = await inscrire('b');
    expect([complet.status, (await json(complet)).error]).toEqual([409, MESSAGE_COMPLET]);
    await base.prepare('UPDATE evenements SET places_totales = 5').run();
    const double = await inscrire('a');
    expect([double.status, (await json(double)).error]).toEqual([409, MESSAGE_DEJA_INSCRITE]);
    expect(compter(base, 'inscriptions')).toBe(1);
  });

  it.each([
    ['annulée', 'annulee', ''],
    ['déconseillée', 'deconseillee', ''],
    ['expirée', 'expiree', ''],
    ['retenue par carte échue', 'retenue', ", 'carte', 1"],
  ])('le retour d’une inscription %s quand la place a été reprise → 409', async (_, statut, champs) => {
    await poserInscription('ancienne', 'a', statut, champs);
    expect((await inscrire('b')).status).toBe(201);
    const res = await appeler('PATCH', '/api/inscriptions/ancienne', { statut: 'confirmee' });
    expect([res.status, (await json(res)).error]).toEqual([409, MESSAGE_COMPLET]);
    expect(base.query('SELECT statut FROM inscriptions WHERE id = ?', 'ancienne')[0]).toEqual({ statut });
  });

  it('le retour d’une annulée sur une place libre : fait ; une confirmée qui occupe déjà la sienne la garde', async () => {
    await poserInscription('ancienne', 'a', 'annulee');
    expect((await appeler('PATCH', '/api/inscriptions/ancienne', { statut: 'confirmee' })).status).toBe(200);
    expect((await appeler('PATCH', '/api/inscriptions/ancienne', { statut: 'confirmee' })).status).toBe(200);
    expect((await appeler('PATCH', '/api/inscriptions/ancienne', { statut: 'annulee' })).status).toBe(200);
  });

  it('la dernière place demandée en même temps par une inscription et par un retour : une seule', async () => {
    await poserInscription('ancienne', 'a', 'annulee');
    const [x, y] = await Promise.all([inscrire('b'), appeler('PATCH', '/api/inscriptions/ancienne', { statut: 'confirmee' })]);
    expect([x.status, y.status].filter((s) => s < 300)).toHaveLength(1);
    expect(Number(base.query("SELECT COUNT(*) AS n FROM inscriptions WHERE statut = 'confirmee'")[0].n)).toBe(1);
  });

  it('places abaissées sous l’occupation → 409 ; au niveau de l’occupation → fait', async () => {
    await base.prepare('UPDATE evenements SET places_totales = 3').run();
    await inscrire('a');
    await inscrire('b');
    expect((await appeler('PATCH', '/api/evenements/ev', { placesTotales: 1 })).status).toBe(409);
    expect((await appeler('PATCH', '/api/evenements/ev', { placesTotales: 2 })).status).toBe(200);
    expect(base.query('SELECT places_totales FROM evenements')[0]).toEqual({ places_totales: 2 });
  });

  it('suppression d’un évènement en même temps qu’une inscription : l’une des deux échoue', async () => {
    const [suppression, inscription] = await Promise.all([appeler('DELETE', '/api/evenements/ev'), inscrire('a')]);
    expect([suppression.status, inscription.status].filter((s) => s < 300)).toHaveLength(1);
    const ev = base.query('SELECT deleted_at FROM evenements')[0] as any;
    expect(ev.deleted_at !== null && compter(base, 'inscriptions') > 0).toBe(false);
    if (inscription.status === 201) expect((await json(await appeler('DELETE', '/api/evenements/ev'))).error).toBe(MESSAGE_INSCRITS);
  });

  it('la liste : places occupées et libres à l’instant (§14.4)', async () => {
    await base.prepare('UPDATE evenements SET places_totales = 4').run();
    await poserInscription('v', 'a', 'retenue', ", 'virement', 1");
    await poserInscription('k', 'b', 'retenue', ", 'carte', 1");
    const { evenements } = await json(await appeler('GET', '/api/evenements'));
    expect(evenements[0]).toMatchObject({ id: 'ev', placesTotales: 4, placesOccupees: 1, placesLibres: 3 });
    expect((await appeler('GET', '/api/evenements/ev')).status).toBe(200);
  });

  it('un évènement : créé, modifié, le prix en centimes, `publie` hors de portée', async () => {
    const { id } = await json(await appeler('POST', '/api/evenements', { nom: 'Journée d’essai', debut: '2027-01-16T10:00:00+01:00', prixCentimes: 9000, placesTotales: 12 }));
    expect((await appeler('PATCH', `/api/evenements/${id}`, { publie: true })).status).toBe(400);
    expect((await appeler('PATCH', `/api/evenements/${id}`, { htmlProgramme: '<p>Texte d’essai</p>' })).status).toBe(200);
    const e = await json(await appeler('GET', `/api/evenements/${id}`));
    expect([e.prixCentimes, e.htmlProgramme, e.debut, e.publie]).toEqual([9000, '<p>Texte d’essai</p>', '2027-01-16T10:00:00+01:00', false]);
  });
});

describe('NORMATIF — aucune route DELETE sur les fiches, les séances, les inscriptions, les questionnaires (règle 8)', () => {
  it.each(['/api/clients/x', '/api/seances/x', '/api/inscriptions/x', '/api/clients/x/notes', '/api/seances/x/notes', '/api/clients/x/confiance'])('DELETE %s : 404', async (chemin) => {
    expect((await appeler('DELETE', chemin)).status).toBe(404);
  });
});

// ─── Les professionnels et la réservation ───────────────────────────────────

describe('Les professionnels', () => {
  it('créés, listés avec les personnes reçues, modifiés, retirés logiquement', async () => {
    const { id } = await json(await appeler('POST', '/api/professionnels', { nom: 'Cabinet d’essai', categories: ['Médecin'], courriers: ['Mai 2025'], connu: true }));
    await ajouterClient(base, 'a', 'Ana', 'Essai');
    await base.prepare('UPDATE clients SET via_professionnel_id = ?').bind(id).run();
    expect((await json(await appeler('GET', '/api/professionnels'))).professionnels[0])
      .toMatchObject({ id, categories: ['Médecin'], courriers: ['Mai 2025'], connu: true, personnesRecues: 1 });
    expect((await appeler('PATCH', `/api/professionnels/${id}`, { ville: 'Ville d’essai' })).status).toBe(200);
    expect((await appeler('DELETE', `/api/professionnels/${id}`)).status).toBe(200);
    expect((await json(await appeler('GET', '/api/professionnels'))).professionnels).toEqual([]);
    expect(base.query('SELECT via_professionnel_id FROM clients')[0]).toEqual({ via_professionnel_id: id });
  });
});

describe('Les réglages de la réservation', () => {
  it('lit les types, la semaine, les dates à venir et les réglages', async () => {
    const r = await json(await appeler('GET', '/api/reservation'));
    expect(r.types.map((t: any) => t.cle)).toContain('seance_breathwork');
    expect(r.semaine).toHaveLength(6);
    expect(r.reglages.liste_attente_personnes_max).toBe(8);
  });

  it('modifie un type, sans sa clé ; refuse une fenêtre inversée', async () => {
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { montantCentimes: 9000 })).status).toBe(200);
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { cle: 'autre' })).status).toBe(400);
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { fenetreDebutH: 10, fenetreFinH: 5 })).status).toBe(400);
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { fenetreFinH: 100 })).status).toBe(400);
  });

  it('renomme un type, et range les types en un lot (retours du 28/11, §2.6)', async () => {
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { libelle: 'Séance individuelle' })).status).toBe(200);
    expect((await appeler('PATCH', `/api/reservation/types/${TYPES.seance}`, { libelle: '  ' })).status).toBe(400);
    const avant = (await json(await appeler('GET', '/api/reservation'))).types as { id: string; libelle: string }[];
    expect(avant.find((t) => t.id === TYPES.seance)?.libelle).toBe('Séance individuelle');
    const inverse = avant.map((t) => t.id).reverse();
    expect((await appeler('PUT', '/api/reservation/types/ordre', { ids: inverse })).status).toBe(200);
    expect(((await json(await appeler('GET', '/api/reservation'))).types as { id: string }[]).map((t) => t.id)).toEqual(inverse);
    expect((await appeler('PUT', '/api/reservation/types/ordre', { ids: [] })).status).toBe(400);
  });

  it('remplace la semaine ; refuse des plages qui se chevauchent', async () => {
    expect((await appeler('PUT', '/api/reservation/semaine', { plages: [{ jour: 2, debut: '09:00', fin: '12:00' }, { jour: 2, debut: '11:00', fin: '13:00' }] })).status).toBe(400);
    expect((await appeler('PUT', '/api/reservation/semaine', { plages: [{ jour: 2, debut: '09:00', fin: '12:00' }] })).status).toBe(200);
    expect((await json(await appeler('GET', '/api/reservation'))).semaine).toMatchObject([{ jour: 2, debut: '09:00', fin: '12:00' }]);
  });

  it('une date : ouverte, fermée, rendue à la semaine type', async () => {
    expect((await appeler('PUT', '/api/reservation/dates/2099-01-05', { plages: [{ debut: '10:00', fin: '12:00' }] })).status).toBe(200);
    expect((await appeler('PUT', '/api/reservation/dates/2099-01-06', { plages: [] })).status).toBe(200);
    expect((await json(await appeler('GET', '/api/reservation'))).dates).toEqual([
      { date: '2099-01-05', plages: [{ debut: '10:00', fin: '12:00' }] }, { date: '2099-01-06', plages: [] },
    ]);
    expect((await appeler('DELETE', '/api/reservation/dates/2099-01-06')).status).toBe(200);
    expect((await json(await appeler('GET', '/api/reservation'))).dates).toHaveLength(1);
    expect((await appeler('PUT', '/api/reservation/dates/2099-02-30', { plages: [] })).status).toBe(400);
  });

  it('les réglages, par clé connue seulement', async () => {
    expect((await appeler('PATCH', '/api/reservation/reglages', { liste_attente_personnes_max: 6 })).status).toBe(200);
    expect((await json(await appeler('GET', '/api/reservation'))).reglages.liste_attente_personnes_max).toBe(6);
    expect((await appeler('PATCH', '/api/reservation/reglages', { inventee: 1 })).status).toBe(400);
  });
});
