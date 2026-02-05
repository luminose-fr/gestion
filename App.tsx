import React, { useState, useEffect } from 'react';
import { Layout, Lightbulb, Calendar as CalendarIcon, Archive, Search, ArrowRight, Plus, AlertCircle, Users, Settings, Briefcase, ChevronRight, CheckCircle2, PenLine, Loader2, RefreshCw, ExternalLink, LogOut, Menu, X, Brain, Sparkles } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem, Verdict } from './types';
import * as NotionService from './services/notionService';
import * as StorageService from './services/storageService';
import ContentCard from './components/ContentCard';
import SettingsModal from './components/SettingsModal';
import EditorModal from './components/EditorModal';
import AnalysisModal from './components/AnalysisModal';
import CalendarView from './components/CalendarView';
import { LoginPage } from './components/LoginPage';
import { isAuthenticated, logout } from './auth';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertModal, ConfirmModal, CharCounter } from './components/CommonModals';

type SpaceView = 'social' | 'clients';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

function App() {
  // Auth State
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Data State
  const [items, setItems] = useState<ContentItem[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  
  // Loading States
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [currentSpace, setCurrentSpace] = useState<SpaceView>('social');
  const [currentSocialTab, setCurrentSocialTab] = useState<SocialTab>('ideas');
  const [searchQuery, setSearchQuery] = useState("");
  const [newIdeaText, setNewIdeaText] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Modals State
  const [isContextManagerOpen, setIsContextManagerOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Global Alert/Confirm State
  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });
  const [confirmAnalysis, setConfirmAnalysis] = useState(false);

  // --- AUTH CHECK ---
  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setCheckingAuth(false);
  }, []);

  // --- DATA LOADING STRATEGY ---
  const initData = async () => {
      try {
          const [cachedItems, cachedContexts] = await Promise.all([
              StorageService.getCachedContent(),
              StorageService.getCachedContexts()
          ]);
          
          if (cachedItems.length > 0) setItems(cachedItems);
          if (cachedContexts.length > 0) setContexts(cachedContexts);
          
      } catch (e) {
          console.error("Erreur lecture cache:", e);
      } finally {
          setIsInitializing(false);
          syncWithNotion();
      }
  };

  const syncWithNotion = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);

    try {
        const [fetchedContent, fetchedContexts] = await Promise.all([
            NotionService.fetchContent(),
            NotionService.fetchContexts()
        ]);
        
        setItems(fetchedContent);
        setContexts(fetchedContexts);

        await Promise.all([
            StorageService.setCachedContent(fetchedContent),
            StorageService.setCachedContexts(fetchedContexts)
        ]);

    } catch (err: any) {
        console.error("Sync Error:", err);
        let msg = err.message || "Impossible de synchroniser avec Notion.";
        setError(msg);
    } finally {
        setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      initData();
    }
  }, [authenticated]);

  useEffect(() => {
      setSearchQuery("");
      setIsMobileMenuOpen(false); // Close menu on tab change
  }, [currentSocialTab]);

  // --- AUTH HANDLERS ---
  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    // Réinitialiser l'état de l'app
    setItems([]);
    setContexts([]);
    setIsInitializing(true);
  };

  // --- HANDLERS ---
  const handleContextsChange = (newContexts: ContextItem[]) => {
      setContexts(newContexts);
      StorageService.setCachedContexts(newContexts); 
  };

  const handleQuickAddIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdeaText.trim()) return;

    const text = newIdeaText;
    setNewIdeaText(""); 
    
    setIsSyncing(true);
    try {
        const newItem = await NotionService.createContent(text);
        
        const newItems = [newItem, ...items];
        setItems(newItems);
        await StorageService.setCachedContent(newItems);

    } catch (e: any) {
        setAlertInfo({
            isOpen: true,
            title: "Erreur Notion",
            message: e.message || "Erreur lors de la création.",
            type: 'error'
        });
    } finally {
        setIsSyncing(false);
    }
  };

  const handleEditItem = (item: ContentItem) => {
    setEditingItem(item);
    setIsEditorOpen(true);
  };

  const handleGlobalAnalysis = () => {
      const itemsToAnalyze = items.filter(i => i.status === ContentStatus.IDEA && !i.analyzed);
      
      if (itemsToAnalyze.length === 0) {
          setAlertInfo({
              isOpen: true,
              title: "Déjà à jour",
              message: "Toutes vos idées ont déjà été analysées !",
              type: 'success'
          });
          return;
      }
      setIsAnalysisModalOpen(true);
  };

  const handleAnalysisComplete = () => {
      syncWithNotion(); // Force refresh to get updated data from Notion (Verdict, etc.)
  };

  const handleUpdateItem = async (updatedItem: ContentItem): Promise<void> => {
    const newItems = items.map(i => i.id === updatedItem.id ? updatedItem : i);
    setItems(newItems);
    setEditingItem(updatedItem);
    
    StorageService.updateCachedItem(updatedItem).catch(console.error);

    try {
      await NotionService.updateContent(updatedItem);
    } catch (error: any) {
      console.error("Erreur update Notion:", error);
      setError("Échec de la sauvegarde sur Notion. " + error.message);
    }
  };

  const handleDeleteItem = async (itemToDelete: ContentItem): Promise<void> => {
      // Optimistic update : on supprime localement tout de suite
      const newItems = items.filter(i => i.id !== itemToDelete.id);
      setItems(newItems);
      setIsEditorOpen(false); // Fermer la modale
      
      StorageService.setCachedContent(newItems).catch(console.error);

      try {
          await NotionService.deleteContent(itemToDelete.id);
          setAlertInfo({
              isOpen: true,
              title: "Suppression réussie",
              message: "L'élément a été archivé dans Notion.",
              type: 'success'
          });
      } catch (error: any) {
          console.error("Erreur delete Notion:", error);
          setError("Impossible de supprimer sur Notion. " + error.message);
          // On pourrait remettre l'item en cas d'erreur, mais on laisse comme ça pour l'instant
      }
  };

  const handleOpenContextManagerFromEditor = () => {
      setIsContextManagerOpen(true);
  };

  // --- AUTH LOADING ---
  if (checkingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-light dark:bg-dark-bg">
        <Loader2 className="w-8 h-8 text-brand-main dark:text-dark-text animate-spin" />
      </div>
    );
  }

  // --- LOGIN SCREEN ---
  if (!authenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // --- FILTERED LISTS & LOGIC ---
  const today = new Date();

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ideaItems = filteredItems.filter(i => 
    i.status === ContentStatus.IDEA
  );

  const draftingItems = items.filter(i => 
    i.status === ContentStatus.DRAFTING
  );

  const readyItems = items.filter(i => 
    i.status === ContentStatus.READY
  );
  
  const archiveItems = filteredItems.filter(i => {
    if (i.status !== ContentStatus.PUBLISHED) return false;
    if (!i.scheduledDate) return false;
    return new Date(i.scheduledDate) < today;
  }).sort((a, b) => {
    const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
    const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
    return dateB - dateA;
  });

  const futureScheduledCount = items.filter(i => 
    i.scheduledDate && new Date(i.scheduledDate) > today
  ).length;

  // Helper pour la couleur du Verdict
  const getVerdictColor = (verdict?: Verdict) => {
      switch (verdict) {
          case Verdict.VALID: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
          case Verdict.TOO_BLAND: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
          case Verdict.NEEDS_WORK: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
          default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      }
  };

  return (
    <div className="h-screen bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text font-sans flex flex-col transition-colors duration-200 overflow-hidden">
      
      {/* GLOBAL HEADER */}
      <header className="bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border flex-shrink-0 z-30">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-8">
            {/* Mobile Menu Button */}
            <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 text-brand-main dark:text-white"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* Logo Minimaliste */}
            <div className="w-8 h-8 bg-gradient-to-tr from-brand-main to-brand-hover rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0">
              L
            </div>

            {/* Main Navigation (Spaces) - Hidden on small mobile if needed, or condensed */}
            <nav className="hidden md:flex space-x-2">
                <button
                    onClick={() => setCurrentSpace('social')}
                    className={`
                        px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2
                        ${currentSpace === 'social' 
                            ? 'bg-brand-light text-brand-main dark:bg-dark-sec-bg dark:text-white border-2 border-brand-border dark:border-dark-sec-border' 
                            : 'text-gray-500 hover:text-brand-main dark:text-dark-text/70 dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-sec-bg border-2 border-transparent'}
                    `}
                >
                    <Briefcase className="w-4 h-4" />
                    SocialFlows
                </button>
                <button
                    onClick={() => setCurrentSpace('clients')}
                    className={`
                        px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2
                        ${currentSpace === 'clients' 
                            ? 'bg-brand-light text-brand-main dark:bg-dark-sec-bg dark:text-white border-2 border-brand-border dark:border-dark-sec-border' 
                            : 'text-gray-500 hover:text-brand-main dark:text-dark-text/70 dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-sec-bg border-2 border-transparent'}
                    `}
                >
                    <Users className="w-4 h-4" />
                    Clients
                </button>
            </nav>
          </div>
          
          {/* Actions Header */}
          <div className="flex items-center gap-2">
               <button 
                  onClick={syncWithNotion}
                  disabled={isSyncing}
                  className="p-2 text-brand-main/70 hover:text-brand-main dark:text-dark-text/70 dark:hover:text-white transition-colors rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg disabled:opacity-50 disabled:animate-spin"
                  title="Synchroniser avec Notion"
               >
                   <RefreshCw className="w-4 h-4" />
               </button>
               <button
                  onClick={handleLogout}
                  className="p-2 text-brand-main/70 hover:text-red-600 dark:text-dark-text/70 dark:hover:text-red-400 transition-colors rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg"
                  title="Déconnexion"
               >
                   <LogOut className="w-4 h-4" />
               </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 p-2 text-center text-xs flex-shrink-0 animate-fade-in">
            <span className="text-red-700 dark:text-red-300 flex items-center justify-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
                <button onClick={syncWithNotion} className="underline font-bold hover:text-red-900 dark:hover:text-white ml-2">Réessayer</button>
            </span>
        </div>
      )}

      {/* MAIN BODY AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* CENTRAL LOADING OVERLAY */}
        {(isSyncing) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-dark-bg/60 backdrop-blur-[1px]">
                <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-dark-surface rounded-2xl shadow-xl border border-brand-border dark:border-dark-sec-border animate-in fade-in zoom-in duration-200">
                    <Loader2 className="w-10 h-10 text-brand-main dark:text-dark-text animate-spin mb-3" />
                    <p className="text-sm font-semibold text-brand-main dark:text-dark-text">Synchronisation Notion...</p>
                </div>
            </div>
        )}

        {/* Initial Loader */}
        {isInitializing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand-light dark:bg-dark-bg">
                <Loader2 className="w-8 h-8 text-brand-main dark:text-dark-text animate-spin" />
            </div>
        )}

        {/* BACKDROP MOBILE - Shared across spaces */}
        {isMobileMenuOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* RESPONSIVE SIDEBAR - Shared logic */}
        <aside className={`
            fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-dark-surface border-r border-brand-border dark:border-dark-sec-border flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
            {/* Header Sidebar Mobile Only */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-brand-border dark:border-dark-sec-border">
                <span className="font-bold text-brand-main dark:text-white">Menu</span>
                <button onClick={() => setIsMobileMenuOpen(false)}>
                    <X className="w-5 h-5 text-brand-main dark:text-white" />
                </button>
            </div>

            {/* SIDEBAR CONTENT VARIES BY SPACE */}
            {currentSpace === 'social' ? (
                <>
                    <div className="p-4 flex-1 overflow-y-auto space-y-1">
                         <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Navigation</div>
                         
                         <SidebarItem 
                            active={currentSocialTab === 'ideas'} 
                            onClick={() => setCurrentSocialTab('ideas')} 
                            icon={Lightbulb} 
                            label="Boîte à Idées"
                            count={ideaItems.length}
                         />

                         <SidebarItem 
                            active={currentSocialTab === 'drafts'} 
                            onClick={() => setCurrentSocialTab('drafts')} 
                            icon={PenLine} 
                            label="En cours"
                            count={draftingItems.length}
                         />
                         
                         <SidebarItem 
                            active={currentSocialTab === 'ready'} 
                            onClick={() => setCurrentSocialTab('ready')} 
                            icon={CheckCircle2} 
                            label="Prêt à publier"
                            count={readyItems.length}
                         />

                         <div className="my-3 border-t border-brand-light dark:border-dark-sec-border mx-2"></div>

                         <SidebarItem 
                            active={currentSocialTab === 'calendar'} 
                            onClick={() => setCurrentSocialTab('calendar')} 
                            icon={CalendarIcon} 
                            label="Calendrier"
                            count={futureScheduledCount}
                         />

                         <SidebarItem 
                            active={currentSocialTab === 'archive'} 
                            onClick={() => setCurrentSocialTab('archive')} 
                            icon={Archive} 
                            label="Archives"
                            count={archiveItems.length}
                         />
                         
                         {/* Mobile Spaces Navigation */}
                         <div className="md:hidden pt-4 mt-4 border-t border-brand-light dark:border-dark-sec-border">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3">Espaces</div>
                            <button
                                onClick={() => { setCurrentSpace('social'); setIsMobileMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-white"
                            >
                                <Briefcase className="w-5 h-5" /> SocialFlows
                            </button>
                            <button
                                onClick={() => { setCurrentSpace('clients'); setIsMobileMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-main/70 dark:text-dark-text/70"
                            >
                                <Users className="w-5 h-5" /> Clients
                            </button>
                         </div>
                    </div>

                    <div className="p-4 border-t border-brand-border dark:border-dark-sec-border">
                        <button 
                            onClick={() => { setIsContextManagerOpen(true); setIsMobileMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-lg transition-colors group"
                        >
                            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                            <span>Paramètres IA</span>
                        </button>
                    </div>
                </>
            ) : (
                // CLIENTS SIDEBAR (Empty Placeholder)
                <>
                    <div className="p-4 flex-1 overflow-y-auto space-y-1">
                        <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3 mt-2">Menu Clients</div>
                        <div className="px-3 py-2 text-sm text-brand-main/50 dark:text-dark-text/50 italic">
                            Modules à venir...
                        </div>

                         {/* Mobile Spaces Navigation must remain for switching back */}
                         <div className="md:hidden pt-4 mt-4 border-t border-brand-light dark:border-dark-sec-border">
                            <div className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-3 px-3">Espaces</div>
                            <button
                                onClick={() => { setCurrentSpace('social'); setIsMobileMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-main/70 dark:text-dark-text/70"
                            >
                                <Briefcase className="w-5 h-5" /> SocialFlows
                            </button>
                            <button
                                onClick={() => { setCurrentSpace('clients'); setIsMobileMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-white"
                            >
                                <Users className="w-5 h-5" /> Clients
                            </button>
                         </div>
                    </div>
                </>
            )}
        </aside>

        {/* === SPACE: CLIENTS MAIN === */}
        {currentSpace === 'clients' && (
            <div className="flex-1 flex flex-col items-center justify-center text-brand-main/50 dark:text-dark-text/50 relative overflow-y-auto">
                <div className="bg-white dark:bg-dark-surface p-12 rounded-2xl shadow-sm border border-brand-border dark:border-dark-sec-border text-center max-w-md mx-4">
                    <Users className="w-16 h-16 mx-auto mb-6 text-brand-200 dark:text-dark-text/30" />
                    <h2 className="text-xl font-bold text-brand-main dark:text-white mb-2">Espace Clients</h2>
                    <p className="text-sm">Cet espace est en cours de construction. Bientôt, vous pourrez gérer vos CRM et vos projets clients ici.</p>
                </div>
            </div>
        )}

        {/* === SPACE: SOCIALFLOWS MAIN === */}
        {currentSpace === 'social' && (
                <main className="flex-1 overflow-y-auto relative">
                    
                    {/* Workspace Header inside content area */}
                    <div className="sticky top-0 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur z-10 px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b md:border-none border-brand-border dark:border-dark-sec-border">
                         <h2 className="text-xl md:text-2xl font-bold text-brand-main dark:text-white flex items-center gap-2">
                             {currentSocialTab === 'drafts' && 'Brouillons en cours'}
                             {currentSocialTab === 'ready' && 'Prêts pour publication'}
                             {currentSocialTab === 'ideas' && 'Idées & Inspiration'}
                             {currentSocialTab === 'calendar' && 'Planning'}
                             {currentSocialTab === 'archive' && 'Archives'}
                         </h2>

                        {['ideas', 'archive'].includes(currentSocialTab) && (
                             <div className="relative group w-full md:w-72 animate-in fade-in slide-in-from-right-4 duration-300">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand-main/50 dark:text-dark-text/50 group-focus-within:text-brand-main transition-colors" />
                                <input 
                                    type="text" 
                                    placeholder={currentSocialTab === 'ideas' ? "Rechercher une idée..." : "Chercher dans les archives..."} 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-brand-light rounded-lg text-sm outline-none transition-all shadow-sm text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40"
                                />
                             </div>
                        )}
                    </div>

                    <div className="px-4 md:px-6 pb-12 max-w-6xl mx-auto mt-4 md:mt-0">
                        
                        {/* VIEW: DRAFTS */}
                        {currentSocialTab === 'drafts' && (
                            <div className="space-y-6 animate-fade-in">
                                {!isInitializing && draftingItems.length === 0 ? (
                                    <div className="text-center py-20">
                                        <div className="w-16 h-16 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-brand-border dark:border-dark-sec-border">
                                            <PenLine className="w-8 h-8 text-brand-main/50 dark:text-dark-text/50" />
                                        </div>
                                        <h3 className="text-lg font-medium text-brand-main dark:text-white">Aucun brouillon en cours</h3>
                                        <p className="text-brand-main/60 dark:text-dark-text/60 max-w-xs mx-auto mt-2">Vous n'avez aucun post en rédaction.</p>
                                        <button onClick={() => setCurrentSocialTab('ideas')} className="mt-6 text-brand-main dark:text-white font-medium hover:underline flex items-center justify-center gap-1 mx-auto">
                                            Choisir une idée <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {draftingItems.map(item => (
                                            <ContentCard key={item.id} item={item} onClick={handleEditItem} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* VIEW: READY */}
                        {currentSocialTab === 'ready' && (
                            <div className="space-y-6 animate-fade-in">
                                {!isInitializing && readyItems.length === 0 ? (
                                    <div className="text-center py-20">
                                        <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-200 dark:border-green-800">
                                            <CheckCircle2 className="w-8 h-8 text-green-500 dark:text-green-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-brand-main dark:text-white">Rien à valider</h3>
                                        <p className="text-brand-main/60 dark:text-dark-text/60 max-w-xs mx-auto mt-2">Tous vos posts sont soit en brouillon, soit déjà publiés.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {readyItems.map(item => (
                                            <ContentCard key={item.id} item={item} onClick={handleEditItem} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* VIEW: IDEAS */}
                        {currentSocialTab === 'ideas' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-white dark:bg-dark-surface shadow-sm rounded-xl p-6 border border-brand-border dark:border-dark-sec-border">
                                    <h3 className="text-sm font-semibold text-brand-main dark:text-white mb-3">Ajout rapide</h3>
                                    <form onSubmit={handleQuickAddIdea} className="flex flex-col md:flex-row gap-4">
                                        <div className="flex-1 flex flex-col">
                                            <input 
                                                type="text" 
                                                value={newIdeaText}
                                                onChange={(e) => setNewIdeaText(e.target.value)}
                                                maxLength={100} // Limite plus stricte pour le titre rapide
                                                placeholder="Ex: Post sur les tendances IA 2024..."
                                                className="bg-brand-light dark:bg-dark-bg border-none rounded-lg px-4 py-3 text-brand-main dark:text-white outline-none focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light transition-shadow placeholder-brand-main/40 dark:placeholder-dark-text/40"
                                            />
                                            {newIdeaText.length > 80 && <CharCounter current={newIdeaText.length} max={100} />}
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={!newIdeaText.trim()}
                                            className="bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white px-6 py-3 md:py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm h-fit self-start md:self-center"
                                        >
                                            <Plus className="w-5 h-5" />
                                            Ajouter
                                        </button>
                                    </form>
                                </div>

                                {/* Toolbar Analyse Globale */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                                    <div className="text-sm font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">
                                        Vos Idées ({ideaItems.length})
                                    </div>
                                    <button 
                                        onClick={handleGlobalAnalysis}
                                        className="flex items-center gap-2 text-xs sm:text-sm bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-lg font-medium transition-colors border border-purple-200 dark:border-purple-800 shadow-sm w-full sm:w-auto justify-center"
                                        title="Analyser toutes les nouvelles idées avec l'IA"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Analyser les nouvelles idées
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {!isInitializing && ideaItems.length === 0 && (
                                        <div className="p-12 text-center text-brand-main/50 dark:text-dark-text/50 italic bg-white dark:bg-dark-surface rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border">
                                            {searchQuery ? "Aucune idée trouvée pour cette recherche." : "La boîte à idées est vide."}
                                        </div>
                                    )}
                                    {ideaItems.map(item => (
                                        <div 
                                            key={item.id} 
                                            onClick={() => handleEditItem(item)}
                                            className="group bg-white dark:bg-dark-surface p-4 rounded-xl border border-brand-border dark:border-dark-sec-border hover:border-brand-main dark:hover:border-white hover:shadow-md cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-10 h-10 rounded-full bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                                                    <Lightbulb className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-medium text-brand-main dark:text-white group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors truncate max-w-full">
                                                            <HighlightText text={item.title || "Idée sans titre"} highlight={searchQuery} />
                                                        </h4>
                                                        {item.verdict && (
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getVerdictColor(item.verdict)}`}>
                                                                {item.verdict}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.strategicAngle && (
                                                        <p className="text-xs text-brand-main/50 dark:text-dark-text/50 italic mt-0.5 line-clamp-1">
                                                            Angle : {item.strategicAngle}
                                                        </p>
                                                    )}
                                                    {item.notes && !item.strategicAngle && (
                                                        <p className="text-sm text-brand-main/60 dark:text-dark-text/70 line-clamp-1 mt-0.5">
                                                            <HighlightText text={item.notes} highlight={searchQuery} />
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3 self-end md:self-auto">
                                                <div className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                                                    <button className="flex items-center gap-1 text-xs bg-brand-light dark:bg-dark-bg text-brand-main dark:text-white px-3 py-1.5 rounded-full font-medium">
                                                        Travailler
                                                        <ArrowRight className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* VIEW: CALENDAR */}
                        {currentSocialTab === 'calendar' && (
                            <div className="h-[600px] md:h-[750px] animate-fade-in overflow-hidden">
                                <CalendarView items={items} onItemClick={handleEditItem} />
                            </div>
                        )}

                        {/* VIEW: ARCHIVE */}
                        {currentSocialTab === 'archive' && (
                            <div className="bg-white dark:bg-dark-surface shadow rounded-xl overflow-hidden border border-brand-border dark:border-dark-sec-border transition-colors animate-fade-in overflow-x-auto">
                                <table className="min-w-full divide-y divide-brand-border dark:divide-dark-sec-border">
                                    <thead className="bg-brand-light dark:bg-dark-bg">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-brand-main/60 dark:text-dark-text/60 uppercase tracking-wider">Date</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-brand-main/60 dark:text-dark-text/60 uppercase tracking-wider">Titre / Contenu</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-brand-main/60 dark:text-dark-text/60 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-sec-border">
                                        {!isInitializing && archiveItems.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-12 text-center text-sm text-brand-main/50 dark:text-dark-text/50">
                                                    {searchQuery ? "Aucun post trouvé pour cette recherche." : "Aucun post publié dans le passé."}
                                                </td>
                                            </tr>
                                        )}
                                        {archiveItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-brand-light dark:hover:bg-dark-bg transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-brand-main dark:text-dark-text">
                                                    {item.scheduledDate ? format(parseISO(item.scheduledDate), 'dd MMM yyyy', { locale: fr }) : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-brand-main dark:text-white line-clamp-1">
                                                        <HighlightText text={item.title} highlight={searchQuery} />
                                                    </div>
                                                    <div className="text-sm text-brand-main/60 dark:text-dark-text/60 line-clamp-1">
                                                        <HighlightText text={item.body} highlight={searchQuery} />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <button 
                                                        onClick={() => handleEditItem(item)}
                                                        className="text-brand-main dark:text-white hover:text-brand-hover dark:hover:text-brand-light font-medium"
                                                    >
                                                        Voir
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
        )}

      </div>

      {/* Modals */}
      <SettingsModal 
        isOpen={isContextManagerOpen} 
        onClose={() => setIsContextManagerOpen(false)} 
        contexts={contexts}
        onContextsChange={handleContextsChange}
      />

      <EditorModal 
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        item={editingItem}
        onSave={handleUpdateItem}
        onDelete={handleDeleteItem}
        contexts={contexts}
        onManageContexts={handleOpenContextManagerFromEditor}
      />

      <AnalysisModal 
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        itemsToAnalyze={items.filter(i => i.status === ContentStatus.IDEA && !i.analyzed)}
        contexts={contexts}
        onAnalysisComplete={handleAnalysisComplete}
      />

      {/* Global Alerts */}
      <AlertModal 
        isOpen={alertInfo.isOpen} 
        onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
        title={alertInfo.title}
        message={alertInfo.message}
        type={alertInfo.type}
      />
    </div>
  );
}

// Sub-component for Sidebar Items
const SidebarItem = ({ active, onClick, icon: Icon, label, count }: { active: boolean, onClick: () => void, icon: any, label: string, count?: number }) => (
    <button
        onClick={onClick}
        className={`
            w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
            ${active 
                ? 'bg-brand-light text-brand-main dark:bg-dark-sec-bg dark:text-white' 
                : 'text-brand-main/70 dark:text-dark-text/70 hover:bg-brand-light/50 dark:hover:bg-dark-sec-bg/50 hover:text-brand-main dark:hover:text-white'}
        `}
    >
        <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${active ? 'text-brand-main dark:text-white' : 'text-brand-main/50 dark:text-dark-text/50'}`} />
            <span>{label}</span>
        </div>
        {count !== undefined && count > 0 && (
            <span className={`
                text-xs font-bold px-2 py-0.5 rounded-full border
                ${active 
                    ? 'bg-white border-brand-border text-brand-main dark:bg-dark-bg dark:border-dark-sec-border dark:text-white shadow-sm' 
                    : 'bg-brand-light border-transparent text-brand-main/70 dark:bg-dark-bg dark:text-dark-text/70'}
            `}>
                {count}
            </span>
        )}
    </button>
);

// Helper for highlighting text
const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight.trim()) {
        return <>{text}</>;
    }
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <>
            {parts.map((part, i) => 
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded px-0.5">{part}</span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
};

export default App;