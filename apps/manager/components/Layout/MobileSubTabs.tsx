import React from 'react';
import { Lightbulb, PenLine, CheckCircle2, Calendar as CalendarIcon, Archive } from 'lucide-react';

type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

interface MobileSubTabsProps {
    currentTab: SocialTab;
    onNavigate: (tab: SocialTab) => void;
    counts: {
        ideas: number;
        drafts: number;
        ready: number;
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
    { id: 'calendar', icon: CalendarIcon, label: 'Calendrier' },
    { id: 'archive',  icon: Archive,      label: 'Archives'   },
];

export const MobileSubTabs: React.FC<MobileSubTabsProps> = ({ currentTab, onNavigate, counts }) => {
    const tabCount = (id: SocialTab): number => {
        if (id === 'ideas')    return counts.ideas;
        if (id === 'drafts')   return counts.drafts;
        if (id === 'ready')    return counts.ready;
        if (id === 'calendar') return counts.calendar;
        if (id === 'archive')  return counts.archive;
        return 0;
    };

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
