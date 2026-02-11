import React, { useState, useEffect, useRef } from 'react';
import { X, Brain, RefreshCw, ArrowRight, Loader2, Trash2, Globe, ArrowRightFromLine, Save, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { ContentItem, ContentStatus, Verdict, Platform, Profondeur } from '../types';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';
import { CharCounter, ConfirmModal } from './CommonModals';
import { useEscapeClose } from './hooks/useEscapeClose';

interface IdeaModalProps {
    item: ContentItem;
    onClose: () => void;
    onChange: (item: ContentItem) => Promise<void>;
    onDelete: (item: ContentItem) => Promise<void>;
    onTransformToDraft: (item: ContentItem) => Promise<void>;
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

    // Synchroniser les champs d'analyse quand le parent met à jour l'item (ex: après ré-analyse IA)
    useEffect(() => {
        setLocalItem(prev => ({
            ...prev,
            title: item.title,
            analyzed: item.analyzed,
            verdict: item.verdict,
            strategicAngle: item.strategicAngle,
            platforms: item.platforms,
            targetFormat: item.targetFormat,
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
        item.targetFormat,
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
        setIsSaving(true);
        const newItem = { ...localItem, status: ContentStatus.DRAFTING };
        await onTransformToDraft(newItem);
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

    const SaveIndicator = () => {
        if (saveStatus === 'saving') return (
            <span className="flex items-center gap-1.5 text-xs text-brand-main/60 dark:text-dark-text/60 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sauvegarde…
            </span>
        );
        if (saveStatus === 'saved') return (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enregistré
            </span>
        );
        if (saveStatus === 'error') return (
            <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                Erreur sauvegarde
            </span>
        );
        return null;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-main/20 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-dark-surface w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface z-10">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-xl text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                            <Brain className="w-5 h-5" />
                        </div>
                        <input
                            type="text"
                            value={localItem.title}
                            onChange={(e) => setLocalItem({...localItem, title: e.target.value})}
                            className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-none w-full placeholder-brand-main/30"
                            placeholder="Titre de l'idée..."
                        />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <SaveIndicator />
                        <button onClick={onClose} className="p-2 hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-full transition-colors text-brand-main dark:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Notes Editor */}
                    <div className="flex flex-col border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden bg-brand-light dark:bg-dark-bg focus-within:ring-2 focus-within:ring-brand-main transition-shadow min-h-[200px]">
                        <div className="bg-brand-light dark:bg-dark-bg p-2 flex justify-between items-center border-b border-brand-border dark:border-dark-sec-border">
                            <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase px-2">Notes & Inspiration</label>
                            <MarkdownToolbar className="border-none bg-transparent p-0" />
                        </div>
                        <RichTextarea
                            value={localItem.notes}
                            onChange={(val) => setLocalItem({...localItem, notes: val})}
                            className="w-full flex-1 p-4"
                            placeholder="Détaillez votre idée, vos sources, vos inspirations..."
                        />
                        <div className="p-2 flex justify-end border-t border-brand-border/50 dark:border-dark-sec-border/50">
                            <CharCounter current={localItem.notes.length} max={5000} />
                        </div>
                    </div>

                    {/* Analyse IA Section */}
                    <div className="bg-purple-50 dark:bg-purple-900/10 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-purple-200 dark:border-purple-800/50">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase flex items-center gap-2">
                                    <Brain className="w-4 h-4" />
                                    {localItem.analyzed ? "Analyse Stratégique" : "Analyser avec l'IA"}
                                </span>
                                {localItem.verdict && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getVerdictColor(localItem.verdict)}`}>
                                        {localItem.verdict}
                                    </span>
                                )}
                                {localItem.depth && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${DEPTH_COLORS[localItem.depth] || ''}`}>
                                        <Zap className="w-2.5 h-2.5" />{localItem.depth}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={onAnalyze}
                                disabled={isReanalyzing}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-white dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-200 transition-colors border border-purple-200 dark:border-purple-700 shadow-sm disabled:opacity-50 flex-shrink-0"
                            >
                                <RefreshCw className={`w-3 h-3 ${isReanalyzing ? 'animate-spin' : ''}`} />
                                {isReanalyzing ? 'Analyse en cours...' : (localItem.analyzed ? 'Ré-analyser' : 'Lancer l\'analyse')}
                            </button>
                        </div>

                        {localItem.analyzed ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
                                <div className="md:col-span-2 space-y-2">
                                    <p className="text-xs font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Angle Recommandé</p>
                                    <div className="text-sm leading-relaxed text-purple-900 dark:text-purple-100 whitespace-pre-wrap">
                                        {localItem.strategicAngle}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs font-bold text-purple-900/50 dark:text-purple-100/50 uppercase flex items-center gap-1 mb-2">
                                            <Globe className="w-3 h-3" /> Plateformes
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {localItem.platforms.length > 0 ? (
                                                localItem.platforms.map((p, i) => (
                                                    <span key={i} className="px-2 py-1 bg-white dark:bg-purple-800/30 text-purple-800 dark:text-purple-200 rounded-md text-xs font-medium border border-purple-200 dark:border-purple-700">
                                                        {p}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-purple-800/50 italic">Aucune</span>
                                            )}
                                        </div>
                                    </div>
                                    {localItem.targetFormat && (
                                        <div>
                                            <p className="text-xs font-bold text-purple-900/50 dark:text-purple-100/50 uppercase flex items-center gap-1 mb-2">
                                                <ArrowRightFromLine className="w-3 h-3" /> Format cible
                                            </p>
                                            <span className="px-2 py-1 font-bold text-xs rounded-md border bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700">
                                                {localItem.targetFormat}
                                            </span>
                                        </div>
                                    )}
                                    {(localItem.targetOffer || localItem.justification || localItem.suggestedMetaphor) && (
                                        <div className="space-y-3 pt-1">
                                            {localItem.targetOffer && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Cible Offre</p>
                                                    <span className="inline-flex mt-1 text-[10px] px-2 py-1 rounded-full border font-bold bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700">
                                                        {localItem.targetOffer}
                                                    </span>
                                                </div>
                                            )}
                                            {localItem.justification && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Justification</p>
                                                    <div className="text-xs text-purple-900/80 dark:text-purple-100/80 whitespace-pre-wrap">
                                                        {localItem.justification}
                                                    </div>
                                                </div>
                                            )}
                                            {localItem.suggestedMetaphor && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Métaphore Suggérée</p>
                                                    <div className="text-xs text-purple-900/80 dark:text-purple-100/80 whitespace-pre-wrap italic">
                                                        {localItem.suggestedMetaphor}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-center py-6 text-purple-800/40 dark:text-purple-200/40 text-sm italic">
                                    Cliquez sur "Lancer l'analyse" pour obtenir un avis stratégique et des suggestions de plateformes.
                                </div>
                                {(localItem.targetOffer || localItem.justification || localItem.suggestedMetaphor) && (
                                    <div className="rounded-xl border border-purple-200/60 dark:border-purple-800/50 bg-white/70 dark:bg-purple-900/10 p-4 space-y-3">
                                        {localItem.targetOffer && (
                                            <div>
                                                <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Cible Offre</p>
                                                <span className="inline-flex mt-1 text-[10px] px-2 py-1 rounded-full border font-bold bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700">
                                                    {localItem.targetOffer}
                                                </span>
                                            </div>
                                        )}
                                        {localItem.justification && (
                                            <div>
                                                <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Justification</p>
                                                <div className="text-xs text-purple-900/80 dark:text-purple-100/80 whitespace-pre-wrap">
                                                    {localItem.justification}
                                                </div>
                                            </div>
                                        )}
                                        {localItem.suggestedMetaphor && (
                                            <div>
                                                <p className="text-[10px] font-bold text-purple-900/50 dark:text-purple-100/50 uppercase">Métaphore Suggérée</p>
                                                <div className="text-xs text-purple-900/80 dark:text-purple-100/80 whitespace-pre-wrap italic">
                                                    {localItem.suggestedMetaphor}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 px-6 bg-brand-light/50 dark:bg-dark-bg/50 border-t border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                        title="Supprimer l'idée"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="flex gap-3 items-center">
                        <button
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                            title={!isDirty ? "Aucune modification à enregistrer" : undefined}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                                isDirty && !isSaving
                                    ? 'text-brand-main dark:text-dark-text hover:bg-brand-border/50 dark:hover:bg-dark-sec-border/50 cursor-pointer'
                                    : 'text-brand-main/30 dark:text-dark-text/30 cursor-not-allowed'
                            }`}
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Enregistrer
                        </button>
                        <button
                            onClick={handleTransformToDraft}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-6 py-2 bg-brand-main hover:bg-brand-hover text-white rounded-lg font-bold shadow-lg shadow-brand-main/20 transition-all disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Travailler cette idée <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Supprimer cette idée ?"
                message="Elle sera archivée dans Notion."
                isDestructive={true}
            />
        </div>
    );
};
