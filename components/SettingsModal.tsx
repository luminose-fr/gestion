import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Save, Database } from 'lucide-react';
import { ContextItem } from '../types';
import * as NotionService from '../services/notionService';

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

  const handleDelete = async (id: string) => {
      if(confirm("Supprimer ce contexte ?")) {
          await NotionService.deleteContext(id);
          onContextsChange(contexts.filter(c => c.id !== id));
          if (editingId === id) setEditingId(null);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-transparent dark:border-slate-800 transition-colors">
        
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
             <div className="bg-brand-100 dark:bg-brand-900/50 p-2 rounded-lg">
                <Database className="w-5 h-5 text-brand-600 dark:text-brand-400" />
             </div>
             <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Gestion des Contextes IA</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Gérez vos différentes tonalités (Brand Voices) ici.</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* List Sidebar */}
            <div className="w-1/3 border-r border-gray-200 dark:border-slate-800 flex flex-col bg-gray-50 dark:bg-slate-950">
                <div className="p-4 border-b border-gray-200 dark:border-slate-800">
                    <button 
                        onClick={handleCreate}
                        className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 text-gray-700 dark:text-slate-200 py-2 rounded-lg transition-colors shadow-sm font-medium text-sm"
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
                                    ? 'bg-white dark:bg-slate-800 border-brand-500 shadow-sm ring-1 ring-brand-500' 
                                    : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-slate-900 hover:border-gray-200 dark:hover:border-slate-800'
                                }
                            `}
                        >
                            <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm">{ctx.name}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-500 line-clamp-1 mt-0.5">{ctx.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Edit Area */}
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 p-6">
                {(editingId || isCreating) ? (
                    <div className="flex-1 flex flex-col space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nom du Contexte</label>
                            <input 
                                type="text" 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full text-lg font-bold border-b border-gray-200 dark:border-slate-700 py-2 bg-transparent outline-none focus:border-brand-500 text-gray-800 dark:text-slate-100 placeholder-gray-300 dark:placeholder-slate-700"
                                placeholder="Ex: LinkedIn Pro"
                            />
                        </div>
                        <div className="flex-1 flex flex-col">
                             <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Prompt / Description</label>
                             <textarea 
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                className="flex-1 w-full p-4 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-950 outline-none focus:ring-2 focus:ring-brand-500 resize-none text-sm leading-relaxed text-gray-700 dark:text-slate-300"
                                placeholder="Décrivez comment l'IA doit se comporter..."
                             />
                        </div>
                        <div className="flex justify-between items-center pt-4">
                            {!isCreating && (
                                <button 
                                    onClick={() => editingId && handleDelete(editingId)}
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
                                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {isCreating ? 'Créer' : 'Enregistrer'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-slate-600">
                        <Edit2 className="w-12 h-12 mb-4 opacity-20" />
                        <p>Sélectionnez un contexte à modifier ou créez-en un nouveau.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;