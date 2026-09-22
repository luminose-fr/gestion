/**
 * Le bouton de l'application.
 *
 * Une centaine de `<button>` portaient chacun leurs paddings — douze couples
 * `px-/py-`, six hauteurs pour trois intentions. Il en reste deux tailles et
 * trois intentions, écrites ici et nulle part ailleurs.
 */
import React from 'react';

export type TailleBouton = 'petit' | 'normal';
export type IntentionBouton = 'principale' | 'secondaire' | 'discrete';
/** Le sens d'un bouton vert, orange ou rouge. `neutre` est la marque. */
export type TonBouton = 'neutre' | 'succes' | 'alerte' | 'erreur';

/**
 * La taille décide aussi de l'icône. `[&_svg]:size-*` l'emporte sur le
 * `w-3 h-3` qu'une icône apporterait avec elle (sélecteur plus spécifique) :
 * une icône migrée sans qu'on retouche sa classe prend quand même la bonne
 * taille. Trois tailles d'icône cohabitaient dans les boutons, il en reste
 * une par taille de bouton.
 */
const TAILLES: Record<TailleBouton, string> = {
  petit: 'px-2.5 py-1.5 text-xs [&_svg]:size-3.5',
  normal: 'px-3 py-2 text-sm [&_svg]:size-4',
};

/*
  Chaque intention porte sa propre bordure. Sans bordure, l'action principale
  mesure 2 px de moins que la secondaire à paddings identiques, et 2 px de
  moins qu'un champ. La bordure transparente ne peut pas vivre dans les classes
  communes : deux utilitaires qui touchent la même propriété se départagent
  dans l'ordre de la feuille générée, pas dans celui de l'attribut.
*/
const INTENTIONS: Record<TonBouton, Record<IntentionBouton, string>> = {
  neutre: {
    principale:
      // En sombre le fond est blanc : le survol clair de la marque, pas le violet
      // foncé du clair, sur lequel le texte brand-main disparaîtrait.
      'border border-transparent bg-brand-main text-white hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light',
    secondaire:
      'border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text hover:border-brand-main/40',
    discrete:
      'border border-transparent text-brand-main/70 dark:text-dark-text/70 underline hover:no-underline',
  },
  /*
    Les tokens de sens s'éclaircissent en sombre (#6ee7b7, #fcd34d) : un texte
    blanc y tomberait sous 1.5:1. En plein, le texte passe donc à dark-bg en
    sombre — plus de 10:1 — et reste blanc en clair (5:1 et plus).
  */
  succes: {
    principale:
      'border border-transparent bg-succes text-white dark:text-dark-bg hover:bg-succes/90',
    secondaire: 'border border-succes/30 text-succes hover:bg-succes/10',
    discrete: 'border border-transparent text-succes underline hover:no-underline',
  },
  alerte: {
    principale:
      'border border-transparent bg-alerte text-white dark:text-dark-bg hover:bg-alerte/90',
    secondaire: 'border border-alerte/30 text-alerte hover:bg-alerte/10',
    discrete: 'border border-transparent text-alerte underline hover:no-underline',
  },
  /** Suppression, verdict « À revoir ». */
  erreur: {
    principale:
      'border border-transparent bg-erreur text-white dark:text-dark-bg hover:bg-erreur/90',
    secondaire: 'border border-erreur/30 text-erreur hover:bg-erreur/10',
    discrete: 'border border-transparent text-erreur underline hover:no-underline',
  },
};

export interface BoutonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  taille?: TailleBouton;
  intention?: IntentionBouton;
  ton?: TonBouton;
  /** L'ombre, réservée à l'action principale d'un écran. */
  posee?: boolean;
}

/**
 * `type` n'a pas de valeur par défaut, à dessein : `type="button"` d'office
 * changerait le comportement d'un bouton de soumission migré sans y penser.
 */
export const Bouton: React.FC<BoutonProps> = ({
  taille = 'normal',
  intention = 'secondaire',
  ton = 'neutre',
  posee = false,
  className = '',
  ...reste
}) => (
  <button
    className={[
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:opacity-40 [&_svg]:shrink-0',
      TAILLES[taille],
      INTENTIONS[ton][intention],
      posee ? 'shadow-xs' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...reste}
  />
);

export default Bouton;
