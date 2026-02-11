import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, LogOut, Loader2, AlertCircle, Users, Menu, Briefcase } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem, AIModel, Verdict, Platform, isTargetFormat, isTargetOffer, isProfondeur } from './types';
import * as NotionService from './services/notionService';
import * as StorageService from './services/storageService';
import * as GeminiService from './services/geminiService';
import { AI_ACTIONS, INTERNAL_MODELS, isOneMinModel } from './ai/config';
import * as OneMinService from './services/oneMinService';

import SettingsModal from './components/SettingsModal';
import ContentEditor, { EditorStep, bodyJsonToText } from './components/ContentEditor';
import { IdeaModal } from './components/IdeaModal'; 
import AnalysisModal from './components/AnalysisModal';
import CalendarView from './components/CalendarView';
import { LoginPage } from './components/LoginPage';
import { isAuthenticated, logout } from './auth';
import { AlertModal } from './components/CommonModals';
import { AIConfigModal } from './components/AIConfigModal';

// Components refactorisés
import { Sidebar } from './components/Layout/Sidebar';
import { SocialIdeasView } from './components/Views/SocialIdeasView';
import { SocialGridView } from './components/Views/SocialGridView';

type SpaceView = 'social' | 'clients';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

const getHashState = () => {
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    
    let space: SpaceView = 'social';
    if (parts[0] === 'clients') space = 'clients';
    
    let tab: SocialTab = 'ideas'; 
    if (parts[1] && ['drafts', 'ready', 'ideas', 'calendar', 'archive'].includes(parts[1])) {
        tab = parts[1] as SocialTab;
    }

    const itemId = parts[2] && parts[2].trim() !== '' ? parts[2] : null;
    
    let step: EditorStep = 'idea';
    if (parts[3] && ['idea', 'interview', 'content', 'slides', 'postcourt'].includes(parts[3])) {
        step = parts[3] as EditorStep;
    }

    return { space, tab, itemId, step };
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSingleAnalyzing, setIsSingleAnalyzing] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [currentSpace, setCurrentSpace] = useState<SpaceView>('social');
  const [currentSocialTab, setCurrentSocialTab] = useState<SocialTab>('ideas');
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [currentEditorStep, setCurrentEditorStep] = useState<EditorStep>('idea');

  const [searchQuery, setSearchQuery] = useState("");
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isContextManagerOpen, setIsContextManagerOpen] = useState(false);
  
  // New state for AI Configuration Flow
  const [aiConfigState, setAiConfigState] = useState<{
      isOpen: boolean;
      mode: 'single' | 'batch';
      itemId?: string;
  }>({ isOpen: false, mode: 'single' });

  // State for Batch Analysis Execution Modal
  const [batchAnalysisState, setBatchAnalysisState] = useState<{
      isOpen: boolean;
      contextId: string;
      modelId: string;
  }>({ isOpen: false, contextId: '', modelId: '' });

  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

  const mergeById = <T extends { id: string }>(current: T[], updates: T[]): T[] => {
      if (updates.length === 0) return current;
      const map = new Map(current.map(item => [item.id, item]));
      updates.forEach(item => map.set(item.id, item));
      return Array.from(map.values());
  };

  const sortByLastEditedDesc = (list: ContentItem[]): ContentItem[] => {
      return [...list].sort((a, b) => {
          const aTime = a.lastEdited ? new Date(a.lastEdited).getTime() : 0;
          const bTime = b.lastEdited ? new Date(b.lastEdited).getTime() : 0;
          return bTime - aTime;
      });
  };

  useEffect(() => {
      const handleHashChange = () => {
          const { space, tab, itemId, step } = getHashState();
          setCurrentSpace(space);
          if (space === 'social') {
              setCurrentSocialTab(tab);
          }
          setEditingItemId(itemId);
          setCurrentEditorStep(step);
      };
      
      handleHashChange();

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const updateRoute = (space: SpaceView, tab: SocialTab, itemId: string | null = null, step: EditorStep = 'idea') => {
      let hash = `${space}`;
      if (space === 'social') {
          hash += `/${tab}`;
          if (itemId) {
              hash += `/${itemId}`;
              hash += `/${step}`;
          }
      }
      if (window.location.hash !== `#${hash}`) {
          window.location.hash = hash;
      }
  };

  const editingItem = editingItemId ? items.find(i => i.id === editingItemId) || null : null;

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setCheckingAuth(false);
  }, []);

  const initData = async () => {
      let cachedItems: ContentItem[] = [];
      let cachedContexts: ContextItem[] = [];
      let cachedModels: AIModel[] = [];
      try {
          [cachedItems, cachedContexts, cachedModels] = await Promise.all([
              StorageService.getCachedContent(),
              StorageService.getCachedContexts(),
              StorageService.getCachedModels()
          ]);
          
          if (cachedItems.length > 0) setItems(cachedItems);
          if (cachedContexts.length > 0) setContexts(cachedContexts);
          if (cachedModels.length > 0) setAiModels(cachedModels);
          
      } catch (e) {
          console.error("Erreur lecture cache:", e);
      } finally {
          setIsInitializing(false);
          syncWithNotion(false, { items: cachedItems, contexts: cachedContexts, models: cachedModels });
      }
  };

  const syncWithNotion = async (
      forceFullSync = false,
      baseCache?: { items?: ContentItem[]; contexts?: ContextItem[]; models?: AIModel[] }
  ) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);

    try {
        const nowIso = new Date().toISOString();
        const fullSyncThresholdMs = 24 * 60 * 60 * 1000;

        const lastContentSync = StorageService.getLastSync("content");
        const lastContextsSync = StorageService.getLastSync("contexts");
        const lastModelsSync = StorageService.getLastSync("models");

        const lastContentFullSync = StorageService.getLastFullSync("content");
        const lastContextsFullSync = StorageService.getLastFullSync("contexts");
        const lastModelsFullSync = StorageService.getLastFullSync("models");

        const shouldFullSync = (lastFullSync: string | null) => {
            if (!lastFullSync) return true;
            const last = Date.parse(lastFullSync);
            if (Number.isNaN(last)) return true;
            return (Date.now() - last) > fullSyncThresholdMs;
        };

        const contentSince = forceFullSync
            ? undefined
            : (shouldFullSync(lastContentFullSync) ? undefined : lastContentSync || undefined);
        const contextsSince = forceFullSync
            ? undefined
            : (shouldFullSync(lastContextsFullSync) ? undefined : lastContextsSync || undefined);
        const modelsSince = forceFullSync
            ? undefined
            : (shouldFullSync(lastModelsFullSync) ? undefined : lastModelsSync || undefined);

        const [fetchedContent, fetchedContexts, fetchedModels] = await Promise.all([
            NotionService.fetchContent(contentSince),
            NotionService.fetchContexts(contextsSince),
            NotionService.fetchModels(modelsSince)
        ]);

        const baseItems = contentSince ? (baseCache?.items ?? items) : [];
        const baseContexts = contextsSince ? (baseCache?.contexts ?? contexts) : [];
        const baseModels = modelsSince ? (baseCache?.models ?? aiModels) : [];

        const nextItems = sortByLastEditedDesc(
            contentSince ? mergeById(baseItems, fetchedContent) : fetchedContent
        );
        const nextContexts = contextsSince ? mergeById(baseContexts, fetchedContexts) : fetchedContexts;
        const nextModels = modelsSince ? mergeById(baseModels, fetchedModels) : fetchedModels;
        
        setItems(nextItems);
        setContexts(nextContexts);
        setAiModels(nextModels);

        await Promise.all([
            StorageService.setCachedContent(nextItems),
            StorageService.setCachedContexts(nextContexts),
            StorageService.setCachedModels(nextModels)
        ]);

        StorageService.setLastSync("content", nowIso);
        StorageService.setLastSync("contexts", nowIso);
        StorageService.setLastSync("models", nowIso);

        if (!contentSince) StorageService.setLastFullSync("content", nowIso);
        if (!contextsSince) StorageService.setLastFullSync("contexts", nowIso);
        if (!modelsSince) StorageService.setLastFullSync("models", nowIso);

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
      setIsMobileMenuOpen(false); 
  }, [currentSocialTab]);

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setItems([]);
    setContexts([]);
    setAiModels([]);
    setIsInitializing(true);
  };

  const handleContextsChange = (newContexts: ContextItem[]) => {
      setContexts(newContexts);
      StorageService.setCachedContexts(newContexts); 
  };

  const handleModelsChange = (newModels: AIModel[]) => {
      setAiModels(newModels);
      StorageService.setCachedModels(newModels);
  };

  const handleQuickAddIdea = async (title: string, notes: string) => {
    setIsSyncing(true);
    try {
        const newItem = await NotionService.createContent(title, notes);
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
        throw e; // Permet à la vue de savoir qu'il y a eu une erreur
    } finally {
        setIsSyncing(false);
    }
  };

  const handleEditItem = (item: ContentItem) => {
    updateRoute(currentSpace, currentSocialTab, item.id, 'idea');
  };

  const handleCloseEditor = () => {
      updateRoute(currentSpace, currentSocialTab, null, 'idea');
  };

  const handleStepChange = (newStep: EditorStep) => {
      if (editingItemId) {
          updateRoute(currentSpace, currentSocialTab, editingItemId, newStep);
      }
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
      setAiConfigState({ isOpen: true, mode: 'batch' });
  };

  const handleAnalysisComplete = () => {
      syncWithNotion(); 
  };

  const handleUpdateItem = async (updatedItem: ContentItem): Promise<void> => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    StorageService.updateCachedItem(updatedItem).catch(console.error);

    try {
      await NotionService.updateContent(updatedItem);
    } catch (error: any) {
      console.error("Erreur update Notion:", error);
      setError("Échec de la sauvegarde sur Notion. " + error.message);
    }
  };

  const handleTransformToDraft = async (updatedItem: ContentItem): Promise<void> => {
    // Sauvegarder l'item avec le nouveau statut DRAFTING
    await handleUpdateItem(updatedItem);
    // Naviguer vers l'éditeur dans la vue brouillons
    updateRoute('social', 'drafts', updatedItem.id, 'idea');
  };

  const handleDeleteItem = async (itemToDelete: ContentItem): Promise<void> => {
      const newItems = items.filter(i => i.id !== itemToDelete.id);
      setItems(newItems);
      updateRoute(currentSpace, currentSocialTab, null, 'idea');
      
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
      }
  };

  // --- NEW AI ANALYSIS FLOW ---

  const triggerSingleAnalysis = (item: ContentItem) => {
      setAiConfigState({ isOpen: true, mode: 'single', itemId: item.id });
  };

  const handleAIConfigConfirm = async (contextId: string, modelId: string) => {
      const mode = aiConfigState.mode;
      const itemId = aiConfigState.itemId;
      
      setAiConfigState({ isOpen: false, mode: 'single' }); 

      if (mode === 'single') {
          await performSingleAnalysis(contextId, modelId, itemId);
      } else {
          setBatchAnalysisState({ isOpen: true, contextId, modelId });
      }
  };

  const performSingleAnalysis = async (contextId: string, modelId: string, itemId?: string) => {
      const itemToAnalyze = items.find(i => i.id === itemId);
      if (!itemToAnalyze) return;

      setIsSingleAnalyzing(true);
      try {
          const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
          const contextItem = contexts.find(c => c.id === contextId);
          const systemInstruction = actionConfig.getSystemInstruction(contextItem?.description || "Expert Marketing.");

          const contentPayload = [{ id: itemToAnalyze.id, titre: itemToAnalyze.title, notes: itemToAnalyze.notes }];
          
          let responseText = "";
          
          if (isOneMinModel(modelId, aiModels)) {
              responseText = await OneMinService.generateContent({
                  model: modelId,
                  systemInstruction: systemInstruction,
                  prompt: JSON.stringify(contentPayload)
              });
          } else {
              responseText = await GeminiService.generateContent({
                  model: modelId,
                  systemInstruction: systemInstruction,
                  prompt: JSON.stringify(contentPayload),
                  generationConfig: actionConfig.generationConfig
              });
          }
          
          let results: any[] = [];
          try {
              results = JSON.parse(responseText);
          } catch(e) {
              const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
              results = JSON.parse(cleaned);
          }
          
          if (Array.isArray(results) && results.length > 0) {
              const res = results[0];
              const rawPlatforms = Array.isArray(res.plateformes) ? res.plateformes : [];
              const mappedPlatforms: Platform[] = rawPlatforms
                .map((p: string) => p as Platform)
                .filter((p: any) => Object.values(Platform).includes(p));

              const rawFormat = res.format_cible ?? res.format_suggere;
              const targetFormat = isTargetFormat(rawFormat) ? rawFormat : undefined;
              const targetOffer = isTargetOffer(res.cible_offre) ? res.cible_offre : undefined;
              const justification = typeof res.justification === 'string' ? res.justification : undefined;
              const suggestedMetaphor = typeof res.metaphore_suggeree === 'string' ? res.metaphore_suggeree : undefined;
              const suggestedTitle = typeof res.titre === 'string' ? res.titre : undefined;
              const depth = isProfondeur(res.profondeur) ? res.profondeur : undefined;

              const contextName = contextItem?.name || "Contexte par défaut";
              const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
              const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

              const rawAngle = (res.angle_strategique ?? res.angle ?? "");
              const angleWithTitle = suggestedTitle
                  ? `**Titre suggéré :** ${suggestedTitle}\n\n${rawAngle}`
                  : rawAngle;

              const updatedItem: ContentItem = {
                  ...itemToAnalyze,
                  // Le titre initial n'est PAS remplacé — le titre suggéré est visible dans le bloc Analyse IA
                  verdict: res.verdict,
                  strategicAngle: angleWithTitle + signature,
                  platforms: mappedPlatforms.length > 0 ? mappedPlatforms : itemToAnalyze.platforms,
                  targetFormat,
                  targetOffer: targetOffer || itemToAnalyze.targetOffer,
                  justification: justification ?? itemToAnalyze.justification,
                  suggestedMetaphor: suggestedMetaphor ?? itemToAnalyze.suggestedMetaphor,
                  depth: depth ?? itemToAnalyze.depth,
                  analyzed: true,
              };
              await handleUpdateItem(updatedItem);
          }
      } catch (error: any) {
          setAlertInfo({ isOpen: true, title: "Erreur Analyse", message: error.message, type: "error" });
      } finally {
          setIsSingleAnalyzing(false);
      }
  };

  const handleOpenContextManagerFromEditor = () => {
      setIsContextManagerOpen(true);
  };

  // ── Hooks dérivés — TOUJOURS avant tout return conditionnel ──────────────

  const filteredItems = useMemo(() => items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bodyJsonToText(item.body).toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.notes.toLowerCase().includes(searchQuery.toLowerCase())
  ), [items, searchQuery]);

  const ideaItems    = useMemo(() => filteredItems.filter(i => i.status === ContentStatus.IDEA),     [filteredItems]);
  const draftingItems = useMemo(() => filteredItems.filter(i => i.status === ContentStatus.DRAFTING), [filteredItems]);
  const readyItems   = useMemo(() => filteredItems.filter(i => i.status === ContentStatus.READY),    [filteredItems]);

  const archiveItems = useMemo(() => {
    const today = new Date();
    return filteredItems
      .filter(i => i.status === ContentStatus.PUBLISHED && !!i.scheduledDate && new Date(i.scheduledDate) < today)
      .sort((a, b) => {
        const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
        const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
        return dateB - dateA;
      });
  }, [filteredItems]);

  const counts = useMemo(() => {
    const today = new Date();
    return {
      ideas:    items.filter(i => i.status === ContentStatus.IDEA).length,
      drafts:   items.filter(i => i.status === ContentStatus.DRAFTING).length,
      ready:    items.filter(i => i.status === ContentStatus.READY).length,
      calendar: items.filter(i => !!i.scheduledDate && new Date(i.scheduledDate) > today).length,
      archive:  items.filter(i => i.status === ContentStatus.PUBLISHED && !!i.scheduledDate && new Date(i.scheduledDate) < today).length,
    };
  }, [items]);

  // ── Returns conditionnels (après tous les hooks) ──────────────────────────

  if (checkingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-light dark:bg-dark-bg">
        <Loader2 className="w-8 h-8 text-brand-main dark:text-dark-text animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const today = new Date();

  return (
    <div className="h-screen bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text font-sans flex flex-col transition-colors duration-200 overflow-hidden">
      
      <header className="bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border flex-shrink-0 z-30">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-8">
            <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 text-brand-main dark:text-white"
            >
                <Menu className="w-6 h-6" />
            </button>

            <div className="w-8 h-8 bg-gradient-to-tr from-brand-main to-brand-hover rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0">
              L
            </div>

            <div className="hidden md:flex space-x-2">
                <button
                    onClick={() => updateRoute('social', currentSocialTab)}
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
                    onClick={() => updateRoute('clients', 'ideas')}
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
            </div>
          </div>
          
          <div className="flex items-center gap-2">
               <button 
                  onClick={() => syncWithNotion(true)}
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

      <div className="flex-1 flex overflow-hidden relative">
        
        {(isSyncing) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-dark-bg/60 backdrop-blur-[1px]">
                <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-dark-surface rounded-2xl shadow-xl border border-brand-border dark:border-dark-sec-border animate-in fade-in zoom-in duration-200">
                    <Loader2 className="w-10 h-10 text-brand-main dark:text-dark-text animate-spin mb-3" />
                    <p className="text-sm font-semibold text-brand-main dark:text-dark-text">Synchronisation Notion...</p>
                </div>
            </div>
        )}

        {isInitializing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand-light dark:bg-dark-bg">
                <Loader2 className="w-8 h-8 text-brand-main dark:text-dark-text animate-spin" />
            </div>
        )}

        <Sidebar 
            currentSpace={currentSpace}
            currentSocialTab={currentSocialTab}
            onNavigate={(space, tab) => updateRoute(space, tab)}
            counts={counts}
            isMobileOpen={isMobileMenuOpen}
            onMobileClose={() => setIsMobileMenuOpen(false)}
            onOpenSettings={() => setIsContextManagerOpen(true)}
        />

        {currentSpace === 'clients' && (
            <div className="flex-1 flex flex-col items-center justify-center text-brand-main/50 dark:text-dark-text/50 relative overflow-y-auto">
                <div className="bg-white dark:bg-dark-surface p-12 rounded-2xl shadow-sm border border-brand-border dark:border-dark-sec-border text-center max-w-md mx-4">
                    <Users className="w-16 h-16 mx-auto mb-6 text-brand-200 dark:text-dark-text/30" />
                    <h2 className="text-xl font-bold text-brand-main dark:text-white mb-2">Espace Clients</h2>
                    <p className="text-sm">Cet espace est en cours de construction. Bientôt, vous pourrez gérer vos CRM et vos projets clients ici.</p>
                </div>
            </div>
        )}

        {currentSpace === 'social' && (
            <main className="flex-1 overflow-hidden relative flex flex-col">
                
                {editingItem && editingItem.status !== ContentStatus.IDEA ? (
                    <ContentEditor 
                        item={editingItem} 
                        contexts={contexts}
                        aiModels={aiModels}
                        onClose={handleCloseEditor}
                        onSave={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        onManageContexts={handleOpenContextManagerFromEditor}
                        activeStep={currentEditorStep}
                        onStepChange={handleStepChange}
                    />
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        
                        <div className="sticky top-0 bg-brand-light/95 dark:bg-dark-bg/95 backdrop-blur z-10 px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b md:border-none border-brand-border dark:border-dark-sec-border">
                             <h2 className="text-xl md:text-2xl font-bold text-brand-main dark:text-white flex items-center gap-2">
                                 {currentSocialTab === 'drafts' && 'Brouillons en cours'}
                                 {currentSocialTab === 'ready' && 'Prêts pour publication'}
                                 {currentSocialTab === 'ideas' && 'Idées & Inspiration'}
                                 {currentSocialTab === 'calendar' && 'Planning'}
                                 {currentSocialTab === 'archive' && 'Archives'}
                             </h2>
                        </div>

                        <div className="px-4 md:px-6 pb-12 max-w-6xl mx-auto mt-4 md:mt-0">
                            
                            {currentSocialTab === 'ideas' && (
                                <SocialIdeasView 
                                    items={ideaItems}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    onEdit={handleEditItem}
                                    onQuickAdd={handleQuickAddIdea}
                                    onGlobalAnalyze={handleGlobalAnalysis}
                                    isSyncing={isSyncing}
                                    isInitializing={isInitializing}
                                    onNavigateToIdeas={() => {}} 
                                />
                            )}

                            {currentSocialTab === 'drafts' && (
                                <SocialGridView 
                                    items={draftingItems} 
                                    type="drafts" 
                                    searchQuery={searchQuery} 
                                    isInitializing={isInitializing} 
                                    onEdit={handleEditItem} 
                                    onNavigateToIdeas={() => updateRoute('social', 'ideas')} 
                                />
                            )}

                            {currentSocialTab === 'ready' && (
                                <SocialGridView 
                                    items={readyItems} 
                                    type="ready" 
                                    searchQuery={searchQuery} 
                                    isInitializing={isInitializing} 
                                    onEdit={handleEditItem} 
                                    onNavigateToIdeas={() => updateRoute('social', 'ideas')} 
                                />
                            )}

                            {currentSocialTab === 'archive' && (
                                <SocialGridView 
                                    items={archiveItems} 
                                    type="archive" 
                                    searchQuery={searchQuery} 
                                    isInitializing={isInitializing} 
                                    onEdit={handleEditItem} 
                                    onNavigateToIdeas={() => updateRoute('social', 'ideas')} 
                                />
                            )}

                            {currentSocialTab === 'calendar' && (
                                <div className="h-[calc(100vh-250px)] animate-fade-in">
                                    <CalendarView items={items} onItemClick={handleEditItem} />
                                </div>
                            )}

                        </div>
                    </div>
                )}

                {editingItem && editingItem.status === ContentStatus.IDEA && (
                    <IdeaModal
                        item={editingItem}
                        onClose={handleCloseEditor}
                        onChange={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        onTransformToDraft={handleTransformToDraft}
                        onAnalyze={() => triggerSingleAnalysis(editingItem)}
                        isReanalyzing={isSingleAnalyzing}
                    />
                )}

                <SettingsModal 
                    isOpen={isContextManagerOpen}
                    onClose={() => setIsContextManagerOpen(false)}
                    contexts={contexts}
                    onContextsChange={handleContextsChange}
                    aiModels={aiModels}
                    onModelsChange={handleModelsChange}
                />

                <AnalysisModal 
                    isOpen={batchAnalysisState.isOpen}
                    onClose={() => setBatchAnalysisState({ ...batchAnalysisState, isOpen: false })}
                    itemsToAnalyze={items.filter(i => i.status === ContentStatus.IDEA && !i.analyzed)}
                    contexts={contexts}
                    aiModels={aiModels}
                    selectedContextId={batchAnalysisState.contextId}
                    selectedModelId={batchAnalysisState.modelId}
                    onAnalysisComplete={handleAnalysisComplete}
                />
                
                <AlertModal 
                    isOpen={alertInfo.isOpen}
                    onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
                    title={alertInfo.title}
                    message={alertInfo.message}
                    type={alertInfo.type}
                />

                <AIConfigModal 
                    isOpen={aiConfigState.isOpen}
                    onClose={() => setAiConfigState({ ...aiConfigState, isOpen: false })}
                    onConfirm={handleAIConfigConfirm}
                    contexts={contexts}
                    aiModels={aiModels}
                    actionType="analyze"
                    onManageContexts={handleOpenContextManagerFromEditor}
                />
            </main>
        )}
      </div>
    </div>
  );
}

export default App;
