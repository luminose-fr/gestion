/**
 * Les témoins d'attente — un seul vocabulaire pour toute l'application.
 *
 * Avant, chaque écran inventait le sien : un rond qui tourne seul au milieu du
 * vide, un bouton dont le libellé devenait « ... », un voile bloquant, ou rien
 * du tout. Trois formes, quatre tailles, et aucune ne disait jamais combien de
 * temps ça allait durer.
 *
 * Il n'y en a plus que quatre, et elles se composent :
 *   - `Barre`             la primitive — remplit quand on sait, balaie sinon ;
 *   - `EnCours`           ce qu'un bouton affiche pendant qu'il travaille ;
 *   - `Patience`          l'attente qui occupe un panneau entier ;
 *   - `BandeauActivite`   le témoin global des appels en cours, + `FiletActivite`.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as Activite from '../services/activityService';
import type { Tache } from '../services/activityService';

// ── La primitive ─────────────────────────────────────────────────────────

export interface BarreProps {
  /** 0 → 1. `null` : l'échéance est inconnue, la barre balaie au lieu de remplir. */
  part: number | null;
  /** Épaisseur en pixels — 2 pour un filet, 3 pour un bandeau, 4 pour un panneau. */
  epaisseur?: number;
  ton?: 'brand' | 'violet' | 'ambre';
  className?: string;
  /** Ce que la barre mesure, pour qui ne voit pas l'écran. */
  libelle?: string;
  /** Un filet qui court d'un bord à l'autre de l'écran ne s'arrondit pas. */
  arrondi?: boolean;
}

const TONS = {
  brand:  { piste: 'bg-brand-main/15 dark:bg-white/10',   remplissage: 'bg-brand-main dark:bg-dark-text' },
  violet: { piste: 'bg-violet-500/15 dark:bg-violet-300/15', remplissage: 'bg-violet-600 dark:bg-violet-300' },
  ambre:  { piste: 'bg-amber-500/15 dark:bg-amber-300/15',   remplissage: 'bg-amber-500 dark:bg-amber-300' },
};

export const Barre: React.FC<BarreProps> = ({
  part, epaisseur = 3, ton = 'brand', className = '', libelle, arrondi = true,
}) => {
  const { piste, remplissage } = TONS[ton];
  const pourcent = part === null ? null : Math.round(Math.min(1, Math.max(0, part)) * 100);
  const forme = arrondi ? 'rounded-full' : '';

  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(pourcent === null ? {} : { 'aria-valuenow': pourcent })}
      className={`relative w-full overflow-hidden ${forme} ${piste} ${className}`}
      style={{ height: epaisseur }}
    >
      {pourcent === null ? (
        <div className={`absolute inset-y-0 left-0 w-1/4 ${forme} ${remplissage} animate-balayage`} />
      ) : (
        <div
          className={`h-full ${forme} ${remplissage} transition-[width] duration-300 ease-out`}
          style={{ width: `${pourcent}%` }}
        />
      )}
    </div>
  );
};

// ── Ce qu'un bouton affiche pendant qu'il travaille ───────────────────────

const TAILLES = { xs: 'w-3 h-3', sm: 'w-3.5 h-3.5', md: 'w-4 h-4' };

/**
 * À placer dans un bouton, à la place de son icône ET de son libellé.
 *
 * Le libellé NOMME le travail — « Régénération… », pas « ... ». Les trois points
 * seuls étaient le témoin le plus répandu de l'application : ils occupaient la
 * place du seul mot qui aurait renseigné.
 */
export const EnCours: React.FC<{ label: string; taille?: keyof typeof TAILLES }> = ({
  label, taille = 'sm',
}) => (
  <>
    <Loader2 className={`${TAILLES[taille]} shrink-0 animate-spin`} />
    {label}
  </>
);

// ── L'attente qui occupe un panneau ──────────────────────────────────────

/**
 * Un titre qui nomme la tâche, l'étape en cours s'il y en a une, et une barre.
 * Remplace le rond qui tournait seul au milieu du vide : il disait qu'on
 * attendait, jamais quoi ni pour combien de temps.
 */
export const Patience: React.FC<{
  titre: string;
  detail?: string | null;
  /** 0 → 1 quand l'opération sait se compter ; `null` sinon. */
  part?: number | null;
  /** `ligne` pour une attente en pleine page, `bloc` pour une carte posée dessus. */
  aspect?: 'ligne' | 'bloc';
}> = ({ titre, detail, part = null, aspect = 'ligne' }) => {
  const corps = (
    <>
      <Loader2 className="w-6 h-6 text-brand-main dark:text-dark-text animate-spin mb-3" />
      <p className="text-sm font-semibold text-brand-main dark:text-white">{titre}</p>
      {detail && (
        <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60">{detail}</p>
      )}
      <Barre part={part} libelle={titre} className="mt-4 max-w-64" />
    </>
  );

  if (aspect === 'bloc') {
    return (
      <div className="flex flex-col items-center justify-center text-center p-6 w-64 bg-white dark:bg-dark-surface rounded-2xl shadow-xl border border-brand-border dark:border-dark-sec-border animate-fade-in">
        {corps}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 animate-fade-in">
      {corps}
    </div>
  );
};

// ── Le témoin global ─────────────────────────────────────────────────────

/** Les tâches en cours, telles que le registre les voit à l'instant. */
export const useTaches = (): Tache[] => {
  const [taches, setTaches] = useState<Tache[]>(() => Activite.tachesEnCours());
  useEffect(() => Activite.surTaches(setTaches), []);
  return taches;
};

/**
 * Le libellé de l'appel IA en cours — « Rédaction », « Slides du carrousel » —
 * ou `null` s'il n'y en a pas.
 *
 * C'est ce qui permet à un écran de faire tourner LE bouton cliqué plutôt que
 * les quatre : un `isGenerating` booléen ne sait pas lequel a déclenché.
 */
export const useActionIA = (): string | null =>
  useTaches().find(t => t.nature === 'ia')?.label ?? null;

/**
 * L'instant courant, rafraîchi tant qu'il y a de quoi compter. Un quart de
 * seconde : assez pour que la barre glisse au lieu de sauter, assez peu pour
 * qu'un écran au repos ne rende rien du tout.
 */
const useHorloge = (actif: boolean): number => {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!actif) return;
    setMaintenant(Date.now());
    const battement = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(battement);
  }, [actif]);
  return maintenant;
};

/**
 * Deux temporisations, deux raisons : on ne montre rien avant 150 ms — sinon le
 * moindre PATCH fait clignoter l'écran — et on ne retire rien avant 400 ms —
 * sinon le clignotement revient par l'autre bout.
 */
const useTemoinRetarde = (actif: boolean): boolean => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const delai = setTimeout(() => setVisible(actif), actif ? 150 : 400);
    return () => clearTimeout(delai);
  }, [actif]);
  return visible;
};

/**
 * Le filet de progression, collé sous l'en-tête. Il s'allume dès que
 * l'application parle au serveur, quelle que soit la raison et quel que soit
 * l'écran ouvert — c'est le seul témoin qu'on ne peut pas rater parce qu'il est
 * toujours au même endroit.
 */
export const FiletActivite: React.FC = () => {
  const taches = useTaches();
  const visible = useTemoinRetarde(taches.length > 0);
  const maintenant = useHorloge(visible);

  if (!visible) return null;

  // Une seule tâche dont on connaît l'échéance : la barre la suit. Plusieurs, ou
  // aucune estimation : elle balaie — additionner des progressions hétérogènes
  // donnerait un chiffre que rien ne justifie.
  const part = taches.length === 1 ? Activite.partEstimee(taches[0], maintenant) : null;

  // Le positionnement vit sur une enveloppe, pas sur la barre : `Barre` pose
  // `relative` sur sa racine (son remplissage balayant en dépend), et deux
  // utilitaires de position sur la même classe se départagent par l'ordre du
  // fichier CSS — pas par l'ordre où on les écrit. La barre est alors sortie de
  // son coin et rendue au milieu de l'en-tête.
  return (
    <div className="absolute left-0 right-0 -bottom-px z-30">
      <Barre
        part={taches.length === 0 ? 1 : part}
        epaisseur={2}
        arrondi={false}
        libelle="Échange avec le serveur en cours"
      />
    </div>
  );
};

const LigneActivite: React.FC<{ tache: Tache; maintenant: number }> = ({ tache, maintenant }) => {
  const secondes = Math.max(0, Math.round((maintenant - tache.debut) / 1000));
  const part = Activite.partEstimee(tache, maintenant);
  const long = Activite.traineEnLongueur(tache, maintenant);

  return (
    /* Le bandeau prolonge l'en-tête plutôt que de se fondre dans la page : posé
       sur `bg-brand-light`, il avait exactement la couleur du fond des listes et
       ne se voyait pas — c'est le reproche d'origine. */
    <div className="px-4 md:px-6 py-2 bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap text-xs text-brand-main dark:text-dark-text">
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        <span className="flex-1 min-w-0">
          <strong className="font-bold text-brand-main dark:text-white">{tache.label}</strong>
          {tache.persona ? ` — ${tache.persona}` : ''}
          {tache.modele && (
            <span className="text-brand-main/60 dark:text-dark-text/60"> · {tache.modele}</span>
          )}
          {tache.etape && (
            <span className="text-brand-main/60 dark:text-dark-text/60"> · {tache.etape}</span>
          )}
        </span>
        {long && (
          <span className="shrink-0 text-amber-700 dark:text-amber-300 font-medium">
            plus long que d'habitude
          </span>
        )}
        <span className="shrink-0 tabular-nums text-brand-main/60 dark:text-dark-text/60">
          {secondes} s
        </span>
      </div>
      <Barre
        part={part}
        ton={long ? 'ambre' : 'brand'}
        libelle={tache.label}
        className="mt-1.5"
      />
    </div>
  );
};

/**
 * Le bandeau des appels en cours. Il vit dans la coque de l'application, et non
 * dans l'écran qui déclenche : un appel lancé depuis l'atelier reste visible
 * quand on revient à la liste, et le bouton qui disparaît n'emporte plus la
 * seule trace de ce qui travaille (SPEC §3.5.1).
 *
 * Seules les tâches NOMMÉES s'y affichent — le reste n'allume que le filet.
 */
export const BandeauActivite: React.FC = () => {
  const taches = useTaches();
  const nommees = taches.filter(t => t.label);
  const maintenant = useHorloge(nommees.length > 0);

  if (nommees.length === 0) return null;

  return (
    <div className="shrink-0">
      {nommees.map(tache => (
        <LigneActivite key={tache.id} tache={tache} maintenant={maintenant} />
      ))}
    </div>
  );
};
