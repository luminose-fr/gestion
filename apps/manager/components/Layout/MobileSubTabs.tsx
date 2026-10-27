import React from 'react';
import { SETTINGS_SECTIONS, SettingsSection } from '../Settings/sections';
import { PERSONAS_NAV } from '../Settings/apercus';
import { CORPUS_SECTIONS, BLOCS, CorpusSection } from '../Corpus/sections';
import { LISTES, type ListeContenus } from '../Contenus/listes';

interface MobileSubTabsProps {
    /** L'espace décide de ce que la barre montre : contenus, réglages ou corpus. */
    space: 'social' | 'settings' | 'corpus';
    currentTab: ListeContenus;
    currentSettingsSection: SettingsSection;
    /** Le rôle ouvert sous Personas — la seconde rangée de Réglages. */
    currentSettingsPersona?: string | null;
    onNavigate: (tab: ListeContenus) => void;
    onNavigateSettings: (section: SettingsSection, persona?: string | null) => void;
    currentCorpusSection?: CorpusSection;
    currentCorpusBloc?: string | null;
    onNavigateCorpus?: (section: CorpusSection, bloc?: string | null) => void;
    counts: Record<ListeContenus, number>;
}

const RANGEE =
    'md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 scrollbar-hide';

export const MobileSubTabs: React.FC<MobileSubTabsProps> = ({
    space, currentTab, currentSettingsSection, currentSettingsPersona = null,
    onNavigate, onNavigateSettings, counts,
    currentCorpusSection = 'etat', currentCorpusBloc = null, onNavigateCorpus,
}) => {

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

    /*
        Réglages a maintenant lui aussi un troisième niveau : les rôles, sous
        Personas. Même traitement que les blocs du Corpus — une seconde rangée
        là où l'écran large a une troisième colonne.
    */
    if (space === 'settings') {
        return (
            <>
                <div className={RANGEE} style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
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
                {currentSettingsSection === 'personas' && (
                    <div className={`${RANGEE} bg-brand-light/60 dark:bg-dark-bg`} style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                        {PERSONAS_NAV.map(p => {
                            const Icon = p.icon;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => onNavigateSettings('personas', p.id)}
                                    className={CLASSE_ONGLET(currentSettingsPersona === p.id)}
                                >
                                    <Icon className="w-3 h-3" />
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </>
        );
    }

    return (
        <div
            className="md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 scrollbar-hide"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
            {LISTES.map(t => {
                const active = currentTab === t.id;
                const Icon = t.icon;
                const count = counts[t.id];
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
