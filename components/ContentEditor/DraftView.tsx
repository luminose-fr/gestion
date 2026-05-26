import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, LayoutTemplate, RefreshCw, Sparkles, Loader2, Save, CheckCircle2, FileText, Brain, Lightbulb, Images, Pencil, X, Copy, Check, Target, Zap, Quote, Video, Send, ChevronDown, ArrowRight } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat, Profondeur, CoachSession, AIModel } from '../../types';
import { bodyJsonToText } from '../../ai/formats';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';
import { CoachChat } from '../CoachChat';
import { BodyRenderer } from './renderers/BodyRenderer';
import { ScriptVideoRenderer } from './renderers/ScriptVideoRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { parseBodyJson, renderMdText, DEPTH_COLORS, buildPostCourtText, copyTextToClipboard, getPostCourtDzinePrompt, getPostCourtSuggestedVisual } from './renderers/shared';

interface DraftViewProps {
    item: ContentItem;
    onChange: (item: ContentItem) => void;

    // AI Handlers
    onLaunchDrafting: () => void;
    onLaunchCarrouselSlides: () => void;
    onLaunchAdjustment: (adjustmentText: string) => void;
    onLaunchPromptsAdjustment: (instruction: string, slideNumero: number | null) => void;
    onChangeStatus: (status: ContentStatus, scheduledDate?: string) => Promise<void>;
    onSave: (item: ContentItem) => Promise<void>;

    isGenerating: boolean;

    // Coach session (inline)
    aiModels: AIModel[];
    activeModelId: string;
    onCoachSessionChange: (session: CoachSession) => void | Promise<void>;
    onCoachValidate: (session: CoachSession) => void | Promise<void>;

    // View State
    activeTab: 'idea' | 'atelier' | 'slides' | 'postcourt' | 'script';
    onTabChange: (tab: 'idea' | 'atelier' | 'slides' | 'postcourt' | 'script') => void;
}

export const DraftView: React.FC<DraftViewProps> = ({
    item, onChange,
    onLaunchDrafting, onLaunchCarrouselSlides, onLaunchAdjustment, onLaunchPromptsAdjustment, onChangeStatus, onSave, isGenerating,
    aiModels, activeModelId, onCoachSessionChange, onCoachValidate,
    activeTab, onTabChange
}) => {

    const [isEditingBody, setIsEditingBody] = useState(false);
    const [editBodyText, setEditBodyText] = useState("");
    const [copied, setCopied] = useState(false);
    const [copiedDzine, setCopiedDzine] = useState(false);
    const postCourtSavedRef = useRef<string | null>(null);
    const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
    const [adjustmentText, setAdjustmentText] = useState("");
    const contentRef = useRef<HTMLDivElement>(null);

    const isDirect = item.depth === Profondeur.DIRECT;
    const isVideoFormat = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
        || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
    const hasContent = isVideoFormat ? !!item.scriptVideo : !!item.body;
    const hasInterviewAnswers = !!item.interviewAnswers?.trim();

    // ── Session Coach (nouveau flow) ──
    const coachSession = item.coachSession || null;
    const coachMessagesCount = coachSession?.messages?.filter(m => m.role === 'user' || m.role === 'assistant').length || 0;
    const hasCoachSession = coachMessagesCount > 0;
    const coachSessionValidated = coachSession?.status === 'validated';
    const coachLastAssistant = coachSession?.messages
        ? [...coachSession.messages].reverse().find(m => m.role === 'assistant')
        : null;
    const coachState: 'empty' | 'in_progress' | 'validated' =
        coachSessionValidated ? 'validated'
        : hasCoachSession ? 'in_progress'
        : 'empty';

    // Pour l'étape "Générer le brouillon" : on a besoin soit du mode Direct,
    // soit d'une session Coach validée, soit (fallback) des vieilles réponses d'interview.
    const canLaunchDrafting = isDirect || coachSessionValidated || hasInterviewAnswers;

    // Scroll vers le brouillon après génération
    useEffect(() => {
        if (hasContent) {
            setTimeout(() => contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
        }
    }, [hasContent]);

    const startEditBody = (body: string) => {
        setEditBodyText(bodyJsonToText(body));
        setIsEditingBody(true);
    };

    const saveEditBody = () => {
        const data = parseBodyJson(item.body || "");
        let newBody: string;
        if (data && data.format) {
            newBody = JSON.stringify({ ...data, edited_raw: editBodyText });
        } else {
            newBody = editBodyText;
        }
        onChange({ ...item, body: newBody });
        setIsEditingBody(false);
    };

    // Génère et sauvegarde postCourt quand l'onglet Copie devient actif
    useEffect(() => {
        if (activeTab !== 'postcourt') return;
        if (item.targetFormat !== TargetFormat.POST_TEXTE_COURT) return;
        const generated = buildPostCourtText(item.body || "");
        if (!generated) return;
        if (postCourtSavedRef.current === generated) return;
        postCourtSavedRef.current = generated;
        const updated = { ...item, postCourt: generated };
        onChange(updated);
        onSave(updated);
    }, [activeTab, item.body]);

    // Les onglets sont calculés et rendus par EditorLayout/index.tsx — pas besoin ici.

    // ── Bouton secondaire réutilisable ──

    const SecBtn = ({ onClick, disabled, icon: Icon, label, color = 'default' }: {
        onClick: () => void; disabled?: boolean; icon: any; label: string; color?: 'default' | 'pink' | 'blue' | 'violet';
    }) => {
        const colors = {
            default: 'bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main/60 dark:text-dark-text/60 border-brand-border dark:border-dark-sec-border',
            pink:    'bg-white dark:bg-pink-900/30 hover:bg-pink-50 dark:hover:bg-pink-900/50 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
            blue:    'bg-white dark:bg-blue-900/30 hover:bg-blue-50 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
            violet:  'bg-white dark:bg-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
        };
        return (
            <button onClick={onClick} disabled={disabled}
                className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-sm border shadow-xs transition-colors disabled:opacity-50 ${colors[color]}`}
            >
                <Icon className={`w-3 h-3 ${disabled && label === '...' ? 'animate-spin' : ''}`} />
                {label}
            </button>
        );
    };

    const FinalTabHeader = () => (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Format :</span>
                {item.targetFormat ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                        {item.targetFormat}
                    </span>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Offre :</span>
                {item.targetOffer ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                        {item.targetOffer}
                    </span>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Plateformes :</span>
                {item.platforms.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                        {item.platforms.map((platform) => (
                            <span key={platform} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-dark-surface rounded-sm border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text">
                                {platform}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>
        </div>
    );

    // L'onglet Atelier prend toute la hauteur sans scroll de page : on l'extrait du conteneur paddé.
    if (activeTab === 'atelier') {
        return (
            <div className="flex-1 bg-brand-light dark:bg-dark-bg flex flex-col h-full min-h-0 relative">
                {!isDirect && (
                    <CoachChat
                        item={item}
                        aiModels={aiModels}
                        modelId={activeModelId}
                        onSessionChange={onCoachSessionChange}
                        onValidate={onCoachValidate}
                    />
                )}
                {isDirect && (
                    <div className="m-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/50 p-4 flex items-start gap-3 max-w-2xl">
                        <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase mb-1">
                                Mode direct activé
                            </p>
                            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/70 leading-relaxed">
                                Cette idée est marquée comme « Direct » : la session Coach n'est pas nécessaire. Naviguez vers les autres onglets pour rédiger directement.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg flex flex-col h-full relative scroll-smooth">
            {/* Onglets remontés dans EditorLayout (header desktop + sous-bandeau mobile). */}

            {/* ── Content Area ── */}
            <div className="p-6 md:p-10 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6">

                {/* ═══════════════════════════════════════
                    TAB : IDÉE — 1. Notes initiales, 2. Analyse IA
                ════════════════════════════════════════ */}
                {activeTab === 'idea' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">

                        {/* 1. Notes initiales */}
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-main transition-shadow flex flex-col min-h-[200px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border">
                                <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                    <FileText className="w-3 h-3" /> Notes initiales
                                </p>
                            </div>
                            <RichTextarea
                                value={item.notes}
                                onChange={(val) => onChange({ ...item, notes: val })}
                                className="w-full flex-1 p-4 text-sm"
                                placeholder="Tes notes brutes, idées, références..."
                            />
                        </div>

                        {/* 2. Analyse IA — badges + angle + métaphore + justification */}
                        {(item.analyzed || item.verdict || item.targetFormat || item.targetOffer || item.depth) && (
                            <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/50 p-4 space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                                        <Brain className="w-3 h-3" /> Analyse IA
                                    </span>
                                    {item.verdict && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                            item.verdict === 'Valide'    ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' :
                                            item.verdict === 'Trop lisse' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800' :
                                            'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                        }`}>{item.verdict}</span>
                                    )}
                                    {item.targetOffer && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                                            <Target className="w-2.5 h-2.5 inline mr-1" />{item.targetOffer}
                                        </span>
                                    )}
                                    {item.targetFormat && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800">
                                            {item.targetFormat}
                                        </span>
                                    )}
                                    {item.depth && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                            <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                                        </span>
                                    )}
                                    {item.platforms.length > 0 && (
                                        <div className="flex gap-1 flex-wrap">
                                            {item.platforms.map(p => (
                                                <span key={p} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-purple-800/50 rounded-sm border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100">
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {item.strategicAngle && (
                                    <div className="text-sm text-purple-900 dark:text-purple-100/80 leading-relaxed whitespace-pre-wrap border-t border-purple-200 dark:border-purple-800/50 pt-3">
                                        {renderMdText(item.strategicAngle)}
                                    </div>
                                )}

                                {(item.suggestedMetaphor || item.justification) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-purple-200 dark:border-purple-800/50 pt-3">
                                        {item.suggestedMetaphor && (
                                            <div className="bg-white dark:bg-purple-900/20 rounded-lg p-3 border border-purple-100 dark:border-purple-900/40">
                                                <p className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase mb-1 flex items-center gap-1">
                                                    <Quote className="w-2.5 h-2.5" /> Métaphore
                                                </p>
                                                <p className="text-xs text-purple-900 dark:text-purple-100/80 italic leading-relaxed">{item.suggestedMetaphor}</p>
                                            </div>
                                        )}
                                        {item.justification && (
                                            <div className="bg-white dark:bg-purple-900/20 rounded-lg p-3 border border-purple-100 dark:border-purple-900/40">
                                                <p className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase mb-1">Justification</p>
                                                <p className="text-xs text-purple-900 dark:text-purple-100/80 leading-relaxed">{item.justification}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!item.strategicAngle && !item.suggestedMetaphor && !item.justification && (
                                    <p className="text-xs text-purple-900/50 dark:text-purple-100/40 italic">Aucun détail d'analyse disponible.</p>
                                )}
                            </div>
                        )}

                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB : BROUILLON — trame textuelle (relecture / édition avant export final)
                ════════════════════════════════════════ */}
                {activeTab === 'brouillon' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">

                        {/* Empty state : brouillon pas encore généré */}
                        {!hasContent && (
                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border p-8 text-center flex flex-col items-center gap-3">
                                <div className="w-14 h-14 rounded-full bg-brand-light dark:bg-dark-bg flex items-center justify-center">
                                    <Pencil className="w-6 h-6 text-brand-main/50 dark:text-dark-text/50" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-brand-main dark:text-white">Brouillon pas encore généré</p>
                                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-1 max-w-md">
                                        Démarrez la session Coach (onglet Atelier) puis validez avec « Go Éditeur » pour générer la trame textuelle.
                                    </p>
                                </div>
                                <button
                                    onClick={() => onTabChange('atelier')}
                                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-main dark:text-white hover:underline"
                                >
                                    Aller à l'Atelier <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* CTA Générer les Slides — uniquement pour Carrousel, quand body existe mais pas encore de slides */}
                        {hasContent && item.targetFormat === TargetFormat.CARROUSEL_SLIDE && !item.slides && (
                            <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800/50 p-4 flex items-start gap-3 order-1">
                                <Images className="w-5 h-5 text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-violet-800 dark:text-violet-200 uppercase mb-1">Étape suivante</p>
                                    <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
                                        Relisez et corrigez la trame ci-dessous si nécessaire. Une fois prête, transformez-la en slides structurées.
                                    </p>
                                </div>
                                <button
                                    onClick={onLaunchCarrouselSlides}
                                    disabled={isGenerating}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-violet-600/20 transition-all disabled:opacity-50 whitespace-nowrap"
                                >
                                    {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
                                    Générer les Slides
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* ── 4. Section Brouillon (visible quand contenu existe) ── */}
                        {hasContent && (
                            <div ref={contentRef} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-pink-500/20 overflow-hidden flex flex-col flex-1 min-h-[400px] order-2">

                                {/* Header brouillon */}
                                <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Brouillon</p>
                                        {item.targetFormat && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                                                {item.targetFormat}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isEditingBody ? (
                                            <>
                                                <SecBtn onClick={() => setIsEditingBody(false)} icon={X} label="Annuler" />
                                                <button
                                                    onClick={saveEditBody}
                                                    className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-sm border shadow-xs bg-green-600 hover:bg-green-700 text-white border-green-700 transition-colors"
                                                >
                                                    <Save className="w-3 h-3" /> Enregistrer
                                                </button>
                                            </>
                                        ) : (
                                            !isVideoFormat && item.body && <SecBtn onClick={() => startEditBody(item.body)} icon={Pencil} label="Modifier" />
                                        )}
                                        <SecBtn
                                            onClick={() => { setShowAdjustmentForm(!showAdjustmentForm); if (showAdjustmentForm) setAdjustmentText(""); }}
                                            disabled={isGenerating}
                                            icon={MessageSquare}
                                            label={showAdjustmentForm ? 'Annuler' : 'Ajuster'}
                                            color="blue"
                                        />
                                        <SecBtn
                                            onClick={onLaunchDrafting}
                                            disabled={isGenerating}
                                            icon={RefreshCw}
                                            label={isGenerating ? '...' : 'Régénérer'}
                                            color="pink"
                                        />
                                    </div>
                                </div>

                                {/* Formulaire d'ajustement */}
                                {showAdjustmentForm && (
                                    <div className="px-4 py-3 border-b border-brand-border dark:border-dark-sec-border bg-blue-50 dark:bg-blue-900/10 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <MessageSquare className="w-3 h-3" /> Demande d'ajustement
                                        </p>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={adjustmentText}
                                                onChange={(e) => setAdjustmentText(e.target.value)}
                                                placeholder="Raccourcis l'intro, insiste plus sur la métaphore du miroir..."
                                                className="flex-1 text-sm p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-dark-surface text-brand-main dark:text-dark-text placeholder-brand-main/30 dark:placeholder-dark-text/30 outline-hidden focus:ring-2 focus:ring-blue-400 resize-none"
                                                rows={2}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && adjustmentText.trim()) {
                                                        onLaunchAdjustment(adjustmentText.trim());
                                                        setAdjustmentText("");
                                                        setShowAdjustmentForm(false);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    if (adjustmentText.trim()) {
                                                        onLaunchAdjustment(adjustmentText.trim());
                                                        setAdjustmentText("");
                                                        setShowAdjustmentForm(false);
                                                    }
                                                }}
                                                disabled={!adjustmentText.trim() || isGenerating}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                                            >
                                                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                Envoyer
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1.5">&#8984;+Entrée pour envoyer</p>
                                    </div>
                                )}

                                {/* Contenu (auto-détection body vs scriptVideo) */}
                                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                    {isEditingBody ? (
                                        <textarea
                                            value={editBodyText}
                                            onChange={(e) => setEditBodyText(e.target.value)}
                                            className="flex-1 w-full p-6 text-sm leading-relaxed bg-white dark:bg-dark-surface text-brand-main dark:text-dark-text outline-hidden resize-none font-mono"
                                            placeholder="Éditez le contenu..."
                                        />
                                    ) : isVideoFormat ? (
                                        <ScriptVideoRenderer raw={item.scriptVideo!} />
                                    ) : (
                                        <BodyRenderer body={item.body!} />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── 5. CTA contextuel (étape suivante) ── */}
                        {hasContent && (() => {
                            if (item.targetFormat === TargetFormat.POST_TEXTE_COURT) return (
                                <div className="flex justify-end order-4">
                                    <button
                                        onClick={() => onTabChange('postcourt')}
                                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5"
                                    >
                                        <Copy className="w-5 h-5" />
                                        Voir la copie finale
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </div>
                            );

                            if (item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT) return (
                                <div className="flex justify-end order-4">
                                    <button
                                        onClick={() => onTabChange('script')}
                                        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-amber-600/20 transition-all hover:-translate-y-0.5"
                                    >
                                        <Video className="w-5 h-5" />
                                        Voir le script
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </div>
                            );

                            // Carrousel : si slides existent, CTA "Voir les slides" en bas du brouillon.
                            // Si pas encore générées, le bandeau violet du haut affiche déjà le CTA "Générer les Slides".
                            if (item.targetFormat === TargetFormat.CARROUSEL_SLIDE) {
                                if (!item.slides) return null;
                                return (
                                    <div className="flex justify-end order-4">
                                        <button
                                            onClick={() => onTabChange('slides')}
                                            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-violet-600/20 transition-all hover:-translate-y-0.5"
                                        >
                                            <Images className="w-5 h-5" />
                                            Voir les slides
                                            <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                );
                            }

                            // Formats sans tab d'export → action finale directe
                            return (
                                <div className="flex justify-end order-4">
                                    <button
                                        onClick={() => onChangeStatus(ContentStatus.READY)}
                                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5"
                                    >
                                        <CheckCircle2 className="w-5 h-5" />
                                        Marquer comme Prêt
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB : SCRIPT (Reel/Short)
                ════════════════════════════════════════ */}
                {activeTab === 'script' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">
                        <FinalTabHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-amber-500/20 overflow-hidden flex flex-col">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Video className="w-3 h-3" /> Script
                                    </p>
                                </div>
                                <SecBtn
                                    onClick={onLaunchDrafting}
                                    disabled={isGenerating}
                                    icon={RefreshCw}
                                    label={isGenerating ? '...' : 'Régénérer'}
                                    color="pink"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {item.scriptVideo ? (
                                    <ScriptVideoRenderer raw={item.scriptVideo} variant="table" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8 min-h-[240px]">
                                        <Video className="w-10 h-10 text-amber-300 dark:text-amber-600" />
                                        <div>
                                            <p className="text-sm font-semibold text-brand-main dark:text-white">Script pas encore généré</p>
                                            <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-1 max-w-md">
                                                Démarrez la session Coach dans l'onglet Atelier puis validez avec « Go Éditeur ».
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onTabChange('atelier')}
                                            className="flex items-center gap-1.5 text-xs font-semibold text-brand-main dark:text-white hover:underline"
                                        >
                                            Aller à l'Atelier <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {item.scriptVideo && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => onChangeStatus(ContentStatus.READY)}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Marquer comme Prêt
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB : COPIE (Post Court)
                ════════════════════════════════════════ */}
                {activeTab === 'postcourt' && (() => {
                    const postText = buildPostCourtText(item.body || "");
                    const dzinePrompt = getPostCourtDzinePrompt(item.body || "");
                    const suggestedVisual = getPostCourtSuggestedVisual(item.body || "");

                    const handleCopy = async () => {
                        const copied = await copyTextToClipboard(postText);
                        if (!copied) return;
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    };

                    const handleDzineCopy = async () => {
                        const copied = await copyTextToClipboard(dzinePrompt);
                        if (!copied) return;
                        setCopiedDzine(true);
                        setTimeout(() => setCopiedDzine(false), 2000);
                    };

                    const renderPostCourt = (text: string) => {
                        return text.split('\n\n').map((paragraph, pi) => (
                            <p key={pi} className={`leading-relaxed text-brand-main dark:text-dark-text ${pi > 0 ? 'mt-4' : ''}`}>
                                {paragraph}
                            </p>
                        ));
                    };

                    return (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">

                            <FinalTabHeader />

                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-emerald-500/20 overflow-hidden flex flex-col min-h-[200px]">
                                <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Copy className="w-3 h-3" /> Copie
                                    </p>
                                    <SecBtn
                                        onClick={onLaunchDrafting}
                                        disabled={isGenerating}
                                        icon={RefreshCw}
                                        label={isGenerating ? '...' : 'Régénérer'}
                                        color="pink"
                                    />
                                </div>

                                <div className={`flex-1 overflow-y-auto custom-scrollbar p-6 grid gap-6 ${(dzinePrompt || suggestedVisual) ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]' : 'grid-cols-1'}`}>
                                    <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                                            <span className="inline-flex items-center rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                                Texte à copier
                                            </span>
                                            <button
                                                onClick={handleCopy}
                                                disabled={!postText}
                                                className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-xs transition-colors disabled:opacity-40 ${
                                                    copied
                                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                                        : 'bg-white dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                                }`}
                                            >
                                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copied ? 'Copié !' : 'Copier'}
                                            </button>
                                        </div>
                                        <div className="p-6">
                                            {postText ? (
                                                <div className="text-sm select-text">
                                                    {renderPostCourt(postText)}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-center gap-3 py-8">
                                                    <Copy className="w-10 h-10 text-emerald-300 dark:text-emerald-600" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-brand-main dark:text-white">Copie pas encore générée</p>
                                                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-1 max-w-md">
                                                            Démarrez la session Coach (onglet Atelier) puis validez avec « Go Éditeur ».
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => onTabChange('atelier')}
                                                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-main dark:text-white hover:underline"
                                                    >
                                                        Aller à l'Atelier <ArrowRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {(dzinePrompt || suggestedVisual) && (
                                        <div className="space-y-4">
                                            {dzinePrompt && (
                                                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-5">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                                                Prompt Dzine
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={handleDzineCopy}
                                                            disabled={!dzinePrompt}
                                                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                                                copiedDzine
                                                                    ? 'border-emerald-700 bg-emerald-600 text-white'
                                                                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/30'
                                                            }`}
                                                        >
                                                            {copiedDzine ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                            {copiedDzine ? 'Copié' : 'Copier'}
                                                        </button>
                                                    </div>
                                                    <div className="mt-4 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-white/80 dark:bg-dark-surface/50 p-4">
                                                        <p className="font-sans text-[13px] leading-[1.6] text-brand-main dark:text-dark-text whitespace-pre-wrap select-text">
                                                            {dzinePrompt}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {suggestedVisual && (
                                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                                    <div className="bg-amber-50 dark:bg-amber-900/10 px-4 py-2.5 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                                                        <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-2">
                                                            <FileText className="w-3 h-3" /> Visuel suggéré
                                                        </p>
                                                    </div>
                                                    <div className="p-6">
                                                        <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">
                                                            {suggestedVisual}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Marquer comme Prêt */}
                            <div className="flex justify-end">
                                <button
                                    onClick={() => onChangeStatus(ContentStatus.READY)}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Marquer comme Prêt
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══════════════════════════════════════
                    TAB : SLIDES
                ════════════════════════════════════════ */}
                {activeTab === 'slides' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">
                        <FinalTabHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-violet-500/20 overflow-hidden flex flex-col flex-1 min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Images className="w-3 h-3" /> Slides
                                    </p>
                                </div>
                                <SecBtn
                                    onClick={onLaunchCarrouselSlides}
                                    disabled={isGenerating}
                                    icon={RefreshCw}
                                    label={isGenerating ? '...' : 'Régénérer'}
                                    color="violet"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {!item.slides ? (
                                    !item.body ? (
                                        // Pas de brouillon textuel → rediriger vers Brouillon
                                        <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                            <Images className="w-10 h-10 text-violet-300 dark:text-violet-600" />
                                            <div>
                                                <p className="text-sm font-semibold text-brand-main dark:text-white">Brouillon textuel requis</p>
                                                <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-1 max-w-md">
                                                    Les slides sont construites à partir du brouillon narratif. Démarrez par l'onglet Atelier puis relisez la trame sur Brouillon.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => onTabChange('atelier')}
                                                className="flex items-center gap-1.5 text-xs font-semibold text-brand-main dark:text-white hover:underline mt-1"
                                            >
                                                Aller à l'Atelier <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        // Brouillon existant mais slides pas encore générées
                                        <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                            <Images className="w-10 h-10 text-violet-300 dark:text-violet-600" />
                                            <p className="text-sm text-brand-main/50 dark:text-dark-text/50 max-w-xs leading-relaxed">
                                                Transformez la trame textuelle en slides structurées (titre, texte, intention visuelle par slide).
                                            </p>
                                            <button
                                                onClick={onLaunchCarrouselSlides}
                                                disabled={isGenerating}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                            >
                                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                Générer les slides
                                            </button>
                                            <button
                                                onClick={() => onTabChange('brouillon')}
                                                className="text-[11px] text-brand-main/50 dark:text-dark-text/50 hover:underline"
                                            >
                                                ← Relire le brouillon textuel
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <SlidesRenderer
                                        slidesRaw={item.slides!}
                                        onAdjustPrompts={onLaunchPromptsAdjustment}
                                        isAdjusting={isGenerating}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Marquer comme Prêt */}
                        {item.slides && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => onChangeStatus(ContentStatus.READY)}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-base font-bold shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Marquer comme Prêt
                                </button>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
