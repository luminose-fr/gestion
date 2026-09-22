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
  reponses: [],
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
        {
          uri: TYPE, name: 'Séance', duration: 90, color: '#17e885', secret: false,
          locations: [{ kind: 'custom', location: '2 Avenue de Verdun, 31290 Villefranche de Lauragais' }],
          custom_questions: [
            { name: 'Masquée', type: 'string', position: 0, enabled: false, required: false, answer_choices: [] },
            {
              name: 'Conditions d’annulation', type: 'single_select', position: 1,
              enabled: true, required: true, answer_choices: ['Toute séance oubliée…'],
            },
          ],
        },
      ] } },
    });

    const res = await app.fetch(new Request('https://api.test/api/rdv/types', {
      headers: { 'X-Session-Token': token },
    }), env as any);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.types[0]).toMatchObject({
      nom: 'Séance', duree: 90,
      lieux: [{ kind: 'custom', texte: '2 Avenue de Verdun, 31290 Villefranche de Lauragais' }],
      questions: [{ nom: 'Conditions d’annulation', requis: true, position: 1 }],
    });
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

  it('joint le TEXTE du lieu, pas seulement son kind', async () => {
    const appels = stubCalendly({ '/invitees': { status: 201, body: { resource: { uri: 'u', event: 'e' } } } });

    await poster({ ...RDV, lieu: { kind: 'custom', texte: '2 Avenue de Verdun' } });

    expect(appels[0].charge.location).toEqual({ kind: 'custom', location: '2 Avenue de Verdun' });
  });

  it('retombe sur le numéro de l’invité pour un appel sortant', async () => {
    const appels = stubCalendly({ '/invitees': { status: 201, body: { resource: { uri: 'u', event: 'e' } } } });

    await poster({ ...RDV, lieu: { kind: 'outbound_call', texte: '' } });

    expect(appels[0].charge.location).toEqual({ kind: 'outbound_call', location: '+33612345678' });
  });

  it('refuse plutôt que d’envoyer un lieu vide que Calendly rejettera', async () => {
    const appels = stubCalendly({});
    const { res, body } = await poster({ ...RDV, telephone: null, lieu: { kind: 'custom', texte: '  ' } });

    expect(res.status).toBe(400);
    expect(body.error).toContain('demande un lieu');
    expect(appels).toHaveLength(0);
  });

  it('découpe trois mois en tranches de sept jours', async () => {
    const appels = stubCalendly({ '/event_type_available_times': { body: { collection: [] } } });

    await app.fetch(new Request(
      `https://api.test/api/rdv/creneaux?type=${encodeURIComponent(TYPE)}&jours=92`,
      { headers: { 'X-Session-Token': token } },
    ), env as any);

    expect(appels.length).toBe(14);
    for (const a of appels) {
      const u = new URL(a.url);
      const duree = new Date(u.searchParams.get('end_time')!).getTime()
        - new Date(u.searchParams.get('start_time')!).getTime();
      expect(duree).toBeLessThanOrEqual(7 * 86_400_000);
    }
  });

  /**
   * Le mode libre ne demande RIEN à `event_type_available_times` : c'est ce
   * qui lui permet d'ignorer le délai minimum et l'horizon de réservation.
   * Il recompose depuis le planning et les plages occupées — et le créneau
   * déjà pris doit disparaître, sinon le mode ne vaut rien.
   */
  it('recompose les créneaux depuis l’agenda, sans le délai minimum', async () => {
    const demain = new Date(Date.now() + 26 * 3600_000);
    const jour = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][demain.getUTCDay()];

    stubCalendly({
      '/users/me': { body: MOI },
      '/event_types/': { body: { resource: { duration: 60 } } },
      '/user_availability_schedules': { body: { collection: [{
        default: true, timezone: 'UTC',
        rules: [{ type: 'wday', wday: jour, intervals: [{ from: '09:00', to: '12:00' }] }],
      }] } },
      '/user_busy_times': { body: { collection: [] } },
    });

    const res = await app.fetch(new Request(
      `https://api.test/api/rdv/creneaux?type=${encodeURIComponent(TYPE)}&jours=3&libre=1`,
      { headers: { 'X-Session-Token': token } },
    ), env as any);
    const body = (await res.json()) as any;

    expect(body.libre).toBe(true);
    // 9 h, 10 h et 11 h le jour visé — dans les 48 h, donc invisibles autrement.
    const heures = body.creneaux.map((c: any) => new Date(c.debut).getUTCHours());
    expect(heures).toContain(9);
    expect(heures).toContain(11);
  });

  it('écarte un créneau qui chevauche une plage occupée', async () => {
    const demain = new Date(Date.now() + 26 * 3600_000);
    const jour = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][demain.getUTCDay()];
    const neufHeures = new Date(Date.UTC(demain.getUTCFullYear(), demain.getUTCMonth(), demain.getUTCDate(), 9));

    stubCalendly({
      '/users/me': { body: MOI },
      '/event_types/': { body: { resource: { duration: 60 } } },
      '/user_availability_schedules': { body: { collection: [{
        default: true, timezone: 'UTC',
        rules: [{ type: 'wday', wday: jour, intervals: [{ from: '09:00', to: '12:00' }] }],
      }] } },
      '/user_busy_times': { body: { collection: [{
        start_time: neufHeures.toISOString(),
        end_time: new Date(neufHeures.getTime() + 3600_000).toISOString(),
      }] } },
    });

    const res = await app.fetch(new Request(
      `https://api.test/api/rdv/creneaux?type=${encodeURIComponent(TYPE)}&jours=3&libre=1`,
      { headers: { 'X-Session-Token': token } },
    ), env as any);
    const body = (await res.json()) as any;

    expect(body.creneaux.map((c: any) => c.debut)).not.toContain(neufHeures.toISOString());
  });

  it('garde la sélection des types affichés', async () => {
    const put = await app.fetch(new Request('https://api.test/api/rdv/selection', {
      method: 'PUT',
      headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ types: [TYPE] }),
    }), env as any);
    expect(put.status).toBe(200);

    const get = await app.fetch(new Request('https://api.test/api/rdv/selection', {
      headers: { 'X-Session-Token': token },
    }), env as any);
    expect((await get.json() as any).types).toEqual([TYPE]);
  });

  /**
   * Appris d'un 400 : « Required Questions and Answers cannot be blank ». Une
   * question obligatoire du formulaire d'invité l'est aussi pour l'API, et une
   * réponse laissée vide fait échouer la liste ENTIÈRE — y compris quand elle
   * appartient à une question facultative.
   */
  it('joint les réponses au formulaire, et écarte celles qui sont vides', async () => {
    const appels = stubCalendly({ '/invitees': { status: 201, body: { resource: { uri: 'u' } } } });

    await poster({
      ...RDV,
      reponses: [
        { question: 'Conditions d’annulation', answer: 'Toute séance oubliée…', position: 1 },
        { question: 'Liste d’attente', answer: '', position: 0 },
      ],
    });

    expect(appels[0].charge.questions_and_answers).toEqual([
      { question: 'Conditions d’annulation', answer: 'Toute séance oubliée…', position: 1 },
    ]);
  });

  it('n’envoie aucune liste de réponses quand il n’y en a pas', async () => {
    const appels = stubCalendly({ '/invitees': { status: 201, body: { resource: { uri: 'u' } } } });
    await poster(RDV);
    expect(appels[0].charge).not.toHaveProperty('questions_and_answers');
  });

  /**
   * La réponse de création ne porte pas le lien de visioconférence : il faut
   * relire l'événement. Sans ça, impossible de dire si Google Meet a bien
   * fabriqué le lien — or c'est toute la question pour une séance à distance.
   */
  it('relit l’événement pour rendre le lien de visioconférence', async () => {
    stubCalendly({
      '/invitees': { status: 201, body: { resource: {
        uri: 'https://api.calendly.com/scheduled_events/S1/invitees/I1',
        event: 'https://api.calendly.com/scheduled_events/S1',
      } } },
      '/scheduled_events/S1': { body: { resource: { location: {
        type: 'google_conference', status: 'pushed', join_url: 'https://meet.google.com/abc-defg-hij',
      } } } },
    });

    const { body } = await poster(RDV);

    expect(body.rdv.lieu).toEqual({ type: 'google_conference', texte: 'https://meet.google.com/abc-defg-hij' });
  });

  it('rend le rendez-vous même si l’événement est illisible', async () => {
    stubCalendly({
      '/invitees': { status: 201, body: { resource: { uri: 'u', event: 'https://api.calendly.com/scheduled_events/S1' } } },
      '/scheduled_events/S1': { status: 500, body: { message: 'boom' } },
    });

    const { res, body } = await poster(RDV);

    expect(res.status).toBe(200);
    expect(body.rdv.lieu).toBeNull();
  });
});
