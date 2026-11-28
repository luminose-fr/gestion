/**
 * Le bandeau du haut (retours du 28/11/2026, §1.4 —
 * docs/refonte/05-retours-28-novembre.md).
 *
 * Tous les écrans du Mac ont le même bandeau blanc : le titre (ou, sur une
 * page de détail, le fil « Stages › » puis le nom), les vues de l'écran en
 * onglets juste après, avec leur compteur, et l'action principale à droite.
 * L'onglet actif est souligné de 2 px, posé sur la bordure basse du bandeau.
 * Plus d'onglets dans le contenu, plus de « ‹ Retour ».
 *
 * La coque (App) tient le bandeau ; un écran y écrit par `<Bandeau>`, qui
 * passe par deux portails — le titre, la suite. Sans `<Bandeau>`, la coque
 * garde son titre par défaut.
 */
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { FOCUS, TitreEcran } from './index';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type SlotsBandeau = { titre: HTMLElement | null; suite: HTMLElement | null };
/** `null` : aucune coque (un écran monté seul, en test) — le bandeau s'écrit alors en place. */
export const SlotsBandeauContext = createContext<SlotsBandeau | null>(null);

export const Bandeau: React.FC<{
  /** Le fil d'une page de détail : « Stages › ». */
  fil?: { libelle: string; href: string };
  /** Le titre de l'écran ; absent, la coque garde le sien. */
  titre?: React.ReactNode;
  /** Les vues de l'écran : `<OngletsBarre>`. */
  onglets?: React.ReactNode;
  /** L'action principale, et ses voisines, à droite. */
  actions?: React.ReactNode;
}> = ({ fil, titre, onglets, actions }) => {
  const slots = useContext(SlotsBandeauContext);
  const tete = (fil || titre) ? (
        <div data-titre-ecran className="flex min-w-0 items-center gap-2">
          {fil && (
            <a href={fil.href} className={cx('flex-none rounded-controle font-charte text-courant font-semibold text-second hover:text-marque', FOCUS)}>
              {fil.libelle} <span aria-hidden="true">›</span>
            </a>
          )}
          {titre && <TitreEcran className="truncate">{titre}</TitreEcran>}
        </div>
  ) : null;
  const suite = (onglets || actions) ? (
    <>
      {onglets}
      {actions && <div className="ml-auto flex flex-none items-center gap-2 py-2">{actions}</div>}
    </>
  ) : null;
  if (!slots) return <div className="flex flex-wrap items-center gap-3">{tete}{suite}</div>;
  return (
    <>
      {slots.titre && tete && createPortal(tete, slots.titre)}
      {slots.suite && suite && createPortal(suite, slots.suite)}
    </>
  );
};

export type OngletBarre<T extends string> = { id: T; libelle: string; compte?: number };

/**
 * Les onglets du bandeau : la hauteur du bandeau, l'actif souligné de 2 px
 * sur sa bordure basse. Flèches gauche et droite au clavier.
 */
export function OngletsBarre<T extends string>({ onglets, actif, onChange, libelle }: {
  onglets: OngletBarre<T>[]; actif: T; onChange: (id: T) => void; libelle: string;
}) {
  const aller = (i: number, e: React.KeyboardEvent<HTMLElement>) => {
    const n = (i + onglets.length) % onglets.length;
    onChange(onglets[n].id);
    const voisins = (e.currentTarget.parentElement?.querySelectorAll('[role="tab"]') ?? []) as NodeListOf<HTMLElement>;
    voisins[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={libelle} className="flex flex-none items-stretch gap-1">
      {onglets.map((o, i) => {
        const choisi = o.id === actif;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={choisi} tabIndex={choisi ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); aller(i + 1, e); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); aller(i - 1, e); }
            }}
            className={cx(
              '-mb-px flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 font-charte text-courant md:h-16',
              choisi ? 'border-marque font-semibold text-texte' : 'border-transparent text-second hover:text-texte',
              'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque',
            )}>
            {o.libelle}
            {o.compte !== undefined && <span className="text-secondaire font-normal text-second tabular-nums">{o.compte}</span>}
          </button>
        );
      })}
    </div>
  );
}
