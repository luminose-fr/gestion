import React, { useState, useEffect } from 'react';
import { X, Sparkles, Send, Calendar, Save, Trash2, ExternalLink, Settings, ChevronLeft, ArrowRight, Lock, FileText, CheckCircle2, Edit3, Eye, Loader2 } from 'lucide-react';
import { ContentItem, ContentStatus, Platform, ContextItem } from '../types';
import { STATUS_COLORS } from '../constants';
import { generateContent } from '../services/aiService';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EditorModalProps {
  item: ContentItem | null;
  contexts: ContextItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onManageContexts: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ item, contexts, isOpen, onClose, onSave, onManageContexts }) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublerOpen, setIsPublerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedContextId, setSelectedContextId] = useState<string>("");

  useEffect(() => {
    if (item) setEditedItem({ ...item });
  }, [item]);

  if (!isOpen || !editedItem) return null;

  const isIdea = editedItem.status === ContentStatus.IDEA;
  const isPublished = editedItem.status === ContentStatus.PUBLISHED;
  const isDrafting = editedItem.status === ContentStatus.DRAFTING;
  const isReady = editedItem.status === ContentStatus.READY;

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    
    const contextItem = contexts.find(c => c.id === selectedContextId);
    const contextString = contextItem ? contextItem.description : "Standard professional tone.";

    setIsGenerating(true);
    try {
      const generated = await generateContent(
        aiPrompt, 
        contextString, 
        editedItem.body, 
        editedItem.platforms.join(', ') || "Réseaux Sociaux"
      );
      setEditedItem(prev => prev ? { ...prev, body: generated } : null);
      setAiPrompt("");
    } catch (e) {
      alert("Erreur lors de la génération IA");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkAsPublished = async () => {
    setIsPublerOpen(true);
    // Simulation du délai Publer
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsPublerOpen(false);
    
    // Changement de statut réel
    await changeStatus(ContentStatus.PUBLISHED);
    alert("Contenu marqué comme publié !");
  };

  const changeStatus = async (newStatus: ContentStatus) => {
      if (isSaving) return;
      setIsSaving(true);
      const newItem = { ...editedItem, status: newStatus };
      setEditedItem(newItem); // Optimistic UI local pour la modale
      
      await onSave(newItem);
      setIsSaving(false);
  };

  const handleManualSave = async () => {
      if (isSaving) return;
      setIsSaving(true);
      await onSave(editedItem);
      setIsSaving(false);
  };

  // --- RENDERERS ---

  // 1. VUE PUBLIÉE (READ ONLY)
  if (isPublished) {
    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-fade-in">
             <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-4">
                     <button onClick={onClose} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-full transition-colors">
                        <ChevronLeft className="w-6 h-6" />
                     </button>
                     <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                           <Lock className="w-5 h-5 text-gray-400" />
                           {editedItem.title}
                        </h2>
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Publié le {editedItem.scheduledDate ? format(parseISO(editedItem.scheduledDate), 'dd MMMM yyyy', { locale: fr }) : "Date inconnue"}
                        </span>
                     </div>
                </div>
                <div className={`px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.PUBLISHED]}`}>
                    PUBLIÉ
                </div>
             </div>

             <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950 p-8 flex justify-center">
                 <div className="w-full max-w-3xl bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 rounded-xl p-8 space-y-8">
                     {/* Platforms */}
                     <div>
                        <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">Destinations</h3>
                        <div className="flex flex-wrap gap-2">
                            {editedItem.platforms.length > 0 ? editedItem.platforms.map(p => (
                                <span key={p} className="px-3 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-700">
                                    {p}
                                </span>
                            )) : <span className="text-sm text-gray-400 italic">Aucune plateforme spécifiée</span>}
                        </div>
                     </div>

                     {/* Content */}
                     <div className="prose dark:prose-invert max-w-none">
                         <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">Contenu publié</h3>
                         <div className="p-6 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-800 text-lg leading-relaxed whitespace-pre-wrap font-serif">
                            {editedItem.body}
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
  }

  // 2. VUE READY (PRÊT À PUBLIER - READ ONLY PREVIEW)
  if (isReady) {
    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-fade-in">
             <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center gap-4">
                     <button onClick={onClose} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-full transition-colors">
                        <ChevronLeft className="w-6 h-6" />
                     </button>
                     <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                           {editedItem.title}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Prêt pour la validation finale</p>
                     </div>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className={`px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.READY]}`}>
                        PRÊT
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950 p-8 flex justify-center">
                 <div className="w-full max-w-4xl flex gap-8">
                     
                     {/* Preview Card */}
                     <div className="flex-1 bg-white dark:bg-slate-900 shadow-xl shadow-gray-200/50 dark:shadow-black/20 border border-gray-200 dark:border-slate-800 rounded-xl p-8 space-y-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Eye className="w-5 h-5 text-gray-400" />
                            <h3 className="text-sm font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aperçu du contenu</h3>
                        </div>

                        <div className="p-6 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-800 text-lg leading-relaxed whitespace-pre-wrap font-serif text-gray-800 dark:text-slate-200">
                            {editedItem.body || <span className="text-gray-400 italic">Contenu vide...</span>}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100 dark:border-slate-800">
                            {editedItem.platforms.map(p => (
                                <span key={p} className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded text-xs border border-gray-200 dark:border-slate-700">
                                    {p}
                                </span>
                            ))}
                        </div>
                     </div>

                     {/* Actions Sidebar */}
                     <div className="w-72 space-y-4">
                        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                            <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-4">Actions</h3>
                            
                            <button 
                                onClick={handleMarkAsPublished}
                                disabled={isPublerOpen || isSaving}
                                className="w-full mb-3 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {(isPublerOpen || isSaving) ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Publication...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        Marquer comme publié
                                    </>
                                )}
                            </button>

                            <button 
                                onClick={() => changeStatus(ContentStatus.DRAFTING)}
                                disabled={isSaving}
                                className="w-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                                Revenir en brouillon
                            </button>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
                            <p><strong>Note :</strong> Ce contenu est verrouillé. Pour le modifier, repassez-le en mode brouillon.</p>
                        </div>
                     </div>
                 </div>
             </div>
        </div>
    );
  }

  // 3. VUE IDÉE (SIMPLIFIED)
  if (isIdea) {
      return (
        <div className="fixed inset-0 z-50 bg-gray-100/90 dark:bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 flex items-center gap-2 text-sm font-medium transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                        Retour
                    </button>
                    <div className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[ContentStatus.IDEA]}`}>
                        IDÉE
                    </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Titre de l'idée</label>
                        <input 
                            type="text" 
                            value={editedItem.title}
                            onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                            className="w-full text-2xl font-bold text-gray-800 dark:text-slate-100 bg-transparent border-b-2 border-gray-200 dark:border-slate-700 focus:border-brand-500 outline-none py-2 placeholder-gray-300 transition-colors"
                            placeholder="Titre de votre idée..."
                            autoFocus
                        />
                    </div>

                    <div>
                         <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notes & Contexte (Mémo)</label>
                         <textarea 
                            value={editedItem.notes}
                            onChange={(e) => setEditedItem({...editedItem, notes: e.target.value})}
                            className="w-full h-32 p-4 bg-gray-50 dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 dark:text-slate-300 resize-none text-sm leading-relaxed"
                            placeholder="Notez vos premières pensées ici..."
                         />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
                     <button 
                        onClick={() => {
                            if(confirm("Supprimer cette idée ?")) {
                                onClose(); // In real app, call delete
                            }
                        }}
                        className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                     >
                        <Trash2 className="w-5 h-5" />
                     </button>

                     <div className="flex gap-3">
                        <button 
                            onClick={handleManualSave}
                            disabled={isSaving}
                            className="px-4 py-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                            Enregistrer sans commencer
                        </button>
                        <button 
                            onClick={() => changeStatus(ContentStatus.DRAFTING)}
                            disabled={isSaving}
                            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium shadow-lg shadow-brand-500/30 flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Travailler cette idée
                            {!isSaving && <ArrowRight className="w-4 h-4" />}
                        </button>
                     </div>
                </div>
             </div>
        </div>
      );
  }

  // 4. VUE ÉDITEUR DRAFT (PAR DÉFAUT)
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-fade-in transition-colors">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <input 
            type="text" 
            value={editedItem.title}
            onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
            className="text-xl font-bold text-gray-800 dark:text-slate-100 bg-transparent outline-none placeholder-gray-400 dark:placeholder-slate-600 w-full max-w-2xl"
            placeholder="Titre du post..."
          />
        </div>

        <div className="flex items-center gap-3">
           <div className={`px-3 py-1 mr-2 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.DRAFTING]}`}>
                BROUILLON
           </div>
          
          <button 
              onClick={handleManualSave}
              disabled={isSaving}
              className="text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 px-4 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
          >
              {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              Enregistrer
          </button>

          <button 
              onClick={() => changeStatus(ContentStatus.READY)}
              disabled={isSaving}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm disabled:opacity-50"
          >
              {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                  <CheckCircle2 className="w-4 h-4" />
              )}
              Valider pour publication
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
          
          {/* Left: Metadata */}
          <div className="w-80 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 p-6 overflow-y-auto space-y-8 hidden md:block">
              <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">Destinations</h3>
                  <div className="flex flex-col gap-2">
                      {Object.values(Platform).map(p => (
                          <label key={p} className="flex items-center gap-3 cursor-pointer group">
                              <div className={`
                                  w-5 h-5 rounded border flex items-center justify-center transition-colors
                                  ${editedItem.platforms.includes(p) 
                                      ? 'bg-brand-600 border-brand-600 text-white' 
                                      : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700 group-hover:border-gray-400'}
                              `}>
                                  {editedItem.platforms.includes(p) && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                              </div>
                              <input 
                                  type="checkbox" 
                                  className="hidden"
                                  checked={editedItem.platforms.includes(p)}
                                  onChange={() => {
                                      const platforms = editedItem.platforms.includes(p)
                                          ? editedItem.platforms.filter(pl => pl !== p)
                                          : [...editedItem.platforms, p];
                                      setEditedItem({...editedItem, platforms});
                                  }}
                              />
                              <span className={`text-sm ${editedItem.platforms.includes(p) ? 'text-gray-900 dark:text-slate-100 font-medium' : 'text-gray-600 dark:text-slate-400'}`}>
                                  {p}
                              </span>
                          </label>
                      ))}
                  </div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">Planification</h3>
                  <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                      <input 
                          type="date"
                          value={editedItem.scheduledDate || ""}
                          onChange={(e) => setEditedItem({...editedItem, scheduledDate: e.target.value})}
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                  </div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4">Notes internes</h3>
                  <textarea 
                      value={editedItem.notes}
                      onChange={(e) => setEditedItem({...editedItem, notes: e.target.value})}
                      className="w-full h-40 p-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none resize-none placeholder-gray-400 dark:placeholder-slate-600"
                      placeholder="Mémo..."
                  />
              </div>

               <button 
                  className="w-full text-red-500 hover:text-red-700 dark:hover:text-red-400 text-sm flex items-center justify-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-8"
                  onClick={() => {
                     if(confirm("Supprimer ce brouillon ?")) {
                         onClose();
                     }
                  }}
              >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
              </button>
          </div>

          {/* Center: Writing Canvas */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative">
              <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto py-12 px-8 h-full">
                      <textarea 
                          value={editedItem.body}
                          onChange={(e) => setEditedItem({...editedItem, body: e.target.value})}
                          className="w-full h-full text-lg leading-relaxed text-gray-800 dark:text-slate-100 bg-transparent outline-none resize-none placeholder-gray-300 dark:placeholder-slate-700 font-serif"
                          placeholder="Écrivez votre contenu ici..."
                          autoFocus
                      />
                  </div>
              </div>
          </div>

          {/* Right: AI Assistant */}
          <div className="w-96 border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2 text-brand-700 dark:text-brand-400 font-semibold mb-3">
                      <Sparkles className="w-5 h-5" />
                      <span>Co-pilote IA</span>
                  </div>
                  
                  {/* Context Selector */}
                  <div className="flex gap-2">
                      <select 
                          value={selectedContextId}
                          onChange={(e) => setSelectedContextId(e.target.value)}
                          className="flex-1 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md p-1.5 outline-none focus:ring-1 focus:ring-brand-500 text-gray-700 dark:text-slate-200"
                      >
                          <option value="">Aucun (Standard)</option>
                          {contexts.map(ctx => (
                              <option key={ctx.id} value={ctx.id}>{ctx.name}</option>
                          ))}
                      </select>
                      <button 
                          onClick={onManageContexts}
                          className="p-1.5 bg-gray-200 dark:bg-slate-700 rounded-md hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 transition-colors"
                          title="Gérer les contextes"
                      >
                          <Settings className="w-4 h-4" />
                      </button>
                  </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                      {selectedContextId ? (
                          <p>
                              Mode : <span className="font-semibold text-brand-600 dark:text-brand-400">{contexts.find(c => c.id === selectedContextId)?.name}</span>
                          </p>
                      ) : (
                          <p>Mode : <span className="font-semibold">Standard</span></p>
                      )}
                      <p className="mt-2 text-xs opacity-70">Décrivez ce que vous voulez : "Réécris en plus court", "Ajoute des emojis", "Traduis en anglais"...</p>
                  </div>
                  {isGenerating && (
                      <div className="flex justify-center py-4">
                          <div className="animate-pulse flex space-x-2">
                              <div className="h-2 w-2 bg-brand-400 rounded-full"></div>
                              <div className="h-2 w-2 bg-brand-400 rounded-full"></div>
                              <div className="h-2 w-2 bg-brand-400 rounded-full"></div>
                          </div>
                      </div>
                  )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="relative">
                      <textarea
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAiGenerate();
                              }
                          }}
                          className="w-full pr-10 pl-3 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none resize-none h-24 placeholder-gray-400 dark:placeholder-slate-500 shadow-sm"
                          placeholder="Instructions IA..."
                      />
                      <button 
                          onClick={handleAiGenerate}
                          disabled={isGenerating || !aiPrompt.trim()}
                          className="absolute right-2 bottom-2 p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                          <Send className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default EditorModal;