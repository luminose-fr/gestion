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
    // Aucun ordre dans cette phase : la confirmation attend l'agenda.
    expect(compter(base, 'ordres')).toBe(0);
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
