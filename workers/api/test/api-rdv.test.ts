/**
 * La prise de rendez-vous Calendly (route `/api/rdv`).
 *
 * Trois choses méritent un test, et ce sont les trois qui décident si l'écran
 * tient sa promesse : le numéro part bien à Calendly (sans lui, pas de rappel
 * SMS, et c'est toute la raison d'être de la route), un jeton absent se dit au
 * lieu de passer pour une panne, et un refus de Calendly arrive à l'écran avec
 * SON message plutôt qu'un « Erreur interne » qui n'apprend rien.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv> & { CALENDLY_TOKEN?: string };
let token: string;

const MOI = { resource: { uri: 'https://api.calendly.com/users/U1', timezone: 'Europe/Paris' } };

const TYPE = 'https://api.calendly.com/event_types/E1';

/** Ce que Calendly renvoie, route par route — et ce qu'on a reçu de nous. */
const stubCalendly = (reponses: Record<string, { status?: number; body: unknown }>) => {
  const appels: Array<{ url: string; charge: any }> = [];
  vi.stubGlobal('fetch', async (url: string, init: any = {}) => {
    const cle = Object.keys(reponses).find((k) => String(url).includes(k)) ?? '';
    const r = reponses[cle] ?? { status: 404, body: { message: 'non stubé' } };
    appels.push({ url: String(url), charge: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return appels;
};

const poster = async (charge: unknown) => {
  const res = await app.fetch(new Request('https://api.test/api/rdv', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(charge),
  }), env as any);
  return { res, body: (await res.json()) as any };
};

const RDV = {
  type: TYPE,
  debut: '2026-10-02T18:30:00.000Z',
  nom: 'Marie Durand',
  email: 'marie@exemple.fr',
  telephone: '06 12 34 56 78',
  lieu: null,
};

beforeEach(async () => {
  env = { ...makeEnv(), CALENDLY_TOKEN: 'jeton-calendly' };
  token = await createSessionToken(env);
});

describe('prise de rendez-vous', () => {
  it('envoie le numéro au format E.164 et rend celui que Calendly a retenu', async () => {
    const appels = stubCalendly({
      '/invitees': { status: 201, body: { resource: {
        uri: 'https://api.calendly.com/scheduled_events/S1/invitees/I1',
        event: 'https://api.calendly.com/scheduled_events/S1',
        text_reminder_number: '+33612345678',
        cancel_url: 'https://calendly.com/cancellations/X',
        reschedule_url: 'https://calendly.com/reschedulings/X',
      } } },
    });

    const { res, body } = await poster(RDV);

    expect(res.status).toBe(200);
    expect(appels[0].charge.invitee.text_reminder_number).toBe('+33612345678');
    expect(body.rdv.telephone).toBe('+33612345678');
  });

  it('retente à la racine quand Calendly désigne le champ du numéro', async () => {
    let premier = true;
    const appels: any[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: any = {}) => {
      appels.push(JSON.parse(init.body));
      if (premier) {
        premier = false;
        return new Response(JSON.stringify({
          message: 'Invalid argument', details: [{ parameter: 'invitee.text_reminder_number' }],
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ resource: { uri: 'u', event: 'e' } }), { status: 201 });
    });

    const { res } = await poster(RDV);

    expect(res.status).toBe(200);
    expect(appels).toHaveLength(2);
    expect(appels[1].text_reminder_number).toBe('+33612345678');
  });

  it('refuse un numéro qu’elle ne sait pas normaliser, sans appeler Calendly', async () => {
    const appels = stubCalendly({});
    const { res, body } = await poster({ ...RDV, telephone: '12' });

    expect(res.status).toBe(400);
    expect(body.error).toContain('non reconnu');
    expect(appels).toHaveLength(0);
  });

  it('dit ce qui manque quand le jeton n’est pas posé', async () => {
    env.CALENDLY_TOKEN = undefined;
    const { res, body } = await poster(RDV);

    expect(res.status).toBe(409);
    expect(body.error).toContain('CALENDLY_TOKEN');
  });

  it('fait remonter le message de Calendly plutôt qu’une erreur interne', async () => {
    stubCalendly({ '/invitees': { status: 400, body: { message: 'This time slot is no longer available' } } });
    const { res, body } = await poster(RDV);

    expect(res.status).toBe(400);
    expect(body.error).toContain('no longer available');
  });

  it('liste les types actifs en repartant de l’utilisateur du jeton', async () => {
    stubCalendly({
      '/users/me': { body: MOI },
      '/event_types': { body: { collection: [
        { uri: TYPE, name: 'Séance', duration: 90, color: '#17e885', secret: false, locations: [{ kind: 'custom' }] },
      ] } },
    });

    const res = await app.fetch(new Request('https://api.test/api/rdv/types', {
      headers: { 'X-Session-Token': token },
    }), env as any);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.types[0]).toMatchObject({ nom: 'Séance', duree: 90, lieu: 'custom' });
  });

  it('ne demande jamais de créneaux dans le passé', async () => {
    const appels = stubCalendly({ '/event_type_available_times': { body: { collection: [] } } });

    await app.fetch(new Request(
      `https://api.test/api/rdv/creneaux?type=${encodeURIComponent(TYPE)}&debut=2020-01-01T00:00:00.000Z&jours=7`,
      { headers: { 'X-Session-Token': token } },
    ), env as any);

    const url = new URL(appels[0].url);
    expect(new Date(url.searchParams.get('start_time')!).getTime()).toBeGreaterThan(Date.now());
  });
});
