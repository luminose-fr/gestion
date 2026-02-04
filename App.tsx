import React, { useState, useEffect } from 'react';
import { Layout, Lightbulb, Calendar as CalendarIcon, Archive, Search, ArrowRight, Plus, AlertCircle, Users, Settings, Briefcase, ChevronRight, CheckCircle2, PenLine, Loader2, RefreshCw } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem } from './types';
import * as NotionService from './services/notionService';
import * as StorageService from './services/storageService';
import ContentCard from './components/ContentCard';
import SettingsModal from './components/SettingsModal';
import EditorModal from './components/EditorModal';
import CalendarView from './components/CalendarView';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

type SpaceView = 'social' | 'clients';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

function App() {
  // Data State
  const [items, setItems] = useState<ContentItem[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  
  // Loading States
  const [isInitializing, setIsInitializing] = useState(true); // Chargement du cache
  const [isSyncing, setIsSyncing] = useState(false); // Synchronisation Notion
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [currentSpace, setCurrentSpace] = useState<SpaceView>('social');
  const [currentSocialTab, setCurrentSocialTab] = useState<SocialTab>('ideas');
  const [searchQuery, setSearchQuery] = useState("");
  const [newIdeaText, setNewIdeaText] = useState("");
  
  // Modals State
  const [isContextManagerOpen, setIsContextManagerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // --- DATA LOADING STRATEGY ---

  const initData = async () => {
      try {
          // 1. Charger le cache immédiatement (Rapide)
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
          // 2. Lancer la synchro réseau ensuite
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
        
        // Mise à jour de l'état React
        setItems(fetchedContent);
        setContexts(fetchedContexts);

        // Mise à jour du Cache
        await Promise.all([
            StorageService.setCachedContent(fetchedContent),
            StorageService.setCachedContexts(fetchedContexts)
        ]);

    } catch (err: any) {
        console.error("Sync Error:", err);
        // On n'écrase pas les données locales si Notion échoue, on garde le cache actif.
        setError(err.message || "Impossible de synchroniser avec Notion.");
    } finally {
        setIsSyncing(false);
    }
  };

  useEffect(() => {
    initData();
  }, []);

  // Reset search query when tab changes to avoid confusion
  useEffect(() => {
      setSearchQuery("");
  }, [currentSocialTab]);

  // --- HANDLERS ---

  const handleContextsChange = (newContexts: ContextItem[]) => {
      setContexts(newContexts);
      // On sauvegarde en cache immédiatement pour la fluidité
      StorageService.setCachedContexts(newContexts); 
  };

  const handleQuickAddIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdeaText.trim()) return;

    const text = newIdeaText;
    setNewIdeaText(""); 
    
    setIsSyncing(true); // On affiche le loader central car c'est une action réseau explicite
    try {
        const newItem = await NotionService.createContent(text);
        
        const newItems = [newItem, ...items];
        setItems(newItems);
        await StorageService.setCachedContent(newItems);

    } catch (e) {
        alert("Erreur lors de la création dans Notion. Vérifiez la console.");
    } finally {
        setIsSyncing(false);
    }
  };

  const handleEditItem = (item: ContentItem) => {
    setEditingItem(item);
    setIsEditorOpen(true);
  };

  const handleUpdateItem = async (updatedItem: ContentItem): Promise<void> => {
    // Optimistic UI Update : On met à jour l'interface et le cache TOUT DE SUITE
    const newItems = items.map(i => i.id === updatedItem.id ? updatedItem : i);
    setItems(newItems);
    setEditingItem(updatedItem);
    
    // Update Cache
    StorageService.updateCachedItem(updatedItem).catch(console.error);

    // Background Network Update (Fire & Forget visuel, mais on gère l'erreur)
    try {
      await NotionService.updateContent(updatedItem);
    } catch (error) {
      console.error("Erreur update Notion:", error);
      setError("Échec de la sauvegarde sur Notion. Vos modifications sont locales pour l'instant.");
      // Idéalement ici on marquerait l'item comme "dirty" pour re-try plus tard
    }
  };

  const handleOpenContextManagerFromEditor = () => {
      setIsContextManagerOpen(true);
  };

  // --- FILTERED LISTS & LOGIC ---
  const today = new Date();

  // On applique le filtre de recherche globalement, mais l'input n'est visible que sur certains onglets
  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ideaItems = filteredItems.filter(i => 
    i.status === ContentStatus.IDEA
  );

  const draftingItems = items.filter(i => // Note: Drafting doesn't use search filter based on requirements, using raw items
    i.status === ContentStatus.DRAFTING
  );

  const readyItems = items.filter(i => // Note: Ready doesn't use search filter based on requirements
    i.status === ContentStatus.READY
  );
  
  // Logic Archive: Published AND Date < Today
  // Uses filteredItems because search IS enabled for Archive
  const archiveItems = filteredItems.filter(i => {
    if (i.status !== ContentStatus.PUBLISHED) return false;
    if (!i.scheduledDate) return false; // Must have a date to be "past"
    return new Date(i.scheduledDate) < today;
  }).sort((a, b) => {
    const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
    const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
    return dateB - dateA;
  });

  // Logic Calendar Counter: Any item with Date > Today (Future)
  const futureScheduledCount = items.filter(i => 
    i.scheduledDate && new Date(i.scheduledDate) > today
  ).length;

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors duration-200 overflow-hidden">
      
      {/* GLOBAL HEADER */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex-shrink-0 z-30">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo Minimaliste */}
            <div className="w-8 h-8 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0">
              L
            </div>

            {/* Main Navigation (Spaces) */}
            <nav className="flex space-x-1">
                <button
                    onClick={() => setCurrentSpace('social')}
                    className={`
                        px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2
                        ${currentSpace === 'social' 
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800' 
                            : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800'}
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
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800' 
                            : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800'}
                    `}
                >
                    <Users className="w-4 h-4" />
                    Clients
                </button>
            </nav>
          </div>
          
          {/* Refresh Button Manual */}
          <div className="flex items-center">
               <button 
                  onClick={syncWithNotion}
                  disabled={isSyncing}
                  className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:animate-spin"
                  title="Synchroniser avec Notion"
               >
                   <RefreshCw className="w-4 h-4" />
               </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 p-2 text-center text-xs flex-shrink-0">
            <span className="text-red-700 dark:text-red-300 flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
                <button onClick={syncWithNotion} className="underline font-bold hover:text-red-900">Réessayer</button>
            </span>
        </div>
      )}

      {/* MAIN BODY AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* CENTRAL LOADING OVERLAY */}
        {(isSyncing) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[1px]">
                <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
                    <Loader2 className="w-10 h-10 text-brand-600 dark:text-brand-400 animate-spin mb-3" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Synchronisation Notion...</p>
                </div>
            </div>
        )}

        {/* Initial Loader */}
        {isInitializing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white dark:bg-slate-950">
                <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
            </div>
        )}

        {/* === SPACE: CLIENTS === */}
        {currentSpace === 'clients' && (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 text-gray-400 dark:text-slate-600 relative">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 text-center max-w-md">
                    <Users className="w-16 h-16 mx-auto mb-6 text-gray-200 dark:text-slate-700" />
                    <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">Espace Clients</h2>
                    <p className="text-sm">Cet espace est en cours de construction. Bientôt, vous pourrez gérer vos CRM et vos projets clients ici.</p>
                </div>
            </div>
        )}

        {/* === SPACE: SOCIALFLOWS === */}
        {currentSpace === 'social' && (
            <>
                {/* LEFT SIDEBAR */}
                <aside className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col flex-shrink-0 z-20">
                    <div className="p-4 flex-1 overflow-y-auto space-y-1">
                         <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3 mt-2">Navigation</div>
                         
                         {/* 1. Idées */}
                         <SidebarItem 
                            active={currentSocialTab === 'ideas'} 
                            onClick={() => setCurrentSocialTab('ideas')} 
                            icon={Lightbulb} 
                            label="Boîte à Idées"
                            count={ideaItems.length}
                         />

                         {/* 2. En cours */}
                         <SidebarItem 
                            active={currentSocialTab === 'drafts'} 
                            onClick={() => setCurrentSocialTab('drafts')} 
                            icon={PenLine} 
                            label="En cours"
                            count={draftingItems.length}
                         />
                         
                         {/* 3. Prêt à publier */}
                         <SidebarItem 
                            active={currentSocialTab === 'ready'} 
                            onClick={() => setCurrentSocialTab('ready')} 
                            icon={CheckCircle2} 
                            label="Prêt à publier"
                            count={readyItems.length}
                         />

                         {/* 4. Separator */}
                         <div className="my-3 border-t border-gray-100 dark:border-slate-800 mx-2"></div>

                         {/* 5. Calendrier */}
                         <SidebarItem 
                            active={currentSocialTab === 'calendar'} 
                            onClick={() => setCurrentSocialTab('calendar')} 
                            icon={CalendarIcon} 
                            label="Calendrier"
                            count={futureScheduledCount}
                         />

                         {/* 6. Archives */}
                         <SidebarItem 
                            active={currentSocialTab === 'archive'} 
                            onClick={() => setCurrentSocialTab('archive')} 
                            icon={Archive} 
                            label="Archives"
                            count={archiveItems.length}
                         />
                    </div>

                    <div className="p-4 border-t border-gray-200 dark:border-slate-800">
                        <button 
                            onClick={() => setIsContextManagerOpen(true)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                        >
                            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                            <span>Paramètres IA</span>
                        </button>
                    </div>
                </aside>

                {/* RIGHT WORK AREA */}
                <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 relative">
                    
                    {/* Workspace Header inside content area */}
                    <div className="sticky top-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur z-10 px-6 py-4 flex items-center justify-between">
                         <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                             {currentSocialTab === 'drafts' && 'Brouillons en cours'}
                             {currentSocialTab === 'ready' && 'Prêts pour publication'}
                             {currentSocialTab === 'ideas' && 'Idées & Inspiration'}
                             {currentSocialTab === 'calendar' && 'Planning de publication'}
                             {currentSocialTab === 'archive' && 'Historique des publications'}
                         </h2>

                        {/* Search Bar - Only visible in IDEAS and ARCHIVE */}
                        {['ideas', 'archive'].includes(currentSocialTab) && (
                             <div className="relative group w-72 animate-in fade-in slide-in-from-right-4 duration-300">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
                                <input 
                                    type="text" 
                                    placeholder={currentSocialTab === 'ideas' ? "Rechercher une idée..." : "Chercher dans les archives..."} 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 focus:border-brand-500 dark:focus:border-brand-400 rounded-lg text-sm outline-none transition-all shadow-sm"
                                />
                             </div>
                        )}
                    </div>

                    <div className="px-6 pb-12 max-w-6xl mx-auto">
                        
                        {/* VIEW: DRAFTS */}
                        {currentSocialTab === 'drafts' && (
                            <div className="space-y-6 animate-fade-in">
                                {!isInitializing && draftingItems.length === 0 ? (
                                    <div className="text-center py-20">
                                        <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <PenLine className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Aucun brouillon en cours</h3>
                                        <p className="text-gray-500 dark:text-slate-400 max-w-xs mx-auto mt-2">Vous n'avez aucun post en rédaction.</p>
                                        <button onClick={() => setCurrentSocialTab('ideas')} className="mt-6 text-brand-600 dark:text-brand-400 font-medium hover:underline flex items-center justify-center gap-1 mx-auto">
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
                                        <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle2 className="w-8 h-8 text-green-500 dark:text-green-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Rien à valider</h3>
                                        <p className="text-gray-500 dark:text-slate-400 max-w-xs mx-auto mt-2">Tous vos posts sont soit en brouillon, soit déjà publiés.</p>
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
                                <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl p-6 border border-gray-200 dark:border-slate-800">
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Ajout rapide</h3>
                                    <form onSubmit={handleQuickAddIdea} className="flex gap-4">
                                        <input 
                                            type="text" 
                                            value={newIdeaText}
                                            onChange={(e) => setNewIdeaText(e.target.value)}
                                            placeholder="Ex: Post sur les tendances IA 2024..."
                                            className="flex-1 bg-gray-50 dark:bg-slate-800 border-none rounded-lg px-4 py-3 text-gray-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                                        />
                                        <button 
                                            type="submit" 
                                            disabled={!newIdeaText.trim()}
                                            className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                        >
                                            <Plus className="w-5 h-5" />
                                            Ajouter
                                        </button>
                                    </form>
                                </div>

                                <div className="space-y-2">
                                    {!isInitializing && ideaItems.length === 0 && (
                                        <div className="p-12 text-center text-gray-500 dark:text-slate-400 italic bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
                                            {searchQuery ? "Aucune idée trouvée pour cette recherche." : "La boîte à idées est vide."}
                                        </div>
                                    )}
                                    {ideaItems.map(item => (
                                        <div 
                                            key={item.id} 
                                            onClick={() => handleEditItem(item)}
                                            className="group bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-md cursor-pointer transition-all flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-10 h-10 rounded-full bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                                                    <Lightbulb className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-medium text-gray-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate">
                                                        <HighlightText text={item.title || "Idée sans titre"} highlight={searchQuery} />
                                                    </h4>
                                                    {item.notes && (
                                                        <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                                            <HighlightText text={item.notes} highlight={searchQuery} />
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 ml-4 flex-shrink-0">
                                                <button className="flex items-center gap-1 text-xs bg-brand-50 dark:bg-slate-800 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-full font-medium">
                                                    Travailler
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* VIEW: CALENDAR */}
                        {currentSocialTab === 'calendar' && (
                            <div className="h-[750px] animate-fade-in">
                                <CalendarView items={items} onItemClick={handleEditItem} />
                            </div>
                        )}

                        {/* VIEW: ARCHIVE */}
                        {currentSocialTab === 'archive' && (
                            <div className="bg-white dark:bg-slate-900 shadow rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 transition-colors animate-fade-in">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                                    <thead className="bg-gray-50 dark:bg-slate-800/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Titre / Contenu</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                                        {!isInitializing && archiveItems.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-slate-400">
                                                    {searchQuery ? "Aucun post trouvé pour cette recherche." : "Aucun post publié dans le passé."}
                                                </td>
                                            </tr>
                                        )}
                                        {archiveItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                                                    {item.scheduledDate ? format(parseISO(item.scheduledDate), 'dd MMM yyyy', { locale: fr }) : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-slate-100 line-clamp-1">
                                                        <HighlightText text={item.title} highlight={searchQuery} />
                                                    </div>
                                                    <div className="text-sm text-gray-500 dark:text-slate-500 line-clamp-1">
                                                        <HighlightText text={item.body} highlight={searchQuery} />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <button 
                                                        onClick={() => handleEditItem(item)}
                                                        className="text-brand-600 dark:text-brand-400 hover:text-brand-900 dark:hover:text-brand-300 font-medium"
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
            </>
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
        contexts={contexts}
        onManageContexts={handleOpenContextManagerFromEditor}
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
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-50' 
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'}
        `}
    >
        <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${active ? 'text-brand-600 dark:text-brand-50' : 'text-gray-400 dark:text-slate-500'}`} />
            <span>{label}</span>
        </div>
        {count !== undefined && count > 0 && (
            <span className={`
                text-xs font-bold px-2 py-0.5 rounded-full border
                ${active 
                    ? 'bg-white border-brand-100 text-brand-600 dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-sm' 
                    : 'bg-gray-100 border-transparent text-gray-600 dark:bg-slate-800 dark:text-slate-400'}
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