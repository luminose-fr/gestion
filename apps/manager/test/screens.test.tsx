/**
 * @vitest-environment jsdom
 *
 * Tests de montage des écrans.
 *
 * Ce que ces tests protègent : le 16/08/2026, un useEffect placé après le
 * `if (!isOpen) return null;` de SettingsPanel a passé typecheck ET build, a été
 * déployé, et rendait une page blanche au clic sur Réglages (React refuse un
 * nombre de hooks variable entre deux rendus). Aucun outil statique ne voit ça —
 * seul un rendu réel le voit.
 *
 * D'où la règle : tout composant doit être monté ici, et tout composant qui a un
 * retour anticipé doit être monté dans les DEUX états.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import SettingsSpace from '../components/Settings/SettingsSpace';
import CorpusSpace from '../components/Corpus/CorpusSpace';
import { Sidebar } from '../components/Layout/Sidebar';
import { MobileSubTabs } from '../components/Layout/MobileSubTabs';
import DocumentsView from '../components/Corpus/DocumentsView';
import InboxView from '../components/Corpus/InboxView';
import Markdown from '../components/Corpus/Markdown';
import * as Api from '../services/apiService';
import { SETTINGS_SECTIONS } from '../components/Settings/sections';
import { PERSONAS_NAV } from '../components/Settings/apercus';
import { AI_ACTION_CATALOG } from '@luminose/editorial';
import { LoginPage } from '../components/LoginPage';
import CalendarView from '../components/CalendarView';
import SubtitleConverter from '../components/SubtitleConverter';
import PsychedelicsCalculator from '../components/PsychedelicsCalculator';
import { SocialIdeasView } from '../components/Views/SocialIdeasView';
import { SocialGridView, TRI_CONTENUS_DEFAUT } from '../components/Views/SocialGridView';
import { SeriesView, TRI_SERIES_DEFAUT } from '../components/Series/SeriesView';
import { SeriePlanView } from '../components/Series/SeriePlanView';
import { ConfirmSuppressionSerie } from '../components/Series/ConfirmSuppressionSerie';
import { CoachChat } from '../components/CoachChat';
import { DraftView } from '../components/ContentEditor/DraftView';
import { Barre, BandeauActivite, EnCours, FiletActivite, Patience } from '../components/Feedback';
import * as Activite from '../services/activityService';
import { ContentStatus, DEFAULT_DISPLAY_PREFS } from '../types';
import type { AIModel, ContentItem, Serie, CoachMessage, CoachSession } from '../types';

const now = Date.now();

const MODELS: AIModel[] = [
  {
    id: 'm1', name: 'GPT-5.2 Pro', apiCode: 'gpt-5.2-pro',
    provider: 'onemin', vendor: 'OpenAI', cost: 'high',
    strengths: '', bestUseCases: '', textQuality: 5, isDefault: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
];

const ITEM: ContentItem = {
  id: 'i1', title: 'Le piège chinois', status: ContentStatus.DRAFTING, platforms: [],
  targetFormat: null, objectif: null, depth: null,
  analyzedAt: null, verdict: null, strategicAngle: null, justification: null,
  suggestedMetaphor: null, notes: '', draft: null, slides: null,
  coachStatus: null, coachFormatCible: null, coachBrief: null, coachValidatedAt: null,
  serieId: null, angle: null, seriePosition: null, scheduledDate: null, legacyJson: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};

const SERIE: Serie = {
  id: 's1', titre: 'Qu’est-ce qu’un psychopraticien transpersonnel ?',
  intention: 'Faire comprendre le métier', statut: 'en_cours', sourceContentId: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};

const noop = () => {};
const asyncNoop = async () => {};

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
});

afterEach(() => cleanup());

describe('espace Réglages', () => {
  const props = {
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    onDisplayPrefsChange: noop,
    aiModels: MODELS,
    onModelsChange: noop,
    activeModelId: 'm1',
    onActiveModelChange: noop,
    actionModels: {},
    onActionModelsChange: noop,
    providers: [
      { id: 'onemin', label: '1min.ai', configured: true, hint: '…f4d9', source: 'environnement' as const, updatedAt: null },
      { id: 'openrouter', label: 'OpenRouter', configured: true, hint: '…0000', source: 'base' as const, updatedAt: 1 },
      { id: 'openai', label: 'OpenAI', configured: false, hint: null, source: null, updatedAt: null },
    ],
    onProvidersChange: noop,
  };

  /**
   * Chaque section est un état de rendu distinct — c'est la règle née de la
   * page blanche de SettingsPanel : ce qui n'est pas monté ici n'est vérifié
   * par rien.
   */
  it.each(SETTINGS_SECTIONS.map(s => s.id))('la section %s se monte', (section) => {
    expect(() => render(<SettingsSpace {...(props as any)} section={section} />)).not.toThrow();
  });

  /**
   * L'écran de mesures a un métier précis : rendre lisible le DÉBIT. C'est lui
   * qui sépare « le modèle produit trop » de « l'hébergeur est lent », et les
   * deux ne se corrigent pas au même endroit — l'un dans un budget de
   * réflexion, l'autre dans un suffixe de routage.
   */
  it('affiche le débit, la durée et les échecs de chaque action', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      mesures: [{
        action: 'DRAFT_CONTENT', format: 'Article (long/SEO)', modelLabel: 'Kimi K3',
        provider: 'openrouter', appels: 3, echecs: 1,
        entreeMoy: 16264, sortieMoy: 18073, sortieMax: 19000,
        dureeMoyMs: 594_000, dureeMaxMs: 600_000, feuilleCarMoy: 24178,
        coutTotal: 0.96, jetonsParSeconde: 30.4, dernier: now,
      }],
    }), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="mesures" />);
    await findByText('DRAFT_CONTENT');

    expect(container.textContent).toContain('Article (long/SEO)');
    expect(container.textContent).toContain('Kimi K3');
    expect(container.textContent).toContain('30,4');      // jetons par seconde
    expect(container.textContent).toContain('9,9 min');   // la durée, en clair
    expect(container.textContent).toContain('0,960 $');
  });

  it('dit qu’il n’y a rien, plutôt que de montrer un tableau vide', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ mesures: [] }), { status: 200 }));
    const { findByText } = render(<SettingsSpace {...(props as any)} section="mesures" />);
    await findByText(/Aucun appel mesuré/);
  });

  const QUOTAS = (postes: unknown[]) => ({
    postes, depuis: '2026-09-01T00:00:00.000Z', seuilsReleves: '2026-09-01',
  });

  it('affiche chaque poste avec sa part et son état', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(QUOTAS([
      { id: 'workers-requetes', service: 'Workers', libelle: 'Requêtes',
        valeur: 1500, seuil: 100_000, unite: 'requetes', periode: 'jour' },
      { id: 'd1-lignes-ecrites', service: 'D1', libelle: 'Lignes écrites',
        valeur: 92_000, seuil: 100_000, unite: 'lignes', periode: 'jour' },
      { id: 'd1-stockage', service: 'D1', libelle: 'Stockage',
        valeur: 12_500_000, seuil: 5_000_000_000, unite: 'octets', periode: 'total' },
    ])), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="quotas" />);
    await findByText('Requêtes');

    expect(container.textContent).toContain('1,5 %');
    expect(container.textContent).toContain('dans le plan gratuit');
    // Un poste à 92 % doit le DIRE, pas seulement changer de teinte : une
    // alerte portée par la seule couleur n'existe pas pour tout le monde.
    expect(container.textContent).toContain('92 %');
    expect(container.textContent).toContain('proche du plafond');
    // Les octets se lisent en unité, pas en chiffre brut.
    expect(container.textContent).toContain('12,5 Mo');
  });

  /**
   * NORMATIF — un poste non renseigné ne s'affiche jamais comme un poste à
   * zéro. « Je ne sais pas ce que je consomme » et « je ne consomme rien » se
   * lisent à l'envers l'un de l'autre, et c'est le second qui rassure à tort.
   */
  it('dit « non communiqué » plutôt que zéro — NORMATIF', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(QUOTAS([
      { id: 'workers-requetes', service: 'Workers', libelle: 'Requêtes',
        valeur: null, seuil: 100_000, unite: 'requetes', periode: 'jour',
        note: 'Cloudflare : unknown field "max"' },
    ])), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="quotas" />);
    await findByText('Requêtes');

    expect(container.textContent).toContain('non communiqué');
    expect(container.textContent).not.toContain('0 %');
    // Et la raison voyage jusqu'au lecteur : un poste muet dit ce qui lui manque.
    expect(container.textContent).toContain('unknown field');
  });

  /**
   * Un jeton absent est un refus, pas une panne : l'écran doit afficher la
   * commande à taper, pas « Erreur interne ». C'est le défaut qui avait rendu
   * invisible le conseil le plus utile de l'application (§ refus.ts).
   */
  it('affiche la commande à taper quand le jeton manque', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ error: 'Aucun jeton d’analytics Cloudflare. Posez-le en secret : npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN (portée « Account Analytics: Read »).' }),
      { status: 409 },
    ));

    const { findByText } = render(<SettingsSpace {...(props as any)} section="quotas" />);
    expect(await findByText(/CLOUDFLARE_ANALYTICS_TOKEN/)).toBeTruthy();
  });

  it('range le catalogue sous ses adaptateurs', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="models" />);
    expect(container.textContent).toContain('1min.ai');
    expect(container.textContent).toContain('OpenRouter');
    // Le modèle de test est sur l'adaptateur onemin : il tombe sous son groupe,
    // et l'adaptateur sans modèle le dit plutôt que de disparaître.
    expect(container.textContent).toContain('GPT-5.2 Pro');
    // OpenRouter a une clé mais aucun modèle : il se montre, et il le dit.
    expect(container.textContent).toContain('Aucun modèle sur cet adaptateur');
  });

  /**
   * Le conseil doit être là où se prend la décision : sous chaque famille, et
   * sur chaque carte. En préambule, il ne sert qu'à la première lecture.
   */
  it('donne le conseil de choix par famille ET par action', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="presets" />);
    for (const famille of ['Juger', 'Recopier', 'Synthétiser', 'Porter la voix']) {
      expect(container.textContent).toContain(famille);
    }
    // Ce que la famille implique pour la dépense…
    expect(container.textContent).toContain('c’est là qu’est le volume');
    // …et ce qui est propre à une action.
    expect(container.textContent).toContain('la conversation grossit à chaque tour');
    expect(container.textContent).not.toContain('Ce qui compte vraiment');
  });

  it('les sélecteurs d’action rangent les modèles sous leur adaptateur', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="presets" />);
    const groupes = container.querySelectorAll('optgroup');
    expect(groupes.length).toBeGreaterThan(0);
    expect(Array.from(groupes).map(g => g.getAttribute('label'))).toContain('1min.ai');
  });

  /**
   * Trois adaptateurs, deux avec une clé, des modèles sur un seul : OpenRouter
   * se montre vide (il a une clé, on va lui en ajouter), OpenAI disparaît.
   * On compte le message de groupe vide — « OpenAI » apparaît aussi comme
   * FABRICANT sur une carte, ce qui ne dit rien du catalogue.
   */
  it('laisse hors du catalogue un adaptateur sans clé ni modèle', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="models" />);
    const vides = container.textContent?.match(/Aucun modèle sur cet adaptateur/g) ?? [];
    expect(vides).toHaveLength(1);
  });

  /**
   * L'explorateur est un état de rendu à part entière : il se monte, et il
   * annonce ce que ses indices mesurent — sinon on les prend pour un verdict.
   */
  const catalogueStub = (over: Record<string, unknown> = {}) => ({
    models: [{
      id: 'anthropic/claude-fable-5', name: 'Claude Fable 5', contextLength: 1000000,
      promptPrice: 10, completionPrice: 50, intelligence: 71.2, coding: 65.8, agentic: 58.3,
      elo: 1932.4, ecriture: 16.81, slop: 10.28, suivi: 18.49,
      forces: ['Rythme', "Évite l'emphase"],
      selection: true, palier: 'premium', palierLibelle: '> 15 $',
    }],
    benchmarksAvailable: true, benchmarksReason: null,
    ecritureAvailable: true, ecritureReason: null,
    selection: ['anthropic/claude-fable-5'], fetchedAt: Date.now(),
    ...over,
  });

  it('l’explorateur de catalogue se monte et dit ce qu’il mesure', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(catalogueStub()), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="models" />);
    fireEvent.click(await findByText('Explorer le catalogue OpenRouter'));

    expect(container.textContent).toContain('aucune tâche de votre flux');
    expect(await findByText('anthropic/claude-fable-5')).toBeTruthy();
    // La colonne la plus parlante ne doit pas se lire à l'envers.
    expect(container.textContent).toContain('plus bas est meilleur');
  });

  it('l’explorateur s’ouvre sur la courte liste et sait montrer le reste', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(catalogueStub()), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="models" />);
    fireEvent.click(await findByText('Explorer le catalogue OpenRouter'));
    await findByText('anthropic/claude-fable-5');

    expect(container.textContent).toContain('La sélection · 1');
    expect(container.textContent).toContain('Tout le catalogue · 1');
    fireEvent.click(await findByText('Tout le catalogue · 1'));
    expect(container.textContent).toContain('sélection · > 15 $');
  });

  /** EQ-Bench n'est pas une API publiée : son absence doit se voir, pas se subir. */
  it('sans notes d’écriture, l’explorateur bascule sur le catalogue entier et le dit', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(catalogueStub({
      ecritureAvailable: false, ecritureReason: 'injoignable', selection: [],
      models: [{
        id: 'anthropic/claude-fable-5', name: 'Claude Fable 5', contextLength: 1000000,
        promptPrice: 10, completionPrice: 50, intelligence: 71.2, coding: 65.8, agentic: 58.3,
        elo: null, ecriture: null, slop: null, suivi: null, forces: [],
        selection: false, palier: null, palierLibelle: null,
      }],
    })), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="models" />);
    fireEvent.click(await findByText('Explorer le catalogue OpenRouter'));
    await findByText('anthropic/claude-fable-5');

    expect(container.textContent).toContain("Notes d'écriture indisponibles (injoignable)");
    expect(container.textContent).not.toContain('La sélection ·');
  });

  it('n’affiche jamais autre chose que l’empreinte d’une clé', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="providers" />);
    expect(container.textContent).toContain('…f4d9');
    expect(container.textContent).toContain('Aucune clé');
  });

  /**
   * L'écran Personas ne liste plus rien : la liste est passée dans le panneau
   * de troisième niveau, et l'écran montre le détail du rôle que porte la
   * route. Ce qui compte ici est qu'un rôle sans feuille DISE qu'il n'en a
   * pas — un vide se lit comme un oubli, et un écran de vérification qui
   * laisse croire à un oubli est pire que pas d'écran.
   */
  it('sans role dans la route, ouvre le premier plutot qu\u2019un ecran vide', () => {
    vi.spyOn(Api, 'fetchFeuilleAction').mockReturnValue(new Promise(() => {}) as any);
    const { container } = render(<SettingsSpace {...(props as any)} section="personas" persona={null} />);
    expect(container.textContent).toContain(PERSONAS_NAV[0].persona);
    expect(container.textContent).toContain(AI_ACTION_CATALOG[0].id);
  });

  it('un role sans feuille dit que c\u2019est voulu', async () => {
    vi.spyOn(Api, 'fetchFeuilleAction').mockResolvedValue({
      action: 'COLD_READ', chemins: null, neRecoitRien: true,
      texte: '', hash: '', taille: 0, documents: [],
    } as any);
    const { findByText } = render(
      <SettingsSpace {...(props as any)} section="personas" persona="COLD_READ" />,
    );
    await findByText(/ne re\u00e7oit rien du corpus/i);
  });

  it('un role avec feuille montre son empreinte et ses documents', async () => {
    vi.spyOn(Api, 'fetchFeuilleAction').mockResolvedValue({
      action: 'ANALYZE_BATCH', chemins: ['socle/identite'], neRecoitRien: false,
      texte: '# Ce qu\u2019il faut savoir', hash: 'abcd1234', taille: 22,
      documents: ['socle/identite/positionnement'],
    } as any);
    const { container, findByText } = render(
      <SettingsSpace {...(props as any)} section="personas" persona="ANALYZE_BATCH" />,
    );
    await findByText('abcd1234');
    expect(container.textContent).toContain('socle/identite/positionnement');
  });

  /**
   * Le cas qui ne doit PAS se lire comme « ne reçoit rien » : la table prévoit
   * une feuille, mais aucun document ne correspond. C'est une dérive du corpus,
   * pas une décision — l'écran doit la nommer.
   */
  it('signale une feuille prevue mais vide', async () => {
    vi.spyOn(Api, 'fetchFeuilleAction').mockResolvedValue({
      action: 'ANALYZE_BATCH', chemins: ['socle/disparu'], neRecoitRien: false,
      texte: '', hash: '', taille: 0, documents: [],
    } as any);
    const { container, findByText } = render(
      <SettingsSpace {...(props as any)} section="personas" persona="ANALYZE_BATCH" />,
    );
    await findByText(/rien ne partira/i);
    expect(container.textContent).not.toMatch(/ne re\u00e7oit rien du corpus/i);
  });
});

/**
 * L'atelier a deux états de rendu que rien ne couvrait : en cours et validé.
 * C'est exactement là qu'était le piège — validé, le chat passait en lecture
 * seule DÉFINITIVEMENT, et une rédaction qui échouait derrière laissait la
 * publication sans aucune action possible.
 */
describe('atelier du Coach', () => {
  const msg = (role: 'user' | 'assistant', content: string): CoachMessage => ({
    id: `m-${role}-${content.length}`, contentId: 'i1', role, content,
    raw: null, quickReplies: [], readyForEditor: false, createdAt: now,
  });

  const session = (over: Partial<CoachSession> = {}): CoachSession => ({
    status: 'in_progress', formatCible: null, brief: null, validatedAt: null,
    messages: [msg('user', 'TITRE : Le piège chinois'), msg('assistant', 'Voici une direction.')],
    ...over,
  });

  const monte = (over: Partial<CoachSession> = {}, handlers: Record<string, any> = {}) =>
    render(
      <CoachChat
        item={ITEM}
        aiModels={MODELS}
        modelId="m1"
        session={session(over)}
        onAppendMessage={noop}
        onValidate={asyncNoop}
        onReopen={asyncNoop}
        onReset={asyncNoop}
        {...handlers}
      />
    );

  it('se monte session en cours, et propose de valider', () => {
    const { container } = monte();
    expect(container.textContent).toContain('Voici une direction.');
    expect(container.textContent).toContain('Go Éditeur');
  });

  it('se monte session validée, et offre le chemin du retour', () => {
    const { container } = monte({ status: 'validated', validatedAt: now });
    expect(container.textContent).toContain('Validée');
    expect(container.textContent).toContain('Rouvrir');
    // Le pied ne doit plus promettre une transmission à venir : elle a eu lieu.
    expect(container.textContent).not.toContain('prête à être transmise');
  });

  it('rouvrir rend l’atelier utilisable sans attendre le réseau', () => {
    let rouvert = 0;
    const { container, getByText } = monte(
      { status: 'validated', validatedAt: now },
      { onReopen: async () => { rouvert++; } }
    );
    expect(container.textContent).not.toContain('Go Éditeur');

    fireEvent.click(getByText('Rouvrir'));

    expect(rouvert).toBe(1);
    expect(container.textContent).toContain('Go Éditeur');
    expect(container.textContent).not.toContain('Validée');
  });

  it('réinitialiser demande confirmation avant de jeter la conversation', () => {
    let reinit = 0;
    const { container, getByText } = monte({}, { onReset: async () => { reinit++; } });

    fireEvent.click(getByText('Réinitialiser'));
    expect(container.textContent).toContain('Réinitialiser la session ?');
    expect(reinit).toBe(0);
  });

  /** Le parent renvoie une session vide, mais l'effet d'adoption ignore le vide :
   *  la vue doit se vider elle-même, sans quoi le JSON resterait à l'écran. */
  it('après réinitialisation, la conversation quitte l’écran', async () => {
    const { container, getByText, getAllByText } = monte({}, { onReset: asyncNoop });

    fireEvent.click(getByText('Réinitialiser'));
    const boutons = getAllByText('Réinitialiser');
    fireEvent.click(boutons[boutons.length - 1]);

    await waitFor(() => {
      expect(container.textContent).not.toContain('Voici une direction.');
    });
    expect(container.textContent).toContain('Prêt à démarrer ?');
  });

  it('sans message, rien à rouvrir ni à réinitialiser', () => {
    const { container } = monte({ status: null, messages: [] });
    expect(container.textContent).toContain('Prêt à démarrer ?');
    expect(container.textContent).not.toContain('Réinitialiser');
    expect(container.textContent).not.toContain('Rouvrir');
  });
});

/**
 * Le panneau du Lecteur froid.
 *
 * Il partait dès le clic sur « Appliquer les corrections », sans attendre le
 * résultat. Un échec côté fournisseur laissait donc une erreur à l'écran et
 * plus rien pour réessayer : les problèmes relevés et les corrections
 * proposées étaient perdus, et c'était la seule copie sous les yeux.
 */
describe('Lecteur froid — panneau', () => {
    const RAPPORT = {
        lecture_naive: { sujet: 'Le piège chinois', auteur: 'un praticien', action: 'lire' },
        controles: [{ regle: 'Zéro emoji', statut: 'OK' as const }],
        problemes: [
            { gravite: 'Important' as const, localisation: 'accroche',
              probleme: 'On ne sait pas de quoi ça parle', correction_proposee: 'Nommer le piège dès la première ligne.' },
        ],
        verdict: 'À retoucher',
    };

    const AVEC_BROUILLON: ContentItem = {
        ...ITEM,
        targetFormat: 'Post Texte (Court)' as any,
        draft: JSON.stringify({ body: 'Un brouillon rédigé.' }),
    };

    const monte = (handlers: Record<string, any> = {}, coldRead: any = RAPPORT) =>
        render(
            <DraftView
                item={AVEC_BROUILLON}
                onChange={noop}
                onLaunchDrafting={noop}
                onLaunchCarrouselSlides={noop}
                onLaunchAdjustment={asyncNoop}
                onLaunchPromptsAdjustment={noop}
                coachSession={null}
                onChangeStatus={asyncNoop}
                onSave={asyncNoop}
                isGenerating={false}
                aiModels={MODELS}
                activeModelId="m1"
                onCoachMessage={noop}
                onCoachValidate={asyncNoop}
                onCoachReopen={asyncNoop}
                onCoachReset={asyncNoop}
                coldRead={coldRead}
                onDismissColdRead={noop}
                onRunColdRead={noop}
                activeTab="brouillon"
                onTabChange={noop}
                {...handlers}
            />
        );

    it('affiche la provenance d’un rapport repris du journal', () => {
        const { container } = monte({
            coldReadMeta: { at: new Date('2026-08-24T14:32:00').getTime(), modelLabel: 'Claude Fable 5' },
        });
        expect(container.textContent).toContain('Relecture du 24/08/2026');
        expect(container.textContent).toContain('par Claude Fable 5');
        // La mise en garde compte autant que la date : le texte a pu changer depuis.
        expect(container.textContent).toContain('relancez-la si le texte a changé');
    });

    it('se passe de provenance quand elle manque', () => {
        const { container } = monte();
        expect(container.textContent).toContain('Lecteur froid');
        expect(container.textContent).not.toContain('Relecture du');
    });

    it('se monte avec et sans rapport', () => {
        expect(() => monte({}, null)).not.toThrow();
        cleanup();
        const { container } = monte();
        expect(container.textContent).toContain('Lecteur froid');
        expect(container.textContent).toContain('On ne sait pas de quoi ça parle');
    });

    it('garde le rapport quand l’ajustement échoue', async () => {
        let ecarte = 0;
        const { container, getByText } = monte({
            onLaunchAdjustment: async () => false,
            onDismissColdRead: () => { ecarte++; },
        });

        fireEvent.click(getByText('Appliquer les corrections'));
        await waitFor(() => expect(ecarte).toBe(0));

        // Tout est encore là : on peut réessayer sans avoir rien perdu.
        expect(container.textContent).toContain('Nommer le piège dès la première ligne.');
    });

    it('ne l’écarte qu’une fois l’ajustement abouti', async () => {
        let ecarte = 0;
        let recu = '';
        const { getByText } = monte({
            onLaunchAdjustment: async (t: string) => { recu = t; return true; },
            onDismissColdRead: () => { ecarte++; },
        });

        fireEvent.click(getByText('Appliquer les corrections'));
        await waitFor(() => expect(ecarte).toBe(1));
        expect(recu).toContain('Nommer le piège dès la première ligne.');
        expect(recu).toContain('[accroche]');
    });

    it('un rapport sans correction proposée n’offre pas d’appliquer', () => {
        const { container } = monte({}, { ...RAPPORT, problemes: [
            { gravite: 'Détail', probleme: 'Une virgule de trop' },
        ] });
        expect(container.textContent).not.toContain('Appliquer les corrections');
        expect(container.textContent).toContain('Une virgule de trop');
    });
});

/**
 * L'atelier n'appartient qu'à SA publication.
 *
 * Ce que ce test protège : le 25/08/2026, passer d'une publication de série à
 * la suivante affichait la conversation de la PRÉCÉDENTE — React réutilisait le
 * composant faute de `key`, et gardait avec lui « la session a démarré », le
 * drapeau anti-relance et les messages. Une publication jamais touchée
 * présentait donc un atelier en cours, et ce qu'on y écrivait partait sur elle.
 */
describe('atelier — une publication, une session', () => {
    const message = (id: string, role: 'user' | 'assistant', content: string): CoachMessage =>
        ({ id, contentId: 'a', role, content, raw: null, quickReplies: [], readyForEditor: false, createdAt: 1 });

    const SESSION_A: CoachSession = {
        status: 'in_progress', formatCible: null, brief: null, validatedAt: null,
        messages: [message('m1', 'user', 'TITRE : A'), message('m2', 'assistant', 'Réponse pour A.')],
    };

    const publication = (id: string): ContentItem =>
        ({ ...ITEM, id, targetFormat: 'Post Texte (Court)' as any, depth: null });

    const atelier = (item: ContentItem, coachSession: CoachSession | null) => (
        <DraftView
            item={item} onChange={noop}
            onLaunchDrafting={noop} onLaunchCarrouselSlides={noop}
            onLaunchAdjustment={asyncNoop} onLaunchPromptsAdjustment={noop}
            coachSession={coachSession}
            onChangeStatus={asyncNoop} onSave={asyncNoop} isGenerating={false}
            aiModels={MODELS} activeModelId="m1"
            onCoachMessage={noop} onCoachValidate={asyncNoop}
            onCoachReopen={asyncNoop} onCoachReset={asyncNoop}
            coldRead={null} onDismissColdRead={noop} onRunColdRead={noop}
            activeTab="atelier" onTabChange={noop}
        />
    );

    it('la conversation d’une publication ne suit pas sur la suivante', () => {
        const { container, rerender } = render(atelier(publication('a'), SESSION_A));
        expect(container.textContent).toContain('Réponse pour A.');

        // On passe à une publication jamais touchée, sans démonter l'éditeur.
        rerender(atelier(publication('b'), null));
        expect(container.textContent).not.toContain('Réponse pour A.');
        // Et son sas revient : rien n'a démarré sur elle.
        expect(container.textContent).toContain('Prêt à démarrer');
    });

    it('revenir sur la première retrouve sa conversation', () => {
        const { container, rerender } = render(atelier(publication('a'), SESSION_A));
        rerender(atelier(publication('b'), null));
        rerender(atelier(publication('a'), SESSION_A));
        expect(container.textContent).toContain('Réponse pour A.');
        expect(container.textContent).not.toContain('Prêt à démarrer');
    });

    it('une publication neuve attend qu’on démarre — elle ne part jamais seule', () => {
        const { container } = render(atelier(publication('neuve'), null));
        expect(container.textContent).toContain('Prêt à démarrer');
        expect(container.textContent).toContain('Démarrer la session');
    });
});

describe('écrans autonomes', () => {
  it('LoginPage se monte', () => {
    expect(() => render(<LoginPage onLoginSuccess={noop} />)).not.toThrow();
  });

  it('CalendarView se monte, y compris sans contenu', () => {
    expect(() => render(<CalendarView items={[]} onItemClick={noop} />)).not.toThrow();
  });

  it('SubtitleConverter se monte', () => {
    expect(() => render(<SubtitleConverter aiModels={MODELS} />)).not.toThrow();
  });

  it('PsychedelicsCalculator se monte', () => {
    expect(() => render(<PsychedelicsCalculator />)).not.toThrow();
  });
});

describe('vues de contenu', () => {
  const shared = {
    searchQuery: '',
    isInitializing: false,
    onEdit: noop,
    onNavigateToIdeas: noop,
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    tri: TRI_CONTENUS_DEFAUT,
    onTri: noop,
    filtre: 'ALL',
    onFiltre: noop,
  };

  it('SocialIdeasView se monte vide et peuplée', () => {
    expect(() => render(
      <SocialIdeasView {...(shared as any)} items={[]} onSearchChange={noop} onQuickAdd={asyncNoop} onGlobalAnalyze={noop} isSyncing={false} />
    )).not.toThrow();
    cleanup();
    expect(() => render(
      <SocialIdeasView {...(shared as any)} items={[ITEM]} onSearchChange={noop} onQuickAdd={asyncNoop} onGlobalAnalyze={noop} isSyncing={false} />
    )).not.toThrow();
  });

  it('SocialGridView se monte pour chaque type de liste', () => {
    for (const type of ['drafts', 'ready', 'archive'] as const) {
      expect(() => render(<SocialGridView {...(shared as any)} items={[ITEM]} type={type} />)).not.toThrow();
      cleanup();
    }
  });
});

describe('séries', () => {
  it('SeriesView se monte vide et peuplée', () => {
    const { container } = render(
      <SeriesView series={[]} contents={[]} isInitializing={false} isSyncing={false} onOpen={noop} onCreate={asyncNoop} tri={TRI_SERIES_DEFAUT} onTri={noop} />
    );
    expect(container.textContent).toContain('Aucune série');
    cleanup();

    const populated = render(
      <SeriesView series={[SERIE]} contents={[ITEM]} isInitializing={false} isSyncing={false} onOpen={noop} onCreate={asyncNoop} tri={TRI_SERIES_DEFAUT} onTri={noop} />
    );
    expect(populated.container.textContent).toContain('psychopraticien');
  });

  /**
   * Le tri des Séries n'existait pas : le tableau rendait l'ordre reçu, point.
   * Ces deux tests tiennent les deux moitiés — ce qui s'affiche, et ce qui est
   * demandé au clic.
   */
  it('SeriesView rend les séries dans l’ordre du tri fourni', () => {
    const serie = (id: string, titre: string, creeLe: number): Serie =>
      ({ ...SERIE, id, titre, createdAt: creeLe });
    const series = [serie('s1', 'Bêta', 200), serie('s2', 'Alpha', 100), serie('s3', 'Gamma', 300)];

    const { container, rerender } = render(
      <SeriesView series={series} contents={[]} isInitializing={false} isSyncing={false}
        onOpen={noop} onCreate={asyncNoop} tri={{ colonne: 'titre', sens: 'asc' }} onTri={noop} />
    );
    const titres = () => Array.from(container.querySelectorAll('tbody tr')).map(tr => tr.textContent ?? '');
    expect(titres()[0]).toContain('Alpha');
    expect(titres()[2]).toContain('Gamma');

    rerender(
      <SeriesView series={series} contents={[]} isInitializing={false} isSyncing={false}
        onOpen={noop} onCreate={asyncNoop} tri={{ colonne: 'creele', sens: 'desc' }} onTri={noop} />
    );
    expect(titres()[0]).toContain('Gamma');
    expect(titres()[2]).toContain('Alpha');
  });

  it('un clic sur un en-tête de Séries demande le tri suivant', () => {
    const demandes: Array<{ colonne: string; sens: string }> = [];
    const { getByText } = render(
      <SeriesView series={[SERIE]} contents={[]} isInitializing={false} isSyncing={false}
        onOpen={noop} onCreate={asyncNoop}
        tri={{ colonne: 'creele', sens: 'desc' }} onTri={t => demandes.push(t)} />
    );
    fireEvent.click(getByText('Statut'));
    expect(demandes).toEqual([{ colonne: 'statut', sens: 'asc' }]);

    fireEvent.click(getByText('Créée le'));
    expect(demandes[1]).toEqual({ colonne: 'creele', sens: 'asc' });
  });

  /**
   * La modale de suppression : retour anticipé, donc montée dans les DEUX
   * états. Et surtout, elle doit rendre au choix ce qu'il vaut — c'était toute
   * la raison de la remplacer.
   */
  describe('supprimer une série', () => {
    const props = {
      titre: 'Le transpersonnel, sans folklore',
      nbPublications: 3,
      onClose: noop,
      onConfirm: noop,
    };

    it('ne rend rien tant qu’elle est fermée', () => {
      const { container } = render(<ConfirmSuppressionSerie {...props} isOpen={false} />);
      expect(container.textContent).toBe('');
    });

    it('annonce le nombre de publications et offre les deux gestes', () => {
      const { container } = render(<ConfirmSuppressionSerie {...props} isOpen />);
      expect(container.textContent).toContain('3 publications');
      expect(container.textContent).toContain('Supprimer, garder les publications');
      expect(container.textContent).toContain('Tout supprimer');
    });

    /**
     * Deux rendus distincts, pas un `rerender` : pendant qu'une suppression
     * tourne, les DEUX boutons sont désactivés — c'est voulu, et ça rendrait le
     * second clic muet sur la même instance.
     */
    it('rend le mode choisi, et pas l’autre', () => {
      const choix: string[] = [];

      const garder = render(<ConfirmSuppressionSerie {...props} isOpen onConfirm={m => { choix.push(m); }} />);
      fireEvent.click(garder.getByText('Supprimer, garder les publications'));
      expect(choix).toEqual(['detacher']);
      cleanup();

      const tout = render(<ConfirmSuppressionSerie {...props} isOpen onConfirm={m => { choix.push(m); }} />);
      fireEvent.click(tout.getByText(/Tout supprimer/));
      expect(choix).toEqual(['detacher', 'supprimer']);
    });

    /** Une série vide n'a rien à cascader : le choix n'a pas lieu d'être posé. */
    it('sur une série vide, un seul geste est proposé', () => {
      const { container } = render(<ConfirmSuppressionSerie {...props} isOpen nbPublications={0} />);
      expect(container.textContent).toContain('aucune publication');
      expect(container.textContent).toContain('Supprimer la série');
      expect(container.textContent).not.toContain('Tout supprimer');
    });

    /** Le pilier préexiste à la série : sans cette phrase, « tout supprimer » fait peur à raison. */
    it('dit que le contenu pilier ne part pas avec la série', () => {
      const { container } = render(
        <ConfirmSuppressionSerie {...props} isOpen titrePilier="Article sur le stress" />
      );
      expect(container.textContent).toContain('Article sur le stress');
      expect(container.textContent).toContain('ne sera pas supprimé');
    });
  });

  const planProps = {
    contents: [] as ContentItem[],
    sourceContent: null,
    onBack: noop,
    onUpdate: asyncNoop,
    onDelete: asyncNoop,
    onCreateContents: asyncNoop,
    onOpenContent: noop,
    onGeneratePlan: async () => [],
  };

  it('SeriePlanView se monte avec un plan vide', () => {
    const { container } = render(<SeriePlanView {...(planProps as any)} serie={SERIE} />);
    expect(container.textContent).toContain('Plan de publication');
    expect(container.textContent).toContain('Le plan est vide');
  });

  /** Le pilier et les contenus rattachés sont deux rendus distincts du même écran. */
  it('SeriePlanView se monte avec un contenu pilier et des contenus rattachés', () => {
    const serieWithSource: Serie = { ...SERIE, sourceContentId: ITEM.id };
    const { container } = render(
      <SeriePlanView
        {...(planProps as any)}
        serie={serieWithSource}
        sourceContent={ITEM}
        contents={[{ ...ITEM, serieId: SERIE.id, angle: 'La mécanique du piège' }]}
      />
    );
    expect(container.textContent).toContain('Contenu pilier');
    expect(container.textContent).toContain('La mécanique du piège');
  });

  /**
   * Le plan se replie quand la série a déjà des publications, et ne disparaît
   * jamais : régénérer est le seul chemin pour allonger une série existante.
   */
  describe('le plan de publication se replie', () => {
    const rattache = (id: string, titre: string): ContentItem =>
      ({ ...ITEM, id, title: titre, serieId: SERIE.id, seriePosition: 1 });

    it('reste ouvert tant que la série est vide — il n’y a rien d’autre à regarder', () => {
      const { container } = render(<SeriePlanView {...(planProps as any)} serie={SERIE} contents={[]} />);
      expect(container.textContent).toContain('Le plan est vide');
    });

    it('se replie dès qu’une publication existe', () => {
      const { container } = render(
        <SeriePlanView {...(planProps as any)} serie={SERIE} contents={[rattache('c1', 'Première')]} />
      );
      expect(container.textContent).not.toContain('Le plan est vide');
      // Le bloc reste là, et dit à quoi il sert.
      expect(container.textContent).toContain('Plan de publication');
      expect(container.textContent).toContain('allonger la série');
      // Replié, le bloc n'offre AUCUNE action : la barre n'est pas seulement
      // masquée, elle n'est pas rendue.
      expect(container.textContent).not.toContain('Générer un plan');
      // Ce qu'on vient voir est visible.
      expect(container.textContent).toContain('Première');
    });

    it('se déplie au clic, et se replie au second', () => {
      const { container, getByTitle } = render(
        <SeriePlanView {...(planProps as any)} serie={SERIE} contents={[rattache('c1', 'Première')]} />
      );
      fireEvent.click(getByTitle('Déplier le plan pour allonger la série'));
      expect(container.textContent).toContain('Le plan est vide');
      expect(container.textContent).toContain('Générer un plan');

      fireEvent.click(getByTitle('Replier le plan'));
      expect(container.textContent).not.toContain('Le plan est vide');
    });
  });

  /**
   * Une série se relit dans l'ordre où elle a été pensée — y compris quand les
   * contenus arrivent dans le désordre depuis le cache.
   */
  it('SeriePlanView rend les publications dans l’ordre de la progression', () => {
    const publication = (id: string, titre: string, rang: number | null): ContentItem =>
      ({ ...ITEM, id, title: titre, serieId: SERIE.id, seriePosition: rang });

    const { container } = render(
      <SeriePlanView
        {...(planProps as any)}
        serie={SERIE}
        contents={[
          publication('c3', 'Troisième', 3),
          publication('c1', 'Premier', 1),
          publication('c9', 'Sans rang', null),
          publication('c2', 'Deuxième', 2),
        ]}
      />
    );
    const titres = Array.from(container.querySelectorAll('li'))
      .map(li => li.textContent ?? '')
      .map(t => t.replace(/\s+/g, ' ').trim());
    expect(titres[0]).toContain('Premier');
    expect(titres[1]).toContain('Deuxième');
    expect(titres[2]).toContain('Troisième');
    expect(titres[3]).toContain('Sans rang');
  });
});

/**
 * Les témoins d'attente.
 *
 * `FiletActivite` et `BandeauActivite` ont un retour anticipé : ils sont montés
 * dans les DEUX états, au repos et pendant une tâche — c'est la règle née de la
 * page blanche du 16/08/2026 (voir l'en-tête de ce fichier).
 */
describe('témoins d’attente', () => {
  it('Barre se rend remplie ET balayante', () => {
    const { container: rempli } = render(<Barre part={0.42} libelle="Rédaction" />);
    expect(rempli.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');

    const { container: balaie } = render(<Barre part={null} libelle="Rédaction" />);
    // Sans échéance connue, pas de valeur annoncée : la barre ne prétend rien.
    expect(balaie.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('Patience nomme la tâche, avec et sans détail', () => {
    const { container } = render(<Patience titre="Analyse de 3 idées" detail="Enregistrement (2/3)…" part={0.7} />);
    expect(container.textContent).toContain('Analyse de 3 idées');
    expect(container.textContent).toContain('Enregistrement (2/3)…');
    cleanup();
    expect(() => render(<Patience titre="Lecture du catalogue" />)).not.toThrow();
  });

  it('EnCours dit ce qui travaille, jamais « ... »', () => {
    const { container } = render(<EnCours label="Rédaction…" />);
    expect(container.textContent).toBe('Rédaction…');
  });

  it('le bandeau reste muet au repos, et nomme l’appel dès qu’il y en a un', async () => {
    const { container, rerender } = render(<BandeauActivite />);
    expect(container.textContent).toBe('');

    Activite.enregistrerModeles(MODELS);
    const suivi = Activite.ouvrir({
      nature: 'ia', label: 'Rédaction', persona: 'Rédacteur', modele: Activite.nomDuModele('m1'),
    });
    rerender(<BandeauActivite />);
    await waitFor(() => {
      expect(container.textContent).toContain('Rédaction');
      expect(container.textContent).toContain('Rédacteur');
      // Le modèle EST l'information : « il se passe quelque chose » ne suffit pas.
      expect(container.textContent).toContain('GPT-5.2 Pro');
    });

    suivi.fermer();
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('le filet s’allume puis s’éteint, sans clignoter sur une requête éclair', async () => {
    const { container } = render(<FiletActivite />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();

    const suivi = Activite.ouvrir({ label: '' });
    // Rien pendant les 150 premières millisecondes : une requête plus courte
    // que ça ne doit pas faire sauter l'écran.
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    await waitFor(() => expect(container.querySelector('[role="progressbar"]')).not.toBeNull());

    suivi.fermer();
    await waitFor(() => expect(container.querySelector('[role="progressbar"]')).toBeNull());
  });
});

/**
 * CorpusSpace a TROIS retours anticipés — chargement, panne, corpus lu. La
 * règle §10.3 impose de le monter dans chacun : c'est précisément un `useEffect`
 * placé après un retour anticipé qui a produit la page blanche du 16/08.
 */
describe('CorpusSpace', () => {
  const ETAT: Api.EtatCorpus = {
    date: '2026-08-26',
    documents: 26,
    blocs: ['canaux', 'outils', 'repertoire', 'socle', 'strategie', 'voix'],
    profils: [
      { profil: 'noyau', titre: 'Contexte Luminose — noyau', intention: 'x',
        hash: 'aaaaaaaa', taille: 5999, documents: 2, plafond: 7500, depasse: false },
      { profil: 'complet', titre: 'Contexte Luminose', intention: 'y',
        hash: 'bbbbbbbb', taille: 27591, documents: 20, plafond: null, depasse: false },
      { profil: 'strategie', titre: 'Contexte Luminose — stratégie', intention: 'z',
        hash: 'cccccccc', taille: 14153, documents: 5, plafond: null, depasse: false },
    ],
    offres: [
      { chemin: 'socle/offres/le-seuil', titre: 'Le Seuil', statut: 'suspendu' },
      { chemin: 'socle/offres/seance-individuelle', titre: 'Séance individuelle', statut: 'actif' },
    ],
    aRevoir: [{ chemin: 'strategie/decisions/x', titre: 'Une décision', review_at: '2026-01' }],
    absencesDeliberees: [{ chemin: 'voix/direction-artistique', revu: '2026-08' }],
  };

  afterEach(() => { vi.restoreAllMocks(); cleanup(); });

  it('se monte pendant le chargement', () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockReturnValue(new Promise(() => {}) as any);
    vi.spyOn(Api, 'fetchPoses').mockReturnValue(new Promise(() => {}) as any);
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    expect(container.textContent).toContain('Lecture du corpus');
  });

  it('se monte en panne, sans page blanche', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockRejectedValue(new Error('Worker injoignable'));
    vi.spyOn(Api, 'fetchPoses').mockRejectedValue(new Error('Worker injoignable'));
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('Worker injoignable'));
  });

  it('se monte corpus lu, et marque les offres non proposables', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({ poses: {} } as any);
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('26 documents'));
    expect(container.textContent).toContain('Le Seuil');
    expect(container.textContent).toContain('suspendu');
    // Aucune surface posée : tout ce qui n'est pas automatique attend un collage.
    expect(container.textContent).toContain('Copier');
  });

  /**
   * NORMATIF — « je ne sais pas » ne se rend jamais comme « tout va bien ».
   *
   * L'écran affichait « Aucun écart connu » dès qu'il lui manquait un point de
   * comparaison, c'est-à-dire toujours : il comparait la date du dernier commit
   * à celle du dernier run GitHub Actions, que `npm run deploy` ne produit pas.
   * Une fiche corrigée depuis la console restait invisible, et l'écran s'en
   * portait garant.
   */
  it('dit son ignorance plutôt que de rassurer — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({ poses: {} } as any);
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({
      configure: true, etat: null, source: null,
      ecart: { comparable: false, raison: 'Le dépôt est injoignable.', differents: [] },
    } as any);

    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('Impossible de savoir'));
    expect(container.textContent).toContain('Le dépôt est injoignable.');
    expect(container.textContent).not.toContain('correspond au dépôt');
  });

  it('nomme les fiches commitées qui ne sont pas encore servies', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({ poses: {} } as any);
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({
      configure: true, etat: null, source: null,
      ecart: {
        comparable: true, raison: null,
        differents: [{ chemin: 'socle/offres/le-seuil', etat: 'modifie' }],
      },
    } as any);

    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('n’est pas encore servie'));
    // Un booléen ne dirait pas laquelle rouvrir.
    expect(container.textContent).toContain('socle/offres/le-seuil');
  });

  it('une surface dont le hash correspond est dite à jour', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({
      poses: { gpt: { profil: 'noyau', hash: 'aaaaaaaa', poseeLe: 1 } },
    } as any);
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('à jour'));
  });
});

describe('Corpus — lecture des documents', () => {
  afterEach(() => { vi.restoreAllMocks(); cleanup(); });

  it('se monte pendant le chargement de la liste', () => {
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockReturnValue(new Promise(() => {}) as any);
    const { container } = render(<DocumentsView bloc="socle" />);
    expect(container.textContent).toContain('Lecture des documents');
  });

  it('se monte en panne', async () => {
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockRejectedValue(new Error('Liste injoignable'));
    const { container } = render(<DocumentsView bloc="socle" />);
    await waitFor(() => expect(container.textContent).toContain('Liste injoignable'));
  });

  it('liste par bloc, et ouvre un document', async () => {
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue({
      documents: [{
        chemin: 'socle/offres/le-seuil', bloc: 'socle', titre: 'Le Seuil',
        statut: 'suspendu', type: 'fact', revu: '2026-08', review_at: '2027-08',
        expose: 'prive', taille: 900,
      }],
    } as any);
    vi.spyOn(Api, 'fetchDocumentCorpus').mockResolvedValue({
      chemin: 'socle/offres/le-seuil', bloc: 'socle', titre: 'Le Seuil',
      meta: { statut: 'suspendu' },
      corps: '# Le Seuil\n\nStatut **suspendu** depuis août.',
    } as any);

    const { container, getByText } = render(<DocumentsView bloc="socle" />);
    await waitFor(() => expect(container.textContent).toContain('Le Seuil'));
    fireEvent.click(getByText('Le Seuil'));
    await waitFor(() => expect(container.textContent).toContain('depuis août'));
  });

  /**
   * Le lien d'édition doit viser LE fichier ouvert.
   *
   * Il pointait sur l'organisation GitHub : il annonçait « modifier » et
   * déposait sur une liste de dépôts. Un lien mort ne fait échouer aucun
   * test et ne lève aucune erreur — il déçoit en silence, une fois par clic.
   * D'où ce garde-fou : le chemin du document, la racine du corpus et
   * l'extension, reconstitués tels que GitHub les attend.
   */
  /**
   * L'édition dans la console.
   *
   * Trois garanties, et la troisième est la raison d'être de tout le
   * chantier : après un commit, l'écran doit DIRE que les prompts reçoivent
   * encore l'ancienne version. Sans ça, on corrige, on croit que c'est fait,
   * et le corpus servi diverge de la source sans que rien ne l'annonce — soit
   * exactement le problème qu'on cherchait à supprimer.
   */
  const ouvrirUneFiche = async () => {
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue({
      documents: [{
        chemin: 'socle/offres/le-seuil', bloc: 'socle', titre: 'Le Seuil',
        statut: 'suspendu', type: 'fact', revu: null, review_at: null, expose: 'prive', taille: 900,
      }],
    } as any);
    vi.spyOn(Api, 'fetchDocumentCorpus').mockResolvedValue({
      chemin: 'socle/offres/le-seuil', bloc: 'socle', titre: 'Le Seuil',
      meta: { statut: 'suspendu' }, corps: '# Le Seuil\n\nCorps du bundle.',
    } as any);
    const vue = render(<DocumentsView bloc="socle" />);
    await waitFor(() => expect(vue.container.textContent).toContain('Le Seuil'));
    fireEvent.click(vue.getByText('Le Seuil'));
    await waitFor(() => expect(vue.container.textContent).toContain('Corps du bundle'));
    return vue;
  };

  it('sans jeton GitHub, la fiche se lit et le bouton Modifier ne s’affiche pas', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({ configure: false, etat: null, source: null } as any);
    const { container } = await ouvrirUneFiche();
    await waitFor(() => expect(container.textContent).toContain('Modifier sur GitHub'));
    expect([...container.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Modifier')).toBe(false);
  });

  it('« Modifier » charge la source du dépôt, pas la fiche du bundle — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({ configure: true, etat: null, source: null } as any);
    const source = vi.spyOn(Api, 'fetchSourceCorpus').mockResolvedValue({
      chemin: 'socle/offres/le-seuil',
      contenu: '---\nstatut: suspendu\n---\n\n# Le Seuil\n\nCorps du DÉPÔT.',
      sha: 'sha-1', lien: 'https://github.com/…',
    } as any);

    const { container, findByText } = await ouvrirUneFiche();
    fireEvent.click(await findByText('Modifier'));

    const zone = await waitFor(() => {
      const t = container.querySelector('textarea') as HTMLTextAreaElement | null;
      expect(t).not.toBeNull();
      return t!;
    });
    expect(source).toHaveBeenCalledWith('socle/offres/le-seuil');
    // Le fichier ENTIER : c'est dans le frontmatter que vit `statut`.
    expect(zone.value).toContain('statut: suspendu');
    expect(zone.value).toContain('Corps du DÉPÔT');
    expect(zone.value).not.toContain('Corps du bundle');
  });

  it('après le commit, l’écran dit que ce n’est pas encore déployé — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({ configure: true, etat: null, source: null } as any);
    vi.spyOn(Api, 'fetchSourceCorpus').mockResolvedValue({
      chemin: 'socle/offres/le-seuil',
      contenu: '---\nstatut: suspendu\n---\n\n# Le Seuil\n\nCorps.',
      sha: 'sha-1', lien: 'https://github.com/…',
    } as any);
    const ecrire = vi.spyOn(Api, 'enregistrerSourceCorpus').mockResolvedValue({
      sha: 'sha-2', commit: 'abcdef1234567890', deploiementRequis: true,
    } as any);

    const { container, findByText } = await ouvrirUneFiche();
    fireEvent.click(await findByText('Modifier'));
    // L'assertion DANS le waitFor : sans elle, il rend `null` du premier coup
    // au lieu de réessayer, et l'échec se lit « fournissez un élément du DOM ».
    const zone = await waitFor(() => {
      const t = container.querySelector('textarea') as HTMLTextAreaElement | null;
      expect(t).not.toBeNull();
      return t!;
    });

    // Sans modification, on ne peut pas enregistrer : rien à commiter.
    const bouton = () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Enregistrer')) as HTMLButtonElement;
    expect(bouton().disabled).toBe(true);

    fireEvent.change(zone, { target: { value: '---\nstatut: actif\n---\n\n# Le Seuil\n\nCorps.' } });
    expect(bouton().disabled).toBe(false);
    fireEvent.click(bouton());

    await findByText(/reçoivent encore l’ancienne version|reçoivent encore l'ancienne version/);
    expect(container.textContent).toContain('abcdef1');
    expect(ecrire).toHaveBeenCalledWith('socle/offres/le-seuil', expect.stringContaining('statut: actif'), 'sha-1', '');
    expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Déployer maintenant'))).toBe(true);
  });

  it('le lien d’édition vise le fichier ouvert, pas le dépôt — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue({
      documents: [{
        chemin: 'canaux/google-ads', bloc: 'canaux', titre: 'Google Ads',
        statut: 'actif', type: 'fact', revu: null, review_at: null, expose: 'prive', taille: 10,
      }],
    } as any);
    vi.spyOn(Api, 'fetchDocumentCorpus').mockResolvedValue({
      chemin: 'canaux/google-ads', bloc: 'canaux', titre: 'Google Ads',
      meta: {}, corps: '# Google Ads',
    } as any);

    const { container, getByText } = render(<DocumentsView bloc="canaux" />);
    await waitFor(() => expect(container.textContent).toContain('Google Ads'));
    fireEvent.click(getByText('Google Ads'));

    const lien = await waitFor(() => {
      const a = container.querySelector('article a') as HTMLAnchorElement | null;
      expect(a).not.toBeNull();
      return a!;
    });
    expect(lien.href).toBe(
      'https://github.com/luminose-fr/gestion/edit/main/packages/corpus/content/canaux/google-ads.md',
    );
    // Et l'écran doit dire que la correction ne se verra qu'au déploiement :
    // sans ça, on corrige, on revient, on ne voit rien, on croit que c'est cassé.
    expect(container.textContent).toContain('déploiement');
  });
});

describe('Corpus — inbox', () => {
  afterEach(() => { vi.restoreAllMocks(); cleanup(); });

  it('se monte vide, et dit que rien n’attend', async () => {
    vi.spyOn(Api, 'fetchInbox').mockResolvedValue({ captures: [], enAttente: 0 } as any);
    const { container } = render(<InboxView />);
    await waitFor(() => expect(container.textContent).toContain('Rien en attente'));
  });

  it('se monte en panne', async () => {
    vi.spyOn(Api, 'fetchInbox').mockRejectedValue(new Error('Inbox injoignable'));
    const { container } = render(<InboxView />);
    await waitFor(() => expect(container.textContent).toContain('Inbox injoignable'));
  });

  it('un « remplace » vide se lit « je ne sais pas », jamais « rien »', async () => {
    vi.spyOn(Api, 'fetchInbox').mockResolvedValue({
      captures: [{
        id: 'a', decide: 'On arrête Le Seuil.', remplace: null, source: 'Console',
        createdAt: 1756080000000, integratedAt: null, integration: null,
      }],
      enAttente: 1,
    } as any);
    const { container } = render(<InboxView />);
    await waitFor(() => expect(container.textContent).toContain('je ne sais pas'));
    expect(container.textContent).not.toContain('Remplace : rien');
  });
});

describe('Markdown', () => {
  it('rend titres, gras, code, listes et tableaux', () => {
    const { container } = render(
      <Markdown texte={'# Titre\n\nUn **gras** et du `code`.\n\n- un\n- deux\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('gras');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('ne perd rien sur un texte vide', () => {
    const { container } = render(<Markdown texte="" />);
    expect(container.textContent).toBe('');
  });
});

/**
 * La navigation du Corpus vit désormais dans le panneau latéral, à trois
 * niveaux : espace, section, bloc. Le troisième niveau ne s'ouvre que sous la
 * section active — un panneau qui déplierait six blocs en permanence
 * afficherait neuf entrées pour trois destinations.
 */
describe('Corpus — navigation à trois niveaux', () => {
  afterEach(cleanup);

  const props = {
    currentSpace: 'corpus' as const,
    currentSocialTab: 'ideas' as const,
    currentSettingsSection: 'display' as const,
    currentSettingsPersona: null,
    onNavigate: () => {},
    onNavigateSettings: () => {},
    counts: { ideas: 0, drafts: 0, ready: 0, series: 0, calendar: 0, archive: 0 },
    isMobileOpen: false,
    onMobileClose: () => {},
  };

  it('le deuxième panneau porte les trois sections, sans les blocs', () => {
    const { container } = render(
      <Sidebar {...props} currentCorpusSection="etat" currentCorpusBloc={null} onNavigateCorpus={() => {}} />,
    );
    expect(container.textContent).toContain('État');
    expect(container.textContent).toContain('Documents');
    expect(container.textContent).toContain('Inbox');
    // Le troisième panneau n'existe pas hors de la section Documents : il
    // disparaît plutôt que de rester vide.
    expect(container.textContent).not.toContain('Répertoire');
  });

  it('un troisième panneau apparaît sous Documents, avec les six blocs', () => {
    const { container } = render(
      <Sidebar {...props} currentCorpusSection="documents" currentCorpusBloc="socle" onNavigateCorpus={() => {}} />,
    );
    for (const b of ['Socle', 'Voix', 'Stratégie', 'Canaux', 'Répertoire', 'Outils']) {
      expect(container.textContent).toContain(b);
    }
    // Trois colonnes de navigation : le rail, les sections, les blocs.
    const panneaux = container.querySelectorAll('aside > div');
    expect(panneaux.length).toBe(3);
  });

  it('porte les captures en attente en pastille', () => {
    const { container } = render(
      <Sidebar {...props} currentCorpusSection="etat" currentCorpusBloc={null}
        onNavigateCorpus={() => {}} corpusCounts={{ inbox: 3, parBloc: { socle: 9 } }} />,
    );
    expect(container.textContent).toContain('3');
  });

  it('le troisième panneau des rôles apparaît sous Personas, et pas ailleurs', () => {
    const sansRoles = render(
      <Sidebar {...props} currentSpace="settings" currentSettingsSection="display"
        currentCorpusSection="etat" currentCorpusBloc={null} onNavigateCorpus={() => {}} />,
    );
    expect(sansRoles.container.querySelectorAll('aside > div').length).toBe(2);
    cleanup();

    const { container } = render(
      <Sidebar {...props} currentSpace="settings" currentSettingsSection="personas"
        currentSettingsPersona="DRAFT_CONTENT"
        currentCorpusSection="etat" currentCorpusBloc={null} onNavigateCorpus={() => {}} />,
    );
    expect(container.querySelectorAll('aside > div').length).toBe(3);
    for (const p of PERSONAS_NAV) expect(container.textContent).toContain(p.label);
  });

  /**
   * Les quatre niveaux doivent faire la même largeur — sinon deux colonnes de
   * navigation côte à côte se lisent comme une hiérarchie qui n'existe pas.
   */
  it('les deux panneaux de navigation font la même largeur', () => {
    const { container } = render(
      <Sidebar {...props} currentCorpusSection="documents" currentCorpusBloc="socle" onNavigateCorpus={() => {}} />,
    );
    const [, deuxieme, troisieme] = [...container.querySelectorAll('aside > div')];
    expect(deuxieme.className).toContain('w-[210px]');
    expect(troisieme.className).toContain('w-[210px]');
  });

  it('la coque route vers la vue demandée', () => {
    vi.spyOn(Api, 'fetchInbox').mockResolvedValue({ captures: [], enAttente: 0 } as any);
    const { container } = render(<CorpusSpace section="inbox" bloc={null} />);
    expect(container.textContent).toContain('inbox');
    vi.restoreAllMocks();
  });
});

describe('Corpus — navigation sur téléphone', () => {
  afterEach(cleanup);

  const props = {
    currentTab: 'ideas' as const,
    currentSettingsSection: 'display' as const,
    onNavigate: () => {},
    onNavigateSettings: () => {},
    counts: { ideas: 0, drafts: 0, ready: 0, series: 0, calendar: 0, archive: 0 },
  };

  it('une seule rangée hors Documents', () => {
    const { container } = render(
      <MobileSubTabs {...props} space="corpus" currentCorpusSection="etat" currentCorpusBloc={null} onNavigateCorpus={() => {}} />,
    );
    expect(container.textContent).toContain('État');
    expect(container.textContent).not.toContain('Répertoire');
  });

  it('deux rangées sous Documents — les mêmes trois niveaux, empilés', () => {
    const { container } = render(
      <MobileSubTabs {...props} space="corpus" currentCorpusSection="documents" currentCorpusBloc="voix" onNavigateCorpus={() => {}} />,
    );
    expect(container.textContent).toContain('Documents');
    expect(container.textContent).toContain('Répertoire');
    expect(container.querySelectorAll('div.md\\:hidden')).toHaveLength(2);
  });
});
