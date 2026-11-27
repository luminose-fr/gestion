/**
 * Les espaces de la base des clients, au premier niveau de la barre latérale
 * (décision de Florent du 27/11/2026, qui remplace les onglets du §15.4) :
 *
 *   #clients                      les fiches
 *   #clients/nouvelle             une nouvelle fiche
 *   #clients/<id>                 une fiche
 *   #seances[/semaine/<lundi>]    le planning, à la semaine
 *   #seances/mois/<premier>       le planning, au mois
 *   #seances/calendly             l'ancien écran Calendly, tant qu'il sert
 *   #seances/<id>                 une séance et ses notes
 *   #evenements[/nouveau|/<id>]   les évènements (EvenementsView.tsx)
 *   #professionnels               les professionnels (ProfessionnelsView.tsx)
 *
 * Chaque espace lit lui-même la suite de son adresse : App ne connaît que
 * l'espace. Des identifiants et des dates, jamais un nom (§15.2, règle 3).
 */
import React from 'react';
import { FichesView } from './FichesView';
import { NouvelleFicheView } from './NouvelleFicheView';
import { FicheView } from './FicheView';
import { SeanceView } from './SeanceView';
import { PlanningView } from './PlanningView';
import { useAdresse } from './commun';

export const EspaceClients: React.FC = () => {
  const [premier] = useAdresse();
  if (!premier) return <FichesView />;
  if (premier === 'nouvelle') return <NouvelleFicheView />;
  return <FicheView key={premier} id={decodeURIComponent(premier)} />;
};

const VUES = ['semaine', 'mois', 'calendly'] as const;

export const EspaceSeances: React.FC = () => {
  const [premier, second] = useAdresse();
  if (!premier || (VUES as readonly string[]).includes(premier)) {
    return <PlanningView vue={(premier as (typeof VUES)[number]) ?? 'semaine'} date={second} />;
  }
  return <SeanceView key={premier} id={decodeURIComponent(premier)} />;
};
