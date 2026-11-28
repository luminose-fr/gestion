/**
 * Les jours d'une période, vus de l'Agenda (refonte de la console, lot 5) :
 * fermés ou ouverts, et combien de créneaux restent libres à la réservation.
 *
 * Le compte suit la règle du site — `creneauxLibres` de `packages/pratique`,
 * sur le type « séance » (le rendez-vous courant), avec les horaires, les
 * dates d'exception, les séances prévues et l'agenda Google — mais sans la
 * fenêtre de réservation en ligne (voir plus bas).
 * Une lecture groupée de quatre instructions, un aller-retour, plus l'agenda.
 */
import { creneauxLibres, instantDeParis, jourDeLaSemaine, jourDeParis, jourSuivant, type Horaires, type Occupation, type TypeDeSeance } from '@luminose/pratique';
import type { Env } from '../env';
import { baseClients } from './base';
import { ouvrirAgenda } from './agenda';

const JOUR = 86_400_000;

export type JourAgenda = {
  date: string;
  /** `exception` : fermé par une date d'exception ; `habitude` : aucun horaire ce jour de la semaine. */
  ferme: 'exception' | 'habitude' | null;
  /** Une date d'exception porte ce jour : « Ouvrir ce jour » la retire. */
  exception: boolean;
  /** Les créneaux libres du type « séance » ; `null` quand ce type n'existe pas. */
  libres: number | null;
};

export const disponibilites = async (env: Env, du: string, au: string, maintenant: number): Promise<{ jours: JourAgenda[]; agendaLu: boolean }> => {
  const db = baseClients(env);
  const debut = instantDeParis(du, '00:00');
  const fin = instantDeParis(jourSuivant(au), '00:00');
  const [types, semaine, dates, seances] = await db.batch([
    db.prepare(`SELECT duree_min, marge_apres_min, pas_min
      FROM types_seance WHERE cle = 'seance' AND deleted_at IS NULL AND actif = 1`),
    db.prepare('SELECT jour, debut, fin FROM horaires WHERE deleted_at IS NULL'),
    db.prepare('SELECT date, debut, fin FROM horaires_dates WHERE deleted_at IS NULL AND date >= ?1 AND date <= ?2').bind(du, au),
    db.prepare(`SELECT debut, occupe_jusqua FROM seances WHERE statut = 'prevue' AND debut < ?2 AND occupe_jusqua > ?1`).bind(debut - JOUR, fin + JOUR),
  ]);
  const horaires: Horaires = { semaine: {}, dates: {} };
  for (const h of semaine.results as { jour: number; debut: string; fin: string }[]) (horaires.semaine[h.jour] ??= []).push({ debut: h.debut, fin: h.fin });
  for (const d of dates.results as { date: string; debut: string | null; fin: string | null }[]) {
    const plages = (horaires.dates[d.date] ??= []);
    if (d.debut && d.fin) plages.push({ debut: d.debut, fin: d.fin });
  }
  const t = types.results[0] as Record<string, number> | undefined;
  const type: TypeDeSeance | null = t ? {
    dureeMin: Number(t.duree_min), margeApresMin: Number(t.marge_apres_min), pasMin: Number(t.pas_min),
    // La fenêtre du site (3 semaines à 6 mois pour une séance) est ignorée : ce
    // compte dit à Florent où il reste de la place dans SES horaires, y compris
    // cette semaine — qu'il remplit lui-même. Le passé, lui, ne compte pas.
    fenetreDebutH: 0, fenetreFinH: 24 * 366,
  } : null;
  let occupations: Occupation[] = (seances.results as { debut: number; occupe_jusqua: number }[]).map((s) => ({ debut: Number(s.debut), fin: Number(s.occupe_jusqua) }));

  // L'agenda Google, s'il est relié. Ici on AFFICHE : une lecture qui échoue
  // ne fait pas tomber l'écran, elle se dit (`agendaLu: false`).
  let agendaLu = true;
  if (type) {
    try {
      const agenda = await ouvrirAgenda(env);
      if (agenda) occupations = [...occupations, ...await agenda.occupe(debut, fin)];
    } catch { agendaLu = false; }
  }

  const parJour = new Map<string, number>();
  if (type) for (const d of creneauxLibres({ type, horaires, occupations, maintenant, du, au })) {
    const j = jourDeParis(d);
    parJour.set(j, (parJour.get(j) ?? 0) + 1);
  }

  const jours: JourAgenda[] = [];
  for (let date = du; date <= au; date = jourSuivant(date)) {
    const exception = Object.prototype.hasOwnProperty.call(horaires.dates, date);
    const plages = exception ? horaires.dates[date] : horaires.semaine[jourDeLaSemaine(date)] ?? [];
    jours.push({
      date,
      ferme: plages.length ? null : exception ? 'exception' : 'habitude',
      exception,
      libres: type ? parJour.get(date) ?? 0 : null,
    });
  }
  return { jours, agendaLu };
};

/**
 * Les heures libres d'un type, jour par jour, pour poser ou déplacer un
 * rendez-vous depuis la console (retours du 28/11/2026, §5). Le calcul du
 * site — `creneauxLibres`, sur les horaires, les dates d'exception, les
 * séances prévues et l'agenda Google — avec les durée, marge et pas du type ;
 * pour le même jour, la console et le site ne se contredisent pas.
 *
 * Deux écarts, voulus. La fenêtre de réservation en ligne est ignorée, comme
 * pour l'Agenda : Florent remplit lui-même sa semaine. Et la séance qu'on
 * déplace (`sauf`) ne compte pas comme occupée : on peut la décaler d'une
 * demi-heure sur elle-même. Un type « console seulement » se pose aussi.
 * Une lecture groupée de quatre instructions, plus l'agenda.
 */
export const creneauxDuType = async (
  env: Env, typeId: string, du: string, au: string, maintenant: number, sauf: string | null,
): Promise<{ creneaux: number[]; agendaLu: boolean } | null> => {
  const db = baseClients(env);
  const debut = instantDeParis(du, '00:00');
  const fin = instantDeParis(jourSuivant(au), '00:00');
  const [types, semaine, dates, seances] = await db.batch([
    db.prepare('SELECT duree_min, marge_apres_min, pas_min FROM types_seance WHERE id = ?1 AND deleted_at IS NULL AND actif = 1').bind(typeId),
    db.prepare('SELECT jour, debut, fin FROM horaires WHERE deleted_at IS NULL'),
    db.prepare('SELECT date, debut, fin FROM horaires_dates WHERE deleted_at IS NULL AND date >= ?1 AND date <= ?2').bind(du, au),
    db.prepare(`SELECT id, debut, occupe_jusqua, agenda_evenement_id FROM seances
      WHERE statut = 'prevue' AND debut < ?2 AND occupe_jusqua > ?1 AND id IS NOT ?3`).bind(debut - JOUR, fin + JOUR, sauf),
  ]);
  const t = types.results[0] as Record<string, number> | undefined;
  if (!t) return null;
  const horaires: Horaires = { semaine: {}, dates: {} };
  for (const h of semaine.results as { jour: number; debut: string; fin: string }[]) (horaires.semaine[h.jour] ??= []).push({ debut: h.debut, fin: h.fin });
  for (const d of dates.results as { date: string; debut: string | null; fin: string | null }[]) {
    const plages = (horaires.dates[d.date] ??= []);
    if (d.debut && d.fin) plages.push({ debut: d.debut, fin: d.fin });
  }
  const type: TypeDeSeance = {
    dureeMin: Number(t.duree_min), margeApresMin: Number(t.marge_apres_min), pasMin: Number(t.pas_min),
    fenetreDebutH: 0, fenetreFinH: 24 * 366,
  };
  let occupations: Occupation[] = (seances.results as { debut: number; occupe_jusqua: number }[]).map((s) => ({ debut: Number(s.debut), fin: Number(s.occupe_jusqua) }));
  let agendaLu = true;
  try {
    const agenda = await ouvrirAgenda(env);
    if (agenda) {
      // La séance qu'on déplace est aussi dans l'agenda Google : son évènement ne bloque pas non plus.
      const deplacee = sauf ? await db.prepare('SELECT debut FROM seances WHERE id = ?1').bind(sauf).first<{ debut: number }>() : null;
      const occupe = await agenda.occupe(debut, fin);
      occupations = [...occupations, ...occupe.filter((o) => !deplacee || o.debut !== Number(deplacee.debut))];
    }
  } catch { agendaLu = false; }
  return { creneaux: creneauxLibres({ type, horaires, occupations, maintenant, du, au }), agendaLu };
};
