import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Save, Settings } from 'lucide-react';
import { ContextItem } from '../types';
import * as NotionService from '../services/notionService';
import { ConfirmModal, CharCounter } from './CommonModals';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contexts: ContextItem[];
  onContextsChange: (contexts: ContextItem[]) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, contexts, onContextsChange }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEdit = (ctx: ContextItem) => {
    setEditingId(ctx.id);
    setEditName(ctx.name);
    setEditDesc(ctx.description);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (isCreating) {
        const newCtx = await NotionService.createContext(editName, editDesc);
        onContextsChange([...contexts, newCtx]);
        setIsCreating(false);
    } else if (editingId) {
        const updatedCtx = { id: editingId, name: editName, description: editDesc };
        await NotionService.updateContext(updatedCtx);
        onContextsChange(contexts.map(c => c.id === editingId ? updatedCtx : c));
        setEditingId(null);
    }
  };

  const handleConfirmDelete = async () => {
      if (deleteId) {
          await NotionService.deleteContext(deleteId);
          onContextsChange(contexts.filter(c => c.id !== deleteId));
          if (editingId === deleteId) setEditingId(null);
          setDeleteId(null);
      }
  };

  return (
    <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-brand-border dark:border-dark-sec-border transition-colors overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="flex items-center justify-between p-6 border-b border-brand-border dark:border-dark-sec-border flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="bg-brand-light dark:bg-dark-sec-bg p-2 rounded-lg">
                <Settings className="w-5 h-5 text-brand-main dark:text-brand-light" />
             </div>
             <div className="min-w-0">
                <h2 className="text-xl font-bold text-brand-main dark:text-white truncate">Gestion des Contextes IA</h2>
                <p className="text-sm text-brand-main/60 dark:text-dark-text/60 truncate">Gérez vos différentes tonalités (Brand Voices) ici.</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-full transition-colors">
            <X className="w-5 h-5 text-brand-main/50 dark:text-dark-text/50" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* List Sidebar */}
            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-brand-border dark:border-dark-sec-border flex flex-col bg-brand-light dark:bg-dark-bg h-1/3 md:h-auto">
                <div className="p-4 border-b border-brand-border dark:border-dark-sec-border">
                    <button 
                        onClick={handleCreate}
                        className="w-full flex items-center justify-center gap-2 bg-white dark:bg-dark-sec-bg border-2 border-brand-border dark:border-dark-sec-border hover:border-brand-main dark:hover:border-white text-brand-main dark:text-white py-2 rounded-lg transition-colors shadow-sm font-medium text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Nouveau Contexte
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {contexts.map(ctx => (
                        <div 
                            key={ctx.id}
                            onClick={() => handleEdit(ctx)}
                            className={`
                                p-3 rounded-lg cursor-pointer transition-all border
                                ${editingId === ctx.id 
                                    ? 'bg-white dark:bg-dark-surface border-brand-main dark:border-white shadow-sm' 
                                    : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-dark-surface hover:border-brand-border dark:hover:border-dark-sec-border'
                                }
                            `}
                        >
                            <h3 className="font-semibold text-brand-main dark:text-white text-sm">{ctx.name}</h3>
                            <p className="text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-1 mt-0.5">{ctx.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Edit Area */}
            <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface p-6 h-2/3 md:h-auto overflow-y-auto">
                {(editingId || isCreating) ? (
                    <div className="flex-1 flex flex-col space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-1.5">Nom du Contexte</label>
                            <input 
                                type="text" 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full text-lg font-bold border-b border-brand-border dark:border-dark-sec-border py-2 bg-transparent outline-none focus:border-brand-main dark:focus:border-brand-light text-brand-main dark:text-white placeholder-brand-main/30 dark:placeholder-dark-text/30"
                                placeholder="Ex: LinkedIn Pro"
                            />
                        </div>
                        <div className="flex-1 flex flex-col min-h-[300px]">
                             <label className="block text-xs font-semibold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-1.5">Prompt / Description</label>
                             <textarea 
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                maxLength={2000}
                                className="flex-1 w-full p-4 border border-brand-border dark:border-dark-sec-border rounded-lg bg-brand-light dark:bg-dark-bg outline-none focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light resize-y text-sm leading-relaxed text-brand-main dark:text-white"
                                placeholder="Décrivez comment l'IA doit se comporter..."
                             />
                             <CharCounter current={editDesc.length} max={2000} />
                        </div>
                        <div className="flex justify-between items-center pt-4">
                            {!isCreating && (
                                <button 
                                    onClick={() => editingId && setDeleteId(editingId)}
                                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                            <div className="flex gap-2 ml-auto">
                                <button 
                                    onClick={handleSave}
                                    disabled={!editName.trim()}
                                    className="flex items-center gap-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {isCreating ? 'Créer' : 'Enregistrer'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-brand-main/40 dark:text-dark-text/40">
                        <Edit2 className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-center">Sélectionnez un contexte à modifier<br/>ou créez-en un nouveau.</p>
                    </div>
                )}
            </div>
        </div>
      </div>

      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer le contexte ?"
        message="Cette action est irréversible et supprimera ce persona de vos options."
        isDestructive={true}
        confirmLabel="Supprimer"
      />
    </div>
  );
};

export default SettingsModal;