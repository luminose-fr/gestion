/**
 * Le vocabulaire de l'espace Corpus, partagé par le panneau latéral et l'écran
 * — pour qu'une section ajoutée le soit à un seul endroit.
 *
 * Même forme que `Settings/sections.ts` : les deux espaces ont un panneau de
 * deuxième niveau, et ils doivent se ressembler. Ce qui change ici, c'est le
 * TROISIÈME niveau : les documents se rangent par bloc, et le bloc est une
 * information de navigation, pas un filtre d'écran.
 */
import {
    Gauge, BookOpen, Inbox, Landmark, Mic, Compass, Radio, Library, Wrench,
} from 'lucide-react';

export type CorpusSection = 'etat' | 'documents' | 'inbox';

export const CORPUS_SECTIONS: Array<{
    id: CorpusSection;
    label: string;
    /** Ce que la section donne à voir, sous le titre de l'écran. */
    sousTitre: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'etat',      label: 'État',      sousTitre: 'Ce qui demande une décision',              icon: Gauge },
    { id: 'documents', label: 'Documents', sousTitre: 'Le corpus, en lecture seule',             icon: BookOpen },
    { id: 'inbox',     label: 'Inbox',     sousTitre: 'Capturer sans ranger — trois champs',     icon: Inbox },
];

/**
 * Les six blocs, dans l'ordre où ils se lisent : du plus général au plus
 * spécialisé. Ce n'est pas l'ordre alphabétique — `socle/` d'abord parce que
 * tout le charge, `outils/` en dernier parce qu'un seul cas d'usage le lit.
 */
export const BLOCS: Array<{
    id: string;
    label: string;
    sousTitre: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'socle',      label: 'Socle',      sousTitre: 'Identité, offres, cadre déontologique',   icon: Landmark },
    { id: 'voix',       label: 'Voix',       sousTitre: 'Ton, interdits, direction artistique',    icon: Mic },
    { id: 'strategie',  label: 'Stratégie',  sousTitre: 'Décisions datées, hypothèses',            icon: Compass },
    { id: 'canaux',     label: 'Canaux',     sousTitre: 'Une fiche par canal',                     icon: Radio },
    { id: 'repertoire', label: 'Répertoire', sousTitre: 'La matière réutilisable',                 icon: Library },
    { id: 'outils',     label: 'Outils',     sousTitre: 'Le parc et les process',                  icon: Wrench },
];

export const isCorpusSection = (v: string): v is CorpusSection =>
    CORPUS_SECTIONS.some(s => s.id === v);

export const isBloc = (v: string) => BLOCS.some(b => b.id === v);

export const corpusSectionLabel = (s: CorpusSection, bloc?: string | null) => {
    if (s === 'documents' && bloc) {
        return BLOCS.find(b => b.id === bloc)?.label ?? 'Documents';
    }
    return CORPUS_SECTIONS.find(x => x.id === s)?.label ?? 'Corpus';
};

export const corpusSectionSousTitre = (s: CorpusSection, bloc?: string | null) => {
    if (s === 'documents' && bloc) {
        return BLOCS.find(b => b.id === bloc)?.sousTitre ?? '';
    }
    return CORPUS_SECTIONS.find(x => x.id === s)?.sousTitre ?? '';
};
