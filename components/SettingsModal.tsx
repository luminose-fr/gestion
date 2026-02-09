import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Settings, Loader2, Brain, Cpu, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ContextItem, AIModel } from '../types';
import * as NotionService from '../services/notionService';
import { ConfirmModal } from './CommonModals';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';
import { useEscapeClose } from './hooks/useEscapeClose';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contexts: ContextItem[];
  onContextsChange: (contexts: ContextItem[]) => void;
  aiModels: AIModel[];
  onModelsChange: (models: AIModel[]) => void;
}

type MenuCategory = 'contexts' | 'models' | null;

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, contexts, onContextsChange, aiModels = [], onModelsChange 
}) => {
  // Navigation State
  const [activeCategory, setActiveCategory] = useState<MenuCategory>(null);
  
  // Selection / Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Operations State
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Context Edit State
  const [editCtxName, setEditCtxName] = useState("");
  const [editCtxDesc, setEditCtxDesc] = useState("");

  // Model Edit State
  const [editModel, setEditModel] = useState<Partial<AIModel>>({
      name: "", apiCode: "", cost: "medium", provider: "", strengths: "", bestUseCases: "", textQuality: 3
  });

  // Reset state on close
  useEffect(() => {
      if (!isOpen) {
          setActiveCategory(null);
          setEditingId(null);
          setIsCreating(false);
      }
  }, [isOpen]);

  useEscapeClose(isOpen, onClose, isSaving || isDeleting || !!deleteId);

  if (!isOpen) return null;

  // --- NAVIGATION HANDLERS ---
  const handleCategorySelect = (category: MenuCategory) => {
      setActiveCategory(category);
      setEditingId(null);
      setIsCreating(false);
  };

  const handleBackToMenu = () => {
      setActiveCategory(null);
      setEditingId(null);
      setIsCreating(false);
  };

  // --- ITEM SELECTION HANDLERS ---
  const handleEditContext = (ctx: ContextItem) => {
    setEditingId(ctx.id); 
    setEditCtxName(ctx.name); 
    setEditCtxDesc(ctx.description); 
    setIsCreating(false);
  };

  const handleCreateContext = () => {
    setEditingId(null); 
    setEditCtxName(""); 
    setEditCtxDesc(""); 
    setIsCreating(true);
  };

  const handleEditModel = (model: AIModel) => {
      setEditingId(model.id); 
      setEditModel(model); 
      setIsCreating(false);
  };

  const handleCreateModel = () => {
      setEditingId(null); 
      setIsCreating(true);
      setEditModel({ name: "", apiCode: "", cost: "medium", provider: "", strengths: "", bestUseCases: "", textQuality: 3 });
  };

  // --- SAVE HANDLERS ---
  const handleSaveContext = async () => {
    setIsSaving(true);
    try {
        if (isCreating) {
            const newCtx = await NotionService.createContext(editCtxName, editCtxDesc);
            onContextsChange([...contexts, newCtx]); 
            setEditingId(newCtx.id); // Select new item
            setIsCreating(false);
        } else if (editingId) {
            const updatedCtx = { id: editingId, name: editCtxName, description: editCtxDesc };
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
              setEditingId(newModel.id); // Select new item
              setIsCreating(false);
          } else if (editingId) {
              const updatedModel = { ...editModel, id: editingId } as AIModel;
              await NotionService.updateModel(updatedModel);
              onModelsChange(aiModels.map(m => m.id === editingId ? updatedModel : m));
          }
      } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleConfirmDelete = async () => {
      if (deleteId) {
          setIsDeleting(true);
          try {
              if (activeCategory === 'contexts') {
                  await NotionService.deleteContext(deleteId);
                  onContextsChange(contexts.filter(c => c.id !== deleteId));
              } else {
                  await NotionService.deleteModel(deleteId);
                  onModelsChange(aiModels.filter(m => m.id !== deleteId));
              }
              if (editingId === deleteId) {
                  setEditingId(null);
                  setIsCreating(false);
              }
          } catch (e) { console.error(e); } finally { setIsDeleting(false); setDeleteId(null); }
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      
      {/* MAIN CONTAINER: Hauteur fixe relative au device */}
      <div 
        className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] min-h-[500px] max-h-[900px] flex flex-col border border-brand-border dark:border-dark-sec-border overflow-hidden transition-all" 
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-sec-border flex-shrink-0 bg-white dark:bg-dark-surface z-10">
          <div className="flex items-center gap-3">
             <div className="bg-brand-light dark:bg-dark-sec-bg p-2 rounded-xl">
                <Settings className="w-5 h-5 text-brand-main dark:text-white" />
             </div>
             <div>
                 <h2 className="text-lg font-bold text-brand-main dark:text-white leading-tight">Configuration</h2>
                 <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Gérez vos personas et vos modèles</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-full transition-colors text-brand-main dark:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT AREA (Split View) */}
        <div className="flex flex-1 overflow-hidden relative">
            
            {/* LEFT SIDEBAR (Sliding Navigation) */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg flex flex-col overflow-hidden relative">
                
                {/* SLIDER CONTAINER */}
                <div 
                    className="flex w-[200%] h-full transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
                    style={{ transform: activeCategory ? 'translateX(-50%)' : 'translateX(0)' }}
                >
                    
                    {/* LEVEL 0: ROOT MENU */}
                    <div className="w-1/2 h-full p-4 space-y-2 overflow-y-auto">
                        <div className="text-xs font-bold text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest px-2 mb-2">Menu Principal</div>
                        
                        <button 
                            onClick={() => handleCategorySelect('contexts')}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-dark-surface hover:bg-white/80 dark:hover:bg-dark-surface/80 rounded-xl shadow-sm border border-brand-border dark:border-dark-sec-border transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-300">
                                    <Brain className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-brand-main dark:text-white">Contextes</span>
                                    <span className="text-xs text-brand-main/50 dark:text-dark-text/50">Personas & Voix</span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-brand-main/30 group-hover:text-brand-main/60 transition-colors" />
                        </button>

                        <button 
                            onClick={() => handleCategorySelect('models')}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-dark-surface hover:bg-white/80 dark:hover:bg-dark-surface/80 rounded-xl shadow-sm border border-brand-border dark:border-dark-sec-border transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-300">
                                    <Cpu className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-brand-main dark:text-white">Modèles IA (1min.ai)</span>
                                    <span className="text-xs text-brand-main/50 dark:text-dark-text/50">Clés API & Configs</span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-brand-main/30 group-hover:text-brand-main/60 transition-colors" />
                        </button>
                    </div>

                    {/* LEVEL 1: LIST VIEW */}
                    <div className="w-1/2 h-full flex flex-col bg-brand-light dark:bg-dark-bg">
                        {/* List Header with Back & Add */}
                        <div className="p-4 border-b border-brand-border dark:border-dark-sec-border flex items-center gap-3 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur-sm z-10 sticky top-0">
                            <button 
                                onClick={handleBackToMenu}
                                className="flex items-center gap-1 text-sm font-medium text-brand-main/60 hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" /> Retour
                            </button>
                            <div className="flex-1 text-center font-bold text-brand-main dark:text-white">
                                {activeCategory === 'contexts' ? 'Contextes' : 'Modèles'}
                            </div>
                            <div className="w-16"></div> {/* Spacer for balance if needed, or actions */}
                        </div>

                        {/* ADD BUTTON (At the top of the list area) */}
                        <div className="p-4 pb-2">
                            <button 
                                onClick={activeCategory === 'contexts' ? handleCreateContext : handleCreateModel}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed font-bold transition-all
                                    ${isCreating 
                                        ? 'border-brand-main bg-brand-main/5 text-brand-main' 
                                        : 'border-brand-border dark:border-dark-sec-border text-brand-main/60 hover:border-brand-main hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white'}
                                `}
                            >
                                <Plus className="w-4 h-4" /> 
                                {activeCategory === 'contexts' ? 'Créer un Persona' : 'Ajouter un Modèle'}
                            </button>
                        </div>

                        {/* SCROLLABLE LIST */}
                        <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
                            {activeCategory === 'contexts' ? (
                                (contexts || []).map(ctx => (
                                    <div 
                                        key={ctx.id} 
                                        onClick={() => handleEditContext(ctx)} 
                                        className={`p-3 rounded-lg cursor-pointer transition-all border relative
                                            ${editingId === ctx.id && !isCreating
                                                ? 'bg-white dark:bg-dark-surface border-brand-main shadow-md' 
                                                : 'bg-white/50 dark:bg-dark-surface/50 border-transparent hover:bg-white dark:hover:bg-dark-surface'}
                                        `}
                                    >
                                        <h3 className="font-semibold text-sm truncate text-brand-main dark:text-white">{ctx.name}</h3>
                                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-1 mt-0.5">{ctx.description}</p>
                                        {editingId === ctx.id && !isCreating && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-main"></div>}
                                    </div>
                                ))
                            ) : (
                                (aiModels || []).map(m => (
                                    <div 
                                        key={m.id} 
                                        onClick={() => handleEditModel(m)} 
                                        className={`p-3 rounded-lg cursor-pointer transition-all border relative
                                            ${editingId === m.id && !isCreating
                                                ? 'bg-white dark:bg-dark-surface border-brand-main shadow-md' 
                                                : 'bg-white/50 dark:bg-dark-surface/50 border-transparent hover:bg-white dark:hover:bg-dark-surface'}
                                        `}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="font-semibold text-sm truncate text-brand-main dark:text-white">{m.name}</h3>
                                            <span className="text-[10px] bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border px-1.5 rounded-full font-bold">{m.provider}</span>
                                        </div>
                                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60 font-mono mt-1 truncate opacity-70">{m.apiCode}</p>
                                        {editingId === m.id && !isCreating && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-main"></div>}
                                    </div>
                                ))
                            )}
                            
                            {/* Empty State */}
                            {((activeCategory === 'contexts' && contexts.length === 0) || (activeCategory === 'models' && aiModels.length === 0)) && (
                                <div className="text-center py-8 text-brand-main/40 dark:text-dark-text/40 text-sm italic">
                                    Aucun élément.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT EDITOR (Main Content) */}
            <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface overflow-hidden">
                {isCreating || editingId ? (
                    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Editor Header */}
                        <div className="px-8 py-6 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between">
                            <h3 className="text-xl font-bold text-brand-main dark:text-white">
                                {isCreating 
                                    ? (activeCategory === 'contexts' ? 'Nouveau Persona' : 'Nouveau Modèle') 
                                    : (activeCategory === 'contexts' ? 'Modifier Persona' : 'Modifier Modèle')
                                }
                            </h3>
                            {editingId && (
                                <button 
                                    onClick={() => setDeleteId(editingId)} 
                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Editor Form - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-6">
                            {activeCategory === 'contexts' ? (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-widest mb-2">Nom du Persona</label>
                                        <input 
                                            type="text" 
                                            value={editCtxName} 
                                            onChange={(e) => setEditCtxName(e.target.value)} 
                                            className="w-full text-xl font-bold border-b-2 border-brand-border dark:border-dark-sec-border py-2 bg-transparent focus:border-brand-main dark:focus:border-brand-light outline-none text-brand-main dark:text-white placeholder-brand-main/30" 
                                            placeholder="Ex: Rédacteur LinkedIn Pro" 
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-widest mb-2">Prompt Système</label>
                                        <div className="flex-1 border border-brand-border dark:border-dark-sec-border rounded-xl bg-brand-light dark:bg-dark-bg focus-within:ring-2 focus-within:ring-brand-main overflow-hidden flex flex-col min-h-[300px]">
                                            <MarkdownToolbar />
                                            <RichTextarea 
                                                value={editCtxDesc} 
                                                onChange={setEditCtxDesc} 
                                                className="w-full flex-1 p-6" 
                                                placeholder="Décrivez comment l'IA doit se comporter, son ton, son style..." 
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-widest mb-2">Nom commercial</label>
                                        <input type="text" value={editModel.name} onChange={(e) => setEditModel({...editModel, name: e.target.value})} className="w-full text-xl font-bold border-b-2 border-brand-border dark:border-dark-sec-border py-2 bg-transparent focus:border-brand-main outline-none text-brand-main dark:text-white" placeholder="Ex: GPT-5.2 Pro" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase mb-2">Code API 1min.AI</label>
                                        <input type="text" value={editModel.apiCode} onChange={(e) => setEditModel({...editModel, apiCode: e.target.value})} className="w-full p-3 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg font-mono text-sm text-brand-main dark:text-white" placeholder="ex: gpt-5.2-pro" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase mb-2">Fournisseur</label>
                                        <input type="text" value={editModel.provider} onChange={(e) => setEditModel({...editModel, provider: e.target.value})} className="w-full p-3 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg text-sm text-brand-main dark:text-white" placeholder="ex: OpenAI" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase mb-2">Coût / Crédits</label>
                                        <select value={editModel.cost} onChange={(e) => setEditModel({...editModel, cost: e.target.value as any})} className="w-full p-3 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg text-sm text-brand-main dark:text-white outline-none">
                                            <option value="low">Faible</option>
                                            <option value="low_medium">Moyen-Faible</option>
                                            <option value="medium">Moyen</option>
                                            <option value="high">Élevé</option>
                                            <option value="very_high">Très Élevé (Premium)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase mb-2">Qualité Rédaction (1-5)</label>
                                        <div className="flex gap-2 p-3 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg">
                                            {[1,2,3,4,5].map(v => (
                                                <button key={v} onClick={() => setEditModel({...editModel, textQuality: v})} className={`w-8 h-8 rounded flex items-center justify-center transition-all font-bold ${editModel.textQuality === v ? 'bg-brand-main text-white' : 'hover:bg-brand-border dark:hover:bg-white/10 text-brand-main dark:text-white'}`}>{v}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase mb-2">Forces & Cas d'usage</label>
                                        <textarea value={editModel.strengths} onChange={(e) => setEditModel({...editModel, strengths: e.target.value})} className="w-full p-4 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg text-sm min-h-[120px] text-brand-main dark:text-white" placeholder="Ex: Excelle dans la structure longue et l'analyse..." />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Editor Footer */}
                        <div className="p-6 border-t border-brand-border dark:border-dark-sec-border flex justify-end bg-brand-light/30 dark:bg-dark-bg/30">
                            <button 
                                onClick={activeCategory === 'contexts' ? handleSaveContext : handleSaveModel} 
                                disabled={isSaving} 
                                className="flex items-center gap-2 bg-brand-main hover:bg-brand-hover text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-brand-main/20 transition-all disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                <span>{isCreating ? 'Créer' : 'Enregistrer les modifications'}</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    // EMPTY STATE (Right Pane)
                    <div className="flex-1 flex flex-col items-center justify-center text-brand-main/30 dark:text-dark-text/30 space-y-6 animate-in fade-in zoom-in duration-300">
                        {activeCategory === 'contexts' ? (
                            <div className="w-24 h-24 rounded-full bg-brand-light dark:bg-dark-bg flex items-center justify-center">
                                <Brain className="w-12 h-12 opacity-50" />
                            </div>
                        ) : activeCategory === 'models' ? (
                            <div className="w-24 h-24 rounded-full bg-brand-light dark:bg-dark-bg flex items-center justify-center">
                                <Cpu className="w-12 h-12 opacity-50" />
                            </div>
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-brand-light dark:bg-dark-bg flex items-center justify-center">
                                <Settings className="w-12 h-12 opacity-50 animate-spin-slow" />
                            </div>
                        )}
                        <div className="text-center">
                            <p className="text-lg font-bold">
                                {!activeCategory ? "Bienvenue dans les paramètres" : "Sélectionnez un élément"}
                            </p>
                            <p className="text-sm opacity-70 mt-1 max-w-xs mx-auto">
                                {!activeCategory 
                                    ? "Choisissez une catégorie dans le menu de gauche pour commencer." 
                                    : "Cliquez sur un élément de la liste pour le modifier ou utilisez le bouton 'Ajouter'."}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleConfirmDelete} title="Confirmer la suppression ?" message="Cette action est irréversible dans Notion." isDestructive={true} isLoading={isDeleting} />
    </div>
  );
};

export default SettingsModal;
