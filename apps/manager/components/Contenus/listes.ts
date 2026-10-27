/**
 * Les trois listes de l'espace Contenus (SPEC §13) : le vocabulaire partagé par
 * la barre latérale, la barre mobile et l'écran — une liste ajoutée l'est à un
 * seul endroit. Même forme que `Corpus/sections.ts` et `Settings/sections.ts`.
 *
 * Un contenu est dans UNE liste, et une seule : une idée dans Idées, un
 * contenu publié ou programmé dans Publiés, tout le reste dans Conversations.
 * Les six onglets d'avant (Boîte à idées, En cours, Prêts, Séries, Calendrier,
 * Archives) et l'espace Vidéos montraient parfois deux fois le même contenu.
 */
import { CheckCircle2, Lightbulb, MessagesSquare } from 'lucide-react';
import { ContentItem, ContentStatus } from '../../types';

export type ListeContenus = 'conversations' | 'ideas' | 'publies';

export const LISTES: Array<{
    id: ListeContenus;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'conversations', label: 'Conversations', icon: MessagesSquare },
    { id: 'ideas',         label: 'Idées',         icon: Lightbulb },
    { id: 'publies',       label: 'Publiés',       icon: CheckCircle2 },
];

export const estListe = (valeur: unknown): valeur is ListeContenus => LISTES.some(l => l.id === valeur);

export const libelleDeListe = (liste: ListeContenus): string => LISTES.find(l => l.id === liste)?.label ?? 'Contenus';

/** La liste où un contenu se trouve. */
export const listeDuContenu = (item: Pick<ContentItem, 'status'>): ListeContenus =>
    item.status === ContentStatus.IDEA ? 'ideas'
    : item.status === ContentStatus.PUBLISHED ? 'publies'
    : 'conversations';

/**
 * Les adresses d'avant la v2.19, et où elles mènent désormais. Un favori, un
 * lien d'historique, un onglet resté ouvert : aucun ne doit tomber sur un écran
 * vide.
 */
export const REDIRECTIONS: Record<string, string> = {
    drafts: 'conversations',
    ready: 'conversations',
    calendar: 'publies?vue=calendrier',
    archive: 'publies',
};
