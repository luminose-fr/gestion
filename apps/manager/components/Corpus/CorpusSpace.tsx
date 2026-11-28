/**
 * L'espace Corpus — le poste de pilotage du socle Luminose.
 *
 * La navigation vit dans le panneau latéral, comme pour Contenus et Réglages :
 * un espace de plus ne doit pas demander d'apprendre une navigation de plus.
 * Cette coque ne fait donc que router — elle ne porte aucun onglet à elle.
 *
 * Une seule des trois vues écrit quoi que ce soit : l'inbox. Le corpus est une
 * constante du bundle du Worker — l'application ne PEUT pas le modifier, et ce
 * n'est pas une discipline mais une propriété.
 */
import React from 'react';
import type { CorpusSection } from './sections';
import EtatView from './EtatView';
import DocumentsView from './DocumentsView';
import InboxView from './InboxView';
import CarteView from './CarteView';
import { useState } from 'react';
import { ListeSecondNiveau } from '../charte/cadre';
import { Etiquette, Secondaire } from '../charte';
import { RoleIA } from '../Settings/RoleIA';
import { PERSONAS_NAV } from '../Settings/apercus';

/**
 * Les rôles IA, sous la Carte (refonte, lot 9 — docs/refonte/01, §3) : la
 * Carte montre le chemin du corpus jusqu'au modèle, un rôle montre ce qu'il
 * reçoit en entier. Ils étaient dans Réglages → Personas.
 */
const RolesIA: React.FC = () => {
  const [role, setRole] = useState<string>(PERSONAS_NAV[0].id);
  return (
    <section aria-labelledby="titre-roles" className="mt-8 flex flex-col gap-3 border-t border-bord pt-6 font-charte">
      <div>
        <Etiquette as="h2" id="titre-roles">Les rôles IA</Etiquette>
        <Secondaire className="mt-1">Ce que chaque rôle reçoit, dans l’ordre : la feuille de salle du corpus, puis le prompt composé. En lecture.</Secondaire>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <ListeSecondNiveau libelle="Rôles" actif={role} onChoisir={setRole}
          entrees={PERSONAS_NAV.map((p) => ({ id: p.id, libelle: p.label }))} />
        <div className="min-w-0 flex-1"><RoleIA persona={role} /></div>
      </div>
    </section>
  );
};

interface Props {
  section: CorpusSection;
  /** Bloc ouvert, quand la section est « documents ». */
  bloc: string | null;
}

const CorpusSpace: React.FC<Props> = ({ section, bloc }) => {
  if (section === 'documents') return <DocumentsView bloc={bloc} />;
  if (section === 'inbox') return <InboxView />;
  if (section === 'carte') return <><CarteView /><RolesIA /></>;
  return <EtatView />;
};

export default CorpusSpace;
