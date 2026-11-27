/**
 * La porte et gestion ensemble (SPEC §14.3, §14.5) : la porte de
 * workers/porte, et les entrées nommées de gestion à la place des liaisons de
 * service — le seul morceau qui ne se voit qu'en recette.
 *
 * Ce que ces tests protègent : la règle 4 de bout en bout (à parcours égal, le
 * même statut, le même corps, les mêmes en-têtes, que la personne soit connue
 * ou non, attendue ou non) et la règle 7 des deux côtés de la liaison.
 *
 * Le sens de l'import est permis : c'est la PORTE qui n'importe rien de
 * workers/api, pas l'inverse — et ceci est un test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { MAINTENANT } from './helpers/clients';
import { envPortes, executer, ficheEssai, seanceEssai, jetonDe, envoiComplet, envoiSuivi, espionner } from './helpers/portes';
import { PortePublique, PorteService } from '../src/index';
import porte from '../../porte/src/index';

const SITE = 'https://essai-recette.luminose.fr';
const IP = '203.0.113.42';
const REPERES = [IP, 'emilie.martin@example.org', 'Émilie', '+33 6 39 98 00 01', 'Question d’essai 2', 'repere-jeton-make'];

let env: any;
let base: TestD1;
let attentes: Promise<unknown>[];
let journal: string[];

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { attentes.push(p); }, passThroughOnException: () => {} }) as unknown as ExecutionContext;
const envPorte = () => ({
  ENVIRONNEMENT: 'recette',
  ORIGINE_SITE: SITE,
  GESTION_PUBLIQUE: new PortePublique(ctx(), env),
  GESTION_SERVICE: new PorteService(ctx(), env),
  LIMITE_QUESTIONNAIRES: { limit: async () => ({ success: true }) },
  LIMITE_LIENS: { limit: async () => ({ success: true }) },
});
const envoyer = (chemin: string, envoi: unknown, entetes: Record<string, string> = {}) =>
  porte.fetch(new Request(`https://api-recette.luminose.fr${chemin}`, {
    method: 'POST', body: JSON.stringify(envoi),
    headers: { Origin: SITE, 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...entetes },
  }), envPorte());
const vu = async (r: Response) => ({ statut: r.status, corps: await r.text(), entetes: [...r.headers.entries()].sort() });

beforeEach(() => {
  ({ env, base } = envPortes());
  attentes = [];
  journal = [];
  for (const niveau of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, niveau).mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); });
  }
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
});
afterEach(() => { vi.useRealTimers(); });

describe('NORMATIF — règle 4, à travers la porte : POST /v1/questionnaires', () => {
  const chemins: [string, (b: TestD1) => Promise<Record<string, unknown>>][] = [
    ['référence valable', async (b) => { ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1'); return envoiComplet({ reference: await jetonDe('s1') }); }],
    ['sans référence', async () => envoiComplet()],
    ['référence fausse', async () => envoiComplet({ reference: 'abc.def' })],
    ['référence échue', async (b) => { seanceEssai(b, 's1', null); return envoiComplet({ reference: await jetonDe('s1', { echeance: 1 }) }); }],
    ['référence révoquée', async (b) => { seanceEssai(b, 's1', null); return envoiComplet({ reference: await jetonDe('s1', { version: 9 }) }); }],
    ['séance qui a déjà un questionnaire', async (b) => {
      seanceEssai(b, 's1', null);
      executer(b, `INSERT INTO questionnaires (id, contexte, created_at, updated_at) VALUES ('q0', 'seance', 0, 0);
                   UPDATE seances SET questionnaire_id = 'q0';`);
      return envoiComplet({ reference: await jetonDe('s1') });
    }],
    ['suivi avec un complet', async (b) => {
      ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1');
      executer(b, `INSERT INTO questionnaires (id, contexte, version, client_id, created_at, updated_at) VALUES ('q0', 'seance', 'complet', 'c1', 0, 0)`);
      return envoiSuivi({ reference: await jetonDe('s1') });
    }],
    ['suivi sans complet', async (b) => { ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1'); return envoiSuivi({ reference: await jetonDe('s1') }); }],
    ['personne connue, sans lien', async (b) => { ficheEssai(b, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' }); return envoiComplet(); }],
    ['personne inconnue', async () => envoiComplet({ identite: { prenom: 'Ève', nom: 'Dupont', email: 'eve.dupont@example.org' } })],
  ];

  it('chaque chemin : le même statut, le même corps, les mêmes en-têtes', async () => {
    const vus = new Set<string>();
    for (const [, preparer] of chemins) {
      ({ env, base } = envPortes());
      const envoi = await preparer(base);
      vus.add(JSON.stringify(await vu(await envoyer('/v1/questionnaires', envoi))));
    }
    expect(vus.size).toBe(1);
    expect(JSON.parse([...vus][0])).toMatchObject({ statut: 200, corps: '{"ok":true}' });
  });
});

describe('NORMATIF — règle 4, à travers la porte : POST /v1/questionnaires/lien', () => {
  const cas: [string, () => Promise<unknown>][] = [
    ['faux', async () => ({ reference: 'abc.def' })],
    ['échu', async () => ({ reference: await jetonDe('s1', { echeance: MAINTENANT - 1 }) })],
    ['révoqué', async () => ({ reference: await jetonDe('s1', { version: 3 }) })],
    ['séance annulée', async () => { executer(base, "UPDATE seances SET statut = 'annulee'"); return { reference: await jetonDe('s1') }; }],
  ];

  it('faux, échu, révoqué, séance annulée : la même réponse, les mêmes en-têtes, les mêmes instructions', async () => {
    const vus = new Set<string>();
    const instructions = new Set<number>();
    for (const [, preparer] of cas) {
      ({ env, base } = envPortes());
      seanceEssai(base, 's1', null);
      const envoi = await preparer();
      const preparees = espionner(env.CLIENTS);
      vus.add(JSON.stringify(await vu(await envoyer('/v1/questionnaires/lien', envoi))));
      instructions.add(preparees.length);
    }
    expect(vus.size).toBe(1);
    expect(JSON.parse([...vus][0])).toMatchObject({ statut: 200, corps: '{"ok":false,"motif":"lien_invalide"}' });
    expect([...instructions]).toEqual([2]);
  });

  it('valable : { ok: true }, avec les mêmes en-têtes', async () => {
    seanceEssai(base, 's1', null);
    const valable = await vu(await envoyer('/v1/questionnaires/lien', { reference: await jetonDe('s1') }));
    const faux = await vu(await envoyer('/v1/questionnaires/lien', { reference: 'abc.def' }));
    expect(valable.corps).toBe('{"ok":true}');
    expect(valable.entetes).toEqual(faux.entetes);
  });
});

describe('l’envoi de bout en bout', () => {
  it('envoyé deux fois : une ligne, un ordre, la même réponse ; la fiche complétée par waitUntil', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const envoi = envoiComplet({ reference: await jetonDe('s1') });
    const premier = await vu(await envoyer('/v1/questionnaires', envoi));
    const second = await vu(await envoyer('/v1/questionnaires', envoi));
    expect(second).toEqual(premier);
    expect(base.query('SELECT COUNT(*) AS n FROM questionnaires')[0].n).toBe(1);
    expect(base.query('SELECT COUNT(*) AS n FROM ordres')[0].n).toBe(1);
    await Promise.all(attentes);
    expect(base.query("SELECT telephone FROM clients WHERE id = 'c1'")[0].telephone).toBe('+33 6 39 98 00 01');
  });

  it('porte coupée : ferme, à l’ouverture comme à l’envoi', async () => {
    seanceEssai(base, 's1', null);
    executer(base, "UPDATE reglages SET valeur = 0 WHERE cle = 'porte_publique_ouverte'");
    const reference = await jetonDe('s1');
    expect((await vu(await envoyer('/v1/questionnaires/lien', { reference }))).corps).toBe('{"ok":false,"motif":"ferme"}');
    expect((await vu(await envoyer('/v1/questionnaires', envoiComplet({ reference })))).corps).toBe('{"ok":false,"motif":"ferme"}');
  });

  it('PorteService sans autorisation : 401 à travers la porte, corps vide', async () => {
    const r = await porte.fetch(new Request('https://api-recette.luminose.fr/service/v1/confirmations', {
      method: 'POST', body: JSON.stringify({ ordre: 'o1', issue: 'fait' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer repere-jeton-make' },
    }), envPorte());
    expect(r.status).toBe(401);
    expect(await r.text()).toBe('');
  });
});

describe('NORMATIF — règle 7, des deux côtés de la liaison', () => {
  it('réussite, refus et panne : aucun repère dans les journaux de la porte ni de gestion, ni dans une réponse', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const reponses: string[] = [];
    const garder = async (r: Promise<Response>) => { reponses.push(JSON.stringify(await vu(await r))); };
    const reference = await jetonDe('s1');
    await garder(envoyer('/v1/questionnaires', envoiComplet({ reference })));
    await garder(envoyer('/v1/questionnaires', { ...envoiComplet(), accord: { accepte: true, version: 99 } }));
    await garder(envoyer('/v1/questionnaires/lien', { reference }));
    // La panne : la base lève un message qui cite tout.
    env.CLIENTS.batch = async () => { throw new Error(`SQLITE_ERROR ${REPERES.join(' ')}`); };
    await garder(envoyer('/v1/questionnaires', envoiComplet({ reference })));
    await garder(envoyer('/v1/questionnaires/lien', { reference }));
    await Promise.all(attentes).catch(() => {});

    const sortie = [...journal, ...reponses].join('\n');
    for (const repere of [...REPERES, reference]) expect(sortie, repere).not.toContain(repere);
    for (const ligne of journal) expect(ligne).toMatch(/^porte\.[a-z_]+$/);
  });
});
