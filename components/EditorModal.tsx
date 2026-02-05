import React, { useState, useEffect } from 'react';
import { X, Sparkles, Send, Calendar, Save, Trash2, Settings, Lock, CheckCircle2, Edit3, Eye, Loader2, ArrowRight, FileText, Info } from 'lucide-react';
import { ContentItem, ContentStatus, Platform, ContextItem } from '../types';
import { STATUS_COLORS } from '../constants';
import * as GeminiService from '../services/geminiService';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertModal, ConfirmModal, CharCounter } from './CommonModals';

interface EditorModalProps {
  item: ContentItem | null;
  contexts: ContextItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
  onManageContexts: () => void;
}

type MobileTab = 'editor' | 'details' | 'ai';

const EditorModal: React.FC<EditorModalProps> = ({ item, contexts, isOpen, onClose, onSave, onDelete, onManageContexts }) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublerOpen, setIsPublerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('editor');
  
  const [selectedContextId, setSelectedContextId] = useState<string>("");

  // Modal states
  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    const platformsString = editedItem.platforms.join(', ') || "Réseaux Sociaux";

    setIsGenerating(true);
    try {
      // Construction du prompt système et utilisateur (anciennement dans aiService)
      const systemInstruction = `
        Tu es un assistant de rédaction expert pour les réseaux sociaux.
        
        CONTEXTE DE L'UTILISATEUR (BRAND VOICE):
        ${contextString}

        TA MISSION:
        Rédiger ou améliorer un post pour la plateforme : ${platformsString}.
        
        RÈGLES:
        1. Renvoie UNIQUEMENT le contenu du post suggéré.
        2. Pas de phrases d'introduction du type "Voici une proposition" ou "Certes".
        3. Utilise le ton défini dans le contexte.
      `;

      const userPrompt = `
        CONTENU ACTUEL / IDÉE DE DÉPART:
        "${editedItem.body || ''}"

        INSTRUCTION SPÉCIFIQUE:
        ${aiPrompt}
      `;

      const generated = await GeminiService.generateContent({
        model: "gemini-3-flash-preview",
        systemInstruction: systemInstruction,
        prompt: userPrompt
      });

      setEditedItem(prev => prev ? { ...prev, body: generated.substring(0, 2000) } : null);
      setAiPrompt("");
      // Switch back to editor on mobile to see result
      setActiveMobileTab('editor');
    } catch (e) {
      console.error(e);
      setAlertInfo({ 
          isOpen: true, 
          title: "Erreur IA", 
          message: "Impossible de générer le contenu.", 
          type: 'error' 
      });
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
    setAlertInfo({ 
        isOpen: true, 
        title: "Félicitations !", 
        message: "Contenu marqué comme publié.", 
        type: 'success' 
    });
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

  const handleDelete = async () => {
      if (onDelete && editedItem) {
          await onDelete(editedItem);
      }
      onClose();
  };

  // --- WRAPPER UNIFIÉ POUR TOUTES LES VUES DE LA MODALE ---
  const ModalWrapper = ({ children, headerContent }: { children: React.ReactNode, headerContent: React.ReactNode }) => (
      <div 
        className="fixed inset-0 z-50 bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-fade-in"
        onClick={onClose} // Close on backdrop click
      >
         <div 
            className="bg-white dark:bg-dark-surface w-full h-full md:h-[90vh] md:max-w-7xl md:rounded-2xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden transition-colors"
            onClick={(e) => e.stopPropagation()} // Prevent close when clicking content
         >
            {/* Unified Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex-shrink-0">
                <div className="flex-1 min-w-0">
                    {headerContent}
                </div>
                <button onClick={onClose} className="p-2 ml-2 text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
            
            {/* Content Area */}
            {children}
         </div>

         <AlertModal 
            isOpen={alertInfo.isOpen} 
            onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
            title={alertInfo.title}
            message={alertInfo.message}
            type={alertInfo.type}
         />
         
         <ConfirmModal 
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
            title="Supprimer le brouillon ?"
            message="Cette action est irréversible."
            isDestructive={true}
            confirmLabel="Supprimer"
         />
      </div>
  );

  // 1. VUE PUBLIÉE (READ ONLY)
  if (isPublished) {
    return (
        <ModalWrapper 
            headerContent={
                <div className="flex items-center gap-4">
                     <div className="flex flex-col">
                        <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white flex items-center gap-2 truncate">
                           <Lock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                           <span className="truncate">{editedItem.title}</span>
                        </h2>
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Publié le {editedItem.scheduledDate ? format(parseISO(editedItem.scheduledDate), 'dd MMMM yyyy', { locale: fr }) : "Date inconnue"}
                        </span>
                     </div>
                     <div className={`hidden md:block px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.PUBLISHED]}`}>
                        PUBLIÉ
                    </div>
                </div>
            }
        >
             <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8 flex justify-center">
                 <div className="w-full max-w-3xl bg-white dark:bg-dark-surface shadow-sm border border-brand-border dark:border-dark-sec-border rounded-xl p-6 md:p-8 space-y-8">
                     {/* Platforms */}
                     <div>
                        <h3 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3">Destinations</h3>
                        <div className="flex flex-wrap gap-2">
                            {editedItem.platforms.length > 0 ? editedItem.platforms.map(p => (
                                <span key={p} className="px-3 py-1 bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text rounded-lg text-sm font-medium border border-brand-border dark:border-dark-sec-border">
                                    {p}
                                </span>
                            )) : <span className="text-sm text-gray-400 italic">Aucune plateforme spécifiée</span>}
                        </div>
                     </div>

                     {/* Content */}
                     <div className="prose dark:prose-invert max-w-none">
                         <h3 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3">Contenu publié</h3>
                         <div className="p-6 bg-brand-light dark:bg-dark-bg rounded-lg border border-brand-border dark:border-dark-sec-border text-lg leading-relaxed whitespace-pre-wrap font-serif text-brand-main dark:text-white">
                            {editedItem.body}
                         </div>
                     </div>
                 </div>
             </div>
        </ModalWrapper>
    );
  }

  // 2. VUE READY (PRÊT À PUBLIER - READ ONLY PREVIEW)
  if (isReady) {
    return (
        <ModalWrapper
            headerContent={
                <div className="flex items-center gap-4">
                     <div className="min-w-0">
                        <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white flex items-center gap-2 truncate">
                           <span className="truncate">{editedItem.title}</span>
                        </h2>
                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Prêt pour la validation finale</p>
                     </div>
                     <div className={`hidden md:block px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.READY]}`}>
                        PRÊT
                    </div>
                </div>
            }
        >
             <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8 flex justify-center">
                 <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8">
                     
                     {/* Preview Card */}
                     <div className="flex-1 bg-white dark:bg-dark-surface shadow-xl shadow-brand-main/5 dark:shadow-black/20 border border-brand-border dark:border-dark-sec-border rounded-xl p-6 md:p-8 space-y-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Eye className="w-5 h-5 text-brand-main/50 dark:text-dark-text/50" />
                            <h3 className="text-sm font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Aperçu du contenu</h3>
                        </div>

                        <div className="p-6 bg-brand-light dark:bg-dark-bg rounded-lg border border-brand-border dark:border-dark-sec-border text-lg leading-relaxed whitespace-pre-wrap font-serif text-brand-main dark:text-white">
                            {editedItem.body || <span className="text-gray-400 italic">Contenu vide...</span>}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-border dark:border-dark-sec-border">
                            {editedItem.platforms.map(p => (
                                <span key={p} className="px-2 py-1 bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text rounded text-xs border border-brand-border dark:border-dark-sec-border">
                                    {p}
                                </span>
                            ))}
                        </div>
                     </div>

                     {/* Actions Sidebar */}
                     <div className="w-full md:w-72 space-y-4">
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-xl p-5 shadow-sm">
                            <h3 className="font-semibold text-brand-main dark:text-white mb-4">Actions</h3>
                            
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
                                className="w-full bg-white dark:bg-dark-sec-bg hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main dark:text-white border-2 border-brand-border dark:border-dark-sec-border px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                                Revenir en brouillon
                            </button>
                        </div>

                        <div className="bg-brand-light dark:bg-dark-sec-bg border border-brand-border dark:border-dark-sec-border rounded-xl p-4 text-sm text-brand-main dark:text-dark-text">
                            <p><strong>Note :</strong> Ce contenu est verrouillé. Pour le modifier, repassez-le en mode brouillon.</p>
                        </div>
                     </div>
                 </div>
             </div>
        </ModalWrapper>
    );
  }

  // 3. VUE IDÉE
  if (isIdea) {
      return (
        <div 
            className="fixed inset-0 z-50 bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-fade-in"
            onClick={onClose}
        >
             <div 
                className="bg-white dark:bg-dark-surface w-full h-full md:h-auto md:max-w-2xl md:rounded-2xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
             >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-sec-border">
                    <div className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[ContentStatus.IDEA]}`}>
                        IDÉE
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-2">Titre de l'idée</label>
                        <input 
                            type="text" 
                            value={editedItem.title}
                            onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                            className="w-full text-2xl font-bold text-brand-main dark:text-white bg-transparent border-b-2 border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-brand-light outline-none py-2 placeholder-brand-main/30 dark:placeholder-dark-text/30 transition-colors"
                            placeholder="Titre de votre idée..."
                            autoFocus
                        />
                    </div>

                    <div>
                         <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-2">Notes & Contexte (Mémo)</label>
                         <textarea 
                            value={editedItem.notes}
                            onChange={(e) => setEditedItem({...editedItem, notes: e.target.value})}
                            maxLength={2000}
                            className="w-full h-48 md:h-32 p-4 bg-brand-light dark:bg-dark-bg rounded-xl border border-brand-border dark:border-dark-sec-border outline-none focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light text-brand-main dark:text-white resize-none text-sm leading-relaxed placeholder-brand-main/40 dark:placeholder-dark-text/40"
                            placeholder="Notez vos premières pensées ici..."
                         />
                         <CharCounter current={editedItem.notes.length} max={2000} />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-brand-light dark:bg-dark-bg border-t border-brand-border dark:border-dark-sec-border flex flex-col md:flex-row items-center justify-between gap-4">
                     <button 
                        onClick={() => setConfirmDelete(true)}
                        className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors self-start md:self-auto"
                     >
                        <Trash2 className="w-5 h-5" />
                     </button>

                     <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                        <button 
                            onClick={handleManualSave}
                            disabled={isSaving}
                            className="px-4 py-3 md:py-2 text-brand-main dark:text-dark-text hover:bg-white dark:hover:bg-dark-surface rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 border-2 border-transparent hover:border-brand-border dark:hover:border-dark-sec-border w-full md:w-auto"
                        >
                            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                            Enregistrer sans commencer
                        </button>
                        <button 
                            onClick={() => changeStatus(ContentStatus.DRAFTING)}
                            disabled={isSaving}
                            className="px-6 py-3 md:py-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white rounded-lg font-medium shadow-lg shadow-brand-main/20 dark:shadow-none flex items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 w-full md:w-auto"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Travailler cette idée
                            {!isSaving && <ArrowRight className="w-4 h-4" />}
                        </button>
                     </div>
                </div>
             </div>
             
             <ConfirmModal 
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleDelete}
                title="Supprimer l'idée ?"
                message="Cette action est irréversible."
                isDestructive={true}
                confirmLabel="Supprimer"
             />
        </div>
      );
  }

  // 4. VUE ÉDITEUR DRAFT (PAR DÉFAUT)
  return (
    <ModalWrapper
        headerContent={
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
                <input 
                    type="text" 
                    value={editedItem.title}
                    onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                    className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-none placeholder-brand-main/40 dark:placeholder-dark-text/40 w-full md:max-w-2xl"
                    placeholder="Titre du post..."
                />
                
                <div className="flex items-center gap-2 md:gap-3 md:ml-auto w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <div className={`hidden md:block px-3 py-1 mr-2 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.DRAFTING]}`}>
                            BROUILLON
                    </div>
                    
                    <button 
                        onClick={handleManualSave}
                        disabled={isSaving}
                        className="flex-1 md:flex-none justify-center text-brand-main dark:text-white hover:bg-brand-light dark:hover:bg-dark-bg bg-white dark:bg-dark-sec-bg border-2 border-brand-border dark:border-dark-sec-border px-3 md:px-4 py-2 rounded-lg font-medium transition-colors text-xs md:text-sm flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                    >
                        {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Enregistrer
                    </button>

                    <button 
                        onClick={() => changeStatus(ContentStatus.READY)}
                        disabled={isSaving}
                        className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white px-4 md:px-5 py-2 rounded-lg font-medium transition-colors shadow-sm text-xs md:text-sm disabled:opacity-50 whitespace-nowrap"
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4" />
                        )}
                        Valider
                    </button>
                </div>
            </div>
        }
    >
      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
          
          {/* Left: Metadata (Hidden on Mobile unless active tab) */}
          <div className={`
              ${activeMobileTab === 'details' ? 'block' : 'hidden'} 
              md:block w-full md:w-80 border-r border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-6 overflow-y-auto space-y-8
          `}>
              <div>
                  <h3 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-4">Destinations</h3>
                  <div className="flex flex-col gap-2">
                      {Object.values(Platform).map(p => (
                          <label key={p} className="flex items-center gap-3 cursor-pointer group">
                              <div className={`
                                  w-5 h-5 rounded border flex items-center justify-center transition-colors
                                  ${editedItem.platforms.includes(p) 
                                      ? 'bg-brand-main border-brand-main text-white dark:bg-brand-light dark:border-brand-light dark:text-brand-hover' 
                                      : 'bg-white dark:bg-dark-surface border-brand-border dark:border-dark-sec-border group-hover:border-brand-main/50'}
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
                              <span className={`text-sm ${editedItem.platforms.includes(p) ? 'text-brand-main dark:text-white font-medium' : 'text-brand-main/70 dark:text-dark-text/70'}`}>
                                  {p}
                              </span>
                          </label>
                      ))}
                  </div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-4">Planification</h3>
                  <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />
                      <input 
                          type="date"
                          value={editedItem.scheduledDate || ""}
                          onChange={(e) => setEditedItem({...editedItem, scheduledDate: e.target.value})}
                          className="w-full pl-9 pr-3 py-2 border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface rounded-lg text-sm text-brand-main dark:text-white focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light outline-none"
                      />
                  </div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-4">Notes internes</h3>
                  <textarea 
                      value={editedItem.notes}
                      onChange={(e) => setEditedItem({...editedItem, notes: e.target.value})}
                      maxLength={2000}
                      className="w-full h-40 p-3 border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface rounded-lg text-sm text-brand-main dark:text-white focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light outline-none resize-none placeholder-brand-main/40 dark:placeholder-dark-text/40"
                      placeholder="Mémo..."
                  />
                  <CharCounter current={editedItem.notes.length} max={2000} />
              </div>

               <button 
                  className="w-full text-red-500 hover:text-red-700 dark:hover:text-red-400 text-sm flex items-center justify-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-8"
                  onClick={() => setConfirmDelete(true)}
              >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
              </button>
          </div>

          {/* Center: Writing Canvas (Hidden on Mobile unless active tab) */}
          <div className={`
              ${activeMobileTab === 'editor' ? 'flex' : 'hidden'} 
              md:flex flex-1 flex-col bg-white dark:bg-dark-surface relative
          `}>
              <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto py-6 md:py-12 px-4 md:px-8 h-full flex flex-col">
                      <textarea 
                          value={editedItem.body}
                          onChange={(e) => setEditedItem({...editedItem, body: e.target.value})}
                          maxLength={2000}
                          className="w-full flex-1 text-base md:text-lg leading-relaxed text-brand-main dark:text-white bg-transparent outline-none resize-none placeholder-brand-main/30 dark:placeholder-dark-text/30 font-serif pb-20 md:pb-0"
                          placeholder="Écrivez votre contenu ici..."
                          autoFocus
                      />
                      <div className="mt-2 flex justify-end">
                          <CharCounter current={editedItem.body.length} max={2000} />
                      </div>
                  </div>
              </div>
          </div>

          {/* Right: AI Assistant (Hidden on Mobile unless active tab) */}
          <div className={`
              ${activeMobileTab === 'ai' ? 'flex' : 'hidden'} 
              md:flex w-full md:w-96 border-l border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg flex-col
          `}>
              <div className="p-4 border-b border-brand-border dark:border-dark-sec-border bg-white/50 dark:bg-dark-surface/50">
                  <div className="flex items-center gap-2 text-brand-hover dark:text-brand-light font-semibold mb-3">
                      <Sparkles className="w-5 h-5" />
                      <span>Co-pilote IA</span>
                  </div>
                  
                  {/* Context Selector */}
                  <div className="flex gap-2">
                      <select 
                          value={selectedContextId}
                          onChange={(e) => setSelectedContextId(e.target.value)}
                          className="flex-1 text-sm bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-md p-1.5 outline-none focus:ring-1 focus:ring-brand-main dark:focus:ring-brand-light text-brand-main dark:text-white"
                      >
                          <option value="">Aucun (Standard)</option>
                          {contexts.map(ctx => (
                              <option key={ctx.id} value={ctx.id}>{ctx.name}</option>
                          ))}
                      </select>
                      <button 
                          onClick={onManageContexts}
                          className="p-1.5 bg-brand-200 dark:bg-dark-sec-bg rounded-md hover:bg-brand-border dark:hover:bg-brand-hover text-brand-main dark:text-white transition-colors border border-transparent"
                          title="Gérer les contextes"
                      >
                          <Settings className="w-4 h-4" />
                      </button>
                  </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  <div className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-brand-border dark:border-dark-sec-border shadow-sm text-sm text-brand-main dark:text-dark-text leading-relaxed">
                      {selectedContextId ? (
                          <p>
                              Mode : <span className="font-semibold text-brand-hover dark:text-brand-light">{contexts.find(c => c.id === selectedContextId)?.name}</span>
                          </p>
                      ) : (
                          <p>Mode : <span className="font-semibold">Standard</span></p>
                      )}
                      <p className="mt-2 text-xs opacity-70">Décrivez ce que vous voulez : "Réécris en plus court", "Ajoute des emojis", "Traduis en anglais"...</p>
                  </div>
                  {isGenerating && (
                      <div className="flex justify-center py-4">
                          <div className="animate-pulse flex space-x-2">
                              <div className="h-2 w-2 bg-brand-main/50 rounded-full"></div>
                              <div className="h-2 w-2 bg-brand-main/50 rounded-full"></div>
                              <div className="h-2 w-2 bg-brand-main/50 rounded-full"></div>
                          </div>
                      </div>
                  )}
              </div>

              <div className="p-4 border-t border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface pb-24 md:pb-4">
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
                          className="w-full pr-10 pl-3 py-3 border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg rounded-xl text-sm text-brand-main dark:text-white focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light outline-none resize-none h-24 placeholder-brand-main/40 dark:placeholder-dark-text/40 shadow-sm"
                          placeholder="Instructions IA..."
                      />
                      <button 
                          onClick={handleAiGenerate}
                          disabled={isGenerating || !aiPrompt.trim()}
                          className="absolute right-2 bottom-2 p-2 bg-brand-main text-white dark:bg-brand-light dark:text-brand-hover rounded-lg hover:bg-brand-hover dark:hover:bg-white disabled:opacity-50 transition-colors shadow-sm"
                      >
                          <Send className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          </div>

          {/* MOBILE NAVIGATION TABS (Bottom Bar) */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-sec-border flex justify-around p-2 z-10">
              <button 
                  onClick={() => setActiveMobileTab('details')}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg flex-1 ${activeMobileTab === 'details' ? 'text-brand-main dark:text-white bg-brand-light dark:bg-dark-sec-bg' : 'text-gray-400'}`}
              >
                  <Info className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Détails</span>
              </button>
              <button 
                  onClick={() => setActiveMobileTab('editor')}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg flex-1 ${activeMobileTab === 'editor' ? 'text-brand-main dark:text-white bg-brand-light dark:bg-dark-sec-bg' : 'text-gray-400'}`}
              >
                  <FileText className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Éditeur</span>
              </button>
              <button 
                  onClick={() => setActiveMobileTab('ai')}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg flex-1 ${activeMobileTab === 'ai' ? 'text-brand-main dark:text-white bg-brand-light dark:bg-dark-sec-bg' : 'text-gray-400'}`}
              >
                  <Sparkles className="w-5 h-5" />
                  <span className="text-[10px] font-medium">IA</span>
              </button>
          </div>
      </div>
    </ModalWrapper>
  );
};

export default EditorModal;