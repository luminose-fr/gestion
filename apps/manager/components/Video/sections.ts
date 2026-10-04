/**
 * Le vocabulaire de l'espace Vidéos, partagé par le panneau latéral, la barre
 * mobile et l'écran — pour qu'une section ajoutée le soit à un seul endroit.
 * Même forme que `Corpus/sections.ts` et `Settings/sections.ts`.
 */
import { Captions, Clapperboard } from 'lucide-react';

export type VideosSection = 'montage' | 'sous-titres';

export const VIDEOS_SECTIONS: Array<{
    id: VideosSection;
    label: string;
    /** Ce que la section donne à voir, sous le titre de l'écran. */
    sousTitre: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'montage',     label: 'Montage',     sousTitre: 'Les Reels expliqués, du script à la vidéo publiée', icon: Clapperboard },
    { id: 'sous-titres', label: 'Sous-titres', sousTitre: 'Un fichier .srt en titres Final Cut Pro (.fcpxml)', icon: Captions },
];

export const isVideosSection = (valeur: unknown): valeur is VideosSection =>
    VIDEOS_SECTIONS.some(s => s.id === valeur);

export const videosSectionLabel = (section: VideosSection): string =>
    VIDEOS_SECTIONS.find(s => s.id === section)?.label ?? 'Vidéos';

export const videosSectionSousTitre = (section: VideosSection): string =>
    VIDEOS_SECTIONS.find(s => s.id === section)?.sousTitre ?? '';
