/**
 * Séances — le planning (SPEC §15.4, et la navigation décidée par Florent le
 * 27/11/2026 : un espace à part, plus un onglet de « Clients »).
 *
 * La semaine, du lundi au dimanche, jour par jour ; pour chaque séance l'heure,
 * la personne, le type, et deux pastilles — statut et paiement. Précédente,
 * suivante, aujourd'hui. Un contrôle « Semaine · Mois » ; le mois est une
 * grille qui montre, par jour, l'heure et le prénom. Toucher une séance l'ouvre.
 * Sur téléphone, la semaine est une liste de jours.
 *
 * L'adresse porte la vue et le lundi affiché : `#agenda/semaine/2026-12-14`,
 * `#agenda/mois/2026-12-01`. Des dates, jamais une personne.
 *
 * L'ancien écran Calendly reste ici, troisième vue, tant que Calendly sert.
 */
import React, { lazy, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Bouton, Carte, ControleSegmente, ecran } from '../ui';
import * as Clients from '../../services/clientsService';
import type { Seance } from '../../types-clients';
import {
  aller, aujourdhui, EtatLecture, heure, jourDe, lundiDe, nomComplet, PastillePaiement, PastilleStatut, plusJours, useLecture, Vide,
} from './commun';
import { PoserRendezVous } from './PoserRendezVous';

const RdvView = lazy(() => import('./RdvView'));

export type VuePlanning = 'semaine' | 'mois' | 'calendly';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const enLettres = (date: string, f: Intl.DateTimeFormat) => f.format(new Date(`${date}T12:00:00Z`));

/** Le premier du mois, et les bornes de la grille : du lundi d'avant au dimanche d'après. */
const grilleDuMois = (premier: string) => {
  const d = new Date(`${premier}T12:00:00Z`);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  const debut = lundiDe(premier);
  const fin = plusJours(lundiDe(dernier), 6);
  return { debut, fin };
};
const moisVoisin = (premier: string, n: number) => {
  const d = new Date(`${premier}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)).toISOString().slice(0, 10);
};

const LigneSeance: React.FC<{ s: Seance }> = ({ s }) => (
  <li>
    <a href={`#agenda/${encodeURIComponent(s.id)}`} className="ui-list-action block rounded-lg px-2 py-2 hover:bg-survol dark:hover:bg-dark-sec-bg">
      {/* L'heure, puis la personne en entier : dans une colonne de jour, un nom coupé ne se lit plus. */}
      <span className="block text-sm font-semibold text-brand-main dark:text-white tabular-nums">{heure(s.debut)}</span>
      <span className="block text-sm text-brand-main dark:text-white break-words">{nomComplet(s.personne)}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-brand-main dark:text-dark-text">{s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}</span>
        <PastilleStatut statut={s.statut} />
        <PastillePaiement etat={s.etatPaiement} />
      </div>
    </a>
  </li>
);

const parJour = (seances: Seance[]) => {
  const jours = new Map<string, Seance[]>();
  for (const s of seances) jours.set(jourDe(s.debut), [...(jours.get(jourDe(s.debut)) ?? []), s]);
  return jours;
};

const Semaine: React.FC<{ lundi: string; seances: Seance[] }> = ({ lundi, seances }) => {
  const jours = parJour(seances);
  const auj = aujourdhui();
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {JOURS.map((nom, i) => {
        const date = plusJours(lundi, i);
        const duJour = jours.get(date) ?? [];
        return (
          <Carte key={date} densite="liste" className={date === auj ? 'border-brand-main dark:border-white' : ''}>
            <p className="text-sm font-bold text-brand-main dark:text-white">{nom} <span className="font-normal">{enLettres(date, JOUR_MOIS)}</span></p>
            {duJour.length === 0
              ? <p className="mt-1 text-xs text-brand-main dark:text-dark-text">—</p>
              : <ul className="mt-1 space-y-1">{duJour.map((s) => <LigneSeance key={s.id} s={s} />)}</ul>}
          </Carte>
        );
      })}
    </div>
  );
};

const Mois: React.FC<{ premier: string; debut: string; fin: string; seances: Seance[] }> = ({ premier, debut, fin, seances }) => {
  const jours = parJour(seances);
  const moisAffiche = premier.slice(0, 7);
  const auj = aujourdhui();
  const cases: string[] = [];
  for (let d = debut; d <= fin; d = plusJours(d, 1)) cases.push(d);
  return (
    <Carte densite="tableau">
      <div className="grid grid-cols-7 border-b border-brand-border dark:border-dark-sec-border">
        {JOURS.map((j) => <p key={j} className="px-2 py-2 text-xs font-semibold text-brand-main dark:text-dark-text">{j.slice(0, 3)}</p>)}
      </div>
      <div className="grid grid-cols-7">
        {cases.map((date) => (
          <div key={date} className={`min-h-24 border-b border-r border-brand-border dark:border-dark-sec-border p-1.5 ${date.slice(0, 7) === moisAffiche ? '' : 'bg-brand-light dark:bg-dark-bg'}`}>
            <p className={`text-xs font-semibold tabular-nums ${date === auj ? 'text-brand-main dark:text-white underline' : 'text-brand-main dark:text-dark-text'}`}>{Number(date.slice(8))}</p>
            <ul className="mt-1 space-y-1">
              {(jours.get(date) ?? []).map((s) => (
                <li key={s.id}>
                  <a href={`#agenda/${encodeURIComponent(s.id)}`} title={`${nomComplet(s.personne)} — ${s.type?.libelle ?? ''}`}
                    className={`block truncate rounded-md px-1 text-xs hover:bg-survol dark:hover:bg-dark-sec-bg ${s.statut === 'annulee' ? 'line-through text-brand-main dark:text-dark-text' : 'text-brand-main dark:text-white'}`}>
                    <span className="tabular-nums">{heure(s.debut)}</span> {s.personne.prenom ?? '—'}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Carte>
  );
};

/**
 * `poser` : l'adresse `#agenda/poser`, où mène le « + » de l'iPhone (refonte,
 * lot 2) — la semaine en cours, la fenêtre déjà ouverte. La fermer rend
 * l'adresse de l'agenda, pour qu'un « retour » ne la rouvre pas.
 */
export const PlanningView: React.FC<{ vue: VuePlanning; date?: string; poser?: boolean }> = ({ vue, date, poser = false }) => {
  const [rdv, setRdv] = useState(poser);
  useEffect(() => { if (poser) setRdv(true); }, [poser]);
  const fermerRdv = () => { setRdv(false); if (poser) aller('agenda'); };
  const reference = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : aujourdhui();
  const lundi = lundiDe(reference);
  const premier = `${reference.slice(0, 7)}-01`;
  const bornes = useMemo(() => (vue === 'mois' ? grilleDuMois(premier) : { debut: lundi, fin: plusJours(lundi, 6) }), [vue, premier, lundi]);
  const lecture = useLecture(
    () => (vue === 'calendly' ? Promise.resolve({ seances: [] as Seance[] }) : Clients.seancesDeLaPeriode(bornes.debut, bornes.fin)),
    [vue, bornes.debut, bornes.fin],
  );

  const changerVue = (v: VuePlanning) => aller(v === 'calendly' ? 'agenda/calendly' : `agenda/${v}/${v === 'mois' ? premier : lundi}`);
  const precedent = () => aller(vue === 'mois' ? `agenda/mois/${moisVoisin(premier, -1)}` : `agenda/semaine/${plusJours(lundi, -7)}`);
  const suivant = () => aller(vue === 'mois' ? `agenda/mois/${moisVoisin(premier, 1)}` : `agenda/semaine/${plusJours(lundi, 7)}`);
  const titre = vue === 'mois'
    ? enLettres(premier, MOIS)
    : `Du ${enLettres(lundi, JOUR_MOIS)} au ${enLettres(plusJours(lundi, 6), JOUR_MOIS)}`;

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ControleSegmente<VuePlanning>
          libelle="Vue du planning"
          valeur={vue}
          onChange={changerVue}
          options={[{ valeur: 'semaine', libelle: 'Semaine' }, { valeur: 'mois', libelle: 'Mois' }, { valeur: 'calendly', libelle: 'Calendly', titre: 'Envoyer un lien de réservation Calendly, tant que Calendly sert' }]}
        />
        <Bouton taille="grand" intention="principale" posee onClick={() => setRdv(true)}><CalendarPlus /> Poser un rendez-vous</Bouton>
      </div>

      {vue === 'calendly' ? <RdvView /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Bouton intention="secondaire" onClick={precedent} aria-label={vue === 'mois' ? 'Mois précédent' : 'Semaine précédente'}><ChevronLeft /></Bouton>
            <Bouton intention="secondaire" onClick={() => aller(`agenda/${vue}/${vue === 'mois' ? `${aujourdhui().slice(0, 7)}-01` : lundiDe(aujourdhui())}`)}>Aujourd’hui</Bouton>
            <Bouton intention="secondaire" onClick={suivant} aria-label={vue === 'mois' ? 'Mois suivant' : 'Semaine suivante'}><ChevronRight /></Bouton>
            <p className="text-sm font-bold text-brand-main dark:text-white first-letter:uppercase">{titre}</p>
          </div>
          {lecture.phase !== 'prete' ? <EtatLecture lecture={lecture} /> : (
            lecture.donnees.seances.length === 0 && vue === 'semaine'
              ? <><Semaine lundi={lundi} seances={[]} /><Vide>Aucune séance cette semaine.</Vide></>
              : vue === 'mois'
                ? <Mois premier={premier} debut={bornes.debut} fin={bornes.fin} seances={lecture.donnees.seances} />
                : <Semaine lundi={lundi} seances={lecture.donnees.seances} />
          )}
        </>
      )}

      {rdv && (
        <PoserRendezVous
          date={vue === 'semaine' && lundi > aujourdhui() ? lundi : aujourdhui()}
          onFermer={fermerRdv}
          onPose={(id) => { setRdv(false); aller(`agenda/${encodeURIComponent(id)}`); }}
        />
      )}
    </div>
  );
};

export default PlanningView;
