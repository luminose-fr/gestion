import React, { useState } from 'react';
import { MessageSquare, LayoutTemplate, RefreshCw, Sparkles, Loader2, Save, Send, Trash2, CheckCircle2, FileText, Brain, Lightbulb, ChevronRight, Images, Pencil, X } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat, Profondeur } from '../../types';
import { bodyJsonToText } from './index';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';

interface DraftViewProps {
    item: ContentItem;
    onChange: (item: ContentItem) => void;
    
    // AI Handlers
    onLaunchInterview: () => void;
    onLaunchDrafting: () => void;
    onLaunchCarrouselSlides: () => void;
    onChangeStatus: (status: ContentStatus) => Promise<void>;

    isGenerating: boolean;

    // View State
    activeTab: 'idea' | 'interview' | 'content' | 'slides';
    onTabChange: (tab: 'idea' | 'interview' | 'content' | 'slides') => void;
}

export const DraftView: React.FC<DraftViewProps> = ({
    item, onChange,
    onLaunchInterview, onLaunchDrafting, onLaunchCarrouselSlides, onChangeStatus, isGenerating,
    activeTab, onTabChange
}) => {
    
    const [isEditingBody, setIsEditingBody] = useState(false);
    const [editBodyText, setEditBodyText] = useState("");

    const parseBodyJson = (raw: string): any | null => {
        if (!raw) return null;
        try {
            const lastBrace = raw.lastIndexOf('}');
            const cleaned = lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw;
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    };

    const startEditBody = (body: string) => {
        setEditBodyText(bodyJsonToText(body));
        setIsEditingBody(true);
    };

    const saveEditBody = () => {
        const data = parseBodyJson(item.body || "");
        let newBody: string;
        if (data && data.format) {
            // Reconstruit un JSON minimal avec le texte édité dans edited_raw
            newBody = JSON.stringify({ ...data, edited_raw: editBodyText });
        } else {
            newBody = editBodyText;
        }
        onChange({ ...item, body: newBody });
        setIsEditingBody(false);
    };

    const renderBodyStructured = (body: string) => {
        const data = parseBodyJson(body);

        // Pas de JSON valide ou ancien contenu texte
        if (!data || !data.format) {
            return (
                <div className="p-6 whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                    {data?.edited_raw || body}
                </div>
            );
        }

        // Édition manuelle précédente
        if (data.edited_raw) {
            return (
                <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                        <Pencil className="w-3 h-3" /> Contenu édité manuellement
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                        {data.edited_raw}
                    </div>
                </div>
            );
        }

        const t = (v: any) => typeof v === 'string' ? v.trim() : "";
        const Block = ({ label, color, children }: { label: string; color: string; children: React.ReactNode }) => (
            <div className={`rounded-lg border-l-4 ${color} bg-brand-light dark:bg-dark-bg p-4`}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60">{label}</p>
                <div className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{children}</div>
            </div>
        );

        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        const isArticle = fmt === TargetFormat.ARTICLE_LONG_SEO || fmt === "Article";
        const isReelShort = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || fmt === "Script Reel";
        const isYoutube = fmt === TargetFormat.SCRIPT_VIDEO_YOUTUBE || fmt === "Script Youtube";
        const isCarrousel = fmt === TargetFormat.CARROUSEL_SLIDE || fmt === "Carrousel";
        const isPromptImage = fmt === TargetFormat.PROMPT_IMAGE || fmt === "Prompt Image";

        if (isPostTexte) return (
            <div className="p-6 space-y-4">
                {data.hook && <Block label="Hook" color="border-pink-400">{t(data.hook)}</Block>}
                {data.corps && <Block label="Corps" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
                {data.baffe && <Block label="Baffe" color="border-purple-400">{t(data.baffe)}</Block>}
                {data.cta && <Block label="CTA" color="border-green-400">{t(data.cta)}</Block>}
            </div>
        );
        if (isArticle) return (
            <div className="p-6 space-y-4">
                {data.titre_h1 && <h2 className="text-xl font-bold text-brand-main dark:text-white">{t(data.titre_h1)}</h2>}
                {data.introduction && <Block label="Introduction" color="border-blue-400">{t(data.introduction)}</Block>}
                {(data.sections || []).map((s: any, i: number) => (
                    <div key={i} className="space-y-2">
                        {s.sous_titre_h2 && <h3 className="text-base font-bold text-brand-main dark:text-white">{t(s.sous_titre_h2)}</h3>}
                        {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{t(s.contenu)}</p>}
                    </div>
                ))}
                {data.conclusion && <Block label="Conclusion" color="border-purple-400">{t(data.conclusion)}</Block>}
                {data.cta && <Block label="CTA" color="border-green-400">{t(data.cta)}</Block>}
            </div>
        );
        if (isReelShort) return (
            <div className="p-6 space-y-4">
                {data.contrainte && <p className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase">{t(data.contrainte)}</p>}
                {data.hook && <Block label="Hook [0–3s]" color="border-pink-400">{t(data.hook)}</Block>}
                {data.corps && <Block label="Corps [3–50s]" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
                {data.cta && <Block label="CTA [50–60s]" color="border-green-400">{t(data.cta)}</Block>}
            </div>
        );
        if (isYoutube) return (
            <div className="p-6 space-y-4">
                {data.intro && <Block label="Intro" color="border-pink-400">{t(data.intro)}</Block>}
                {(data.developpement || []).map((s: any, i: number) => (
                    <div key={i} className="space-y-2">
                        {s.point && <h3 className="text-sm font-bold text-brand-main dark:text-white">{t(s.point)}</h3>}
                        {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{t(s.contenu)}</p>}
                    </div>
                ))}
                {data.conclusion && <Block label="Conclusion" color="border-purple-400">{t(data.conclusion)}</Block>}
            </div>
        );
        if (isCarrousel) return (
            <div className="p-6 space-y-3">
                {(data.slides || []).map((s: any, i: number) => (
                    <div key={i} className="bg-brand-light dark:bg-dark-bg rounded-lg p-3 border border-brand-border dark:border-dark-sec-border">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">{s.numero ?? i + 1}</span>
                            {s.titre && <span className="text-sm font-bold text-brand-main dark:text-white">{t(s.titre)}</span>}
                        </div>
                        {s.texte && <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{t(s.texte)}</p>}
                    </div>
                ))}
                {data.slide_finale && (
                    <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 border border-green-200 dark:border-green-800">
                        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase mb-1">Slide finale</p>
                        {data.slide_finale.titre && <p className="text-sm font-bold text-brand-main dark:text-white">{t(data.slide_finale.titre)}</p>}
                        {data.slide_finale.texte && <p className="text-sm text-brand-main dark:text-dark-text">{t(data.slide_finale.texte)}</p>}
                    </div>
                )}
            </div>
        );
        if (isPromptImage) return (
            <div className="p-6 space-y-4">
                {data.prompt && <Block label="Prompt (EN)" color="border-amber-400">{t(data.prompt)}</Block>}
                {data.legende && <Block label="Légende" color="border-blue-400">{t(data.legende)}</Block>}
            </div>
        );
        return <div className="p-6 text-sm text-brand-main dark:text-dark-text whitespace-pre-wrap">{body}</div>;
    };

    const parseSlidesJson = (raw: string): { direction_globale: any; slides: any[] } | null => {
        try {
            // Retire la signature éventuelle après le dernier }
            const lastBrace = raw.lastIndexOf('}');
            const cleaned = lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw;
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    };

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

    const isDirect = item.depth === Profondeur.DIRECT;

    const steps = [
        { id: 'idea', label: '1. Idée de départ', icon: Lightbulb, disabled: false },
        { id: 'interview', label: '2. Interview', icon: MessageSquare, disabled: isDirect },
        { id: 'content', label: '3. Rédaction', icon: LayoutTemplate, disabled: false },
        ...(item.targetFormat === TargetFormat.CARROUSEL_SLIDE
            ? [{ id: 'slides', label: '4. Slides', icon: Images, disabled: false }]
            : []),
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg flex flex-col h-full relative scroll-smooth">
            
            {/* Sticky Tabs Header */}
            <div className="sticky top-0 z-10 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur border-b border-brand-border dark:border-dark-sec-border px-6 md:px-10 flex-shrink-0 transition-colors">
                <div className="max-w-6xl mx-auto w-full flex gap-8 overflow-x-auto scrollbar-hide">
                    {steps.map((step) => {
                        const isActive = activeTab === step.id;
                        const isDisabled = step.disabled;
                        const Icon = step.icon;
                        return (
                            <button
                                key={step.id}
                                onClick={() => !isDisabled && onTabChange(step.id as any)}
                                disabled={isDisabled}
                                title={isDisabled ? "Non applicable (profondeur Direct)" : undefined}
                                className={`
                                    flex items-center gap-2 pb-3 pt-5 text-sm font-bold border-b-2 transition-all whitespace-nowrap
                                    ${isDisabled
                                        ? 'border-transparent text-brand-main/20 dark:text-dark-text/20 cursor-not-allowed line-through'
                                        : isActive
                                            ? 'border-brand-main text-brand-main dark:text-white dark:border-white'
                                            : 'border-transparent text-brand-main/40 dark:text-dark-text/40 hover:text-brand-main/70 hover:bg-transparent'}
                                `}
                            >
                                <Icon className={`w-4 h-4 ${isActive && !isDisabled ? 'fill-current' : ''}`} />
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

                {/* === TAB 4: SLIDES === */}
                {activeTab === 'slides' && (
                    <div className="flex flex-col flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-violet-500/20 overflow-hidden flex flex-col flex-1 h-full min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Images className="w-3 h-3" /> Direction Artistique Slides
                                    </p>
                                </div>
                                <button
                                    onClick={onLaunchCarrouselSlides}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-white dark:bg-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 transition-colors border border-violet-200 dark:border-violet-800 shadow-sm disabled:opacity-50"
                                    title="Régénérer les slides"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                                    {isGenerating ? '...' : 'Régénérer'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {!item.slides ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                        <Images className="w-10 h-10 text-violet-300 dark:text-violet-600" />
                                        <p className="text-sm text-brand-main/50 dark:text-dark-text/50 max-w-xs leading-relaxed">
                                            Génère la direction artistique et les prompts Dzine pour chaque slide de ton carrousel.
                                        </p>
                                        <button
                                            onClick={onLaunchCarrouselSlides}
                                            disabled={isGenerating}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                        >
                                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Générer les slides
                                        </button>
                                    </div>
                                ) : (() => {
                                    const parsed = parseSlidesJson(item.slides!);
                                    if (!parsed) return (
                                        <pre className="p-6 text-sm font-mono text-brand-main dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                                            {item.slides}
                                        </pre>
                                    );
                                    const { direction_globale: dg, slides: slideList } = parsed;
                                    return (
                                        <div className="p-6 space-y-8">
                                            {/* Direction globale */}
                                            {dg && (
                                                <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800/50 p-5">
                                                    <h3 className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                        <Images className="w-3.5 h-3.5" /> Direction globale
                                                    </h3>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {[
                                                            { label: 'Style', value: dg.style },
                                                            { label: 'Palette', value: dg.palette },
                                                            { label: 'Éclairage', value: dg.eclairage },
                                                            { label: 'Ambiance', value: dg.ambiance },
                                                        ].map(({ label, value }) => value && (
                                                            <div key={label} className="bg-white dark:bg-dark-surface rounded-lg p-3 border border-violet-100 dark:border-violet-900/40">
                                                                <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase mb-1">{label}</p>
                                                                <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Slides */}
                                            <div className="space-y-4">
                                                {Array.isArray(slideList) && slideList.map((slide: any) => (
                                                    <div key={slide.numero} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                                        {/* Header slide */}
                                                        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                                                            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                                {slide.numero}
                                                            </span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${slide.type === 'ILLUSTRÉE' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                                                                {slide.type}
                                                            </span>
                                                            {slide.titre && (
                                                                <span className="text-sm font-bold text-brand-main dark:text-white truncate">
                                                                    {slide.titre}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Body slide */}
                                                        <div className="p-4 space-y-3">
                                                            {/* Contenu éditorial */}
                                                            {slide.texte && (
                                                                <div className="bg-brand-light dark:bg-dark-bg rounded-lg p-3 border-l-4 border-violet-400">
                                                                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-1">Texte slide</p>
                                                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{slide.texte}</p>
                                                                </div>
                                                            )}
                                                            {/* Direction artistique */}
                                                            {slide.prompt_dzine && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">Prompt Dzine</p>
                                                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed italic">{slide.prompt_dzine}</p>
                                                                </div>
                                                            )}
                                                            {slide.indication_typo && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Indication Typo</p>
                                                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{slide.indication_typo}</p>
                                                                </div>
                                                            )}
                                                            {slide.note_composition && (
                                                                <div className="border-t border-brand-border dark:border-dark-sec-border pt-3">
                                                                    <p className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase mb-1">Composition</p>
                                                                    <p className="text-sm text-brand-main/70 dark:text-dark-text/70 leading-relaxed">{slide.note_composition}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* === TAB 3: CONTENU === */}
                {activeTab === 'content' && (
                    <div className="flex flex-col flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-pink-500/20 overflow-hidden flex flex-col flex-1 h-full min-h-[500px]">
                            {/* Header */}
                            <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Contenu rédigé</p>
                                    {item.targetFormat && (
                                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                                            {item.targetFormat}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditingBody && item.body && (
                                        <button
                                            onClick={() => startEditBody(item.body)}
                                            className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main/60 dark:text-dark-text/60 transition-colors border border-brand-border dark:border-dark-sec-border shadow-sm"
                                        >
                                            <Pencil className="w-3 h-3" /> Modifier
                                        </button>
                                    )}
                                    {isEditingBody && (
                                        <>
                                            <button
                                                onClick={() => setIsEditingBody(false)}
                                                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-white dark:bg-dark-surface hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors border border-red-200 dark:border-red-800 shadow-sm"
                                            >
                                                <X className="w-3 h-3" /> Annuler
                                            </button>
                                            <button
                                                onClick={saveEditBody}
                                                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm"
                                            >
                                                <Save className="w-3 h-3" /> Enregistrer
                                            </button>
                                        </>
                                    )}
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
                            </div>

                            {/* Body */}
                            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                {isEditingBody ? (
                                    <textarea
                                        value={editBodyText}
                                        onChange={(e) => setEditBodyText(e.target.value)}
                                        className="flex-1 w-full p-6 text-sm leading-relaxed bg-white dark:bg-dark-surface text-brand-main dark:text-dark-text outline-none resize-none font-mono"
                                        placeholder="Éditez le contenu..."
                                    />
                                ) : item.body ? (
                                    renderBodyStructured(item.body)
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8 opacity-50">
                                        <LayoutTemplate className="w-8 h-8" />
                                        <p className="text-sm">Le contenu généré apparaîtra ici.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ACTION BUTTONS */}
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