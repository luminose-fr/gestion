import React from 'react';
import { Lightbulb, Calendar as CalendarIcon, Archive, Users, Settings, Briefcase, CheckCircle2, PenLine, X, Video, Subtitles, Sparkles, Calculator } from 'lucide-react';

type SpaceView = 'social' | 'clients' | 'videos' | 'psychedelics';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

interface SidebarProps {
    currentSpace: SpaceView;
    currentSocialTab: SocialTab;
    onNavigate: (space: SpaceView, tab: SocialTab) => void;
    counts: {
        ideas: number;
        drafts: number;
        ready: number;
        calendar: number;
        archive: number;
    };
    isMobileOpen: boolean;
    onMobileClose: () => void;
    onOpenSettings: () => void;
}

const SidebarItem = ({ active, onClick, icon: Icon, label, count }: { active: boolean, onClick: () => void, icon: any, label: string, count?: number }) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group
            ${active 
                ? 'bg-brand-main text-white shadow-md dark:bg-white dark:text-brand-main' 
                : 'text-brand-main/70 hover:bg-brand-light hover:text-brand-main dark:text-dark-text/70 dark:hover:bg-dark-sec-bg dark:hover:text-white'}
        `}
    >
        <div className="flex items-center gap-3">
            <Icon className={`w-4 h-4 ${active ? 'text-white dark:text-brand-main' : 'text-brand-main/50 group-hover:text-brand-main dark:text-dark-text/50 dark:group-hover:text-white'}`} />
            <span>{label}</span>
        </div>
        {count !== undefined && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white dark:bg-brand-main/10 dark:text-brand-main' : 'bg-brand-light text-brand-main/50 dark:bg-dark-bg dark:text-dark-text/50'}`}>
                {count}
            </span>
        )}
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ 
    currentSpace, currentSocialTab, onNavigate, counts, 
    isMobileOpen, onMobileClose, onOpenSettings 
}) => {
    const mobileSpaceBtn = (space: SpaceView, icon: any, label: string, tab: SocialTab = 'ideas') => {
        const isActive = currentSpace === space;
        const Icon = icon;
        return (
            <button
                onClick={() => { onNavigate(space, tab); onMobileClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    isActive
                        ? 'bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-white'
                        : 'text-brand-main/70 dark:text-dark-text/70'
                }`}
            >
                <Icon className="w-5 h-5" /> {label}
            </button>
        );
    };

    const renderMobileSpaces = () => (
        <div className="md:hidden pt-4 mt-4 border-t border-brand-light dark:border-dark-sec-border">
            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3">Espaces</div>
            {mobileSpaceBtn('social', Briefcase, 'Contenus', currentSocialTab)}
            {mobileSpaceBtn('clients', Users, 'Clients')}
            {mobileSpaceBtn('videos', Video, 'Vidéos')}
            {mobileSpaceBtn('psychedelics', Sparkles, 'Psychédéliques')}
        </div>
    );

    return (
        <>
            {isMobileOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs"
                    onClick={onMobileClose}
                />
            )}

            <aside className={`
                fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-dark-surface border-r border-brand-border dark:border-dark-sec-border flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static
                ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="md:hidden flex items-center justify-between p-4 border-b border-brand-border dark:border-dark-sec-border">
                    <span className="font-bold text-brand-main dark:text-white">Menu</span>
                    <button onClick={onMobileClose}>
                        <X className="w-5 h-5 text-brand-main dark:text-white" />
                    </button>
                </div>

                {currentSpace === 'social' ? (
                    <>
                        <div className="p-4 flex-1 overflow-y-auto space-y-1">
                             <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Navigation</div>
                             
                             <SidebarItem 
                                active={currentSocialTab === 'ideas'} 
                                onClick={() => onNavigate('social', 'ideas')} 
                                icon={Lightbulb} 
                                label="Boîte à Idées"
                                count={counts.ideas}
                             />

                             <SidebarItem 
                                active={currentSocialTab === 'drafts'} 
                                onClick={() => onNavigate('social', 'drafts')} 
                                icon={PenLine} 
                                label="En cours"
                                count={counts.drafts}
                             />
                             
                             <SidebarItem 
                                active={currentSocialTab === 'ready'} 
                                onClick={() => onNavigate('social', 'ready')} 
                                icon={CheckCircle2} 
                                label="Prêt à publier"
                                count={counts.ready}
                             />

                             <div className="my-3 border-t border-brand-light dark:border-dark-sec-border mx-2"></div>

                             <SidebarItem 
                                active={currentSocialTab === 'calendar'} 
                                onClick={() => onNavigate('social', 'calendar')} 
                                icon={CalendarIcon} 
                                label="Calendrier"
                                count={counts.calendar}
                             />

                             <SidebarItem 
                                active={currentSocialTab === 'archive'} 
                                onClick={() => onNavigate('social', 'archive')} 
                                icon={Archive} 
                                label="Archives"
                                count={counts.archive}
                             />
                             
                             {renderMobileSpaces()}
                        </div>

                        <div className="p-4 border-t border-brand-border dark:border-dark-sec-border">
                            <button
                                onClick={() => { onOpenSettings(); onMobileClose(); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-lg transition-colors group"
                            >
                                <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                                <span>Paramètres IA</span>
                            </button>
                        </div>
                    </>
                ) : currentSpace === 'clients' ? (
                    <>
                        <div className="p-4 flex-1 overflow-y-auto space-y-1">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Menu Clients</div>
                            <div className="px-3 py-2 text-sm text-brand-main/50 dark:text-dark-text/50 italic">
                                Modules à venir...
                            </div>
                            {renderMobileSpaces()}
                        </div>
                    </>
                ) : currentSpace === 'psychedelics' ? (
                    <>
                        <div className="p-4 flex-1 overflow-y-auto space-y-1">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Outils</div>
                            <SidebarItem
                                active={true}
                                onClick={() => {}}
                                icon={Calculator}
                                label="Calculateur"
                            />
                            {renderMobileSpaces()}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-4 flex-1 overflow-y-auto space-y-1">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Outils</div>
                            <SidebarItem
                                active={true}
                                onClick={() => {}}
                                icon={Subtitles}
                                label="Sous-titres"
                            />
                            {renderMobileSpaces()}
                        </div>
                    </>
                )}
            </aside>
        </>
    );
};
