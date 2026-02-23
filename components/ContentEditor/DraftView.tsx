import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, LayoutTemplate, RefreshCw, Sparkles, Loader2, Save, CheckCircle2, FileText, Brain, Lightbulb, Images, Pencil, X, Copy, Check, Target, Zap, Quote, Video, Send } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat, Profondeur } from '../../types';
import { bodyJsonToText } from '../../ai/formats';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';
import { BodyRenderer } from './renderers/BodyRenderer';
import { ScriptVideoRenderer } from './renderers/ScriptVideoRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { parseBodyJson, renderMdText, DEPTH_COLORS } from './renderers/shared';

interface DraftViewProps {
    item: ContentItem;
    onChange: (item: ContentItem) => void;

    // AI Handlers
    onLaunchInterview: () => void;
    onLaunchDrafting: () => void;
    onLaunchCarrouselSlides: () => void;
    onLaunchAdjustment: (adjustmentText: string) => void;
    onChangeStatus: (status: ContentStatus) => Promise<void>;
    onSave: (item: ContentItem) => Promise<void>;

    isGenerating: boolean;

    // View State
    activeTab: 'idea' | 'interview' | 'content' | 'slides' | 'postcourt' | 'script';
    onTabChange: (tab: 'idea' | 'interview' | 'content' | 'slides' | 'postcourt' | 'script') => void;
}

// Convertit une chaîne en gras Unicode (Mathematical Sans-Serif Bold)
// Fonctionne sur LinkedIn, Instagram, etc. — comme Publer
const BOLD_MAP: Record<string, string> = {
    A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',
    N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭',
    a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',
    n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',
    '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵',
};
const toBoldUnicode = (text: string): string =>
    text.split('').map(c => BOLD_MAP[c] ?? c).join('');

// Génère le texte "Post Court" depuis le body JSON.
// Hook, Baffe et CTA sont en gras Unicode — Corps en texte normal.
// Le texte retourné est directement prêt à coller sur les réseaux.
const buildPostCourtText = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);
        if (data.edited_raw) return data.edited_raw;
        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        if (!isPostTexte) return "";
        const t = (v: any) => (typeof v === 'string' ? v.trim() : "");
        const parts: string[] = [];
        if (data.hook)  parts.push(toBoldUnicode(t(data.hook)));
        if (data.corps) parts.push(t(data.corps));
        if (data.baffe) parts.push(toBoldUnicode(t(data.baffe)));
        if (data.cta)   parts.push(toBoldUnicode(t(data.cta)));
        return parts.filter(Boolean).join("\n\n");
    } catch {
        return body;
    }
};

export const DraftView: React.FC<DraftViewProps> = ({
    item, onChange,
    onLaunchInterview, onLaunchDrafting, onLaunchCarrouselSlides, onLaunchAdjustment, onChangeStatus, onSave, isGenerating,
    activeTab, onTabChange
}) => {

    const [isEditingBody, setIsEditingBody] = useState(false);
    const [editBodyText, setEditBodyText] = useState("");
    const [copied, setCopied] = useState(false);
    const postCourtSavedRef = useRef<string | null>(null);
    const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
    const [adjustmentText, setAdjustmentText] = useState("");

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

    const isDirect = item.depth === Profondeur.DIRECT;

    // Génère et sauvegarde postCourt quand l'onglet postcourt devient actif
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

    const isVideoFormat = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
        || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;

    // Onglets dynamiques selon le format
    const steps = [
        { id: 'idea',      label: '1. Idée',      icon: Lightbulb,      disabled: false },
        { id: 'interview', label: '2. Interview',  icon: MessageSquare,  disabled: isDirect },
        { id: 'content',   label: '3. Rédaction',  icon: LayoutTemplate, disabled: false },
        ...(item.targetFormat === TargetFormat.POST_TEXTE_COURT
            ? [{ id: 'postcourt', label: '4. Post Court', icon: Copy,   disabled: !item.body }]
            : []),
        ...(item.targetFormat === TargetFormat.CARROUSEL_SLIDE
            ? [{ id: 'slides',    label: '4. Slides',     icon: Images, disabled: false }]
            : []),
        ...(isVideoFormat
            ? [{ id: 'script',    label: '4. Script',     icon: Video,  disabled: false }]
            : []),
    ];

    // Bouton secondaire réutilisable (header de panneau)
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
                className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-sm transition-colors disabled:opacity-50 ${colors[color]}`}
            >
                <Icon className={`w-3 h-3 ${disabled && label === '...' ? 'animate-spin' : ''}`} />
                {label}
            </button>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg flex flex-col h-full relative scroll-smooth">

            {/* ── Sticky Tabs ── */}
            <div className="sticky top-0 z-10 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur border-b border-brand-border dark:border-dark-sec-border px-6 md:px-10 flex-shrink-0">
                <div className="max-w-6xl mx-auto w-full flex gap-6 overflow-x-auto scrollbar-hide">
                    {steps.map((step) => {
                        const isActive   = activeTab === step.id;
                        const isDisabled = step.disabled;
                        const Icon = step.icon;
                        return (
                            <button
                                key={step.id}
                                onClick={() => !isDisabled && onTabChange(step.id as any)}
                                disabled={isDisabled}
                                title={isDisabled && step.id === 'interview' ? 'Non applicable (profondeur Direct)' : isDisabled ? 'Génère d\'abord le contenu' : undefined}
                                className={`
                                    flex items-center gap-2 pb-3 pt-5 text-sm font-bold border-b-2 transition-all whitespace-nowrap
                                    ${isDisabled
                                        ? 'border-transparent text-brand-main/20 dark:text-dark-text/20 cursor-not-allowed line-through'
                                        : isActive
                                            ? 'border-brand-main text-brand-main dark:text-white dark:border-white'
                                            : 'border-transparent text-brand-main/40 dark:text-dark-text/40 hover:text-brand-main/70'}
                                `}
                            >
                                <Icon className={`w-4 h-4 ${isActive && !isDisabled ? 'fill-current' : ''}`} />
                                <span>{step.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Content Area ── */}
            <div className="p-6 md:p-10 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6">

                {/* ═══════════════════════════════════════
                    TAB 1 : IDÉE
                ════════════════════════════════════════ */}
                {activeTab === 'idea' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6">

                        {/* Bloc Analyse IA — badges + angle + métaphore + justification */}
                        {(item.analyzed || item.verdict || item.targetFormat || item.targetOffer || item.depth) && (
                            <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/50 p-4 space-y-3">
                                {/* Ligne de badges */}
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
                                                <span key={p} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-purple-800/50 rounded border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100">
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Angle stratégique */}
                                {item.strategicAngle && (
                                    <div className="text-sm text-purple-900 dark:text-purple-100/80 leading-relaxed whitespace-pre-wrap border-t border-purple-200 dark:border-purple-800/50 pt-3">
                                        {renderMdText(item.strategicAngle)}
                                    </div>
                                )}

                                {/* Métaphore + Justification côte à côte si présents */}
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

                                {/* Empty state si analysé mais pas d'angle */}
                                {!item.strategicAngle && !item.suggestedMetaphor && !item.justification && (
                                    <p className="text-xs text-purple-900/50 dark:text-purple-100/40 italic">Aucun détail d'analyse disponible.</p>
                                )}
                            </div>
                        )}

                        {/* Notes */}
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-main transition-shadow flex flex-col flex-1 min-h-[200px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border">
                                <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                    <FileText className="w-3 h-3" /> Notes
                                </p>
                            </div>
                            <RichTextarea
                                value={item.notes}
                                onChange={(val) => onChange({ ...item, notes: val })}
                                className="w-full flex-1 p-4 text-sm"
                                placeholder="Tes notes brutes, idées, références..."
                            />
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB 2 : INTERVIEW
                ════════════════════════════════════════ */}
                {activeTab === 'interview' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">

                        {/* Rappel contextuel compact : angle + métaphore */}
                        {(item.strategicAngle || item.suggestedMetaphor) && (
                            <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/50 p-4 flex flex-col gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1">
                                        <Brain className="w-3 h-3" /> Contexte de l'interview
                                    </span>
                                    {item.depth && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                            <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                                        </span>
                                    )}
                                </div>
                                {item.strategicAngle && (
                                    <p className="text-sm text-purple-900 dark:text-purple-100/80 leading-relaxed">
                                        {renderMdText(item.strategicAngle)}
                                    </p>
                                )}
                                {item.suggestedMetaphor && (
                                    <p className="text-xs text-purple-700 dark:text-purple-300 italic border-t border-purple-200 dark:border-purple-800/50 pt-2">
                                        <Quote className="w-3 h-3 inline mr-1 opacity-60" />{item.suggestedMetaphor}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">

                            {/* Colonne gauche : Questions */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/50 p-4 flex flex-col min-h-[400px]">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" /> Questions
                                    </h3>
                                    {item.interviewQuestions && (
                                        <SecBtn
                                            onClick={onLaunchInterview}
                                            disabled={isGenerating}
                                            icon={RefreshCw}
                                            label={isGenerating ? '...' : 'Régénérer'}
                                            color="blue"
                                        />
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {!item.interviewQuestions ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                                            <p className="text-blue-900/60 dark:text-blue-100/60 text-sm max-w-xs leading-relaxed">
                                                L'IA génère des questions ciblées pour enrichir ton contenu.
                                            </p>
                                            <button
                                                onClick={onLaunchInterview}
                                                disabled={isGenerating}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                            >
                                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                Générer les questions
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-blue-900 dark:text-blue-100 whitespace-pre-wrap leading-relaxed">
                                            {renderMdText(item.interviewQuestions)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Colonne droite : Réponses */}
                            <div className="flex flex-col min-h-[400px] gap-4">
                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-pink-500 transition-shadow flex flex-col flex-1">
                                    <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border">
                                        <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                            <FileText className="w-3 h-3" /> Réponses
                                        </p>
                                    </div>
                                    <div className="bg-brand-light/30 dark:bg-dark-bg/30 p-2 border-b border-brand-border dark:border-dark-sec-border">
                                        <MarkdownToolbar />
                                    </div>
                                    <RichTextarea
                                        value={item.interviewAnswers || ""}
                                        onChange={(val) => onChange({ ...item, interviewAnswers: val })}
                                        className="w-full flex-1 p-4 text-sm"
                                        placeholder="Réponds aux questions pour guider la rédaction..."
                                    />
                                </div>

                                <button
                                    onClick={onLaunchDrafting}
                                    disabled={isGenerating || !item.interviewAnswers}
                                    className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold shadow-lg shadow-pink-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 w-full justify-center"
                                >
                                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    Générer le contenu
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB 3 : RÉDACTION
                ════════════════════════════════════════ */}
                {activeTab === 'content' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-pink-500/20 overflow-hidden flex flex-col flex-1 min-h-[500px]">

                            {/* Header */}
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Brouillon</p>
                                    {item.targetFormat && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                                            {item.targetFormat}
                                        </span>
                                    )}
                                    {item.depth && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                            <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isEditingBody ? (
                                        <>
                                            <SecBtn onClick={() => setIsEditingBody(false)} icon={X}    label="Annuler" />
                                            <button
                                                onClick={saveEditBody}
                                                className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-sm bg-green-600 hover:bg-green-700 text-white border-green-700 transition-colors"
                                            >
                                                <Save className="w-3 h-3" /> Enregistrer
                                            </button>
                                        </>
                                    ) : (
                                        item.body && <SecBtn onClick={() => startEditBody(item.body)} icon={Pencil} label="Modifier" />
                                    )}
                                    {item.body && (
                                        <SecBtn
                                            onClick={() => { setShowAdjustmentForm(!showAdjustmentForm); if (showAdjustmentForm) setAdjustmentText(""); }}
                                            disabled={isGenerating}
                                            icon={MessageSquare}
                                            label={showAdjustmentForm ? 'Annuler' : 'Ajuster'}
                                            color="blue"
                                        />
                                    )}
                                    <SecBtn
                                        onClick={onLaunchDrafting}
                                        disabled={isGenerating}
                                        icon={RefreshCw}
                                        label={isGenerating ? '...' : 'Régénérer'}
                                        color="pink"
                                    />
                                </div>
                            </div>

                            {/* Adjustment form */}
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
                                            className="flex-1 text-sm p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-dark-surface text-brand-main dark:text-dark-text placeholder-brand-main/30 dark:placeholder-dark-text/30 outline-none focus:ring-2 focus:ring-blue-400 resize-none"
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
                                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                                        >
                                            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Envoyer
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1.5">⌘+Entrée pour envoyer</p>
                                </div>
                            )}

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
                                    <BodyRenderer body={item.body} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                        <LayoutTemplate className="w-10 h-10 text-pink-300 dark:text-pink-700 opacity-60" />
                                        <p className="text-sm text-brand-main/50 dark:text-dark-text/50 max-w-xs leading-relaxed">
                                            {isDirect
                                                ? 'Lance la génération depuis tes notes.'
                                                : 'Réponds aux questions de l\'interview, puis génère le contenu.'}
                                        </p>
                                        <button
                                            onClick={onLaunchDrafting}
                                            disabled={isGenerating || (!isDirect && !item.interviewAnswers)}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                        >
                                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Générer le contenu
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action principale */}
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
                )}

                {/* ═══════════════════════════════════════
                    TAB 4a : POST COURT
                ════════════════════════════════════════ */}
                {activeTab === 'postcourt' && (() => {
                    const postText = buildPostCourtText(item.body || "");

                    const handleCopy = () => {
                        // Le texte est déjà en Unicode gras — copie directe
                        navigator.clipboard.writeText(postText);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    };

                    const renderPostCourt = (text: string) => {
                        // Le texte contient du gras Unicode — rendu brut paragraphe par paragraphe
                        return text.split('\n\n').map((paragraph, pi) => (
                            <p key={pi} className={`leading-relaxed text-brand-main dark:text-dark-text ${pi > 0 ? 'mt-4' : ''}`}>
                                {paragraph}
                            </p>
                        ));
                    };

                    return (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col pb-10">
                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-emerald-500/20 overflow-hidden flex flex-col flex-1 min-h-[400px]">
                                <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Copy className="w-3 h-3" /> Post Court — Prêt à copier
                                    </p>
                                    <button
                                        onClick={handleCopy}
                                        disabled={!postText}
                                        className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-sm transition-colors disabled:opacity-40 ${
                                            copied
                                                ? 'bg-emerald-600 text-white border-emerald-700'
                                                : 'bg-white dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                        }`}
                                    >
                                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copied ? 'Copié !' : 'Copier'}
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 max-w-2xl mx-auto w-full">
                                    {postText ? (
                                        <div className="text-sm select-text">
                                            {renderPostCourt(postText)}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
                                            <Copy className="w-8 h-8" />
                                            <p className="text-sm">Génère d'abord le contenu dans l'onglet Rédaction.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══════════════════════════════════════
                    TAB 4b : SLIDES
                ════════════════════════════════════════ */}
                {activeTab === 'slides' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-violet-500/20 overflow-hidden flex flex-col flex-1 min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Images className="w-3 h-3" /> Direction artistique
                                    </p>
                                    {item.depth && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                            <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                                        </span>
                                    )}
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
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                        <Images className="w-10 h-10 text-violet-300 dark:text-violet-600" />
                                        <p className="text-sm text-brand-main/50 dark:text-dark-text/50 max-w-xs leading-relaxed">
                                            Génère la direction artistique et les prompts Dzine pour chaque slide.
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
                                ) : (
                                    <SlidesRenderer slidesRaw={item.slides!} />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════
                    TAB 4c : SCRIPT VIDÉO
                ════════════════════════════════════════ */}
                {activeTab === 'script' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col gap-6 pb-10">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-amber-500/20 overflow-hidden flex flex-col flex-1 min-h-[500px]">

                            {/* Header */}
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Video className="w-3 h-3" /> Script vidéo
                                    </p>
                                    {item.targetFormat && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                            {item.targetFormat}
                                        </span>
                                    )}
                                    {item.depth && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                            <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                                        </span>
                                    )}
                                </div>
                                {item.scriptVideo && (
                                    <SecBtn
                                        onClick={() => { setShowAdjustmentForm(!showAdjustmentForm); if (showAdjustmentForm) setAdjustmentText(""); }}
                                        disabled={isGenerating}
                                        icon={MessageSquare}
                                        label={showAdjustmentForm ? 'Annuler' : 'Ajuster'}
                                        color="blue"
                                    />
                                )}
                                <SecBtn
                                    onClick={onLaunchDrafting}
                                    disabled={isGenerating}
                                    icon={RefreshCw}
                                    label={isGenerating ? '...' : 'Régénérer'}
                                    color="pink"
                                />
                            </div>

                            {/* Adjustment form */}
                            {showAdjustmentForm && (
                                <div className="px-4 py-3 border-b border-brand-border dark:border-dark-sec-border bg-blue-50 dark:bg-blue-900/10 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <MessageSquare className="w-3 h-3" /> Demande d'ajustement
                                    </p>
                                    <div className="flex gap-2">
                                        <textarea
                                            value={adjustmentText}
                                            onChange={(e) => setAdjustmentText(e.target.value)}
                                            placeholder="Rends le hook plus percutant, ajoute une transition avant le CTA..."
                                            className="flex-1 text-sm p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-dark-surface text-brand-main dark:text-dark-text placeholder-brand-main/30 dark:placeholder-dark-text/30 outline-none focus:ring-2 focus:ring-blue-400 resize-none"
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
                                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                                        >
                                            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Envoyer
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1.5">⌘+Entrée pour envoyer</p>
                                </div>
                            )}

                            {/* Body */}
                            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                {item.scriptVideo ? (
                                    <ScriptVideoRenderer raw={item.scriptVideo} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                                        <Video className="w-10 h-10 text-amber-300 dark:text-amber-700 opacity-60" />
                                        <p className="text-sm text-brand-main/50 dark:text-dark-text/50 max-w-xs leading-relaxed">
                                            {isDirect
                                                ? 'Lance la génération du script depuis tes notes.'
                                                : 'Réponds aux questions de l\'interview, puis génère le script.'}
                                        </p>
                                        <button
                                            onClick={onLaunchDrafting}
                                            disabled={isGenerating || (!isDirect && !item.interviewAnswers)}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50"
                                        >
                                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Générer le script
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action principale */}
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
                )}

            </div>
        </div>
    );
};
