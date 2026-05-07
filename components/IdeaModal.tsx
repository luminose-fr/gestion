import React, { useState, useEffect, useRef } from 'react';
import { X, Brain, RefreshCw, ArrowRight, Loader2, Trash2, ArrowRightFromLine, Save, CheckCircle2, AlertCircle, Zap, Lightbulb, NotebookPen } from 'lucide-react';
import { ContentItem, ContentStatus, Verdict, Profondeur, TargetFormat, TARGET_FORMAT_VALUES } from '../types';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';
import { CharCounter, ConfirmModal } from './CommonModals';
import { useEscapeClose } from './hooks/useEscapeClose';

interface IdeaModalProps {
    item: ContentItem;
    onClose: () => void;
    onChange: (item: ContentItem) => Promise<void>;
    onDelete: (item: ContentItem) => Promise<void>;
    /** Passe l'item mis à jour. L'option launchInterview déclenche l'interview IA à l'ouverture de l'éditeur. */
    onTransformToDraft: (item: ContentItem, options?: { launchInterview?: boolean }) => Promise<void>;
    onAnalyze: () => void; // Trigger analysis from parent
    isReanalyzing: boolean;
}

const DEPTH_COLORS: Record<string, string> = {
    [Profondeur.DIRECT]:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    [Profondeur.LEGERE]:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    [Profondeur.COMPLETE]: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
};

export const IdeaModal: React.FC<IdeaModalProps> = ({
    item, onClose, onChange, onDelete, onTransformToDraft, onAnalyze, isReanalyzing
}) => {
    const [localItem, setLocalItem] = useState<ContentItem>(item);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const isMountedRef = useRef(true);
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
        };
    }, []);

    // isDirty : vrai si localItem diffère du item source
    const isDirty = JSON.stringify(localItem) !== JSON.stringify(item);

    // Synchroniser les champs d'analyse quand le parent met à jour l'item (ex: après ré-analyse IA).
    // NB : targetFormat est contrôlé par l'utilisateur dans ce modal, on ne l'écrase plus.
    useEffect(() => {
        setLocalItem(prev => ({
            ...prev,
            title: item.title,
            analyzed: item.analyzed,
            verdict: item.verdict,
            strategicAngle: item.strategicAngle,
            platforms: item.platforms,
            targetOffer: item.targetOffer,
            justification: item.justification,
            suggestedMetaphor: item.suggestedMetaphor,
            depth: item.depth,
        }));
    }, [
        item.title,
        item.analyzed,
        item.verdict,
        item.strategicAngle,
        item.targetOffer,
        item.justification,
        item.suggestedMetaphor,
        item.platforms,
        item.depth,
    ]);

    useEscapeClose(true, onClose, isSaving || isReanalyzing || showDeleteConfirm);

    const triggerSaveStatus = (status: 'saved' | 'error') => {
        if (!isMountedRef.current) return;
        setSaveStatus(status);
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setSaveStatus('idle');
        }, 2500);
    };

    const handleSave = async () => {
        if (isSaving || !isDirty) return;
        setIsSaving(true);
        setSaveStatus('saving');
        try {
            await onChange(localItem);
            triggerSaveStatus('saved');
        } catch {
            triggerSaveStatus('error');
        } finally {
            if (isMountedRef.current) setIsSaving(false);
        }
    };

    const handleTransformToDraft = async () => {
        if (!localItem.analyzed) return;
        setIsSaving(true);
        const newItem = { ...localItem, status: ContentStatus.DRAFTING };
        await onTransformToDraft(newItem, { launchInterview: true });
        setIsSaving(false);
    };

    const handleDelete = async () => {
        await onDelete(localItem);
        onClose();
    };

    const getVerdictColor = (verdict?: Verdict) => {
        switch (verdict) {
            case Verdict.VALID: return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
            case Verdict.TOO_BLAND: return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
            case Verdict.NEEDS_WORK: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-brand-main/20 dark:bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Drawer latéral droit */}
            <aside
                className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-white dark:bg-dark-surface border-l border-brand-border dark:border-dark-sec-border flex flex-col shadow-2xl shadow-black/20 animate-in slide-in-from-right duration-300"
            >
                {/* Header */}
                <div className="flex items-start gap-3 px-5 py-4 border-b border-brand-border dark:border-dark-sec-border shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    </div>
                    <input
                        type="text"
                        value={localItem.title}
                        onChange={(e) => setLocalItem({...localItem, title: e.target.value})}
                        className="flex-1 text-base font-bold text-brand-main dark:text-white bg-transparent outline-hidden placeholder-brand-main/30 dark:placeholder-dark-text/30 min-w-0"
                        placeholder="Titre de l'idée…"
                    />
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main/50 dark:text-dark-text/50 hover:text-brand-main dark:hover:text-white transition-colors shrink-0 mt-0.5"
                        title="Fermer (Échap)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Format cible */}
                    <div className="flex items-center gap-3 bg-brand-light dark:bg-dark-bg rounded-xl px-4 py-3">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider whitespace-nowrap shrink-0">
                            <ArrowRightFromLine className="w-3 h-3" />
                            Format
                        </label>
                        <select
                            value={localItem.targetFormat || ''}
                            onChange={(e) => {
                                const value = e.target.value;
                                setLocalItem({
                                    ...localItem,
                                    targetFormat: value ? (value as TargetFormat) : null,
                                });
                            }}
                            className="flex-1 bg-transparent border-none text-sm text-brand-main dark:text-white outline-hidden cursor-pointer min-w-0"
                        >
                            <option value="">— Choisir un format —</option>
                            {TARGET_FORMAT_VALUES.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>

                    {/* Notes & Inspiration */}
                    <div className="rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                        <div className="px-4 py-2.5 bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 flex items-center gap-1.5">
                                <NotebookPen className="w-3 h-3" />
                                Notes & Inspiration
                            </p>
                            <MarkdownToolbar className="border-none bg-transparent p-0" />
                        </div>
                        <RichTextarea
                            value={localItem.notes}
                            onChange={(val) => setLocalItem({...localItem, notes: val})}
                            className="w-full p-4 min-h-[140px] text-sm leading-relaxed bg-white dark:bg-dark-surface"
                            placeholder="Détaillez votre idée, vos sources, vos inspirations…"
                        />
                        <div className="px-3 py-1 flex justify-end border-t border-brand-border/50 dark:border-dark-sec-border/50 bg-white dark:bg-dark-surface">
                            <CharCounter current={localItem.notes.length} max={5000} />
                        </div>
                    </div>

                    {/* Bloc Analyse IA */}
                    <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/40 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-violet-50 dark:bg-violet-900/15 border-b border-violet-200/60 dark:border-violet-800/40 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-violet-800 dark:text-violet-200 flex items-center gap-1.5">
                                    <Brain className="w-3.5 h-3.5" />
                                    {localItem.analyzed ? 'Analyse Stratégique' : "Analyser avec l'IA"}
                                </span>
                                {localItem.verdict && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${getVerdictColor(localItem.verdict)}`}>
                                        {localItem.verdict}
                                    </span>
                                )}
                                {localItem.depth && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${DEPTH_COLORS[localItem.depth] || ''}`}>
                                        <Zap className="w-2.5 h-2.5" />
                                        {localItem.depth}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={onAnalyze}
                                disabled={isReanalyzing}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-violet-900/40 hover:bg-violet-50 dark:hover:bg-violet-800/40 text-violet-700 dark:text-violet-200 border border-violet-200 dark:border-violet-700 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
                            >
                                <RefreshCw className={`w-3 h-3 ${isReanalyzing ? 'animate-spin' : ''}`} />
                                {isReanalyzing ? 'Analyse…' : (localItem.analyzed ? 'Ré-analyser' : 'Analyser')}
                            </button>
                        </div>

                        <div className="p-4 bg-white dark:bg-dark-surface">
                            {localItem.analyzed && localItem.strategicAngle ? (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 mb-2">
                                            Angle recommandé
                                        </p>
                                        <p className="text-sm text-brand-main dark:text-white leading-relaxed whitespace-pre-wrap">
                                            {localItem.strategicAngle.replace(/\*\*/g, '')}
                                        </p>
                                    </div>

                                    {(localItem.platforms?.length || 0) > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 mb-2">
                                                Plateformes
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {localItem.platforms.map(p => (
                                                    <span
                                                        key={p}
                                                        className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border"
                                                    >
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {localItem.targetOffer && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 mb-1.5">
                                                Cible offre
                                            </p>
                                            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full border font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/50">
                                                {localItem.targetOffer}
                                            </span>
                                        </div>
                                    )}

                                    {localItem.justification && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 mb-1.5">
                                                Justification
                                            </p>
                                            <p className="text-xs text-brand-main/70 dark:text-dark-text/70 leading-relaxed whitespace-pre-wrap">
                                                {localItem.justification}
                                            </p>
                                        </div>
                                    )}

                                    {localItem.suggestedMetaphor && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-main/50 dark:text-dark-text/50 mb-1.5">
                                                Métaphore suggérée
                                            </p>
                                            <p className="text-xs text-brand-main/70 dark:text-dark-text/70 italic leading-relaxed">
                                                « {localItem.suggestedMetaphor} »
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-brand-main/50 dark:text-dark-text/50 italic text-center py-6">
                                    Cliquez sur « Analyser » pour obtenir un avis stratégique et des suggestions de plateformes.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-brand-border dark:border-dark-sec-border bg-brand-light/60 dark:bg-dark-bg/60 flex items-center justify-between gap-3 shrink-0">
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-2.5 rounded-lg text-brand-main/50 dark:text-dark-text/50 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                        title="Supprimer cette idée"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        {saveStatus === 'saving' && (
                            <span className="flex items-center gap-1 text-xs text-brand-main/60 dark:text-dark-text/60 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Sauvegarde…
                            </span>
                        )}
                        {saveStatus === 'saved' && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Enregistré
                            </span>
                        )}
                        {saveStatus === 'error' && (
                            <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                                <AlertCircle className="w-3 h-3" />
                                Erreur
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                            title={!isDirty ? "Aucune modification à enregistrer" : undefined}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isDirty && !isSaving
                                    ? 'text-brand-main dark:text-white hover:bg-brand-border/50 dark:hover:bg-dark-sec-border/50 cursor-pointer'
                                    : 'text-brand-main/30 dark:text-dark-text/30 cursor-not-allowed'
                            }`}
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Enregistrer
                        </button>
                        <button
                            onClick={handleTransformToDraft}
                            disabled={isSaving || !localItem.analyzed}
                            title={!localItem.analyzed ? "Lancez d'abord l'analyse IA pour débloquer cette action." : undefined}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-main hover:bg-brand-hover text-white text-sm font-semibold rounded-lg shadow-sm shadow-brand-main/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    Travailler cette idée
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </aside>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Supprimer cette idée ?"
                message="Elle sera archivée dans Notion."
                isDestructive={true}
            />
        </>
    );
};
