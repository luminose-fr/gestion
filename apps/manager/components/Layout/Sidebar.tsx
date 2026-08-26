import React from 'react';
import {
    Lightbulb, Calendar as CalendarIcon, Archive, Users, Settings,
    Briefcase, CheckCircle2, PenLine, X, Video, Sparkles, Layers, BookMarked
} from 'lucide-react';

import { SETTINGS_SECTIONS, SettingsSection } from '../Settings/sections';
import { CORPUS_SECTIONS, BLOCS, CorpusSection } from '../Corpus/sections';

type SpaceView = 'social' | 'clients' | 'videos' | 'psychedelics' | 'corpus' | 'settings';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'series' | 'calendar' | 'archive';

interface SidebarProps {
    currentSpace: SpaceView;
    currentSocialTab: SocialTab;
    /** Section ouverte dans l'espace Réglages. */
    currentSettingsSection: SettingsSection;
    /** Section et bloc ouverts dans l'espace Corpus. */
    currentCorpusSection: CorpusSection;
    currentCorpusBloc: string | null;
    onNavigate: (space: SpaceView, tab: SocialTab) => void;
    onNavigateSettings: (section: SettingsSection) => void;
    onNavigateCorpus: (section: CorpusSection, bloc?: string | null) => void;
    /** Ce que le panneau Corpus affiche en pastille — captures en attente, documents par bloc. */
    corpusCounts?: { inbox?: number; parBloc?: Record<string, number> };
    counts: {
        ideas: number;
        drafts: number;
        ready: number;
        series: number;
        calendar: number;
        archive: number;
    };
    isMobileOpen: boolean;
    onMobileClose: () => void;
}

const SPACES: Array<{
    id: SpaceView;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    defaultTab: SocialTab;
}> = [
    { id: 'social',       icon: Briefcase, label: 'Contenus',       defaultTab: 'ideas' },
    { id: 'clients',      icon: Users,     label: 'Clients',        defaultTab: 'ideas' },
    { id: 'videos',       icon: Video,     label: 'Vidéos',         defaultTab: 'ideas' },
    { id: 'psychedelics', icon: Sparkles,  label: 'Psychédéliques', defaultTab: 'ideas' },
    { id: 'corpus',       icon: BookMarked, label: 'Corpus',         defaultTab: 'ideas' },
];

const SOCIAL_TABS: Array<{
    id: SocialTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}> = [
    { id: 'ideas',    icon: Lightbulb,    label: 'Boîte à idées'   },
    { id: 'drafts',   icon: PenLine,      label: 'En cours'        },
    { id: 'ready',    icon: CheckCircle2, label: 'Prêts'           },
    { id: 'series',   icon: Layers,       label: 'Séries'          },
    { id: 'calendar', icon: CalendarIcon, label: 'Calendrier'      },
    { id: 'archive',  icon: Archive,      label: 'Archives'        },
];

const RailButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}> = ({ active, onClick, icon: Icon, label }) => (
    <button
        onClick={onClick}
        title={label}
        className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 group ${
            active
                ? 'bg-brand-main text-white shadow-md shadow-brand-main/30 dark:bg-white dark:text-brand-main'
                : 'text-brand-main/50 hover:bg-brand-light hover:text-brand-main dark:text-dark-text/60 dark:hover:bg-dark-sec-bg dark:hover:text-white'
        }`}
    >
        <Icon className="w-[18px] h-[18px]" />
        <span className="hidden md:block absolute left-full ml-2 px-2 py-1 rounded-md bg-brand-main text-white dark:bg-dark-surface dark:text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-lg">
            {label}
        </span>
    </button>
);

const PanelTab: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count?: number;
}> = ({ active, onClick, icon: Icon, label, count }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all group ${
            active
                ? 'bg-brand-main text-white shadow-sm shadow-brand-main/25 dark:bg-white dark:text-brand-main'
                : 'text-brand-main/70 hover:bg-white hover:text-brand-main dark:text-dark-text/70 dark:hover:bg-dark-sec-bg dark:hover:text-white'
        }`}
    >
        <span className="flex items-center gap-2.5">
            <Icon className={`w-[14px] h-[14px] ${active ? '' : 'text-brand-main/40 group-hover:text-brand-main dark:text-dark-text/40 dark:group-hover:text-white'}`} />
            {label}
        </span>
        {count !== undefined && count > 0 && (
            <span className={`text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full leading-none ${
                active ? 'bg-white/20 text-white dark:bg-brand-main/15 dark:text-brand-main' : 'bg-brand-light text-brand-main/50 dark:bg-dark-bg dark:text-dark-text/50'
            }`}>
                {count}
            </span>
        )}
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
    currentSpace, currentSocialTab, currentSettingsSection,
    currentCorpusSection, currentCorpusBloc,
    onNavigate, onNavigateSettings, onNavigateCorpus, counts, corpusCounts,
    isMobileOpen, onMobileClose
}) => {
    // Trois espaces partagent le même panneau de deuxième niveau : Contenus,
    // Réglages et Corpus. C'est le même geste, au même endroit — et c'est ce
    // qui fait qu'un nouvel espace ne demande pas d'apprendre une navigation.
    const estReglages = currentSpace === 'settings';
    const estCorpus = currentSpace === 'corpus';
    const showSubPanel = currentSpace === 'social' || estReglages || estCorpus;

    const titrePanneau = estReglages ? 'Réglages' : estCorpus ? 'Corpus' : 'Contenus';

    const tabCount = (id: SocialTab): number | undefined => {
        if (id === 'ideas')    return counts.ideas;
        if (id === 'drafts')   return counts.drafts;
        if (id === 'ready')    return counts.ready;
        if (id === 'series')   return counts.series;
        if (id === 'calendar') return counts.calendar;
        if (id === 'archive')  return counts.archive;
        return undefined;
    };

    return (
        <>
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-xs"
                    onClick={onMobileClose}
                />
            )}

            <aside className={`
                fixed md:static inset-y-0 left-0 z-40 h-full
                flex shrink-0 transition-transform duration-300 ease-out md:translate-x-0
                ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Rail */}
                <div className="w-[64px] shrink-0 bg-white dark:bg-dark-surface border-r border-brand-border dark:border-dark-sec-border flex flex-col items-center py-3 gap-1">
                    <button
                        type="button"
                        onClick={() => { onNavigate('social', 'ideas'); onMobileClose(); }}
                        className="w-9 h-9 rounded-xl bg-linear-to-tr from-brand-main to-brand-hover flex items-center justify-center shadow-md shadow-brand-main/30 mb-3 hover:opacity-90 transition-opacity"
                        title="Luminose"
                    >
                        <span className="text-white font-bold text-base font-display italic">L</span>
                    </button>

                    {SPACES.map(space => (
                        <RailButton
                            key={space.id}
                            active={currentSpace === space.id}
                            onClick={() => { onNavigate(space.id, space.defaultTab); onMobileClose(); }}
                            icon={space.icon}
                            label={space.label}
                        />
                    ))}

                    <div className="flex-1" />

                    <RailButton
                        active={estReglages}
                        onClick={() => { onNavigateSettings(currentSettingsSection); onMobileClose(); }}
                        icon={Settings}
                        label="Réglages"
                    />
                </div>

                {/* Sub-panel — only when space has tabs */}
                {showSubPanel && (
                    <div className="w-[210px] bg-brand-light/60 dark:bg-dark-bg border-r border-brand-border dark:border-dark-sec-border flex flex-col">
                        <div className="px-4 h-[52px] flex items-center justify-between border-b border-brand-border dark:border-dark-sec-border shrink-0">
                            <p className="font-bold text-sm text-brand-main dark:text-white truncate">
                                {titrePanneau}
                            </p>
                            <button
                                onClick={onMobileClose}
                                className="md:hidden p-1 -mr-1 rounded-md text-brand-main/50 dark:text-dark-text/50 hover:bg-white dark:hover:bg-dark-sec-bg"
                                aria-label="Fermer le menu"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                            {estCorpus
                                ? CORPUS_SECTIONS.map(s => (
                                    <React.Fragment key={s.id}>
                                        <PanelTab
                                            active={currentCorpusSection === s.id}
                                            onClick={() => { onNavigateCorpus(s.id); onMobileClose(); }}
                                            icon={s.icon}
                                            label={s.label}
                                            count={s.id === 'inbox' ? corpusCounts?.inbox : undefined}
                                        />
                                        {/*
                                            Le troisième niveau ne s'ouvre que sous la section
                                            active : déplier les six blocs en permanence ferait
                                            un panneau de neuf entrées pour trois destinations.
                                        */}
                                        {s.id === 'documents' && currentCorpusSection === 'documents' && (
                                            <div className="pl-3 ml-2 border-l border-brand-border dark:border-dark-sec-border space-y-0.5 py-0.5">
                                                {BLOCS.map(b => (
                                                    <PanelTab
                                                        key={b.id}
                                                        active={currentCorpusBloc === b.id}
                                                        onClick={() => { onNavigateCorpus('documents', b.id); onMobileClose(); }}
                                                        icon={b.icon}
                                                        label={b.label}
                                                        count={corpusCounts?.parBloc?.[b.id]}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </React.Fragment>
                                ))
                                : estReglages
                                ? SETTINGS_SECTIONS.map(s => (
                                    <PanelTab
                                        key={s.id}
                                        active={currentSettingsSection === s.id}
                                        onClick={() => { onNavigateSettings(s.id); onMobileClose(); }}
                                        icon={s.icon}
                                        label={s.label}
                                    />
                                ))
                                : SOCIAL_TABS.map(t => (
                                    <PanelTab
                                        key={t.id}
                                        active={currentSocialTab === t.id}
                                        onClick={() => { onNavigate('social', t.id); onMobileClose(); }}
                                        icon={t.icon}
                                        label={t.label}
                                        count={tabCount(t.id)}
                                    />
                                ))}
                        </div>
                    </div>
                )}
            </aside>
        </>
    );
};
