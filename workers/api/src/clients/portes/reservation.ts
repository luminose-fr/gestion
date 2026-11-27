/**
 * Réserver depuis le site (contrat §3.1 ; SPEC §14.4, §14.7.1, §14.12).
 *
 * Deux entrées : lire les créneaux libres d'un type, et réserver. Comme le
 * questionnaire, **rien ici ne sait d'où vient l'envoi** : une fonction reçoit
 * ce qui est arrivé (`unknown`) et rend une réponse du contrat ; une panne lève.
 *
 * **L'agenda Google** (agenda.ts), quand Florent l'a relié : ses plages
 * occupées s'ajoutent aux séances prévues, à la lecture comme à la
 * réservation — où il est relu juste avant d'écrire ; illisible, c'est une
 * panne, et rien n'est réservé (contrat §3.1, point 1). La séance s'y écrit
 * après la réponse, avec son lien Meet en visio ; une écriture manquée se
 * reprend au passage planifié (`agenda_etat = 'echec'`). Non relié, gestion
 * fait sans lui, et la séance garde `a_ecrire`. La confirmation et les rappels
 * attendent l'écriture dans l'agenda (contrat §3.1, point 3) : aucun ordre
 * n'est inscrit dans cette phase.
 *
 * **La même fonction sert à afficher et à réserver** (§14.7.1) :
 * `creneauxLibres` et `verifierCreneau`, de `packages/pratique`, sur les mêmes
 * lectures ; un quart d'heure de tolérance à la réservation.
 */
import {
  invalide, refuser, valider, champPiegeRempli, lectureCreneaux, reservation as schemaReservation,
  JOURS_MAX_PAR_LECTURE, type Reponse,
} from '@luminose/contrat';
import {
  creneauxLibres, verifierCreneau, instantDeParis, instantDepuisIso, isoDeParis, jourDeParis, jourSuivant,
  type Horaires, type Occupation, type TypeDeSeance,
} from '@luminose/pratique';
import type { Env } from '../../env';
import { newId } from '../../db';
import { baseClients, clientsReliee } from '../base';
import { secretDesPortes, signerJeton } from '../jetons';
import { decisionCommande, empreinteDe, lireCommande, reponseAuRejeu, commandeExiste, type CommandeVue } from '../commandes';
import { lotCreation } from '../decisions';
import { identite as identiteDeFiche } from '../fiches';
import { ouvrirAlerte, alerteBorne } from '../alertes';
import { ouvrirAgenda } from '../agenda';
import { synchroniserAgenda } from '../agenda-seances';

const MINUTE = 60_000;
const JOUR = 24 * 3_600_000;
/** §14.7.1, point 4 : un quart d'heure de tolérance sur le début de la fenêtre, à la réservation. */
const TOLERANCE_MIN = 15;
const BORNE = 'commandes_reservation_max_jour';

/** L'interrupteur : un réglage absent ferme la porte. */
const INTERRUPTEUR = "SELECT valeur FROM reglages WHERE cle = 'porte_publique_ouverte'";
const estOuverte = (r: D1Result) => Number((r.results?.[0] as { valeur?: number } | undefined)?.valeur ?? 0) === 1;

type LigneType = {
  id: string; duree_min: number; marge_apres_min: number; pas_min: number; fenetre_debut_h: number; fenetre_fin_h: number;
  montant_centimes: number; etat_paiement_defaut: string; lieu: string;
};

/**
 * Ce qu'il faut pour calculer : l'interrupteur, le type (actif, réservable en
 * ligne), la semaine type, les dates d'exception et les séances prévues de la
 * période. UN aller-retour, cinq instructions, quel que soit le type demandé.
 */
const lirePourCalculer = async (db: D1Database, cleType: string, du: string, au: string, enPlus: D1PreparedStatement[] = []) => {
  const debut = instantDeParis(du, '00:00') - JOUR;
  const fin = instantDeParis(jourSuivant(au), '00:00') + JOUR;
  const resultats = await db.batch([
    db.prepare(INTERRUPTEUR),
    db.prepare(`
      SELECT id, duree_min, marge_apres_min, pas_min, fenetre_debut_h, fenetre_fin_h, montant_centimes, etat_paiement_defaut, lieu
      FROM types_seance WHERE cle = ?1 AND deleted_at IS NULL AND actif = 1 AND reservable_en_ligne = 1`).bind(cleType),
    db.prepare('SELECT jour, debut, fin FROM horaires WHERE deleted_at IS NULL'),
    db.prepare('SELECT date, debut, fin FROM horaires_dates WHERE deleted_at IS NULL AND date >= ?1 AND date <= ?2').bind(du, au),
    db.prepare(`SELECT debut, occupe_jusqua FROM seances WHERE statut = 'prevue' AND debut < ?2 AND occupe_jusqua > ?1`).bind(debut, fin),
    ...enPlus,
  ]);
  const [reglage, types, semaine, dates, seances] = resultats;
  const t = (types.results?.[0] as LigneType | undefined) ?? null;
  const horaires: Horaires = { semaine: {}, dates: {} };
  for (const h of semaine.results as { jour: number; debut: string; fin: string }[]) {
    (horaires.semaine[h.jour] ??= []).push({ debut: h.debut, fin: h.fin });
  }
  // Une date d'exception fermée est une ligne sans heures : présente, et vide.
  for (const d of dates.results as { date: string; debut: string | null; fin: string | null }[]) {
    const plages = (horaires.dates[d.date] ??= []);
    if (d.debut && d.fin) plages.push({ debut: d.debut, fin: d.fin });
  }
  const occupations: Occupation[] = (seances.results as { debut: number; occupe_jusqua: number }[])
    .map((s) => ({ debut: Number(s.debut), fin: Number(s.occupe_jusqua) }));
  const type: TypeDeSeance | null = t && {
    dureeMin: Number(t.duree_min), margeApresMin: Number(t.marge_apres_min), pasMin: Number(t.pas_min),
    fenetreDebutH: Number(t.fenetre_debut_h), fenetreFinH: Number(t.fenetre_fin_h),
  };
  return { ouverte: estOuverte(reglage), ligne: t, type, horaires, occupations, enPlus: resultats.slice(5) };
};

const exigerLaBase = (env: Env) => {
  if (!clientsReliee(env)) throw new Error('incident: base_non_reliee');
  return baseClients(env);
};

// ─── Lire les créneaux ──────────────────────────────────────────────────────

/**
 * `GET /v1/reservation/creneaux` : les débuts libres d'un type, du jour `du` au
 * jour `au`, 62 jours au plus. Un type inconnu, inactif ou non réservable en
 * ligne rend une liste vide — la même réponse qu'un mois plein : la porte ne
 * dit pas pourquoi (aucun motif d'indisponibilité, contrat §3.1).
 */
export const creneaux = async (env: Env, lecture: unknown, maintenant: number): Promise<Reponse> => {
  const v = valider(lectureCreneaux, lecture);
  if (!v.valide) return v.refus;
  const { type: cleType, du, au } = v.donnees;
  const jours = Math.round((instantDeParis(au, '12:00') - instantDeParis(du, '12:00')) / JOUR) + 1;
  if (jours > JOURS_MAX_PAR_LECTURE) return invalide(['au']);
  const db = exigerLaBase(env);

  const l = await lirePourCalculer(db, cleType, du, au);
  if (!l.ouverte) return refuser('ferme');
  if (!l.type) return { ok: true, creneaux: [] };
  // L'agenda, sur toute la période ; une lecture qui échoue lève : une panne.
  const agenda = await ouvrirAgenda(env);
  const occupations = agenda
    ? [...l.occupations, ...await agenda.occupe(instantDeParis(du, '00:00'), instantDeParis(jourSuivant(au), '00:00'))]
    : l.occupations;
  const debuts = creneauxLibres({ type: l.type, horaires: l.horaires, occupations, maintenant, du, au });
  return { ok: true, creneaux: debuts.map(isoDeParis) };
};

// ─── Réserver ───────────────────────────────────────────────────────────────

/** Le reçu d'une réservation : la référence et les dates. Ni identité, ni réponse. */
type Recu = { ok: true; reference: string; debut: string; fin: string };

/**
 * `POST /v1/reservation` (contrat §3.1).
 *
 * 1. Le contrat, le champ piège, la base, le secret.
 * 2. UNE lecture groupée : l'interrupteur, le type, les horaires, les séances
 *    de la journée, la commande de cette clé. Une clé déjà vue rend son reçu.
 * 3. Le créneau, par `verifierCreneau` (tolérance d'un quart d'heure) :
 *    `hors_fenetre` ou `creneau_pris` sans rien écrire.
 * 4. UN lot, qui décide : la commande — sous la borne du jour ET la condition
 *    que l'intervalle soit libre, dans la transaction —, puis la fiche si
 *    aucune n'a cette clé, la séance, son mouvement. Un créneau pris
 *    entre-temps ne laisse rien derrière lui.
 * 5. Après la réponse : deux fiches ou plus pour cette clé, la séance reste
 *    « à rapprocher » et une alerte est levée (§14.4, « Désigner un client »).
 *
 * Deux allers-retours sur le chemin qui réserve ; trois quand le lot n'a rien
 * écrit (la relecture dit pourquoi).
 */
export const reserver = async (env: Env, envoi: unknown, maintenant: number): Promise<{ reponse: Reponse; suite: () => Promise<void> }> => {
  const rien = async () => {};
  if (champPiegeRempli(envoi)) return { reponse: invalide(), suite: rien };
  const v = valider(schemaReservation, envoi);
  if (!v.valide) return { reponse: v.refus, suite: rien };
  const r = v.donnees;
  const debut = instantDepuisIso(r.debut);
  if (debut === null) return { reponse: invalide(['debut']), suite: rien };

  if (!secretDesPortes(env)) throw new Error('incident: portes_secret_absent');
  const db = exigerLaBase(env);
  const empreinte = await empreinteDe(env, r);
  const jour = jourDeParis(debut);

  const lu = await lirePourCalculer(db, r.type, jour, jour, [lireCommande(db, 'publique', r.cle)]);
  if (!lu.ouverte) return { reponse: refuser('ferme'), suite: rien };
  const deja = (lu.enPlus[0].results?.[0] as CommandeVue | undefined) ?? null;
  if (deja) return { reponse: reponseAuRejeu(deja, empreinte), suite: rien };
  if (!lu.type || !lu.ligne) return { reponse: refuser('hors_fenetre'), suite: rien };

  // L'intervalle occupé, marge comprise : c'est lui que la décision protège.
  const occupeJusqua = debut + (lu.type.dureeMin + lu.type.margeApresMin) * MINUTE;
  // L'agenda relu juste avant d'écrire, sur cet intervalle. Illisible : une panne, rien n'est réservé.
  const agenda = await ouvrirAgenda(env);
  const occupations = agenda ? [...lu.occupations, ...await agenda.occupe(debut, occupeJusqua)] : lu.occupations;

  const verdict = verifierCreneau({
    type: lu.type, horaires: lu.horaires, occupations, maintenant, debut, toleranceMin: TOLERANCE_MIN,
  });
  if (verdict !== 'libre') return { reponse: refuser(verdict), suite: rien };
  const seanceId = newId();
  const reference = await signerJeton(env, {
    // Choix de S2b (§14.6.2, point 2) : l'échéance d'un lien de questionnaire est le début de la séance.
    usage: 'questionnaire', objet: seanceId, echeance: debut, version: 1,
  });
  const recu: Recu = { ok: true, reference, debut: isoDeParis(debut), fin: isoDeParis(debut + lu.type.dureeMin * MINUTE) };

  const fiche = identiteDeFiche(r.identite.prenom, r.identite.nom, r.identite.email);
  const clientNeuf = newId();
  const commandeId = newId();
  // Les deux instants sont des entiers calculés ici, jamais un texte reçu : écrits tels quels.
  const libre = `NOT EXISTS (SELECT 1 FROM seances autre WHERE autre.statut = 'prevue'
    AND autre.debut < ${Math.trunc(occupeJusqua)} AND autre.occupe_jusqua > ${Math.trunc(debut)})`;

  const creation = lotCreation(db, {
    id: seanceId,
    clientId: null,
    typeSeanceId: lu.ligne.id,
    identiteRecue: JSON.stringify(r.identite),
    debut,
    dureeMin: lu.type.dureeMin,
    etatPaiement: lu.ligne.etat_paiement_defaut as 'a_payer',
    montantCentimes: Number(lu.ligne.montant_centimes),
    mode: r.mode ?? (lu.ligne.lieu === 'sur_place' ? 'sur_place' : lu.ligne.lieu === 'visio' ? 'visio' : null),
    origine: 'site',
    listeAttente: r.liste_attente ?? false,
    conditionsAccepteesLe: r.conditions ? maintenant : null,
    conditionsVersion: r.conditions?.version ?? null,
    provenance: r.provenance ? JSON.stringify(r.provenance) : null,
    clicAnnonce: r.provenance?.clic?.id ?? null,
  }, 'personne', maintenant, fiche.cleClient, `EXISTS (SELECT 1 FROM commandes WHERE id = '${commandeId}')`);

  const resultats = await db.batch([
    // 0. La décision : la commande, sous la borne ET la liberté de l'intervalle.
    decisionCommande(db, {
      id: commandeId, porte: 'publique', cle: r.cle, sorte: 'reservation', objetType: 'seance', objetId: seanceId,
      empreinte, recu, borne: BORNE,
    }, maintenant, libre),
    // 1. La fiche, si aucune n'a cette clé — et seulement si la commande est passée.
    db.prepare(`
      INSERT INTO clients (id, prenom, nom, nom_recherche, cle_client, email, telephone, origine, created_at, updated_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'site', ?8, ?8
      WHERE ${commandeExiste('?9')} AND ?5 IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.cle_client = ?5)`)
      .bind(clientNeuf, fiche.prenom, fiche.nom, fiche.nomRecherche, fiche.cleClient, fiche.email,
        r.identite.telephone ?? null, maintenant, commandeId),
    // 2 et 3. La séance et son mouvement, liés à la commande : refusée (borne, clé), il n'y a pas de séance.
    ...creation.instructions,
  ]);

  if (resultats[0].meta.changes === 1) {
    return {
      reponse: recu,
      suite: async () => {
        const n = await db.prepare('SELECT client_id FROM seances WHERE id = ?1').bind(seanceId).first<{ client_id: string | null }>();
        if (n && n.client_id === null) await ouvrirAlerte(db, { sorte: 'a_rapprocher', objetType: 'seance', objetId: seanceId }, Date.now()).run();
        if (agenda) await synchroniserAgenda(env, db, agenda, seanceId);
      },
    };
  }

  // Rien d'écrit : une clé vue entre-temps, un créneau pris, ou la borne.
  const apres = await lirePourCalculer(db, r.type, jour, jour, [lireCommande(db, 'publique', r.cle)]);
  const vue = (apres.enPlus[0].results?.[0] as CommandeVue | undefined) ?? null;
  if (vue) return { reponse: reponseAuRejeu(vue, empreinte), suite: rien };
  if (apres.type && verifierCreneau({
    type: apres.type, horaires: apres.horaires, occupations: apres.occupations, maintenant, debut, toleranceMin: TOLERANCE_MIN,
  }) !== 'libre') return { reponse: refuser('creneau_pris'), suite: rien };
  await alerteBorne(db, BORNE, maintenant).run();
  return { reponse: refuser('trop_de_demandes'), suite: rien };
};

export type { Recu };
