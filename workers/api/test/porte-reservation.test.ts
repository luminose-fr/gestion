/**
 * Réserver depuis le site, à travers la porte (contrat §3.1 ; SPEC §14.12) :
 * la porte de workers/porte, et les entrées nommées de gestion à la place des
 * liaisons de service. Identités fictives seulement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { MAINTENANT, LUNDI_9H30, MINUTE, HEURE, TYPES, compter } from './helpers/clients';
import { envPortes, executer, ficheEssai, seanceEssai, nouvelleCle, envoiComplet } from './helpers/portes';
import { PortePublique, PorteService } from '../src/index';
import porte from '../../porte/src/index';
import { verifierJeton } from '../src/clients/jetons';
import { TestD1 as BaseDeTest, MIGRATIONS } from './helpers/d1';
import { reprendreLesAgendas } from '../src/clients/agenda-seances';

const SITE = 'https://recette.luminose.fr';
const LUNDI_ISO = '2027-01-11T09:30:00+01:00';

let env: any;
let base: TestD1;
let attentes: Promise<unknown>[];

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { attentes.push(p); }, passThroughOnException: () => {} }) as unknown as ExecutionContext;
const libre = { limit: async () => ({ success: true }) };
const envPorte = () => ({
  ENVIRONNEMENT: 'recette', ORIGINE_SITE: SITE,
  GESTION_PUBLIQUE: new PortePublique(ctx(), env), GESTION_SERVICE: new PorteService(ctx(), env),
  LIMITE_QUESTIONNAIRES: libre, LIMITE_LIENS: libre, LIMITE_CRENEAUX: libre, LIMITE_RESERVATIONS: libre,
});

const lire = async (chemin: string) => {
  const r = await porte.fetch(new Request(`https://api-recette.luminose.fr${chemin}`, { headers: { Origin: SITE } }), envPorte());
  return { statut: r.status, corps: r.status === 200 ? await r.json() as any : null, origine: r.headers.get('Access-Control-Allow-Origin') };
};
const envoyer = async (chemin: string, envoi: unknown) => {
  const r = await porte.fetch(new Request(`https://api-recette.luminose.fr${chemin}`, {
    method: 'POST', body: JSON.stringify(envoi), headers: { Origin: SITE, 'Content-Type': 'application/json' },
  }), envPorte());
  const corps = r.status === 200 ? await r.json() as any : null;
  await Promise.all(attentes);
  return { statut: r.status, corps };
};

const reservation = (champs: Record<string, unknown> = {}) => ({
  cle: nouvelleCle(),
  type: 'seance',
  debut: LUNDI_ISO,
  identite: { prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 01' },
  conditions: { acceptees: true, version: 1 },
  ...champs,
});

beforeEach(() => {
  ({ env, base } = envPortes());
  attentes = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('lire les créneaux — GET /v1/reservation/creneaux', () => {
  it('les débuts libres du type, avec leur décalage, dans la fenêtre seulement', async () => {
    const r = await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11');
    expect(r.statut).toBe(200);
    expect(r.origine).toBe(SITE);
    // Lundi : 09:30–11:30 (un créneau de 90 min), 13:00–16:00 (deux), 16:30–19:30 (deux).
    expect(r.corps).toEqual({ ok: true, creneaux: [
      '2027-01-11T09:30:00+01:00', '2027-01-11T13:00:00+01:00', '2027-01-11T14:30:00+01:00',
      '2027-01-11T16:30:00+01:00', '2027-01-11T18:00:00+01:00',
    ] });
    // Avant la fenêtre (21 jours) : rien.
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2026-12-07&au=2026-12-07')).corps).toEqual({ ok: true, creneaux: [] });
  });

  it('une séance prévue retire son créneau ; un type inconnu rend une liste vide, sans motif', async () => {
    seanceEssai(base, 's0', null, LUNDI_9H30);
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11')).corps.creneaux).not.toContain(LUNDI_ISO);
    expect((await lire('/v1/reservation/creneaux?type=inconnu&du=2027-01-11&au=2027-01-11')).corps).toEqual({ ok: true, creneaux: [] });
  });

  it('plus de 62 jours, une date fausse, un paramètre de trop : invalide', async () => {
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-01&au=2027-03-15')).corps).toEqual({ ok: false, motif: 'invalide', champs: ['au'] });
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-02-30&au=2027-03-01')).corps.motif).toBe('invalide');
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11&nom=x')).corps).toEqual({ ok: false, motif: 'invalide', champs: ['champ_inconnu'] });
  });

  it('une autre origine : 403 ; la porte coupée : ferme', async () => {
    const r = await porte.fetch(new Request('https://api-recette.luminose.fr/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11',
      { headers: { Origin: 'https://autre.example.org' } }), envPorte());
    expect(r.status).toBe(403);
    executer(base, "UPDATE reglages SET valeur = 0 WHERE cle = 'porte_publique_ouverte'");
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11')).corps).toEqual({ ok: false, motif: 'ferme' });
  });
});

describe('réserver — POST /v1/reservation', () => {
  it('une personne inconnue : la séance, sa fiche neuve, la commande ; la référence ouvre le questionnaire de cette séance', async () => {
    const r = await envoyer('/v1/reservation', reservation());
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ ok: true, debut: LUNDI_ISO, fin: '2027-01-11T11:00:00+01:00' });
    const seance = base.query("SELECT * FROM seances WHERE origine = 'site'")[0];
    expect(seance).toMatchObject({ debut: LUNDI_9H30, statut: 'prevue', agenda_etat: 'a_ecrire', type_seance_id: TYPES.seance, montant_centimes: 8000, etat_paiement: 'a_payer' });
    expect(seance.client_id).not.toBeNull();
    expect(base.query('SELECT prenom, nom, email, origine FROM clients WHERE id = ?', seance.client_id)[0])
      .toEqual({ prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', origine: 'site' });
    expect(compter(base, 'seances_mouvements', "seance_id = ? AND nature = 'creee' AND par = 'personne'", seance.id)).toBe(1);
    expect(compter(base, 'commandes', "sorte = 'reservation'")).toBe(1);
    const jeton = await verifierJeton(env, r.corps.reference, 'questionnaire', MAINTENANT);
    expect(jeton).toMatchObject({ objet: seance.id, version: 1, echeance: LUNDI_9H30 });
    // Sans agenda relié : la confirmation et le rappel, inscrits tout de suite, à la révision 0.
    expect(base.query('SELECT modele_cle, cle_unicite FROM ordres ORDER BY prevu_le').map((o) => o.cle_unicite))
      .toEqual([`seance_confirmation:${seance.id}:0`, `seance_rappel:${seance.id}:0`]);
  });

  it('puis le questionnaire, avec la référence : rattaché à la séance', async () => {
    const r = await envoyer('/v1/reservation', reservation());
    const q = await envoyer('/v1/questionnaires', envoiComplet({ reference: r.corps.reference }));
    expect(q.corps).toEqual({ ok: true });
    const seance = base.query("SELECT id, questionnaire_id FROM seances WHERE origine = 'site'")[0];
    expect(seance.questionnaire_id).not.toBeNull();
    expect(base.query('SELECT rattachement FROM questionnaires WHERE id = ?', seance.questionnaire_id)[0].rattachement).not.toBe('a_rapprocher');
  });

  it('la même clé rejouée : le même reçu, une seule séance ; la même clé avec un autre contenu : invalide', async () => {
    const envoi = reservation();
    const a = await envoyer('/v1/reservation', envoi);
    const b = await envoyer('/v1/reservation', envoi);
    expect(b.corps).toEqual(a.corps);
    expect(compter(base, 'seances', "origine = 'site'")).toBe(1);
    expect((await envoyer('/v1/reservation', { ...envoi, mode: 'visio' })).corps).toMatchObject({ ok: false, motif: 'invalide' });
  });

  it('un créneau déjà pris : creneau_pris, et rien derrière — ni fiche, ni commande', async () => {
    seanceEssai(base, 's0', null, LUNDI_9H30);
    const r = await envoyer('/v1/reservation', reservation({ identite: { prenom: 'Ève', nom: 'Dupont', email: 'eve.dupont@example.org' } }));
    expect(r.corps).toEqual({ ok: false, motif: 'creneau_pris' });
    expect(compter(base, 'clients')).toBe(0);
    expect(compter(base, 'commandes')).toBe(0);
  });

  it('un créneau qui chevauche, sans commencer à la même heure : creneau_pris, rien derrière', async () => {
    seanceEssai(base, 's0', null, LUNDI_9H30 + 15 * MINUTE);
    expect((await envoyer('/v1/reservation', reservation())).corps).toEqual({ ok: false, motif: 'creneau_pris' });
    expect(compter(base, 'clients')).toBe(0);
  });

  it('hors de la grille ou de la fenêtre : hors_fenetre ; un type non réservable en ligne aussi', async () => {
    expect((await envoyer('/v1/reservation', reservation({ debut: '2027-01-11T10:00:00+01:00' }))).corps).toEqual({ ok: false, motif: 'hors_fenetre' });
    expect((await envoyer('/v1/reservation', reservation({ debut: '2026-12-07T09:30:00+01:00' }))).corps).toEqual({ ok: false, motif: 'hors_fenetre' });
    executer(base, "UPDATE types_seance SET reservable_en_ligne = 0 WHERE cle = 'seance'");
    expect((await envoyer('/v1/reservation', reservation())).corps).toEqual({ ok: false, motif: 'hors_fenetre' });
    expect(compter(base, 'seances')).toBe(0);
  });

  it('une fiche de cette clé : la séance lui est rattachée, sans fiche de plus', async () => {
    ficheEssai(base, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' });
    await envoyer('/v1/reservation', reservation());
    expect(base.query("SELECT client_id FROM seances WHERE origine = 'site'")[0].client_id).toBe('c1');
    expect(compter(base, 'clients')).toBe(1);
  });

  it('deux fiches de cette clé : rien n’est rattaché, la séance garde l’identité reçue, une alerte est levée', async () => {
    ficheEssai(base, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' });
    ficheEssai(base, 'c2', { cle_client: 'emilie.martin@example.org emilie martin' });
    const r = await envoyer('/v1/reservation', reservation());
    expect(r.corps.ok).toBe(true);
    const s = base.query("SELECT id, client_id, identite_recue FROM seances WHERE origine = 'site'")[0];
    expect(s.client_id).toBeNull();
    expect(JSON.parse(String(s.identite_recue)).email).toBe('emilie.martin@example.org');
    expect(compter(base, 'alertes', "sorte = 'a_rapprocher' AND objet_type = 'seance' AND objet_id = ?", s.id)).toBe(1);
  });

  it('règle 4 : connue ou non, la même forme de réponse', async () => {
    ficheEssai(base, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' });
    const connue = await envoyer('/v1/reservation', reservation());
    const inconnue = await envoyer('/v1/reservation', reservation({
      debut: '2027-01-11T13:00:00+01:00', identite: { prenom: 'Ève', nom: 'Dupont', email: 'eve.dupont@example.org' },
    }));
    expect(Object.keys(connue.corps).sort()).toEqual(Object.keys(inconnue.corps).sort());
  });

  it('le champ piège rempli : invalide, sans champ nommé, rien d’écrit', async () => {
    expect((await envoyer('/v1/reservation', reservation({ site_web: 'https://x.example.org' }))).corps).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(compter(base, 'seances')).toBe(0);
  });

  it('la borne du jour atteinte : trop_de_demandes, et une alerte sur le réglage', async () => {
    executer(base, "UPDATE reglages SET valeur = 0 WHERE cle = 'commandes_reservation_max_jour'");
    expect((await envoyer('/v1/reservation', reservation())).corps).toEqual({ ok: false, motif: 'trop_de_demandes' });
    expect(compter(base, 'seances')).toBe(0);
    expect(compter(base, 'alertes', "sorte = 'borne_atteinte' AND objet_id = 'commandes_reservation_max_jour'")).toBe(1);
  });

  it('un créneau à moins d’un quart d’heure du début de la fenêtre : encore réservable', async () => {
    // La fenêtre de la séance s'ouvre à 21 jours : ce créneau en sort de 10 minutes pour l'affichage.
    vi.setSystemTime(LUNDI_9H30 - 504 * HEURE + 10 * MINUTE);
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11')).corps.creneaux).not.toContain(LUNDI_ISO);
    expect((await envoyer('/v1/reservation', reservation())).corps.ok).toBe(true);
  });
});

describe('l’agenda Google relié (§14.12)', () => {
  type Appel = { url: string; corps: any };
  let appels: Appel[];
  let occupe: { start: string; end: string }[];
  let panneLecture: boolean;
  let panneEcriture: boolean;

  beforeEach(() => {
    const db = new BaseDeTest(MIGRATIONS);
    for (const [k, v] of [
      ['provider_key:google_agenda_client_id', 'client-essai.apps.googleusercontent.com'],
      ['provider_key:google_agenda_client_secret', 'secret-essai-0123456789'],
      ['provider_key:google_agenda_renouvellement', 'renouvellement-essai'],
    ]) db.query('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, 0)', k, v);
    env.DB = db;
    env.ENVIRONNEMENT = 'recette';
    appels = []; occupe = []; panneLecture = false; panneEcriture = false;
    vi.stubGlobal('fetch', async (entree: string, init: RequestInit) => {
      const url = String(entree);
      const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : String(init?.body ?? '');
      appels.push({ url, corps });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'acces-essai' });
      if (url.endsWith('/freeBusy')) {
        if (panneLecture) return new Response('', { status: 500 });
        return Response.json({ calendars: Object.fromEntries(corps.items.map((i: { id: string }) => [i.id, { busy: i.id === 'primary' || i.id === 'perso@group.calendar.google.com' ? occupe : [] }])) });
      }
      if (url.includes('/events?')) {
        return panneEcriture ? new Response('', { status: 503 }) : Response.json({ id: 'evenement-essai', hangoutLink: corps.conferenceData ? 'https://meet.google.com/abc-defg-hij' : undefined });
      }
      return new Response('', { status: 404 });
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('une plage occupée de l’agenda retire les créneaux qu’elle chevauche', async () => {
    occupe = [{ start: '2027-01-11T12:00:00Z', end: '2027-01-11T13:00:00Z' }]; // 13:00–14:00 à Paris
    const r = await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11');
    expect(r.corps.creneaux).not.toContain('2027-01-11T13:00:00+01:00');
    expect(r.corps.creneaux).toContain(LUNDI_ISO);
  });

  it('réserver sur une plage occupée de l’agenda : creneau_pris, rien d’écrit', async () => {
    occupe = [{ start: '2027-01-11T08:00:00Z', end: '2027-01-11T09:00:00Z' }];
    expect((await envoyer('/v1/reservation', reservation())).corps).toEqual({ ok: false, motif: 'creneau_pris' });
    expect(compter(base, 'seances')).toBe(0);
  });

  it('un agenda illisible : une panne, et rien n’est réservé', async () => {
    panneLecture = true;
    const r = await envoyer('/v1/reservation', reservation());
    expect(r.statut).toBeGreaterThanOrEqual(500);
    expect(compter(base, 'seances')).toBe(0);
    expect((await lire('/v1/reservation/creneaux?type=seance&du=2027-01-11&au=2027-01-11')).statut).toBeGreaterThanOrEqual(500);
  });

  it('réservée : la séance s’écrit dans l’agenda principal, avec un lien Meet en visio, et le note', async () => {
    const r = await envoyer('/v1/reservation', reservation({ type: 'seance_distance' }));
    expect(r.corps.ok).toBe(true);
    const ecriture = appels.find((a) => a.url.includes('/calendars/primary/events'))!;
    expect(ecriture.url).toContain('conferenceDataVersion=1');
    expect(ecriture.corps.summary).toBe('[Recette] Séance à distance — Émilie Martin');
    expect(ecriture.corps.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(base.query("SELECT agenda_etat, agenda_evenement_id, visio_url FROM seances WHERE origine = 'site'")[0])
      .toEqual({ agenda_etat: 'ecrit', agenda_evenement_id: 'evenement-essai', visio_url: 'https://meet.google.com/abc-defg-hij' });
  });

  it('l’écriture échoue : la réservation tient, la séance est « echec », et le passage la reprend', async () => {
    panneEcriture = true;
    expect((await envoyer('/v1/reservation', reservation())).corps.ok).toBe(true);
    expect(base.query("SELECT agenda_etat FROM seances WHERE origine = 'site'")[0].agenda_etat).toBe('echec');
    panneEcriture = false;
    vi.setSystemTime(MAINTENANT + HEURE);
    expect(await reprendreLesAgendas(env)).toBe(1);
    expect(base.query("SELECT agenda_etat FROM seances WHERE origine = 'site'")[0].agenda_etat).toBe('ecrit');
  });

  it('les agendas choisis : tous lus, et le rendez-vous écrit dans celui qui est désigné', async () => {
    env.DB.query("INSERT INTO app_settings (key, value, updated_at) VALUES ('agenda_google_lecture', ?, 0)", JSON.stringify(['perso@group.calendar.google.com', 'pro@group.calendar.google.com']));
    env.DB.query("INSERT INTO app_settings (key, value, updated_at) VALUES ('agenda_google_ecriture', 'pro@group.calendar.google.com', 0)");
    occupe = [{ start: '2027-01-11T08:00:00Z', end: '2027-01-11T09:00:00Z' }]; // dans l'agenda perso
    expect((await envoyer('/v1/reservation', reservation())).corps).toEqual({ ok: false, motif: 'creneau_pris' });
    const lecture = appels.find((a) => a.url.endsWith('/freeBusy'))!;
    expect(lecture.corps.items).toEqual([{ id: 'perso@group.calendar.google.com' }, { id: 'pro@group.calendar.google.com' }]);
    occupe = [];
    expect((await envoyer('/v1/reservation', reservation())).corps.ok).toBe(true);
    expect(appels.find((a) => a.url.includes('/events?'))!.url).toContain('/calendars/pro%40group.calendar.google.com/events?');
  });

  it('rien de Google dans les réponses de la porte', async () => {
    const r = await envoyer('/v1/reservation', reservation());
    const texte = JSON.stringify(r.corps);
    for (const repere of ['acces-essai', 'renouvellement-essai', 'secret-essai', 'evenement-essai', 'meet.google']) expect(texte).not.toContain(repere);
  });
});
