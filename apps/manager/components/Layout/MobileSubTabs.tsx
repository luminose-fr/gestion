import React from 'react';
import { Lightbulb, PenLine, CheckCircle2, Calendar as CalendarIcon, Archive, Layers } from 'lucide-react';
import { SETTINGS_SECTIONS, SettingsSection } from '../Settings/sections';
import { CORPUS_SECTIONS, BLOCS, CorpusSection } from '../Corpus/sections';

type SocialTab = 'drafts' | 'ready' | 'ideas' | 'series' | 'calendar' | 'archive';

interface MobileSubTabsProps {
    /** L'espace décide de ce que la barre montre : contenus, réglages ou corpus. */
    space: 'social' | 'settings' | 'corpus';
    currentTab: SocialTab;
    currentSettingsSection: SettingsSection;
    onNavigate: (tab: SocialTab) => void;
    onNavigateSettings: (section: SettingsSection) => void;
    currentCorpusSection?: CorpusSection;
    currentCorpusBloc?: string | null;
    onNavigateCorpus?: (section: CorpusSection, bloc?: string | null) => void;
    counts: {
        ideas: number;
        drafts: number;
        ready: number;
        series: number;
        calendar: number;
        archive: number;
    };
}

const TABS: Array<{
    id: SocialTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}> = [
    { id: 'ideas',    icon: Lightbulb,    label: 'Idées'      },
    { id: 'drafts',   icon: PenLine,      label: 'En cours'   },
    { id: 'ready',    icon: CheckCircle2, label: 'Prêts'      },
    { id: 'series',   icon: Layers,       label: 'Séries'     },
    { id: 'calendar', icon: CalendarIcon, label: 'Calendrier' },
    { id: 'archive',  icon: Archive,      label: 'Archives'   },
];

const RANGEE =
    'md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 scrollbar-hide';

export const MobileSubTabs: React.FC<MobileSubTabsProps> = ({
    space, currentTab, currentSettingsSection, onNavigate, onNavigateSettings, counts,
    currentCorpusSection = 'etat', currentCorpusBloc = null, onNavigateCorpus,
}) => {
    const tabCount = (id: SocialTab): number => {
        if (id === 'ideas')    return counts.ideas;
        if (id === 'drafts')   return counts.drafts;
        if (id === 'ready')    return counts.ready;
        if (id === 'series')   return counts.series;
        if (id === 'calendar') return counts.calendar;
        if (id === 'archive')  return counts.archive;
        return 0;
    };

    const CLASSE_ONGLET = (active: boolean) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
            active
                ? 'bg-brand-main text-white shadow-sm shadow-brand-main/25 dark:bg-white dark:text-brand-main'
                : 'text-brand-main/70 dark:text-dark-text/70 hover:bg-brand-light dark:hover:bg-dark-sec-bg'
        }`;

    /*
        Sur téléphone, les trois niveaux du Corpus s'empilent en rangées plutôt
        qu'en colonnes : sections, puis blocs quand on lit des documents. La
        seconde rangée n'apparaît que là où elle a un sens, comme le troisième
        panneau sur grand écran.
    */
    if (space === 'corpus') {
        return (
            <>
                <div className={RANGEE} style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                    {CORPUS_SECTIONS.map(s => {
                        const Icon = s.icon;
                        return (
                            <button
                                key={s.id}
                                onClick={() => onNavigateCorpus?.(s.id)}
                                className={CLASSE_ONGLET(currentCorpusSection === s.id)}
                            >
                                <Icon className="w-3 h-3" />
                                {s.label}
                            </button>
                        );
                    })}
                </div>
                {currentCorpusSection === 'documents' && (
                    <div className={`${RANGEE} bg-brand-light/60 dark:bg-dark-bg`} style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                        {BLOCS.map(b => {
                            const Icon = b.icon;
                            return (
                                <button
                                    key={b.id}
                                    onClick={() => onNavigateCorpus?.('documents', b.id)}
                                    className={CLASSE_ONGLET(currentCorpusBloc === b.id)}
                                >
                                    <Icon className="w-3 h-3" />
                                    {b.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </>
        );
    }

    if (space === 'settings') {
        return (
            <div
                className="md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 scrollbar-hide"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
                {SETTINGS_SECTIONS.map(s => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.id}
                            onClick={() => onNavigateSettings(s.id)}
                            className={CLASSE_ONGLET(currentSettingsSection === s.id)}
                        >
                            <Icon className="w-3 h-3" />
                            {s.label}
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div
            className="md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 scrollbar-hide"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
            {TABS.map(t => {
                const active = currentTab === t.id;
                const Icon = t.icon;
                const count = tabCount(t.id);
                return (
                    <button
                        key={t.id}
                        onClick={() => onNavigate(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                            active
                                ? 'bg-brand-main text-white shadow-sm shadow-brand-main/25 dark:bg-white dark:text-brand-main'
                                : 'text-brand-main/70 dark:text-dark-text/70 hover:bg-brand-light dark:hover:bg-dark-sec-bg'
                        }`}
                    >
                        <Icon className="w-3 h-3" />
                        {t.label}
                        {count > 0 && (
                            <span className={`text-[10px] font-bold px-1 rounded-full leading-none ${
                                active ? 'bg-white/25 text-white dark:bg-brand-main/15 dark:text-brand-main' : 'bg-brand-light text-brand-main/50 dark:bg-dark-bg dark:text-dark-text/50'
                            }`}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default MobileSubTabs;
