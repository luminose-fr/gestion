/**
 * Ce que les écrans des clients partagent (SPEC §15.4) : les libellés, les
 * pastilles, l'écriture des dates et des montants, l'adresse, et les états d'un
 * écran — chargement, vide, refus, base non reliée.
 *
 * **Rien n'est gardé par le navigateur** (§15.2, règle 5) : pas de
 * `localStorage`, pas de `sessionStorage`, pas d'IndexedDB. L'état vit dans la
 * mémoire de la page ; un rechargement relit les routes. Un test parcourt ce
 * dossier et échoue sur le moindre de ces noms.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { instantDeParis, isoDeParis, jourDeParis } from '@luminose/pratique';
import { Etiquette, type TonEtiquette } from '../ui';
import { Patience } from '../Feedback';
import { ErreurClients } from '../../services/clientsService';
import type { EtatPaiement, ModeSeance, StatutInscription, StatutSeance } from '../../types-clients';

// ─── Les libellés (brief C2, règle 7) ───────────────────────────────────────

export const STATUTS: Record<StatutSeance, { libelle: string; ton: TonEtiquette }> = {
  prevue: { libelle: 'Prévue', ton: 'neutre' },
  realisee: { libelle: 'Réalisée', ton: 'succes' },
  annulee: { libelle: 'Annulée', ton: 'erreur' },
  absent: { libelle: 'Absent', ton: 'alerte' },
};

export const PAIEMENTS: Record<EtatPaiement, { libelle: string; ton: TonEtiquette }> = {
  a_payer: { libelle: 'À payer', ton: 'alerte' },
  attente_especes: { libelle: 'En attente d’espèces', ton: 'alerte' },
  payee: { libelle: 'Payée', ton: 'succes' },
  offerte: { libelle: 'Offerte', ton: 'neutre' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
};

export const MODES: Record<ModeSeance, string> = {
  sur_place: 'Sur place',
  visio: 'En visio',
  appel: 'Par téléphone',
};

export const INSCRIPTIONS: Record<StatutInscription, { libelle: string; ton: TonEtiquette }> = {
  retenue: { libelle: 'Retenue', ton: 'alerte' },
  payee: { libelle: 'Payée', ton: 'succes' },
  confirmee: { libelle: 'Confirmée', ton: 'succes' },
  expiree: { libelle: 'Expirée', ton: 'neutre' },
  annulee: { libelle: 'Annulée', ton: 'erreur' },
  deconseillee: { libelle: 'Déconseillée', ton: 'erreur' },
};

/** Les origines proposées ; la saisie libre reste possible (une `datalist`, pas un `select`). */
export const ORIGINES = [
  'Publicité - Google', 'Publicité - Autre', 'Internet', 'Bouche à oreilles', 'Flyer', 'Rencontre face à face',
  'Plaque signalétique', 'Professionnel de santé', 'Doctolib', 'BNI', 'Salon bien-être', 'MJC', 'CESHUM',
];

/** Un sens n'est jamais une couleur seule : la pastille porte toujours son libellé (brief C2, règle 4). */
export const Pastille: React.FC<{ libelle: string; ton: TonEtiquette; titre?: string }> = ({ libelle, ton, titre }) => (
  <Etiquette as="span" forme="pastille" ton={ton} title={titre}>{libelle}</Etiquette>
);

export const PastilleStatut: React.FC<{ statut: StatutSeance }> = ({ statut }) => (
  <Pastille libelle={STATUTS[statut].libelle} ton={STATUTS[statut].ton} />
);

export const PastillePaiement: React.FC<{ etat: EtatPaiement }> = ({ etat }) => (
  <Pastille libelle={PAIEMENTS[etat].libelle} ton={PAIEMENTS[etat].ton} />
);

// ─── Les dates, à l'heure de Paris ──────────────────────────────────────────

const PARIS = 'Europe/Paris';
const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, ...options });
const JOUR_LONG = format({ weekday: 'long', day: 'numeric', month: 'long' });
const JOUR_AN = format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const DATE_COURTE = format({ day: 'numeric', month: 'short', year: 'numeric' });
const HEURE = format({ hour: '2-digit', minute: '2-digit' });

/** « jeudi 17 décembre » ; l'année seulement quand ce n'est pas l'année en cours. */
export const jourEnLettres = (iso: string, maintenant = Date.now()) => {
  const t = Date.parse(iso);
  return (jourDeParis(t).slice(0, 4) === jourDeParis(maintenant).slice(0, 4) ? JOUR_LONG : JOUR_AN).format(t);
};
export const dateCourte = (iso: string | null) => (iso ? DATE_COURTE.format(Date.parse(iso)) : '—');
export const heure = (iso: string) => HEURE.format(Date.parse(iso));
/** `AAAA-MM-JJ` du jour de Paris où tombe cet instant. */
export const jourDe = (iso: string) => jourDeParis(Date.parse(iso));
export const aujourdhui = () => jourDeParis(Date.now());
/** Une date et une heure de Paris → la date avec son décalage, telle que les routes la veulent. */
export const isoDepuis = (date: string, h: string) => isoDeParis(instantDeParis(date, h));

/** Ajoute des jours à une date `AAAA-MM-JJ` (calendrier, pas durée : un changement d'heure ne la décale pas). */
export const plusJours = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Le lundi de la semaine d'une date. */
export const lundiDe = (date: string) => plusJours(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

/** 8000 → « 80 € » ; 8050 → « 80,50 € ». */
export const euros = (centimes: number | null | undefined) =>
  centimes === null || centimes === undefined ? '—'
    : (centimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: centimes % 100 ? 2 : 0 });

/** « 80 » ou « 80,50 » → 8000, 8050 ; une saisie illisible → `null`. */
export const centimesDepuis = (saisie: string): number | null => {
  const n = Number(saisie.replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export const nomComplet = (p: { prenom: string | null; nom: string | null }) =>
  [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom';

// ─── L'adresse ──────────────────────────────────────────────────────────────

/** Les segments de l'adresse, après l'espace : `#clients/<id>` → `['<id>']`. Suit `hashchange`. */
export const useAdresse = (): string[] => {
  const lire = () => window.location.hash.replace(/^#/, '').split('?')[0].split('/').slice(1).filter(Boolean);
  const [segments, setSegments] = useState<string[]>(lire);
  useEffect(() => {
    const suivre = () => setSegments(lire());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);
  return segments;
};

export const aller = (adresse: string) => {
  if (window.location.hash !== `#${adresse}`) window.location.hash = adresse;
};

/**
 * Un texte saisi ne se perd pas (brief C2, règle 6) : tant que `modifie` est
 * vrai, quitter l'onglet demande confirmation, et changer d'écran aussi — si
 * Florent refuse, l'adresse revient à l'écran qu'il n'a pas quitté.
 * `adresse: false` ne garde que l'onglet : pour un écran qui enregistre de
 * lui-même en partant (les notes d'une séance).
 */
export const MESSAGE_NON_ENREGISTRE = 'Un texte n’est pas enregistré. Quitter cet écran et le perdre ?';
export const useGardeSaisie = (modifie: boolean, { adresse: garderAdresse = true }: { adresse?: boolean } = {}) => {
  const adresse = useRef(window.location.hash);
  const retour = useRef(false);
  useEffect(() => {
    if (!modifie) { adresse.current = window.location.hash; return; }
    const avantDeQuitter = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = MESSAGE_NON_ENREGISTRE; };
    const avantDeChanger = () => {
      if (retour.current) { retour.current = false; return; }
      if (window.location.hash === adresse.current) return;
      if (!window.confirm(MESSAGE_NON_ENREGISTRE)) {
        retour.current = true;
        window.location.hash = adresse.current;
      }
    };
    window.addEventListener('beforeunload', avantDeQuitter);
    if (garderAdresse) window.addEventListener('hashchange', avantDeChanger);
    return () => {
      window.removeEventListener('beforeunload', avantDeQuitter);
      window.removeEventListener('hashchange', avantDeChanger);
    };
  }, [modifie, garderAdresse]);
};

// ─── Les états d'un écran ───────────────────────────────────────────────────

export type Lecture<T> =
  | { phase: 'chargement' }
  | { phase: 'nonReliee' }
  | { phase: 'refus'; message: string }
  | { phase: 'prete'; donnees: T };

/** Ce qu'une erreur d'une route dit à l'écran. */
export const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const lectureEchouee = (e: unknown): Lecture<never> =>
  e instanceof ErreurClients && e.nonReliee ? { phase: 'nonReliee' } : { phase: 'refus', message: messageDe(e) };

/**
 * Une lecture d'écran : chargement, puis la donnée, un refus, ou la base non
 * reliée. `recharger` relit sans repasser par l'état de chargement — la liste
 * ne clignote pas après un enregistrement.
 */
export function useLecture<T>(lire: () => Promise<T>, deps: React.DependencyList): Lecture<T> & { recharger: () => Promise<void> } {
  const [lecture, setLecture] = useState<Lecture<T>>({ phase: 'chargement' });
  const vivant = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const relire = useCallback(lire, deps);
  const recharger = useCallback(async () => {
    try {
      const donnees = await relire();
      if (vivant.current) setLecture({ phase: 'prete', donnees });
    } catch (e) {
      if (vivant.current) setLecture(lectureEchouee(e));
    }
  }, [relire]);
  useEffect(() => {
    vivant.current = true;
    setLecture({ phase: 'chargement' });
    void recharger();
    return () => { vivant.current = false; };
  }, [recharger]);
  return { ...lecture, recharger } as Lecture<T> & { recharger: () => Promise<void> };
}

export const MESSAGE_NON_RELIEE = 'La base des clients n’est pas reliée à cet environnement.';

/** Les états qui ne sont pas la donnée : un seul rendu, partout le même. */
export const EtatLecture: React.FC<{ lecture: Lecture<unknown>; titre?: string }> = ({ lecture, titre = 'Lecture de la base des clients' }) => {
  if (lecture.phase === 'chargement') return <Patience titre={titre} />;
  if (lecture.phase === 'nonReliee') return <Avis>{MESSAGE_NON_RELIEE}</Avis>;
  if (lecture.phase === 'refus') return <Avis ton="erreur">{lecture.message}</Avis>;
  return null;
};

/** Un message dans le flux de l'écran : un refus, un vide, un rappel. */
export const Avis: React.FC<React.PropsWithChildren<{ ton?: 'neutre' | 'erreur' | 'alerte' }>> = ({ ton = 'neutre', children }) => (
  <p
    role={ton === 'erreur' ? 'alert' : undefined}
    className={`text-sm rounded-lg px-3 py-2 border ${
      ton === 'erreur' ? 'text-erreur border-erreur/30 bg-erreur/10'
        : ton === 'alerte' ? 'text-alerte border-alerte/30 bg-alerte/10'
          : 'text-second border-bord bg-surface'
    }`}
  >
    {children}
  </p>
);

/** Une liste vide se dit, elle ne reste pas blanche. */
export const Vide: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p className="text-sm text-second py-6 text-center">{children}</p>
);

/** Le sélecteur natif, aux classes du champ : un choix fermé (statut, paiement, mode, type). */
export const CLASSES_SELECT =
  'w-full px-3 py-2 rounded-lg text-sm bg-fond border border-bord ' +
  'text-texte outline-hidden focus:border-marque transition-colors disabled:opacity-40';
