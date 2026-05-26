import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, LogOut, Loader2, AlertCircle, Users, Menu, Cpu, ChevronDown } from 'lucide-react';
import { ContentItem, ContentStatus, AIModel, Verdict, Platform, DisplayPrefs, isTargetOffer, isProfondeur } from './types';
import * as NotionService from './services/notionService';
import * as StorageService from './services/storageService';
import { AI_ACTIONS } from './ai/actions';
import * as OneMinService from './services/oneMinService';

import SettingsPanel from './components/SettingsPanel';
import ContentEditor, { EditorStep } from './components/ContentEditor';
import { bodyJsonToText } from './ai/formats';
import { IdeaModal } from './components/IdeaModal'; 
import AnalysisModal from './components/AnalysisModal';
import CalendarView from './components/CalendarView';
import { LoginPage } from './components/LoginPage';
import { isAuthenticated, logout } from './auth';
import { AlertModal } from './components/CommonModals';
import SubtitleConverter from './components/SubtitleConverter';
import PsychedelicsCalculator from './components/PsychedelicsCalculator';

// Components refactorisés
import { Sidebar } from './components/Layout/Sidebar';
import { MobileSubTabs } from './components/Layout/MobileSubTabs';
import { SocialIdeasView } from './components/Views/SocialIdeasView';
import { SocialGridView } from './components/Views/SocialGridView';

type SpaceView = 'social' | 'clients' | 'videos' | 'psychedelics';
type SocialTab = 'drafts' | 'ready' | 'ideas' | 'calendar' | 'archive';

const getSpaceHash = (space: SpaceView) => {
    if (space === 'psychedelics') return 'psychedeliques';
    return space;
};

const getHashState = () => {
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    
    let space: SpaceView = 'social';
    if (parts[0] === 'clients') space = 'clients';
    if (parts[0] === 'videos') space = 'videos';
    if (parts[0] === 'psychedelics' || parts[0] === 'psychedeliques') space = 'psychedelics';
    
    let tab: SocialTab = 'ideas'; 
    if (parts[1] && ['drafts', 'ready', 'ideas', 'calendar', 'archive'].includes(parts[1])) {
        tab = parts[1] as SocialTab;
    }

    const itemId = parts[2] && parts[2].trim() !== '' ? parts[2] : null;
    
    let step: EditorStep = 'idea';
    const LEGACY_STEP_MAP: Record<string, EditorStep> = {
        'interview': 'atelier', 'content': 'atelier',
    };
    if (parts[3]) {
        if (['idea', 'atelier', 'brouillon', 'slides', 'postcourt', 'script'].includes(parts[3])) {
            step = parts[3] as EditorStep;
        } else if (LEGACY_STEP_MAP[parts[3]]) {
            step = LEGACY_STEP_MAP[parts[3]];
        }
    }

    return { space, tab, itemId, step };
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSingleAnalyzing, setIsSingleAnalyzing] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [currentSpace, setCurrentSpace] = useState<SpaceView>('social');
  const [currentSocialTab, setCurrentSocialTab] = useState<SocialTab>('ideas');
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [currentEditorStep, setCurrentEditorStep] = useState<EditorStep>('idea');
  const [pendingEditorAction, setPendingEditorAction] = useState<'interview' | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [settingsPanelInitialTab, setSettingsPanelInitialTab] = useState<'display' | 'models' | 'personas'>('display');

  const [displayPrefs, setDisplayPrefsState] = useState<DisplayPrefs>(() => StorageService.getDisplayPrefs());

  const handleDisplayPrefsChange = (prefs: DisplayPrefs) => {
      setDisplayPrefsState(prefs);
      StorageService.setDisplayPrefs(prefs);
  };

  // Modèle IA actif — vérité runtime localStorage, seedé depuis le modèle Notion « Défaut ».
  const [activeModelId, setActiveModelIdState] = useState<string>(
      () => StorageService.getActiveModelId() || ''
  );

  // State for Batch Analysis Execution Modal
  const [batchAnalysisState, setBatchAnalysisState] = useState<{
      isOpen: boolean;
      modelId: string;
  }>({ isOpen: false, modelId: '' });

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
      let hash = `${getSpaceHash(space)}`;
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
      let cachedModels: AIModel[] = [];
      try {
          [cachedItems, cachedModels] = await Promise.all([
              StorageService.getCachedContent(),
              StorageService.getCachedModels()
          ]);

          if (cachedItems.length > 0) setItems(cachedItems);
          if (cachedModels.length > 0) setAiModels(cachedModels);

      } catch (e) {
          console.error("Erreur lecture cache:", e);
      } finally {
          setIsInitializing(false);
          syncWithNotion(false, { items: cachedItems, models: cachedModels });
      }
  };

  const syncWithNotion = async (
      forceFullSync = false,
      baseCache?: { items?: ContentItem[]; models?: AIModel[] }
  ) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);

    try {
        const nowIso = new Date().toISOString();
        const fullSyncThresholdMs = 24 * 60 * 60 * 1000;

        const lastContentSync = StorageService.getLastSync("content");
        const lastModelsSync = StorageService.getLastSync("models");

        const lastContentFullSync = StorageService.getLastFullSync("content");
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
        const modelsSince = forceFullSync
            ? undefined
            : (shouldFullSync(lastModelsFullSync) ? undefined : lastModelsSync || undefined);

        const [fetchedContent, fetchedModels] = await Promise.all([
            NotionService.fetchContent(contentSince),
            NotionService.fetchModels(modelsSince)
        ]);

        const baseItems = contentSince ? (baseCache?.items ?? items) : [];
        const baseModels = modelsSince ? (baseCache?.models ?? aiModels) : [];

        const nextItems = sortByLastEditedDesc(
            contentSince ? mergeById(baseItems, fetchedContent) : fetchedContent
        );
        const nextModels = modelsSince ? mergeById(baseModels, fetchedModels) : fetchedModels;

        setItems(nextItems);
        setAiModels(nextModels);

        await Promise.all([
            StorageService.setCachedContent(nextItems),
            StorageService.setCachedModels(nextModels)
        ]);

        StorageService.setLastSync("content", nowIso);
        StorageService.setLastSync("models", nowIso);

        if (!contentSince) StorageService.setLastFullSync("content", nowIso);
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
    setAiModels([]);
    setIsInitializing(true);
  };

  const handleModelsChange = (newModels: AIModel[]) => {
      setAiModels(newModels);
      StorageService.setCachedModels(newModels);
  };

  // Seed du modèle actif depuis le « Défaut » Notion, tant que l'utilisateur n'a pas choisi explicitement.
  useEffect(() => {
      if (StorageService.getActiveModelId()) return; // choix explicite déjà fait
      const def = aiModels.find(m => m.isDefault) || aiModels[0];
      if (def) setActiveModelIdState(def.apiCode);
  }, [aiModels]);

  const handleActiveModelChange = (modelId: string) => {
      setActiveModelIdState(modelId);
      StorageService.setActiveModelId(modelId);
      // Write-back Notion best-effort : la case « Défaut » suit le choix.
      const chosen = aiModels.find(m => m.apiCode === modelId);
      const previousDefaults = aiModels.filter(m => m.isDefault && m.apiCode !== modelId);
      previousDefaults.forEach(m => NotionService.setModelDefault(m.id, false).catch(console.error));
      if (chosen) NotionService.setModelDefault(chosen.id, true).catch(console.error);
      // Reflète l'état localement
      setAiModels(prev => prev.map(m => ({ ...m, isDefault: m.apiCode === modelId })));
  };

  const handleQuickAddIdea = async (title: string, notes: string, targetFormat?: string | null) => {
    setIsSyncing(true);
    try {
        const newItem = await NotionService.createContent(title, notes, targetFormat ?? null);
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
      // Plus de modale de config : on ouvre directement l'exécuteur batch avec le modèle actif.
      // AnalysisModal a son propre écran de démarrage (confirmation + progression).
      setBatchAnalysisState({ isOpen: true, modelId: activeModelId });
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

  const handleTransformToDraft = async (
    updatedItem: ContentItem,
    options?: { launchInterview?: boolean }
  ): Promise<void> => {
    // Sauvegarder l'item avec le nouveau statut DRAFTING
    await handleUpdateItem(updatedItem);
    // Indiquer à ContentEditor qu'il doit lancer l'interview dès l'ouverture
    if (options?.launchInterview) {
        setPendingEditorAction('interview');
    }
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

  // --- AI ANALYSIS FLOW (sans modale — modèle actif global) ---

  const triggerSingleAnalysis = (item: ContentItem) => {
      void performSingleAnalysis(activeModelId, item.id);
  };

  const performSingleAnalysis = async (modelId: string, itemId?: string) => {
      const itemToAnalyze = items.find(i => i.id === itemId);
      if (!itemToAnalyze) return;

      setIsSingleAnalyzing(true);
      try {
          const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
          const systemInstruction = actionConfig.getSystemInstruction(undefined);

          const contentPayload = [{
              id: itemToAnalyze.id,
              titre: itemToAnalyze.title,
              notes: itemToAnalyze.notes,
              format_cible: itemToAnalyze.targetFormat || "Non précisé",
          }];
          
          const responseText = await OneMinService.generateContent({
              model: modelId,
              systemInstruction: systemInstruction,
              prompt: JSON.stringify(contentPayload)
          });

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

              // Le format cible est choisi par l'utilisateur et ne doit pas être écrasé par l'IA
              const targetOffer = isTargetOffer(res.cible_offre) ? res.cible_offre : undefined;
              const justification = typeof res.justification === 'string' ? res.justification : undefined;
              const suggestedMetaphor = typeof res.metaphore_suggeree === 'string' ? res.metaphore_suggeree : undefined;
              const suggestedTitle = typeof res.titre === 'string' ? res.titre : undefined;
              const depth = isProfondeur(res.profondeur) ? res.profondeur : undefined;

              const modelName = aiModels.find(m => m.apiCode === modelId)?.name || modelId;
              const signature = `\n\n_Généré par : ${modelName} - le ${new Date().toLocaleString('fr-FR')}_`;

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
                  // targetFormat non modifié : contrôlé par l'utilisateur dans IdeaModal
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

  const openSettingsFromSidebar = () => {
      setSettingsPanelInitialTab('display');
      setIsSettingsPanelOpen(true);
  };

  // ── Hooks dérivés — TOUJOURS avant tout return conditionnel ──────────────

  const filteredItems = useMemo(() => items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bodyJsonToText(item.body).toLowerCase().includes(searchQuery.toLowerCase()) ||
    bodyJsonToText(item.scriptVideo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const isEditorTakeover = currentSpace === 'social' && !!editingItem && editingItem.status !== ContentStatus.IDEA;

  return (
    <div className="flex h-screen bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text font-sans transition-colors duration-200 overflow-hidden border-t border-brand-border dark:border-dark-sec-border">

      <Sidebar
          currentSpace={currentSpace}
          currentSocialTab={currentSocialTab}
          onNavigate={(space, tab) => updateRoute(space, tab)}
          counts={counts}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
          onOpenSettings={openSettingsFromSidebar}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

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

        <header className="h-[52px] px-4 md:px-6 flex items-center justify-between border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden p-2 -ml-1 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors"
              >
                  <Menu className="w-5 h-5" />
              </button>

              <h1 className="font-bold text-sm text-brand-main dark:text-white truncate">
                  {currentSpace === 'social' && currentSocialTab === 'ideas' && 'Boîte à idées'}
                  {currentSpace === 'social' && currentSocialTab === 'drafts' && 'En cours'}
                  {currentSpace === 'social' && currentSocialTab === 'ready' && 'Prêts à publier'}
                  {currentSpace === 'social' && currentSocialTab === 'calendar' && 'Calendrier'}
                  {currentSpace === 'social' && currentSocialTab === 'archive' && 'Archives'}
                  {currentSpace === 'clients' && 'Clients'}
                  {currentSpace === 'videos' && 'Sous-titres'}
                  {currentSpace === 'psychedelics' && 'Psychédéliques'}
              </h1>
            </div>

            <div className="flex items-center gap-1.5">
                 {/* Sélecteur global du modèle IA — utilisé par toutes les actions */}
                 <div className="relative flex items-center">
                     <Cpu className="w-[13px] h-[13px] absolute left-2 text-brand-main/40 dark:text-dark-text/40 pointer-events-none" />
                     <select
                        value={activeModelId}
                        onChange={(e) => handleActiveModelChange(e.target.value)}
                        title="Modèle IA utilisé par toutes les actions"
                        className="appearance-none pl-7 pr-7 py-1.5 max-w-[180px] truncate rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg text-xs font-semibold text-brand-main dark:text-white outline-hidden focus:border-brand-main dark:focus:border-white transition-colors cursor-pointer"
                     >
                        {aiModels.length === 0 && <option value="">Aucun modèle configuré</option>}
                        {aiModels.map(m => (
                            <option key={m.id} value={m.apiCode}>{m.name}</option>
                        ))}
                     </select>
                     <ChevronDown className="w-3 h-3 absolute right-2 text-brand-main/40 dark:text-dark-text/40 pointer-events-none" />
                 </div>

                 <button
                    onClick={() => syncWithNotion(true)}
                    disabled={isSyncing}
                    className="p-2 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg hover:text-brand-main dark:hover:text-white transition-colors disabled:opacity-40 disabled:animate-spin"
                    title="Synchroniser avec Notion"
                 >
                     <RefreshCw className="w-[14px] h-[14px]" />
                 </button>
                 <button
                    onClick={handleLogout}
                    className="p-2 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                    title="Déconnexion"
                 >
                     <LogOut className="w-[14px] h-[14px]" />
                 </button>
            </div>
        </header>

        {currentSpace === 'social' && !isEditorTakeover && (
          <MobileSubTabs
              currentTab={currentSocialTab}
              onNavigate={(tab) => updateRoute('social', tab)}
              counts={counts}
          />
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 p-2 text-center text-xs shrink-0 animate-fade-in">
              <span className="text-red-700 dark:text-red-300 flex items-center justify-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                  </div>
                  <button onClick={syncWithNotion} className="underline font-bold hover:text-red-900 dark:hover:text-white ml-2">Réessayer</button>
              </span>
          </div>
        )}

        {currentSpace === 'clients' && (
            <div className="flex-1 flex flex-col items-center justify-center text-brand-main/50 dark:text-dark-text/50 relative overflow-y-auto">
                <div className="bg-white dark:bg-dark-surface p-12 rounded-2xl shadow-xs border border-brand-border dark:border-dark-sec-border text-center max-w-md mx-4">
                    <Users className="w-16 h-16 mx-auto mb-6 text-brand-200 dark:text-dark-text/30" />
                    <h2 className="text-xl font-bold text-brand-main dark:text-white mb-2">Espace Clients</h2>
                    <p className="text-sm">Cet espace est en cours de construction. Bientôt, vous pourrez gérer vos CRM et vos projets clients ici.</p>
                </div>
            </div>
        )}

        {currentSpace === 'videos' && (
            <main className="flex-1 overflow-y-auto">
                <div className="px-4 md:px-6 py-5">
                    <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mb-4">
                        Convertissez un fichier .srt en titres Final Cut Pro (.fcpxml)
                    </p>
                    <SubtitleConverter aiModels={aiModels} />
                </div>
            </main>
        )}

        {currentSpace === 'psychedelics' && (
            <main className="flex-1 overflow-y-auto">
                <div className="px-4 md:px-6 py-5">
                    <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mb-4">
                        Calculateur de repères de dosage et aide à la réduction des risques
                    </p>
                    <PsychedelicsCalculator />
                </div>
            </main>
        )}

        {currentSpace === 'social' && (
            <main className="flex-1 overflow-hidden relative flex flex-col">

                {editingItem && editingItem.status !== ContentStatus.IDEA ? (
                    <ContentEditor
                        item={editingItem}
                        aiModels={aiModels}
                        activeModelId={activeModelId}
                        onClose={handleCloseEditor}
                        onSave={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        activeStep={currentEditorStep}
                        onStepChange={handleStepChange}
                        initialAction={pendingEditorAction}
                        onInitialActionConsumed={() => setPendingEditorAction(null)}
                    />
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className="px-4 md:px-6 py-5 max-w-6xl mx-auto">

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
                                    displayPrefs={displayPrefs}
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
                                    displayPrefs={displayPrefs}
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
                                    displayPrefs={displayPrefs}
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
                                    displayPrefs={displayPrefs}
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

                <AnalysisModal
                    isOpen={batchAnalysisState.isOpen}
                    onClose={() => setBatchAnalysisState({ ...batchAnalysisState, isOpen: false })}
                    itemsToAnalyze={items.filter(i => i.status === ContentStatus.IDEA && !i.analyzed)}
                    aiModels={aiModels}
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
            </main>
        )}
      </div>

      <SettingsPanel
          isOpen={isSettingsPanelOpen}
          onClose={() => setIsSettingsPanelOpen(false)}
          displayPrefs={displayPrefs}
          onDisplayPrefsChange={handleDisplayPrefsChange}
          aiModels={aiModels}
          onModelsChange={handleModelsChange}
          activeModelId={activeModelId}
          onActiveModelChange={handleActiveModelChange}
          initialTab={settingsPanelInitialTab}
      />
    </div>
  );
}

export default App;
