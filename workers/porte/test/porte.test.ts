/**
 * La porte publique et la porte de service (SPEC §14.5), gestion simulé : ce
 * que la porte refuse sans appeler gestion, ce qu'elle rend, les en-têtes de
 * chaque chemin, et ce qu'elle ne journalise jamais (règle 7).
 *
 * La traversée réelle — la porte et les entrées de gestion ensemble, sur les
 * chemins de S2a — est dans workers/api/test/porte-traversee.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import porte, { type Env } from '../src/index';
import { TAILLE_MAX } from '../src/bornes';

const SITE = 'https://essai-recette.luminose.fr';
const exemple = (nom: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'packages', 'contrat', 'exemples', nom), 'utf8'));

// Des valeurs repères, sur chaque chemin : aucune ne doit atteindre console.* ni une réponse.
const IP = '203.0.113.77';
const JETON_MAKE = 'Bearer repere-jeton-de-make';
const envoiQuestionnaire = () => ({ ...exemple('questionnaire-seance.json'), reference: 'repere.reference-du-lien' });
const REPERES = [IP, 'repere-jeton-de-make', 'repere.reference-du-lien', ...['prenom', 'nom', 'email', 'telephone'].map((c) => String(exemple('questionnaire-seance.json').identite[c]))];

type Gestion = { questionnaire: ReturnType<typeof vi.fn>; lienQuestionnaire: ReturnType<typeof vi.fn> };
let gestion: Gestion;
let service: { confirmation: ReturnType<typeof vi.fn> };
let limiteurs: { q: ReturnType<typeof vi.fn>; l: ReturnType<typeof vi.fn> };
let journal: string[];

const env = (extra: Partial<Env> = {}): Env => ({
  ENVIRONNEMENT: 'recette',
  ORIGINE_SITE: SITE,
  GESTION_PUBLIQUE: gestion as never,
  GESTION_SERVICE: service as never,
  LIMITE_QUESTIONNAIRES: { limit: limiteurs.q as never },
  LIMITE_LIENS: { limit: limiteurs.l as never },
  ...extra,
});

beforeEach(() => {
  gestion = { questionnaire: vi.fn(async () => ({ ok: true })), lienQuestionnaire: vi.fn(async () => ({ ok: true })) };
  service = { confirmation: vi.fn(async () => ({ ok: true })) };
  limiteurs = { q: vi.fn(async () => ({ success: true })), l: vi.fn(async () => ({ success: true })) };
  journal = [];
  for (const niveau of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, niveau).mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); });
  }
});

type Options = { methode?: string; origine?: string | null; type?: string | null; corps?: BodyInit | null; entetes?: Record<string, string> };
const requete = (chemin: string, o: Options = {}) => {
  const entetes: Record<string, string> = { 'CF-Connecting-IP': IP, ...o.entetes };
  if (o.origine !== null) entetes.Origin = o.origine ?? SITE;
  if (o.type !== null) entetes['Content-Type'] = o.type ?? 'application/json';
  return new Request(`https://api-recette.luminose.fr${chemin}`, {
    method: o.methode ?? 'POST', headers: entetes, body: o.corps === undefined ? JSON.stringify(envoiQuestionnaire()) : o.corps,
  });
};
const appeler = (chemin: string, o: Options = {}, e: Env = env()) => porte.fetch(requete(chemin, o), e);
const entetes = (r: Response) => Object.fromEntries([...r.headers.entries()].sort());
const lire = async (r: Response) => ({ statut: r.status, corps: await r.text() });

const ENTETES_PUBLICS = {
  'access-control-allow-origin': SITE,
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
  'x-content-type-options': 'nosniff',
};

const sansAppel = () => {
  expect(gestion.questionnaire).not.toHaveBeenCalled();
  expect(gestion.lienQuestionnaire).not.toHaveBeenCalled();
};

describe('porte publique — ce qu’elle refuse sans appeler gestion', () => {
  it.each([
    ['absente', null],
    ['autre', 'https://autre-site.example.org'],
    ['proche', `${SITE}/`],
    ['la porte elle-même', 'https://api-recette.luminose.fr'],
  ])('origine %s : 403, corps vide', async (_nom, origine) => {
    const r = await appeler('/v1/questionnaires', { origine });
    expect(await lire(r)).toEqual({ statut: 403, corps: '' });
    expect(entetes(r)).toEqual(ENTETES_PUBLICS);
    sansAppel();
  });

  it.each([['absent', null], ['texte', 'text/plain'], ['formulaire', 'application/x-www-form-urlencoded']])('type %s : 415', async (_nom, type) => {
    expect(await lire(await appeler('/v1/questionnaires', { type }))).toEqual({ statut: 415, corps: '' });
    sansAppel();
  });

  it('application/json avec paramètres : admis', async () => {
    expect((await appeler('/v1/questionnaires', { type: 'application/json; charset=UTF-8' })).status).toBe(200);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('méthode %s : 404, corps vide', async (methode) => {
    const r = await appeler('/v1/questionnaires', { methode, corps: methode === 'GET' ? null : '{}' });
    expect(await lire(r)).toEqual({ statut: 404, corps: '' });
    sansAppel();
  });

  it('64 Ko + 1 octet : 413', async () => {
    const corps = JSON.stringify({ x: 'a'.repeat(TAILLE_MAX) }).slice(0, TAILLE_MAX + 1);
    expect(await lire(await appeler('/v1/questionnaires', { corps }))).toEqual({ statut: 413, corps: '' });
    sansAppel();
  });

  it('64 Ko + 1 octet avec un Content-Length menteur : 413, sur les octets lus', async () => {
    const octets = new TextEncoder().encode('"' + 'a'.repeat(TAILLE_MAX) + '"');
    const flux = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(octets.slice(0, 1000)); c.enqueue(octets.slice(1000)); c.close(); } });
    const r = await porte.fetch(new Request('https://api-recette.luminose.fr/v1/questionnaires', {
      method: 'POST', body: flux, duplex: 'half',
      headers: { Origin: SITE, 'Content-Type': 'application/json', 'Content-Length': '12' },
    } as RequestInit), env());
    expect(await lire(r)).toEqual({ statut: 413, corps: '' });
    sansAppel();
  });

  it('exactement 64 Ko : lu (puis refusé par le schéma, pas par la taille)', async () => {
    const corps = JSON.stringify({ x: 'a'.repeat(TAILLE_MAX - 8) });
    expect(corps.length).toBe(TAILLE_MAX);
    const r = await appeler('/v1/questionnaires', { corps });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, motif: 'invalide', champs: expect.any(Array) });
  });

  it.each(['{', 'pas du json', '', '[1,'])('JSON illisible (%j) : invalide, sans champs', async (corps) => {
    const r = await appeler('/v1/questionnaires', { corps });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, motif: 'invalide', champs: [] });
    sansAppel();
  });

  it('limite atteinte : trop_de_demandes, sans appel — clé hachée, ni l’adresse ni la route en clair', async () => {
    limiteurs.q.mockResolvedValue({ success: false });
    const r = await appeler('/v1/questionnaires');
    expect(await r.json()).toEqual({ ok: false, motif: 'trop_de_demandes' });
    sansAppel();
    const [{ key }] = limiteurs.q.mock.calls[0] as [{ key: string }];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chaque route a sa limite', async () => {
    await appeler('/v1/questionnaires/lien', { corps: JSON.stringify({ reference: 'abc.def' }) });
    expect(limiteurs.l).toHaveBeenCalledTimes(1);
    expect(limiteurs.q).not.toHaveBeenCalled();
  });

  it('sans limiteur : une panne, jamais une porte sans limite', async () => {
    const r = await appeler('/v1/questionnaires', {}, env({ LIMITE_QUESTIONNAIRES: undefined }));
    expect(await lire(r)).toEqual({ statut: 503, corps: '' });
    sansAppel();
  });

  it('champ piège rempli : invalide, sans champs, sans appel', async () => {
    const r = await appeler('/v1/questionnaires', { corps: JSON.stringify({ ...envoiQuestionnaire(), site_web: 'https://x.example.org' }) });
    expect(await r.json()).toEqual({ ok: false, motif: 'invalide', champs: [] });
    sansAppel();
  });

  it('schéma refusé : invalide, les noms des champs, aucune valeur', async () => {
    const envoi = { ...envoiQuestionnaire(), identite: { ...envoiQuestionnaire().identite, email: 'pas-une-adresse-repere' } };
    const r = await appeler('/v1/questionnaires', { corps: JSON.stringify(envoi) });
    const texte = await r.text();
    expect(JSON.parse(texte)).toEqual({ ok: false, motif: 'invalide', champs: ['identite.email'] });
    expect(texte).not.toContain('repere');
    sansAppel();
  });
});

describe('porte publique — gestion appelé', () => {
  it('l’envoi est confié tel qu’il est arrivé, et la réponse re-sérialisée', async () => {
    const envoi = envoiQuestionnaire();
    const r = await appeler('/v1/questionnaires', { corps: JSON.stringify(envoi) });
    expect(await r.text()).toBe('{"ok":true}');
    expect(gestion.questionnaire).toHaveBeenCalledWith(envoi);
    expect(entetes(r)).toEqual(ENTETES_PUBLICS);
  });

  it('le lien : lienQuestionnaire', async () => {
    gestion.lienQuestionnaire.mockResolvedValue({ ok: false, motif: 'lien_invalide' });
    const r = await appeler('/v1/questionnaires/lien', { corps: JSON.stringify({ reference: 'abc.def' }) });
    expect(await r.json()).toEqual({ ok: false, motif: 'lien_invalide' });
    expect(gestion.lienQuestionnaire).toHaveBeenCalledWith({ reference: 'abc.def' });
  });

  it.each([
    ['gestion lève', () => gestion.questionnaire.mockRejectedValue(new Error(`porte.panne ${REPERES.join(' ')}`))],
    ['réponse hors schéma', () => gestion.questionnaire.mockResolvedValue({ ok: true, prenom: 'Émilie' })],
    ['réponse absente', () => gestion.questionnaire.mockResolvedValue(undefined)],
  ])('%s : 503, corps vide, mêmes en-têtes', async (_nom, casser) => {
    casser();
    const r = await appeler('/v1/questionnaires');
    expect(await lire(r)).toEqual({ statut: 503, corps: '' });
    expect(entetes(r)).toEqual(ENTETES_PUBLICS);
  });

  it('délai dépassé : 503', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    gestion.questionnaire.mockReturnValue(new Promise(() => {}));
    let fini = false;
    const enCours = appeler('/v1/questionnaires').finally(() => { fini = true; });
    // Le hachage de l'adresse et la lecture du corps ne sont pas des minuteries : on leur laisse le temps.
    for (let i = 0; i < 100 && !fini; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(await lire(await enCours)).toEqual({ statut: 503, corps: '' });
    expect(journal).toEqual(['porte.delai']);
    vi.useRealTimers();
  });

  it('liaison absente : 503', async () => {
    expect((await appeler('/v1/questionnaires', {}, env({ GESTION_PUBLIQUE: undefined }))).status).toBe(503);
  });

  it('sans ORIGINE_SITE : 503, jamais une porte ouverte à tous', async () => {
    expect((await appeler('/v1/questionnaires', {}, env({ ORIGINE_SITE: undefined }))).status).toBe(503);
    sansAppel();
  });
});

describe('règle 4 — mêmes en-têtes sur tous les chemins d’une route', () => {
  it('réussite, refus de la porte, refus de gestion, panne, 403, 413, 415 : un seul jeu d’en-têtes', async () => {
    const jeux = new Set<string>();
    const noter = async (r: Promise<Response>) => { jeux.add(JSON.stringify(entetes(await r))); };
    await noter(appeler('/v1/questionnaires'));
    await noter(appeler('/v1/questionnaires', { corps: '{' }));
    await noter(appeler('/v1/questionnaires', { origine: 'https://autre.example.org' }));
    await noter(appeler('/v1/questionnaires', { type: 'text/plain' }));
    await noter(appeler('/v1/questionnaires', { corps: 'x'.repeat(TAILLE_MAX + 1) }));
    gestion.questionnaire.mockResolvedValueOnce({ ok: false, motif: 'ferme' });
    await noter(appeler('/v1/questionnaires'));
    gestion.questionnaire.mockRejectedValueOnce(new Error('x'));
    await noter(appeler('/v1/questionnaires'));
    limiteurs.q.mockResolvedValueOnce({ success: false });
    await noter(appeler('/v1/questionnaires'));
    expect([...jeux]).toEqual([JSON.stringify(ENTETES_PUBLICS)]);
  });
});

describe('CORS', () => {
  it.each(['/v1/questionnaires', '/v1/questionnaires/lien'])('OPTIONS %s : le préliminaire, sans gestion', async (chemin) => {
    const r = await appeler(chemin, { methode: 'OPTIONS', corps: null, origine: 'https://autre.example.org' });
    expect(r.status).toBe(204);
    expect(entetes(r)).toEqual({
      ...ENTETES_PUBLICS,
      'access-control-allow-headers': 'Content-Type',
      'access-control-allow-methods': 'POST',
      'access-control-max-age': '600',
    });
    sansAppel();
  });

  it('Allow-Origin n’est jamais l’origine reçue quand elle diffère, jamais *, jamais d’identifiants', async () => {
    for (const origine of ['https://autre.example.org', 'null', '*']) {
      for (const methode of ['POST', 'OPTIONS']) {
        const r = await appeler('/v1/questionnaires', { methode, origine, corps: methode === 'POST' ? undefined : null });
        expect(r.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
        expect(r.headers.has('Access-Control-Allow-Credentials')).toBe(false);
        expect(r.headers.has('Set-Cookie')).toBe(false);
      }
    }
  });
});

describe('porte de service', () => {
  const confirmer = (o: Options = {}, e = env()) =>
    appeler('/service/v1/confirmations', { origine: null, corps: JSON.stringify({ ordre: 'o1', issue: 'fait' }), ...o }, e);

  it('l’en-tête Authorization est transmis tel quel ; ni CORS ni origine', async () => {
    const r = await confirmer({ entetes: { Authorization: JETON_MAKE } });
    expect(await r.json()).toEqual({ ok: true });
    expect(service.confirmation).toHaveBeenCalledWith(JETON_MAKE, { ordre: 'o1', issue: 'fait' });
    expect(r.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('sans en-tête : null est transmis, et gestion décide', async () => {
    service.confirmation.mockResolvedValue({ autorisation: 'refusee' });
    const r = await confirmer();
    expect(service.confirmation).toHaveBeenCalledWith(null, expect.anything());
    expect(await lire(r)).toEqual({ statut: 401, corps: '' });
  });

  it('type, taille, JSON : comme la porte publique', async () => {
    expect((await confirmer({ type: 'text/plain' })).status).toBe(415);
    expect((await confirmer({ corps: 'x'.repeat(TAILLE_MAX + 1) })).status).toBe(413);
    expect(await (await confirmer({ corps: '{' })).json()).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(service.confirmation).not.toHaveBeenCalled();
  });

  it('gestion lève, ou rend hors schéma : 503, corps vide', async () => {
    service.confirmation.mockRejectedValueOnce(new Error('x'));
    expect(await lire(await confirmer())).toEqual({ statut: 503, corps: '' });
    service.confirmation.mockResolvedValueOnce({ autre: 1 });
    expect(await lire(await confirmer())).toEqual({ statut: 503, corps: '' });
  });
});

describe('NORMATIF — règle 7 : rien de personnel dans les journaux ni dans les réponses', () => {
  it('les repères, sur les chemins de réussite, de refus et de panne, ne sortent pas', async () => {
    const reponses: string[] = [];
    const garder = async (r: Promise<Response>) => { const x = await r; reponses.push(await x.text(), JSON.stringify([...x.headers])); };
    const auth = { entetes: { Authorization: JETON_MAKE } };
    await garder(appeler('/v1/questionnaires', auth));
    await garder(appeler('/v1/questionnaires', { ...auth, corps: JSON.stringify({ ...envoiQuestionnaire(), cle: 'x' }) }));
    await garder(appeler('/v1/questionnaires/lien', { ...auth, corps: JSON.stringify({ reference: 'repere.reference-du-lien' }) }));
    gestion.questionnaire.mockRejectedValue(new Error(REPERES.join(' ')));
    await garder(appeler('/v1/questionnaires', auth));
    gestion.lienQuestionnaire.mockRejectedValue(new Error(REPERES.join(' ')));
    await garder(appeler('/v1/questionnaires/lien', { ...auth, corps: JSON.stringify({ reference: 'repere.reference-du-lien' }) }));
    service.confirmation.mockRejectedValue(new Error(REPERES.join(' ')));
    await garder(appeler('/service/v1/confirmations', { ...auth, origine: null }));
    limiteurs.q.mockRejectedValue(new Error(REPERES.join(' ')));
    await garder(appeler('/v1/questionnaires', auth));

    const sortie = [...journal, ...reponses].join('\n');
    for (const repere of REPERES) expect(sortie, repere).not.toContain(repere);
    // Ce qui est journalisé : des codes fixes, et rien d'autre.
    for (const ligne of journal) expect(ligne).toMatch(/^porte\.[a-z_]+$/);
    expect(journal.length).toBeGreaterThan(0);
  });
});
