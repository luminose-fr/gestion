import React from 'react';
import { MessageSquare, LayoutTemplate, RefreshCw, Sparkles, Loader2, Save, Send, Trash2, CheckCircle2, FileText, Brain, Lightbulb, ChevronRight } from 'lucide-react';
import { ContentItem, ContentStatus } from '../../types';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';

interface DraftViewProps {
    item: ContentItem;
    onChange: (item: ContentItem) => void;
    
    // AI Handlers
    onLaunchInterview: () => void;
    onLaunchDrafting: () => void;
    onChangeStatus: (status: ContentStatus) => Promise<void>;

    isGenerating: boolean;

    // View State
    activeTab: 'idea' | 'interview' | 'content';
    onTabChange: (tab: 'idea' | 'interview' | 'content') => void;
}

export const DraftView: React.FC<DraftViewProps> = ({
    item, onChange,
    onLaunchInterview, onLaunchDrafting, onChangeStatus, isGenerating,
    activeTab, onTabChange
}) => {
    
    const renderReadOnlyText = (text: string) => {
        if (!text) return null;
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-purple-900 dark:text-purple-100">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const steps = [
        { id: 'idea', label: '1. Idée de départ', icon: Lightbulb },
        { id: 'interview', label: '2. Interview', icon: MessageSquare },
        { id: 'content', label: '3. Rédaction', icon: LayoutTemplate },
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg flex flex-col h-full relative scroll-smooth">
            
            {/* Sticky Tabs Header */}
            <div className="sticky top-0 z-10 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur border-b border-brand-border dark:border-dark-sec-border px-6 md:px-10 flex-shrink-0 transition-colors">
                <div className="max-w-6xl mx-auto w-full flex gap-8 overflow-x-auto scrollbar-hide">
                    {steps.map((step) => {
                        const isActive = activeTab === step.id;
                        const Icon = step.icon;
                        return (
                            <button
                                key={step.id}
                                onClick={() => onTabChange(step.id as any)}
                                className={`
                                    flex items-center gap-2 pb-3 pt-5 text-sm font-bold border-b-2 transition-all whitespace-nowrap
                                    ${isActive 
                                        ? 'border-brand-main text-brand-main dark:text-white dark:border-white' 
                                        : 'border-transparent text-brand-main/40 dark:text-dark-text/40 hover:text-brand-main/70 hover:bg-transparent'}
                                `}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'fill-current' : ''}`} />
                                <span>{step.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8 flex-1 flex flex-col">
                
                {/* === TAB 1: IDÉE DE DÉPART === */}
                {activeTab === 'idea' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                            {/* Notes Editor */}
                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-main transition-shadow flex flex-col h-full min-h-[300px]">
                                <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <FileText className="w-3 h-3"/> Notes Originales
                                    </p>
                                </div>
                                <RichTextarea 
                                    value={item.notes}
                                    onChange={(val) => onChange({...item, notes: val})}
                                    className="w-full flex-1 p-4 text-sm"
                                    placeholder="Vos notes brutes..."
                                />
                            </div>

                            {/* Strategy Read-Only */}
                            <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/50 p-4 shadow-sm flex flex-col h-full min-h-[300px]">
                                <h3 className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase mb-3 flex items-center gap-2"><Brain className="w-4 h-4"/> Rappel Stratégique</h3>
                                <div className="flex-1 text-sm text-purple-900 dark:text-purple-100/80 leading-relaxed overflow-y-auto custom-scrollbar">
                                    {item.strategicAngle ? (
                                        <>
                                            <div className="whitespace-pre-wrap">{renderReadOnlyText(item.strategicAngle)}</div>
                                            {item.platforms.length > 0 && (
                                                <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800/50">
                                                    <div className="flex gap-2 flex-wrap">
                                                        {item.platforms.map(p => <span key={p} className="px-2 py-0.5 bg-white dark:bg-purple-800/50 rounded text-xs border border-purple-200 dark:border-purple-800">{p}</span>)}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                                            <Brain className="w-8 h-8 mb-2" />
                                            <p>Aucune analyse disponible.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* === TAB 2: INTERVIEW === */}
                {activeTab === 'interview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10 flex-1 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                            
                            {/* LEFT COL: Questions (Read Only) */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/50 p-4 shadow-sm flex flex-col h-full min-h-[400px]">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4"/> Questions de l'IA
                                    </h3>
                                    {item.interviewQuestions && (
                                        <button 
                                            onClick={onLaunchInterview}
                                            disabled={isGenerating}
                                            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-white dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 transition-colors border border-blue-200 dark:border-blue-800 disabled:opacity-50"
                                            title="Relancer l'interview"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                                            {isGenerating ? '...' : 'Relancer'}
                                        </button>
                                    )}
                                </div>
                                
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {!item.interviewQuestions ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center">
                                            <p className="text-blue-900/60 dark:text-blue-100/60 text-sm mb-6 max-w-xs leading-relaxed">
                                                L'IA joue le rôle de journaliste pour extraire le meilleur de votre expertise.
                                            </p>
                                            <button 
                                                onClick={onLaunchInterview}
                                                disabled={isGenerating}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                            >
                                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                Lancer l'interview
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-blue-900 dark:text-blue-100 whitespace-pre-wrap leading-relaxed">
                                            {renderReadOnlyText(item.interviewQuestions)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT COL: Answers (Editable) */}
                            <div className="flex flex-col h-full min-h-[400px]">
                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-pink-500 transition-shadow flex flex-col flex-1 max-h-[500px]">
                                    <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border">
                                        <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                            <FileText className="w-3 h-3"/> Vos Réponses
                                        </p>
                                    </div>
                                    <div className="bg-brand-light/30 dark:bg-dark-bg/30 p-2 border-b border-brand-border dark:border-dark-sec-border">
                                        <MarkdownToolbar />
                                    </div>
                                    <RichTextarea 
                                        value={item.interviewAnswers || ""} 
                                        onChange={(val) => onChange({...item, interviewAnswers: val})} 
                                        className="w-full flex-1 p-4 text-sm"
                                        placeholder="Répondez point par point aux questions pour guider la rédaction..."
                                    />
                                </div>
                                
                                {/* ACTION BUTTON */}
                                <div className="flex justify-end pt-4">
                                    <button 
                                        onClick={onLaunchDrafting}
                                        disabled={isGenerating || !item.interviewAnswers}
                                        className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold shadow-lg shadow-pink-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 w-full md:w-auto justify-center"
                                    >
                                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        Envoyer à l'IA pour rédaction
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* === TAB 3: CONTENU === */}
                {activeTab === 'content' && (
                    <div className="flex flex-col flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-pink-500/20 overflow-hidden flex flex-col flex-1 h-full min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                                <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Éditeur Final</p>
                                <button 
                                    onClick={onLaunchDrafting}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-white dark:bg-pink-900/30 hover:bg-pink-50 dark:hover:bg-pink-900/50 text-pink-700 dark:text-pink-300 transition-colors border border-pink-200 dark:border-pink-800 shadow-sm disabled:opacity-50"
                                    title="Régénérer le brouillon avec l'IA"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                                    {isGenerating ? '...' : 'Régénérer IA'}
                                </button>
                            </div>
                            <div className="flex-1 flex flex-col">
                                <MarkdownToolbar />
                                <RichTextarea 
                                    value={item.body || ""}
                                    onChange={(val) => onChange({...item, body: val})}
                                    className="w-full flex-1 p-6 text-lg leading-relaxed"
                                    placeholder="Le contenu généré apparaîtra ici..."
                                />
                            </div>
                        </div>

                        {/* ACTION BUTTON */}
                        <div className="flex justify-end pt-6">
                            <button 
                                onClick={() => onChangeStatus(ContentStatus.READY)}
                                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5"
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Valider le post
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};