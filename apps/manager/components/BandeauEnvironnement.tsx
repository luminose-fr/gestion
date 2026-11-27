/**
 * Le bandeau qui dit où l'on est (SPEC §14.8) : « Recette », « Local ».
 *
 * Permanent, sur tous les écrans, contenu ouvert compris : la recette a la même
 * console que la production, et rien d'autre ne les distingue à l'œil. Une
 * écriture faite par erreur dans la mauvaise console, c'est une donnée fictive
 * en production, ou une vraie en recette.
 *
 * Rien en production — ni quand le nom n'est pas encore lu : un bandeau qui
 * clignote au chargement apprendrait à ne plus le regarder.
 *
 * Le sens « alerte » existant, pas une couleur nouvelle (DESIGN.md).
 */
import React from 'react';
import { FlaskConical } from 'lucide-react';
import type { NomEnvironnement } from '../services/apiService';

const TEXTES: Record<Exclude<NomEnvironnement, 'production'>, { nom: string; detail: string }> = {
  recette: { nom: 'Recette', detail: 'données fictives — rien de ce qui se fait ici n’atteint la production' },
  local: { nom: 'Local', detail: 'poste de développement' },
};

export const BandeauEnvironnement: React.FC<{ nom: NomEnvironnement | null }> = ({ nom }) => {
  if (nom !== 'recette' && nom !== 'local') return null;
  const texte = TEXTES[nom];
  return (
    <div
      role="status"
      data-environnement={nom}
      className="shrink-0 bg-alerte/10 border-b border-alerte/30 px-4 py-2 text-xs text-alerte flex items-center justify-center gap-1.5"
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span className="font-bold">{texte.nom}</span>
      <span>· {texte.detail}</span>
    </div>
  );
};

export default BandeauEnvironnement;
