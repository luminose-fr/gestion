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

interface Props {
  section: CorpusSection;
  /** Bloc ouvert, quand la section est « documents ». */
  bloc: string | null;
}

const CorpusSpace: React.FC<Props> = ({ section, bloc }) => {
  if (section === 'documents') return <DocumentsView bloc={bloc} />;
  if (section === 'inbox') return <InboxView />;
  return <EtatView />;
};

export default CorpusSpace;
