/**
 * Les jours de l'Agenda (refonte de la console, lot 5) — `GET /api/seances/disponibilites`.
 * Fermés par habitude ou par exception, et les créneaux libres comptés comme le
 * site les proposerait.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, type TestD1 } from './helpers/d1';
import { ajouterClient, TYPES, MINUTE } from './helpers/clients';

let env: ReturnType<typeof makeEnv>;
let base: TestD1;

const appeler = async (methode: string, chemin: string, corps?: unknown, e = env) => app.fetch(new Request(`https://api.test${chemin}`, {
  method: methode,
  headers: { 'Content-Type': 'application/json', 'X-Session-Token': await createSessionToken(e) },
  body: corps === undefined ? undefined : JSON.stringify(corps),
}), e as any);

beforeEach(async () => {
  env = makeEnv({ clients: true });
  base = env.CLIENTS as unknown as TestD1;
  await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
  vi.useFakeTimers({ toFake: ['Date'] });
  // Le 1er décembre 2026 : la semaine du lundi 11 janvier est dans la fenêtre de la séance
  // (de 21 jours à six mois, migration 0002).
  vi.setSystemTime(Date.UTC(2026, 11, 1, 9, 0));
  // Du lundi au vendredi, 9 h – 12 h ; ni samedi, ni dimanche.
  const plages = [1, 2, 3, 4, 5].map((jour) => ({ jour, debut: '09:00', fin: '12:00' }));
  expect((await appeler('PUT', '/api/reservation/semaine', { plages })).status).toBe(200);
});
afterEach(() => { vi.useRealTimers(); });

const lire = async (du: string, au: string) => (await (await appeler('GET', `/api/seances/disponibilites?du=${du}&au=${au}`)).json()) as any;

describe('les jours de l’Agenda', () => {
  it('la semaine : ouverts en semaine, fermés par habitude le week-end', async () => {
    const { jours } = await lire('2027-01-11', '2027-01-17');
    expect(jours.map((j: any) => j.ferme)).toEqual([null, null, null, null, null, 'habitude', 'habitude']);
    expect(jours[0].libres).toBeGreaterThan(0);
    expect(jours[5].libres).toBe(0);
  });

  it('une date d’exception fermée se dit « exception », et « Ouvrir ce jour » la retire', async () => {
    expect((await appeler('PUT', '/api/reservation/dates/2027-01-12', { plages: [] })).status).toBe(200);
    let { jours } = await lire('2027-01-12', '2027-01-12');
    expect(jours[0]).toEqual({ date: '2027-01-12', ferme: 'exception', exception: true, libres: 0 });
    expect((await appeler('DELETE', '/api/reservation/dates/2027-01-12')).status).toBe(200);
    ({ jours } = await lire('2027-01-12', '2027-01-12'));
    expect(jours[0].ferme).toBeNull();
  });

  it('une séance posée fait baisser le compte des libres de ce jour-là', async () => {
    const avant = (await lire('2027-01-11', '2027-01-11')).jours[0].libres;
    const debut = Date.UTC(2027, 0, 11, 8, 0); // 9 h à Paris
    await base.prepare(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, origine, created_at, updated_at)
      VALUES ('s', 'client-a', ?, ?, 90, ?, 'prevue', 'a_payer', 'console', 0, 0)`).bind(TYPES.seance, debut, debut + 90 * MINUTE).run();
    expect((await lire('2027-01-11', '2027-01-11')).jours[0].libres).toBeLessThan(avant);
  });

  it('63 jours : refusé', async () => {
    expect((await appeler('GET', '/api/seances/disponibilites?du=2027-01-01&au=2027-03-04')).status).toBe(400);
  });
});

describe('Paiements (lot 8)', () => {
  const seance = (id: string, jour: number, statut: string, paiement: string, montant = 8000) => {
    const debut = Date.UTC(2026, 10, jour, 8, 0);
    return base.prepare(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, montant_centimes, origine, created_at, updated_at)
      VALUES (?, 'client-a', ?, ?, 60, ?, ?, ?, ?, 'console', 0, 0)`).bind(id, TYPES.seance, debut, debut + 60 * MINUTE, statut, paiement, montant).run();
  };
  it('à encaisser : réalisées et absences dues, de la plus ancienne ; le total ; encaissés à part', async () => {
    await seance('a', 20, 'realisee', 'a_payer');
    await seance('b', 10, 'absent', 'a_payer', 5000);
    await seance('c', 25, 'realisee', 'payee');
    await seance('d', 15, 'realisee', 'offerte');
    await seance('e', 28, 'annulee', 'a_payer');
    const du = await (await appeler('GET', '/api/seances/paiements?vue=a_encaisser')).json() as any;
    expect(du.seances.map((s: any) => s.id)).toEqual(['b', 'a']);
    expect([du.nombre, du.totalCentimes]).toEqual([2, 13000]);
    const recus = await (await appeler('GET', '/api/seances/paiements?vue=encaisses')).json() as any;
    expect(recus.seances.map((s: any) => s.id)).toEqual(['c']);
    expect((await appeler('GET', '/api/seances/paiements?vue=autre')).status).toBe(400);
  });
});
