/**
 * L'écran Aujourd'hui (refonte de la console, lot 3) — `GET /api/seances/aujourdhui`.
 *
 * Ce que la suite tient : la journée (et le lendemain matin le soir), la
 * prochaine séance, les deux sortes d'À traiter et leur sortie quand le geste
 * est fait, l'état — jamais le contenu — d'une note et d'un questionnaire, la
 * provenance d'un entretien, et un nombre d'instructions borné.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, type TestD1 } from './helpers/d1';
import { ajouterClient, TYPES, MINUTE, HEURE } from './helpers/clients';

let env: ReturnType<typeof makeEnv>;
let base: TestD1;

const lire = async (e = env) => {
  const res = await app.fetch(new Request('https://api.test/api/seances/aujourdhui', {
    headers: { 'X-Session-Token': await createSessionToken(e) },
  }), e as any);
  return { statut: res.status, corps: await res.json() as any };
};

/** Mardi 12 janvier 2027 à Paris (+01:00). */
const A = (heure: number, minute = 0, jour = 12) => Date.UTC(2027, 0, jour, heure - 1, minute);

const seance = (id: string, debut: number, champs: Record<string, unknown> = {}) => {
  const s = { client_id: 'client-a', type: TYPES.seance, duree: 60, statut: 'prevue', provenance: null, questionnaire_id: null, ...champs };
  return base.prepare(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut,
    etat_paiement, origine, provenance, questionnaire_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'a_payer', 'console', ?, ?, 0, 0)`)
    .bind(id, s.client_id, s.type, debut, s.duree, debut + Number(s.duree) * MINUTE, s.statut, s.provenance, s.questionnaire_id).run();
};

beforeEach(async () => {
  env = makeEnv({ clients: true });
  base = env.CLIENTS as unknown as TestD1;
  await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie@example.org');
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Aujourd’hui', () => {
  it('la journée, la prochaine séance, sans les séances annulées ni celles de demain', async () => {
    vi.setSystemTime(A(10, 35));
    await seance('matin', A(9), { statut: 'realisee' });
    await seance('midi', A(11));
    await seance('annulee', A(14), { statut: 'annulee' });
    await seance('demain', A(9, 0, 13));
    const { statut, corps } = await lire();
    expect(statut).toBe(200);
    expect(corps.jour).toBe('2027-01-12');
    expect(corps.lendemainMatin).toBeNull();
    expect(corps.journee.map((s: any) => s.id)).toEqual(['matin', 'midi']);
    expect(corps.prochaine.id).toBe('midi');
    expect(corps.journee[0].personne).toEqual({ clientId: 'client-a', prenom: 'Émilie', nom: 'Martin' });
    expect(corps.journee[0].type).toEqual({ id: TYPES.seance, cle: 'seance', libelle: expect.any(String) });
  });

  it('le soir, le lendemain matin s’ajoute — jusqu’à midi', async () => {
    vi.setSystemTime(A(19));
    await seance('demain-9h', A(9, 0, 13));
    await seance('demain-14h', A(14, 0, 13));
    const { corps } = await lire();
    expect(corps.lendemainMatin).toBe('2027-01-13');
    expect(corps.journee.map((s: any) => s.id)).toEqual(['demain-9h']);
  });

  it('À traiter : la séance restée « prévue », puis les notes d’une séance réalisée ; chacune sort quand le geste est fait', async () => {
    vi.setSystemTime(A(10));
    await seance('oubliee', A(9, 0, 8));
    await seance('sans-notes', A(15, 0, 11), { statut: 'realisee' });
    await seance('ancienne', A(9, 0, 1) - 30 * 24 * HEURE, { statut: 'realisee' });
    let { corps } = await lire();
    expect(corps.aTraiter.map((t: any) => [t.sorte, t.seance.id])).toEqual([['clore', 'oubliee'], ['notes', 'sans-notes']]);

    await base.prepare("UPDATE seances SET statut = 'realisee' WHERE id = 'oubliee'").run();
    await base.prepare("INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES ('n1', 'sans-notes', 'Écrit', 0, 0)").run();
    await base.prepare("INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES ('n2', 'oubliee', 'Écrit', 0, 0)").run();
    ({ corps } = await lire());
    expect(corps.aTraiter).toEqual([]);
  });

  it('des notes vides ne comptent pas pour écrites', async () => {
    vi.setSystemTime(A(10));
    await seance('vide', A(15, 0, 11), { statut: 'realisee' });
    await base.prepare("INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES ('n', 'vide', '  ', 0, 0)").run();
    expect((await lire()).corps.aTraiter.map((t: any) => t.seance.id)).toEqual(['vide']);
  });

  it('l’état d’un questionnaire et d’une note, jamais leur contenu', async () => {
    vi.setSystemTime(A(8));
    await base.prepare(`INSERT INTO questionnaires (id, contexte, client_id, reponses, created_at, updated_at)
      VALUES ('q', 'seance', 'client-a', 'REPERE-QUESTIONNAIRE', 0, 0)`).run();
    await seance('avec-q', A(9), { questionnaire_id: 'q' });
    await base.prepare("INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES ('n', 'avec-q', 'REPERE-NOTE', 0, 0)").run();
    const { corps } = await lire();
    expect(corps.journee[0].questionnaire).toBe('non_relu');
    expect(corps.journee[0].notesEcrites).toBe(true);
    const texte = JSON.stringify(corps);
    expect(texte).not.toContain('REPERE-QUESTIONNAIRE');
    expect(texte).not.toContain('REPERE-NOTE');
    await base.prepare("UPDATE questionnaires SET relu_le = 1 WHERE id = 'q'").run();
    expect((await lire()).corps.journee[0].questionnaire).toBe('relu');
  });

  it('un entretien préalable dit d’où vient la personne ; une séance, non', async () => {
    vi.setSystemTime(A(8));
    await seance('entretien', A(11), { type: TYPES.rencontre, duree: 20,
      provenance: JSON.stringify({ clic: { type: 'gclid', id: 'x', date: '2027-01-10' }, utm: { utm_term: 'hypnose arrêt tabac' } }) });
    await seance('seance', A(14), { provenance: JSON.stringify({ utm: { utm_source: 'google' } }) });
    const { corps } = await lire();
    expect(corps.journee[0].provenance).toBe('Google Ads · mot-clé : hypnose arrêt tabac');
    expect(corps.journee[1].provenance).toBeNull();
  });

  it('un entretien sans trace de provenance : null (l’écran dit « Provenance inconnue »)', async () => {
    vi.setSystemTime(A(8));
    await seance('entretien', A(11), { type: TYPES.rencontre, duree: 20 });
    expect((await lire()).corps.journee[0].provenance).toBeNull();
  });

  it('six instructions, en un aller-retour, quel que soit le volume', async () => {
    vi.setSystemTime(A(10));
    for (let i = 0; i < 12; i++) await seance(`s${i}`, A(9, 0, 1 + (i % 10)), { statut: i % 2 ? 'realisee' : 'prevue' });
    const preparees: string[] = [];
    const prepare = (env.CLIENTS as any).prepare.bind(env.CLIENTS);
    (env.CLIENTS as any).prepare = (sql: string) => { preparees.push(sql); return prepare(sql); };
    const batch = vi.spyOn(env.CLIENTS as any, 'batch');
    await lire();
    expect(preparees).toHaveLength(6);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('sans la base des clients : 409', async () => {
    expect((await lire(makeEnv())).statut).toBe(409);
  });
});

describe('Aujourd’hui — le questionnaire à relire (lot 8)', () => {
  it('reçu et pas relu, pour une séance des sept jours : une ligne ; relu : elle sort', async () => {
    vi.setSystemTime(A(8));
    await base.prepare(`INSERT INTO questionnaires (id, contexte, client_id, reponses, created_at, updated_at)
      VALUES ('q', 'seance', 'client-a', '{}', 0, 0)`).run();
    await seance('jeudi', A(9, 0, 14), { questionnaire_id: 'q' });
    let { corps } = await lire();
    expect(corps.aTraiter.map((t: any) => [t.sorte, t.seance.id, t.seance.questionnaireId])).toEqual([['questionnaire', 'jeudi', 'q']]);
    await base.prepare("UPDATE questionnaires SET relu_le = 1 WHERE id = 'q'").run();
    ({ corps } = await lire());
    expect(corps.aTraiter).toEqual([]);
  });
});
