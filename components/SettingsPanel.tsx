import React, { useEffect, useState } from 'react';
import {
    X, SlidersHorizontal, Cpu, Brain, Minimize2, Minus, Maximize2,
    Plus, Trash2, Save, Loader2, ChevronLeft, ChevronRight, User, Eye
} from 'lucide-react';
import { ContextItem, AIModel, ContextUsage, DisplayPrefs, DisplayDensity, DEFAULT_DISPLAY_PREFS } from '../types';
import * as NotionService from '../services/notionService';
import { ConfirmModal } from './CommonModals';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';
import { ANALYSTE_PERSONA, COACH_PERSONA, REDACTEUR_PERSONA, ARTISTE_PERSONA } from '../ai/prompts';
import { VOICE_RULES } from '../ai/voice';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    displayPrefs: DisplayPrefs;
    onDisplayPrefsChange: (prefs: DisplayPrefs) => void;
    contexts: ContextItem[];
    onContextsChange: (contexts: ContextItem[]) => void;
    aiModels: AIModel[];
    onModelsChange: (models: AIModel[]) => void;
    /** Onglet à afficher à l'ouverture. Défaut : 'display'. */
    initialTab?: 'display' | 'models' | 'contexts';
}

const HARDCODED_PERSONAS = [
    { id: 'voice',    name: 'Règles de voix (transverses)',    usage: 'Partagé',          prompt: VOICE_RULES         },
    { id: 'stratege', name: 'Stratège (ex-Rédacteur en Chef)', usage: 'Analyse',          prompt: ANALYSTE_PERSONA    },
    { id: 'coach',    name: 'Coach (sparring-partner)',         usage: 'Session chat',     prompt: COACH_PERSONA       },
    { id: 'editeur',  name: 'Éditeur Littéraire & Scénariste',  usage: 'Rédaction finale', prompt: REDACTEUR_PERSONA   },
    { id: 'artiste',  name: 'Directeur Artistique',             usage: 'Prompts image',    prompt: ARTISTE_PERSONA     },
];

type Tab = 'display' | 'models' | 'contexts';

const TAB_LABEL: Record<Tab, string> = {
    display:  'Affichage',
    models:   'Modèles IA',
    contexts: 'Contextes IA',
};

// ─── Atoms ────────────────────────────────────────────────────────────────

const ToggleSwitch: React.FC<{
    label: string;
    description?: string;
    value: boolean;
    onChange: (value: boolean) => void;
}> = ({ label, description, value, onChange }) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-brand-border/60 dark:border-dark-sec-border/60 last:border-0">
        <div className="min-w-0">
            <p className="text-sm font-medium text-brand-main dark:text-white">{label}</p>
            {description && (
                <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mt-0.5 leading-snug">{description}</p>
            )}
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => onChange(!value)}
            className={`relative shrink-0 w-10 h-[22px] rounded-full transition-colors duration-200 ${
                value ? 'bg-brand-main dark:bg-white' : 'bg-brand-border dark:bg-dark-sec-border'
            }`}
        >
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white dark:bg-brand-main shadow-sm transition-transform duration-200 ${
                value ? 'translate-x-[18px]' : 'translate-x-0'
            }`} />
        </button>
    </div>
);

const DensitySelector: React.FC<{
    value: DisplayDensity;
    onChange: (value: DisplayDensity) => void;
}> = ({ value, onChange }) => {
    const opts: Array<{ id: DisplayDensity; icon: React.ComponentType<{ className?: string }>; label: string }> = [
        { id: 'compact', icon: Minimize2, label: 'Compacte' },
        { id: 'normal',  icon: Minus,     label: 'Normale'  },
        { id: 'airy',    icon: Maximize2, label: 'Aérée'    },
    ];
    return (
        <div className="py-3 border-b border-brand-border/60 dark:border-dark-sec-border/60">
            <p className="text-sm font-medium text-brand-main dark:text-white mb-2">Densité des listes</p>
            <div className="flex gap-2">
                {opts.map(o => {
                    const Icon = o.icon;
                    const active = value === o.id;
                    return (
                        <button
                            key={o.id}
                            onClick={() => onChange(o.id)}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                active
                                    ? 'bg-brand-light border-brand-main text-brand-main dark:bg-dark-sec-bg dark:border-white dark:text-white'
                                    : 'bg-brand-light/40 border-brand-border text-brand-main/60 hover:text-brand-main dark:bg-dark-bg dark:border-dark-sec-border dark:text-dark-text/60 dark:hover:text-white'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {o.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const SectionTitle: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; count?: number }> = ({ icon: Icon, label, count }) => (
    <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-brand-main/40 dark:text-dark-text/40 flex items-center gap-1.5">
            <Icon className="w-3 h-3" />
            {label}
        </p>
        {typeof count === 'number' && (
            <span className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40">{count}</span>
        )}
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    isOpen, onClose, displayPrefs, onDisplayPrefsChange,
    contexts, onContextsChange,
    aiModels, onModelsChange,
    initialTab = 'display',
}) => {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab);

    // Reset active tab when panel opens to honor `initialTab` (callers may switch from one trigger to another).
    useEffect(() => {
        if (isOpen) setActiveTab(initialTab);
    }, [isOpen, initialTab]);

    // ── Edition state (sub-views inside Modèles / Contextes tabs)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Context edit state
    const [editCtxName, setEditCtxName] = useState('');
    const [editCtxDesc, setEditCtxDesc] = useState('');
    const [editCtxUsage, setEditCtxUsage] = useState<ContextUsage>(ContextUsage.REDACTEUR);

    // Model edit state
    const [editModel, setEditModel] = useState<Partial<AIModel>>({
        name: '', apiCode: '', cost: 'medium', provider: '', strengths: '', bestUseCases: '', textQuality: 3
    });

    const prefs = { ...DEFAULT_DISPLAY_PREFS, ...displayPrefs };
    const setPref = <K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => {
        onDisplayPrefsChange({ ...prefs, [key]: value });
    };

    // ── Reset sub-view state on close & on tab change
    useEffect(() => {
        if (!isOpen) {
            setEditingId(null);
            setIsCreating(false);
            setSelectedPersonaId(null);
        }
    }, [isOpen]);

    useEffect(() => {
        // Switching tabs always returns to root list
        setEditingId(null);
        setIsCreating(false);
        setSelectedPersonaId(null);
    }, [activeTab]);

    // ── Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (isSaving || isDeleting || deleteId) return;
            // First press: back to list ; second press: close panel
            if (editingId || isCreating || selectedPersonaId) {
                setEditingId(null);
                setIsCreating(false);
                setSelectedPersonaId(null);
            } else {
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose, editingId, isCreating, selectedPersonaId, isSaving, isDeleting, deleteId]);

    if (!isOpen) return null;

    // ── Handlers
    const handleEditContext = (ctx: ContextItem) => {
        setEditingId(ctx.id);
        setEditCtxName(ctx.name);
        setEditCtxDesc(ctx.description);
        setEditCtxUsage(ctx.usage || ContextUsage.REDACTEUR);
        setIsCreating(false);
        setSelectedPersonaId(null);
    };

    const handleCreateContext = () => {
        setEditingId(null);
        setEditCtxName('');
        setEditCtxDesc('');
        setEditCtxUsage(ContextUsage.REDACTEUR);
        setIsCreating(true);
        setSelectedPersonaId(null);
    };

    const handleEditModel = (model: AIModel) => {
        setEditingId(model.id);
        setEditModel(model);
        setIsCreating(false);
    };

    const handleCreateModel = () => {
        setEditingId(null);
        setIsCreating(true);
        setEditModel({ name: '', apiCode: '', cost: 'medium', provider: '', strengths: '', bestUseCases: '', textQuality: 3 });
    };

    const backToList = () => {
        setEditingId(null);
        setIsCreating(false);
        setSelectedPersonaId(null);
    };

    const handleSaveContext = async () => {
        setIsSaving(true);
        try {
            if (isCreating) {
                const newCtx = await NotionService.createContext(editCtxName, editCtxDesc, editCtxUsage);
                onContextsChange([...contexts, newCtx]);
                setEditingId(newCtx.id);
                setIsCreating(false);
            } else if (editingId) {
                const updatedCtx = { id: editingId, name: editCtxName, description: editCtxDesc, usage: editCtxUsage };
                await NotionService.updateContext(updatedCtx);
                onContextsChange(contexts.map(c => c.id === editingId ? updatedCtx : c));
            }
        } catch (e) { console.error(e); } finally { setIsSaving(false); }
    };

    const handleSaveModel = async () => {
        setIsSaving(true);
        try {
            if (isCreating) {
                const newModel = await NotionService.createModel(editModel);
                onModelsChange([...aiModels, newModel]);
                setEditingId(newModel.id);
                setIsCreating(false);
            } else if (editingId) {
                const updatedModel = { ...editModel, id: editingId } as AIModel;
                await NotionService.updateModel(updatedModel);
                onModelsChange(aiModels.map(m => m.id === editingId ? updatedModel : m));
            }
        } catch (e) { console.error(e); } finally { setIsSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            if (activeTab === 'contexts') {
                await NotionService.deleteContext(deleteId);
                onContextsChange(contexts.filter(c => c.id !== deleteId));
            } else if (activeTab === 'models') {
                await NotionService.deleteModel(deleteId);
                onModelsChange(aiModels.filter(m => m.id !== deleteId));
            }
            if (editingId === deleteId) backToList();
        } catch (e) { console.error(e); } finally { setIsDeleting(false); setDeleteId(null); }
    };

    // ── Sub-view computation
    const isInModelEditor   = activeTab === 'models'   && (isCreating || !!editingId);
    const isInContextEditor = activeTab === 'contexts' && (isCreating || !!editingId);
    const isInPersonaView   = activeTab === 'contexts' && !!selectedPersonaId;
    const isInSubView       = isInModelEditor || isInContextEditor || isInPersonaView;

    // Breadcrumb sub-title
    const getBreadcrumbLabel = (): string => {
        if (isInPersonaView) {
            return HARDCODED_PERSONAS.find(p => p.id === selectedPersonaId)?.name || 'Persona';
        }
        if (isInContextEditor) {
            return isCreating ? 'Nouveau contexte' : 'Modifier le contexte';
        }
        if (isInModelEditor) {
            return isCreating ? 'Nouveau modèle' : 'Modifier le modèle';
        }
        return '';
    };

    const TABS: Array<{ id: Tab; icon: React.ComponentType<{ className?: string }>; label: string }> = [
        { id: 'display',  icon: SlidersHorizontal, label: 'Affichage'    },
        { id: 'models',   icon: Cpu,               label: 'Modèles IA'   },
        { id: 'contexts', icon: Brain,             label: 'Contextes IA' },
    ];

    return (
        <>
            <div
                className="fixed inset-0 z-50 bg-black/25 dark:bg-black/50 backdrop-blur-[1px] animate-in fade-in duration-150"
                onClick={onClose}
            />
            <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[400px] bg-white dark:bg-dark-surface border-l border-brand-border dark:border-dark-sec-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">

                {/* HEADER */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-dark-sec-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-light dark:bg-dark-bg flex items-center justify-center">
                            <SlidersHorizontal className="w-4 h-4 text-brand-main dark:text-white" />
                        </div>
                        <h2 className="font-bold text-sm text-brand-main dark:text-white">Réglages</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main/50 dark:text-dark-text/50 hover:text-brand-main dark:hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* TABS — always visible */}
                <div className="flex gap-1 px-4 pt-3 shrink-0">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
                                    active
                                        ? 'text-brand-main dark:text-white border-brand-main dark:border-white bg-brand-light dark:bg-dark-bg'
                                        : 'text-brand-main/50 dark:text-dark-text/50 border-transparent hover:text-brand-main dark:hover:text-white'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                <div className="w-full h-px bg-brand-border dark:bg-dark-sec-border shrink-0" />

                {/* BREADCRUMB BAR — only in sub-view */}
                {isInSubView && (
                    <div className="px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light/40 dark:bg-dark-bg/40 shrink-0 flex items-center gap-2 text-xs">
                        <button
                            onClick={backToList}
                            className="flex items-center gap-1 text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white transition-colors font-medium"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="text-brand-main/70 dark:text-dark-text/70">Réglages</span>
                            <span className="text-brand-main/30 dark:text-dark-text/30">/</span>
                            <span className="text-brand-main/70 dark:text-dark-text/70">{TAB_LABEL[activeTab]}</span>
                        </button>
                        <span className="text-brand-main/30 dark:text-dark-text/30">/</span>
                        <span className="text-brand-main dark:text-white font-semibold truncate">
                            {getBreadcrumbLabel()}
                        </span>
                    </div>
                )}

                {/* BODY */}
                <div className="flex-1 overflow-y-auto">

                    {/* ─── DISPLAY TAB ─── */}
                    {activeTab === 'display' && (
                        <div className="p-5 animate-in fade-in duration-200">
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-main/40 dark:text-dark-text/40 mb-3">
                                Espace Contenus
                            </p>
                            <DensitySelector
                                value={prefs.density}
                                onChange={v => setPref('density', v)}
                            />
                            <ToggleSwitch
                                label="Bande verdict colorée"
                                description="Trait coloré à gauche de chaque idée"
                                value={prefs.showVerdictStripe}
                                onChange={v => setPref('showVerdictStripe', v)}
                            />
                            <ToggleSwitch
                                label="Plateformes"
                                description="Badges LinkedIn, Instagram, etc."
                                value={prefs.showPlatforms}
                                onChange={v => setPref('showPlatforms', v)}
                            />
                            <ToggleSwitch
                                label="Niveau d'analyse"
                                description="Direct, Légère, Complète"
                                value={prefs.showDepth}
                                onChange={v => setPref('showDepth', v)}
                            />
                            <ToggleSwitch
                                label="Offre cible"
                                description="Standard, Seuil, Transverse"
                                value={prefs.showOffer}
                                onChange={v => setPref('showOffer', v)}
                            />
                        </div>
                    )}

                    {/* ─── MODELS TAB ─── */}
                    {activeTab === 'models' && !isInModelEditor && (
                        <div className="p-5 animate-in fade-in duration-200 space-y-3">
                            <SectionTitle icon={Cpu} label="Modèles IA" count={aiModels.length} />

                            <button
                                onClick={handleCreateModel}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-brand-border dark:border-dark-sec-border text-brand-main/60 dark:text-dark-text/60 hover:border-brand-main hover:text-brand-main dark:hover:text-white text-sm font-bold transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Ajouter un modèle
                            </button>

                            {aiModels.length === 0 ? (
                                <p className="text-center py-8 text-brand-main/40 dark:text-dark-text/40 text-xs italic">
                                    Aucun modèle. Cliquez ci-dessus pour en créer un.
                                </p>
                            ) : (
                                aiModels.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => handleEditModel(m)}
                                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 hover:shadow-sm transition-all"
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <h3 className="font-semibold text-sm text-brand-main dark:text-white truncate">{m.name}</h3>
                                            {m.provider && (
                                                <span className="shrink-0 text-[10px] bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                    {m.provider}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60 font-mono truncate opacity-70">{m.apiCode}</p>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* ─── MODEL EDITOR ─── */}
                    {activeTab === 'models' && isInModelEditor && (
                        <div className="p-5 animate-in fade-in duration-200 space-y-4">
                            {editingId && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setDeleteId(editingId)}
                                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Supprimer
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Nom commercial</label>
                                <input
                                    type="text"
                                    value={editModel.name || ''}
                                    onChange={(e) => setEditModel({ ...editModel, name: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm font-semibold text-brand-main dark:text-white outline-hidden placeholder-brand-main/30 transition-colors"
                                    placeholder="Ex : GPT-5.2 Pro"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Code API 1min.AI</label>
                                <input
                                    type="text"
                                    value={editModel.apiCode || ''}
                                    onChange={(e) => setEditModel({ ...editModel, apiCode: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg font-mono text-xs text-brand-main dark:text-white outline-hidden transition-colors"
                                    placeholder="ex : gpt-5.2-pro"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Fournisseur</label>
                                <input
                                    type="text"
                                    value={editModel.provider || ''}
                                    onChange={(e) => setEditModel({ ...editModel, provider: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm text-brand-main dark:text-white outline-hidden transition-colors"
                                    placeholder="ex : OpenAI"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Coût / Crédits</label>
                                <select
                                    value={editModel.cost || 'medium'}
                                    onChange={(e) => setEditModel({ ...editModel, cost: e.target.value as any })}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm text-brand-main dark:text-white outline-hidden cursor-pointer transition-colors"
                                >
                                    <option value="low">Faible</option>
                                    <option value="low_medium">Moyen-faible</option>
                                    <option value="medium">Moyen</option>
                                    <option value="high">Élevé</option>
                                    <option value="very_high">Très élevé (Premium)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Qualité rédaction (1-5)</label>
                                <div className="flex gap-1.5 p-2 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg">
                                    {[1, 2, 3, 4, 5].map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setEditModel({ ...editModel, textQuality: v })}
                                            className={`flex-1 h-8 rounded-md text-sm font-bold transition-all ${
                                                editModel.textQuality === v
                                                    ? 'bg-brand-main text-white shadow-sm'
                                                    : 'hover:bg-brand-border dark:hover:bg-dark-sec-border text-brand-main dark:text-white'
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Forces & cas d'usage</label>
                                <textarea
                                    value={editModel.strengths || ''}
                                    onChange={(e) => setEditModel({ ...editModel, strengths: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm text-brand-main dark:text-white outline-hidden resize-none min-h-[100px] transition-colors leading-relaxed"
                                    placeholder="Ex : Excelle dans la structure longue et l'analyse…"
                                />
                            </div>
                        </div>
                    )}

                    {/* ─── CONTEXTS TAB ─── */}
                    {activeTab === 'contexts' && !isInSubView && (
                        <div className="p-5 animate-in fade-in duration-200 space-y-6">

                            {/* Section Personas (read-only) */}
                            <section>
                                <SectionTitle icon={User} label="Personas (lecture seule)" count={HARDCODED_PERSONAS.length} />
                                <div className="space-y-2">
                                    {HARDCODED_PERSONAS.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedPersonaId(p.id)}
                                            className="w-full text-left p-3 rounded-xl bg-white dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-sm transition-all"
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                <h3 className="font-semibold text-sm text-brand-main dark:text-white truncate">{p.name}</h3>
                                                <span className="shrink-0 text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                    {p.usage}
                                                </span>
                                            </div>
                                            <p className="text-xs text-brand-main/50 dark:text-dark-text/50 flex items-center gap-1">
                                                <Eye className="w-3 h-3" /> Lecture seule
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Section Contextes additionnels (CRUD) */}
                            <section>
                                <SectionTitle icon={Brain} label="Contextes additionnels" count={contexts.length} />

                                <button
                                    onClick={handleCreateContext}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-brand-border dark:border-dark-sec-border text-brand-main/60 dark:text-dark-text/60 hover:border-brand-main hover:text-brand-main dark:hover:text-white text-sm font-bold transition-all mb-3"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Créer un contexte
                                </button>

                                {contexts.length === 0 ? (
                                    <p className="text-center py-6 text-brand-main/40 dark:text-dark-text/40 text-xs italic">
                                        Aucun contexte additionnel.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {contexts.map(ctx => (
                                            <button
                                                key={ctx.id}
                                                onClick={() => handleEditContext(ctx)}
                                                className="w-full text-left p-3 rounded-xl bg-white dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 hover:shadow-sm transition-all"
                                            >
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h3 className="font-semibold text-sm text-brand-main dark:text-white truncate">{ctx.name}</h3>
                                                    {ctx.usage && (
                                                        <span className="shrink-0 text-[10px] bg-brand-main/10 text-brand-main dark:bg-white/10 dark:text-white px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                            {ctx.usage}
                                                        </span>
                                                    )}
                                                </div>
                                                {ctx.description && (
                                                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-2 leading-relaxed">{ctx.description}</p>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {/* ─── PERSONA READ-ONLY VIEW ─── */}
                    {isInPersonaView && (() => {
                        const persona = HARDCODED_PERSONAS.find(p => p.id === selectedPersonaId);
                        if (!persona) return null;
                        return (
                            <div className="p-5 animate-in fade-in duration-200 space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full font-bold">
                                        {persona.usage}
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] text-brand-main/50 dark:text-dark-text/50">
                                        <Eye className="w-3 h-3" /> Lecture seule
                                    </span>
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-brand-main/40 dark:text-dark-text/40 mt-3 mb-2">
                                    Prompt système
                                </p>
                                <pre className="whitespace-pre-wrap text-xs text-brand-main dark:text-dark-text leading-relaxed font-sans bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-xl p-4">
                                    {persona.prompt}
                                </pre>
                            </div>
                        );
                    })()}

                    {/* ─── CONTEXT EDITOR ─── */}
                    {isInContextEditor && (
                        <div className="p-5 animate-in fade-in duration-200 space-y-4">
                            {editingId && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setDeleteId(editingId)}
                                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Supprimer
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Nom du contexte</label>
                                <input
                                    type="text"
                                    value={editCtxName}
                                    onChange={(e) => setEditCtxName(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm font-semibold text-brand-main dark:text-white outline-hidden placeholder-brand-main/30 transition-colors"
                                    placeholder="Ex : Contexte LinkedIn Pro"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Rattaché au persona</label>
                                <select
                                    value={editCtxUsage}
                                    onChange={(e) => setEditCtxUsage(e.target.value as ContextUsage)}
                                    className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main rounded-lg text-sm text-brand-main dark:text-white outline-hidden cursor-pointer transition-colors"
                                >
                                    <option value={ContextUsage.REDACTEUR}>Rédacteur</option>
                                    <option value={ContextUsage.ANALYSTE}>Analyste</option>
                                    <option value={ContextUsage.INTERVIEWER}>Interviewer</option>
                                    <option value={ContextUsage.ARTISTE}>Artiste</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2">Contenu du contexte</label>
                                <div className="border border-brand-border dark:border-dark-sec-border rounded-xl bg-brand-light dark:bg-dark-bg focus-within:border-brand-main overflow-hidden flex flex-col min-h-[260px] transition-colors">
                                    <MarkdownToolbar />
                                    <RichTextarea
                                        value={editCtxDesc}
                                        onChange={setEditCtxDesc}
                                        className="w-full flex-1 p-4 text-sm leading-relaxed"
                                        placeholder="Informations complémentaires à injecter dans le prompt…"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER — save button only in editor sub-views */}
                {(isInModelEditor || isInContextEditor) && (
                    <div className="px-5 py-4 border-t border-brand-border dark:border-dark-sec-border bg-brand-light/60 dark:bg-dark-bg/60 flex justify-end shrink-0">
                        <button
                            onClick={isInModelEditor ? handleSaveModel : handleSaveContext}
                            disabled={isSaving || (isInModelEditor ? !(editModel.name || '').trim() : !editCtxName.trim())}
                            className="flex items-center gap-2 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm shadow-brand-main/25 transition-colors disabled:opacity-40"
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {isCreating ? 'Créer' : 'Enregistrer'}
                        </button>
                    </div>
                )}
            </aside>

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
                title="Confirmer la suppression ?"
                message="Cette action est irréversible dans Notion."
                isDestructive={true}
                isLoading={isDeleting}
            />
        </>
    );
};

export default SettingsPanel;
