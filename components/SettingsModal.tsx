import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Save, Settings, Loader2, Brain, Cpu, Sparkles, Star } from 'lucide-react';
import { ContextItem, AIModel } from '../types';
import * as NotionService from '../services/notionService';
import { ConfirmModal, CharCounter } from './CommonModals';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contexts: ContextItem[];
  onContextsChange: (contexts: ContextItem[]) => void;
  // Ajout des props manquantes
  aiModels: AIModel[];
  onModelsChange: (models: AIModel[]) => void;
}

type Tab = 'contexts' | 'models';

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, contexts, onContextsChange, aiModels = [], onModelsChange 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('contexts');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
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

  if (!isOpen) return null;

  // --- CONTEXT HANDLERS ---
  const handleEditContext = (ctx: ContextItem) => {
    setEditingId(ctx.id); setEditCtxName(ctx.name); setEditCtxDesc(ctx.description); setIsCreating(false);
  };
  const handleCreateContext = () => {
    setEditingId(null); setEditCtxName(""); setEditCtxDesc(""); setIsCreating(true);
  };
  const handleSaveContext = async () => {
    setIsSaving(true);
    try {
        if (isCreating) {
            const newCtx = await NotionService.createContext(editCtxName, editCtxDesc);
            onContextsChange([...contexts, newCtx]); setIsCreating(false);
        } else if (editingId) {
            const updatedCtx = { id: editingId, name: editCtxName, description: editCtxDesc };
            await NotionService.updateContext(updatedCtx);
            onContextsChange(contexts.map(c => c.id === editingId ? updatedCtx : c)); setEditingId(null);
        }
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  // --- MODEL HANDLERS ---
  const handleEditModel = (model: AIModel) => {
      setEditingId(model.id); setEditModel(model); setIsCreating(false);
  };
  const handleCreateModel = () => {
      setEditingId(null); setIsCreating(true);
      setEditModel({ name: "", apiCode: "", cost: "medium", provider: "", strengths: "", bestUseCases: "", textQuality: 3 });
  };
  const handleSaveModel = async () => {
      setIsSaving(true);
      try {
          if (isCreating) {
              const newModel = await NotionService.createModel(editModel);
              onModelsChange([...aiModels, newModel]); setIsCreating(false);
          } else if (editingId) {
              const updatedModel = { ...editModel, id: editingId } as AIModel;
              await NotionService.updateModel(updatedModel);
              onModelsChange(aiModels.map(m => m.id === editingId ? updatedModel : m)); setEditingId(null);
          }
      } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleConfirmDelete = async () => {
      if (deleteId) {
          setIsDeleting(true);
          try {
              if (activeTab === 'contexts') {
                  await NotionService.deleteContext(deleteId);
                  onContextsChange(contexts.filter(c => c.id !== deleteId));
              } else {
                  await NotionService.deleteModel(deleteId);
                  onModelsChange(aiModels.filter(m => m.id !== deleteId));
              }
              if (editingId === deleteId) setEditingId(null);
          } catch (e) { console.error(e); } finally { setIsDeleting(false); setDeleteId(null); }
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-brand-border dark:border-dark-sec-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        
        <div className="flex items-center justify-between p-6 border-b border-brand-border flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="bg-brand-light dark:bg-dark-sec-bg p-2 rounded-lg"><Settings className="w-5 h-5 text-brand-main" /></div>
             <div><h2 className="text-xl font-bold text-brand-main dark:text-white">Paramètres IA</h2><p className="text-sm text-brand-main/60 dark:text-dark-text/60">Configurez vos voix et vos modèles</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-light rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-brand-border bg-brand-light dark:bg-dark-bg flex flex-col">
                <div className="p-2 space-y-1">
                    <button onClick={() => { setActiveTab('contexts'); setEditingId(null); setIsCreating(false); }} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'contexts' ? 'bg-brand-main text-white shadow-md' : 'text-brand-main/70 hover:bg-white'}`}>
                        <Brain className="w-4 h-4" /> <span>Personas (Contextes)</span>
                    </button>
                    <button onClick={() => { setActiveTab('models'); setEditingId(null); setIsCreating(false); }} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'models' ? 'bg-brand-main text-white shadow-md' : 'text-brand-main/70 hover:bg-white'}`}>
                        <Cpu className="w-4 h-4" /> <span>Modèles IA (API)</span>
                    </button>
                </div>

                <div className="mt-4 p-4 border-t border-brand-border">
                    <button onClick={activeTab === 'contexts' ? handleCreateContext : handleCreateModel} className="w-full flex items-center justify-center gap-2 bg-white border-2 border-brand-border hover:border-brand-main text-brand-main py-2 rounded-lg font-medium text-sm transition-all shadow-sm">
                        <Plus className="w-4 h-4" /> <span>{activeTab === 'contexts' ? 'Nouveau Persona' : 'Ajouter Modèle'}</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {activeTab === 'contexts' ? (
                        (contexts || []).map(ctx => (
                            <div key={ctx.id} onClick={() => handleEditContext(ctx)} className={`p-3 rounded-lg cursor-pointer transition-all border ${editingId === ctx.id ? 'bg-white border-brand-main shadow-sm' : 'border-transparent hover:bg-white/50'}`}>
                                <h3 className="font-semibold text-sm truncate">{ctx.name}</h3>
                                <p className="text-xs text-brand-main/60 line-clamp-1">{ctx.description}</p>
                            </div>
                        ))
                    ) : (
                        (aiModels || []).map(m => (
                            <div key={m.id} onClick={() => handleEditModel(m)} className={`p-3 rounded-lg cursor-pointer transition-all border ${editingId === m.id ? 'bg-white border-brand-main shadow-sm' : 'border-transparent hover:bg-white/50'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-semibold text-sm truncate">{m.name}</h3>
                                    <span className="text-[10px] bg-brand-light px-1.5 rounded-full font-bold">{m.provider}</span>
                                </div>
                                <p className="text-xs text-brand-main/60 font-mono mt-0.5">{m.apiCode}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Area */}
            <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface p-6 overflow-y-auto">
                {isCreating || editingId ? (
                    <div className="space-y-6">
                        {activeTab === 'contexts' ? (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase tracking-widest mb-1.5">Nom du Persona</label>
                                    <input type="text" value={editCtxName} onChange={(e) => setEditCtxName(e.target.value)} className="w-full text-lg font-bold border-b border-brand-border py-2 bg-transparent focus:border-brand-main outline-none" placeholder="Ex: Rédacteur LinkedIn Pro" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase tracking-widest mb-1.5">Prompt Système</label>
                                    <div className="border border-brand-border rounded-xl bg-brand-light dark:bg-dark-bg focus-within:ring-2 focus-within:ring-brand-main overflow-hidden">
                                        <MarkdownToolbar />
                                        <RichTextarea value={editCtxDesc} onChange={setEditCtxDesc} className="w-full min-h-[300px] p-4" placeholder="Dites à l'IA qui elle est et comment elle doit s'exprimer..." />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase tracking-widest mb-1.5">Nom commercial</label>
                                    <input type="text" value={editModel.name} onChange={(e) => setEditModel({...editModel, name: e.target.value})} className="w-full text-lg font-bold border-b border-brand-border py-2 bg-transparent focus:border-brand-main outline-none" placeholder="Ex: GPT-5.2 Pro" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase mb-1.5">Code API 1min.AI</label>
                                    <input type="text" value={editModel.apiCode} onChange={(e) => setEditModel({...editModel, apiCode: e.target.value})} className="w-full p-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border rounded-lg font-mono text-sm" placeholder="ex: gpt-5.2-pro" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase mb-1.5">Fournisseur</label>
                                    <input type="text" value={editModel.provider} onChange={(e) => setEditModel({...editModel, provider: e.target.value})} className="w-full p-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border rounded-lg text-sm" placeholder="ex: OpenAI" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase mb-1.5">Coût / Crédits</label>
                                    <select value={editModel.cost} onChange={(e) => setEditModel({...editModel, cost: e.target.value as any})} className="w-full p-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border rounded-lg text-sm">
                                        <option value="low">Faible</option>
                                        <option value="low_medium">Moyen-Faible</option>
                                        <option value="medium">Moyen</option>
                                        <option value="high">Élevé</option>
                                        <option value="very_high">Très Élevé (Premium)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase mb-1.5">Qualité Rédaction (1-5)</label>
                                    <div className="flex gap-2 p-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border rounded-lg">
                                        {[1,2,3,4,5].map(v => (
                                            <button key={v} onClick={() => setEditModel({...editModel, textQuality: v})} className={`w-8 h-8 rounded flex items-center justify-center transition-all ${editModel.textQuality === v ? 'bg-brand-main text-white' : 'hover:bg-brand-border'}`}>{v}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-brand-main/50 uppercase mb-1.5">Forces & Cas d'usage</label>
                                    <textarea value={editModel.strengths} onChange={(e) => setEditModel({...editModel, strengths: e.target.value})} className="w-full p-3 bg-brand-light dark:bg-dark-bg border border-brand-border rounded-lg text-sm min-h-[80px]" placeholder="Ex: Excelle dans la structure longue et l'analyse..." />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-6 border-t border-brand-border">
                            {editingId && (
                                <button onClick={() => setDeleteId(editingId)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
                            )}
                            <div className="flex gap-2 ml-auto">
                                <button onClick={activeTab === 'contexts' ? handleSaveContext : handleSaveModel} disabled={isSaving} className="flex items-center gap-2 bg-brand-main hover:bg-brand-hover text-white px-6 py-2.5 rounded-lg font-medium shadow-md transition-all disabled:opacity-50">
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span>{isCreating ? 'Créer' : 'Enregistrer'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-brand-main/30 space-y-4">
                        {activeTab === 'contexts' ? <Brain className="w-16 h-16 opacity-20" /> : <Cpu className="w-16 h-16 opacity-20" />}
                        <p className="text-center font-medium">Sélectionnez un élément à modifier<br/>ou utilisez le bouton "Nouveau".</p>
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