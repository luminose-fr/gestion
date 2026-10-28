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
import { Markdown } from '../components/ui';
import * as Api from '../services/apiService';
import { SETTINGS_SECTIONS } from '../components/Settings/sections';
import { PERSONAS_NAV } from '../components/Settings/apercus';
import { AI_ACTION_CATALOG } from '@luminose/editorial';
import { LoginPage } from '../components/LoginPage';
import CalendarView from '../components/CalendarView';
import PsychedelicsCalculator from '../components/PsychedelicsCalculator';
import RdvView from '../components/Clients/RdvView';
import { ConversationsView } from '../components/Contenus/ConversationsView';
import { IdeesView } from '../components/Contenus/IdeesView';
import { PubliesView } from '../components/Contenus/PubliesView';
import { etapeCourante, etapesDuSelecteur, composerLeFil, buildColdReadApplyInstruction } from '@luminose/editorial';
import { SeriePlanView } from '../components/Series/SeriePlanView';
import { PanneauSerie, AvancementSerie } from '../components/Contenu/Serie';
import { ConfirmSuppressionSerie } from '../components/Series/ConfirmSuppressionSerie';
import ContentEditor from '../components/ContentEditor';
import { Fil } from '../components/Contenu/Fil';
import { SelecteurEtape } from '../components/Contenu/CadreContenu';
import { BodyRenderer } from '../components/ContentEditor/renderers/BodyRenderer';
import { SceneLuminose } from '../components/Video/SceneLuminose';
import PanneauMontage from '../components/Video/PanneauMontage';
import { SequenceScene, SequenceCamera, IllustrationsDuReel } from '../components/Video/CartesDeScene';
import { LectureScript } from '../components/Contenu/Lecture';
import { Studio } from '../components/Contenu/Studio';
import { DepotPrise } from '../components/Video/DepotPrise';
import { ReperesPrise } from '../components/Video/ReperesPrise';
import { MontageTexte } from '../components/Video/MontageTexte';
import { ReglagesPrise } from '../components/Video/ReglagesPrise';
import { RythmeReel } from '../components/Video/RythmeReel';
import { CoupDePoingLuminose } from '../components/Video/SceneLuminose';
import { calerSurLaPrise, voixEntiere, minuterReel, planDeMontage, coupesProposees, coupesAppliquees, instantDansLaVideo, compterMots } from '@luminose/editorial';

/*
 * Le lecteur Remotion mesure son conteneur et le moteur de rendu exige
 * WebCodecs : ni l'un ni l'autre n'existent dans jsdom. On les remplace — ce
 * qu'on monte ici, c'est l'écran qui les entoure, pas Remotion.
 */
vi.mock('@remotion/player', () => ({
  Player: (props: { durationInFrames: number }) => <div data-testid="lecteur-remotion" data-images={props.durationInFrames} />,
}));
vi.mock('@remotion/web-renderer', () => ({ renderMediaOnWeb: vi.fn() }));
vi.mock('@remotion/media', () => ({ Video: () => null }));

/** Un montage lu, sans R2 lié — l'état d'un Worker où le bucket manque. */
const MONTAGE_SANS_R2 = {
  etat: { prises: [], visuels: [], stockage: { octets: 0, plafond: 10e9, disponible: false } },
  erreur: null,
  recharger: async () => {},
};
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
   * R2 compte au mois et Workers AI en neurones ; et des plafonds relevés à des
   * dates différentes portent chacun la leur.
   */
  it('affiche R2 au mois, Workers AI en neurones, et la date de chaque relevé', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(QUOTAS([
      { id: 'workers-requetes', service: 'Workers', libelle: 'Requêtes',
        valeur: 1500, seuil: 100_000, unite: 'requetes', periode: 'jour' },
      { id: 'r2-classe-a', service: 'R2', libelle: 'Écritures (classe A)',
        valeur: 45, seuil: 1_000_000, unite: 'requetes', periode: 'mois', releveLe: '2026-10-04' },
      { id: 'r2-stockage', service: 'R2', libelle: 'Stockage',
        valeur: 2_500_000_000, seuil: 10_000_000_000, unite: 'octets', periode: 'total', releveLe: '2026-10-04',
        note: 'Au-delà, R2 facture.' },
      { id: 'ia-neurones', service: 'Workers AI', libelle: 'Neurones (transcriptions)',
        valeur: 233.5, seuil: 10_000, unite: 'neurones', periode: 'jour', releveLe: '2026-10-04' },
    ])), { status: 200 }));

    const { container, findByText } = render(<SettingsSpace {...(props as any)} section="quotas" />);
    await findByText('Écritures (classe A)');

    expect(container.textContent).toContain('R2 · par mois');
    expect(container.textContent).toContain('2,50 Go');
    expect(container.textContent).toContain('Au-delà, R2 facture.');
    expect(container.textContent).toContain('234');
    expect(container.textContent).toContain('Workers le 01/09/2026');
    expect(container.textContent).toContain('R2, Workers AI le 04/10/2026');
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
describe('le contenu ouvert (SPEC §13.9, §13.10)', () => {
  const editeur = (item: ContentItem, etape: any, over: Record<string, unknown> = {}) => (
    <ContentEditor item={item} aiModels={MODELS} activeModelId="m1" modelFor={() => 'm1'}
      onClose={noop} libelleRetour="Conversations" onSave={asyncNoop} onDelete={asyncNoop}
      activeStep={etape} onStepChange={noop} {...over} />
  );
  const boutons = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).map(b => b.textContent?.trim());
  const POST = JSON.stringify({ format: 'Post Texte', accroche: 'Une accroche.', corps: 'Un corps qui se lit.' });

  it('se monte sans contenu, puis avec : ses hooks précèdent son retour anticipé', async () => {
    const { container, rerender, findByText } = render(editeur(null as any, 'ouverture'));
    expect(container.textContent).toBe('');
    rerender(editeur({ ...ITEM, status: ContentStatus.IDEA }, 'ouverture'));
    expect(await findByText('Ouvrir l’atelier avec le Coach')).toBeTruthy();
  });

  it('une idée s’ouvre à l’Ouverture : notes, format, et l’atelier ne part jamais seul', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { appels.push(String(url)); return new Response('{}', { status: 200 }); });
    const idee = { ...ITEM, status: ContentStatus.IDEA, targetFormat: 'Post Texte (Court)' as any, notes: 'Une note' };
    const { container, findByText } = render(editeur(idee, 'ouverture', { onAnalyser: noop }));
    await findByText('Ouvrir l’atelier avec le Coach');
    expect(container.textContent).toContain('Modifiable jusqu’à l’ouverture de l’atelier.');
    expect(container.textContent).toContain('Demander l’ouverture à l’Analyste');
    expect(container.textContent).toContain('Enregistré automatiquement');
    expect(boutons(container)).not.toContain('Enregistrer');
    // Rien n'est parti chez un modèle : l'atelier attend qu'on l'ouvre.
    expect(appels.some(u => u.includes('/ai'))).toBe(false);
    vi.unstubAllGlobals();
  });

  it('un brouillon : « Bon à publier » en action principale, le reste sous « ⋯ », le composeur au Rédacteur', async () => {
    const { container, findByText, getByLabelText } = render(editeur({ ...ITEM, targetFormat: 'Post Texte (Court)' as any, draft: POST }, 'brouillon'));
    await findByText('Bon à publier');
    expect(container.textContent).toContain('Au Rédacteur');
    fireEvent.click(getByLabelText('Autres actions'));
    expect(container.textContent).toContain('Relire à froid');
    expect(container.textContent).toContain('Régénérer');
    expect(container.textContent).toContain('Modifier à la main');
  });

  it('une vidéo prête à tourner : le script en grand, ce qui sera à l’écran, et « Déposer la prise »', async () => {
    const reel = JSON.stringify({ format: 'Reel expliqué', sequences: [
      { plan: 'camera', role: 'Accroche', voix: 'Vous relisez trois fois un message ?' },
      { plan: 'scene', role: 'Mécanique', voix: 'Une alarme qui sonne.', titre: 'Une [alarme]', elements: [{ type: 'carte', texte: 'Une [alarme]', apparait_sur: 'une alarme' }] },
    ] });
    const { container, findByText } = render(editeur({ ...ITEM, status: ContentStatus.READY, targetFormat: 'Reel expliqué (scènes animées)' as any, draft: reel }, 'tournage'));
    await findByText('Déposer la prise');
    expect(container.textContent).toContain('À l’écran');
    expect(container.textContent).toContain('Une alarme');
    expect(container.textContent).toContain('Votre visage, face caméra.');
  });

  it('la Publication : ce qui sera publié, la date, et la porte des séries', async () => {
    const { container, findByText } = render(editeur({ ...ITEM, status: ContentStatus.READY, targetFormat: 'Post Texte (Court)' as any, draft: POST }, 'publication', { onDecline: noop }));
    await findByText('Marquer publié');
    expect(container.textContent).toContain('Ce qui sera publié');
    expect(container.textContent).toContain('Texte à copier');
    expect(container.textContent).toContain('Décliner en série');
  });

  it('une étape verrouillée de l’adresse retombe sur l’étape courante', async () => {
    const { container, findByText } = render(editeur({ ...ITEM, targetFormat: 'Post Texte (Court)' as any }, 'publication'));
    await findByText('Ouvrir l’atelier avec le Coach');
    expect(container.textContent).not.toContain('Marquer publié');
  });

  it('réinitialiser l’atelier demande confirmation', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(String(url).includes('/generations') ? '{"generations":[]}' : JSON.stringify({
      content: ITEM, coachSession: { status: 'in_progress', formatCible: null, brief: null, validatedAt: null, messages: [
        { id: 'm1', contentId: 'i1', role: 'assistant', content: 'Une question ?', createdAt: now, quickReplies: [], readyForEditor: false },
      ] },
    }), { status: 200 }));
    const { container, findByText, getByLabelText } = render(editeur({ ...ITEM, coachStatus: 'in_progress' }, 'atelier'));
    await findByText('Une question ?');
    fireEvent.click(getByLabelText('Autres actions'));
    fireEvent.click(Array.from(container.querySelectorAll('[role="menuitem"]')).find(b => b.textContent?.includes('Réinitialiser'))!);
    expect(document.body.textContent).toContain('Réinitialiser l’atelier ?');
    vi.unstubAllGlobals();
  });

  it('le sélecteur dit où en est chaque étape, et verrouille ce qui manque', () => {
    const lignes = etapesDuSelecteur({ contenu: { ...ITEM, targetFormat: 'Carrousel (Slide par Slide)', draft: '{"format":"Carrousel","slides":[]}' } as any });
    const choisies: string[] = [];
    const { container, getByText } = render(<SelecteurEtape lignes={lignes} affichee="brouillon" onChoisir={(e) => choisies.push(e)} />);
    expect(container.textContent).toContain('Étape 3 sur 5');
    fireEvent.click(container.querySelector('button')!);
    expect(getByText('Aller à une étape')).toBeTruthy();
    const slides = Array.from(container.querySelectorAll('[role="menuitem"]')).find(b => b.textContent?.includes('Slides')) as HTMLButtonElement;
    expect(slides.disabled).toBe(true);
    expect(slides.title).toContain('slides');
    fireEvent.click(Array.from(container.querySelectorAll('[role="menuitem"]')).find(b => b.textContent?.includes('Atelier'))!);
    expect(choisies).toEqual(['atelier']);
  });
});

describe('le fil (SPEC §13.10)', () => {
  const relecture = (problemes: any[]) => JSON.stringify({ verdict: 'À retoucher', lecture_naive: { sujet: 'le contrôle' }, problemes });
  const fil = (generations: any[]) => composerLeFil({ sorte: 'carrousel', atelierValide: false, coach: [], generations });

  it('une relecture propose ses corrections, qu’on applique ou qu’on ignore', () => {
    const appliquees: string[] = [];
    const elements = fil([{ id: 'c1', kind: 'cold_read', target: null, instruction: null, createdAt: now,
      payload: relecture([{ probleme: 'trop long', correction_proposee: 'raccourcir' }, { probleme: 'flou', correction_proposee: 'préciser' }]) }]);
    const { container, getByText, queryByText } = render(<Fil elements={elements} zone={null} onAppliquer={(c) => appliquees.push(c)} />);
    expect(container.textContent).toContain('À retoucher, 2 points.');
    fireEvent.click(getByText('Appliquer les deux'));
    expect(appliquees).toEqual(['raccourcir\npréciser']);
    fireEvent.click(getByText('Ignorer'));
    expect(queryByText('Appliquer les deux')).toBeNull();
  });

  it('une relecture sans correction proposée n’offre pas d’appliquer ; appliquée, elle dit quand', () => {
    const sans = render(<Fil elements={fil([{ id: 'c1', kind: 'cold_read', target: null, instruction: null, createdAt: now, payload: relecture([{ probleme: 'flou' }]) }])} zone={null} onAppliquer={noop} />);
    expect(sans.queryByText('Appliquer les corrections')).toBeNull();
    cleanup();
    const apres = render(<Fil zone={null} onAppliquer={noop} elements={fil([
      { id: 'c1', kind: 'cold_read', target: null, instruction: null, createdAt: Date.parse('2026-10-15T10:00:00Z'), payload: relecture([{ probleme: 'x', correction_proposee: 'y' }]) },
      { id: 'a1', kind: 'adjustment', target: 'draft', instruction: buildColdReadApplyInstruction('y'), createdAt: Date.parse('2026-10-16T10:00:00Z'), payload: '{}' },
    ])} />);
    expect(apres.container.textContent).toContain('Appliquées le 16 oct.');
  });

  it('le composeur parle au Coach, et « Go » est une réponse rapide', () => {
    const envoyes: string[] = [];
    let go = 0;
    const { getByLabelText, getByText, container } = render(<Fil elements={[]} attente="Coach" zone={{
      type: 'composeur', destinataire: 'coach', onEnvoyer: (t) => envoyes.push(t),
      reponses: [{ libelle: 'Go, passe à l’Éditeur', onChoisir: () => { go += 1; } }],
    }} />);
    expect(container.textContent).toContain('réfléchit…');
    fireEvent.change(getByLabelText('Message au Coach'), { target: { value: 'Le sac, en slide 2.' } });
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.click(getByText('Go, passe à l’Éditeur'));
    expect(envoyes).toEqual(['Le sac, en slide 2.']);
    expect(go).toBe(1);
  });

  /**
   * La carte de la métaphore (28/10/2026) : le Coach la pose en tableau, le
   * brief la garde, le Lecteur froid en dresse une à l'aveugle. Sans rendu,
   * le tableau du Coach s'affichait en barres verticales.
   */
  const BRIEF = JSON.stringify({
    metaphore: { carte: [{ element: 'La digue', realite: 'La retenue' }, { element: 'La vanne', realite: 'Laisser venir, à son rythme' }], hors_image: ['L’armure'] },
    interdits: ['« La digue cède »'], questions_ouvertes: ['La phrase exacte entendue en séance.'],
  });

  it('le tableau du Coach s’affiche en tableau, et un atelier validé se relit par « Lire la trame »', () => {
    const elements = composerLeFil({ sorte: 'video', atelierValide: true, generations: [], coach: [
      { role: 'assistant', createdAt: now, content: '**Une seule image : la digue.**\n\n| Dans l’image | Ce que c’est, en vrai |\n| --- | --- |\n| La digue | La retenue |\n\n1. Humour.\n2. Pédagogie.' },
    ] });
    const { container, getByText } = render(<Fil elements={elements} zone={null} />);
    fireEvent.click(getByText('Lire la trame'));
    expect(container.querySelector('table')?.textContent).toContain('La retenue');
    expect(container.textContent).not.toContain('| La digue |');
    expect(container.textContent).toContain('2.Pédagogie.');
  });

  it('le brief se déplie sur sa carte et ses questions ouvertes ; la relecture compare la sienne', () => {
    const elements = fil([
      { id: 'b1', kind: 'brief', target: null, instruction: null, createdAt: now - 10, payload: BRIEF },
      { id: 'c1', kind: 'cold_read', target: null, instruction: null, createdAt: now, payload: JSON.stringify({
        verdict: 'Publiable', lecture_naive: { sujet: 'retenir', carte_percue: [{ element: 'la digue', represente: 'tout retenir' }] }, problemes: [],
      }) },
    ]);
    const { container, getByText } = render(<Fil elements={elements} zone={null} />);
    expect(container.textContent).toContain('Brief verrouillé : 1 interdit, 1 question ouverte.');
    fireEvent.click(getByText('Lire le brief'));
    expect(container.textContent).toContain('Hors de l’image : L’armure');
    expect(container.textContent).toContain('La phrase exacte entendue en séance.');
    fireEvent.click(getByText('Comparer la carte'));
    const lignes = [...container.querySelectorAll('table')].pop()!.querySelectorAll('tbody tr');
    expect(lignes[0].textContent).toBe('La digueLa retenuetout retenir');
    expect(lignes[1].textContent).toContain('non relevé');
  });

  it('« Go » laissé sans réponse : les questions du Coach sont rappelées avant de passer la main', () => {
    let passe = 0;
    let repondu = 0;
    const { container, getByText } = render(<Fil elements={[]} zone={{
      type: 'composeur', destinataire: 'coach', onEnvoyer: noop,
      reponses: [{ libelle: 'Go, passe à l’Éditeur', onChoisir: noop }],
      rappel: { questions: ['Quelle phrase entendez-vous en séance ?'], onRepondre: () => { repondu += 1; }, onPasser: () => { passe += 1; } },
    }} />);
    expect(container.textContent).toContain('Le Coach attend encore votre réponse');
    expect(container.textContent).not.toContain('Go, passe à l’Éditeur');
    fireEvent.click(getByText('Passer au Rédacteur sans répondre'));
    fireEvent.click(getByText('Répondre d’abord'));
    expect([passe, repondu]).toEqual([1, 1]);
  });
});

describe('écrans autonomes', () => {
  it('LoginPage se monte', () => {
    expect(() => render(<LoginPage onLoginSuccess={noop} />)).not.toThrow();
  });

  it('CalendarView se monte, y compris sans contenu', () => {
    expect(() => render(<CalendarView items={[]} onItemClick={noop} />)).not.toThrow();
  });

  it('PsychedelicsCalculator se monte', () => {
    expect(() => render(<PsychedelicsCalculator />)).not.toThrow();
  });
});

/**
 * L'écran de prise de rendez-vous a un retour anticipé — la confirmation
 * remplace tout le formulaire. Les deux états se montent donc ici, et le
 * formulaire est monté deux fois de plus : avec Calendly qui répond, et avec
 * Calendly qui refuse. C'est le second cas qui compte : un jeton absent est la
 * situation NORMALE d'un déploiement neuf, et l'écran doit le dire au lieu de
 * rester blanc.
 */
describe('prise de rendez-vous', () => {
  const QUESTION = {
    nom: 'Conditions d’annulation', type: 'single_select', requis: true, position: 1,
    choix: ['Toute séance oubliée, déplacée ou annulée moins de 48h avant est due.'], autre: false,
  };
  const TYPE_A = {
    uri: 'https://api.calendly.com/event_types/E1', nom: 'Séance', duree: 90, couleur: '#17e885', secret: false,
    lieux: [{ kind: 'custom', texte: '2 Avenue de Verdun' }], questions: [QUESTION],
  };
  const TYPE_B = {
    uri: 'https://api.calendly.com/event_types/E2', nom: 'Séance enfant', duree: 60, couleur: '#ccf000', secret: false,
    lieux: [], questions: [],
  };

  it('se monte, liste les types, et affiche le refus du Worker', async () => {
    vi.spyOn(Api, 'fetchRdvTypes').mockResolvedValue({ types: [TYPE_A] } as any);
    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [] } as any);
    const { container } = render(<RdvView />);
    await waitFor(() => expect(container.textContent).toContain('Séance'));
    cleanup();

    vi.spyOn(Api, 'fetchRdvTypes').mockRejectedValue(new Error('Aucun jeton Calendly'));
    const refus = render(<RdvView />);
    await waitFor(() => expect(refus.container.textContent).toContain('Aucun jeton Calendly'));
  });

  it('reprend nom, e-mail et téléphone depuis la query string', async () => {
    const avant = window.location.search;
    window.history.replaceState({}, '', '/?prenom=Marie&nom=Durand&email=marie@exemple.fr&tel=0612345678');
    vi.spyOn(Api, 'fetchRdvTypes').mockResolvedValue({ types: [] } as any);
    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [] } as any);

    const { container } = render(<RdvView />);
    const valeurs = [...container.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(valeurs).toContain('Marie Durand');
    expect(valeurs).toContain('marie@exemple.fr');
    expect(valeurs).toContain('0612345678');

    window.history.replaceState({}, '', `/${avant}`);
  });

  /**
   * Dans une query string, `+` veut dire espace — un numéro international y
   * perd donc le seul caractère qui le désigne comme tel. Le lien Notion écrit
   * « tel=+33 6 37… » et le champ doit afficher « +33 6 37… », pas « 33 6 37… ».
   */
  it('rend le « + » d’un numéro international écrit tel quel dans l’URL', async () => {
    const avant = window.location.search;
    window.history.replaceState({}, '', '/?email=a@b.fr&tel=+33%206%2037%2033%2026%2055');
    vi.spyOn(Api, 'fetchRdvTypes').mockResolvedValue({ types: [] } as any);
    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [] } as any);

    const { container } = render(<RdvView />);
    const valeurs = [...container.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(valeurs).toContain('+33 6 37 33 26 55');

    window.history.replaceState({}, '', `/${avant}`);
  });

  /**
   * La sélection décide de ce qui s'affiche, et une sélection VIDE affiche
   * tout : c'est l'état d'un déploiement neuf, et un écran qui ne proposerait
   * rien s'y lirait comme une panne.
   */
  it('n’affiche que les types retenus, et tout quand rien n’est retenu', async () => {
    vi.spyOn(Api, 'fetchRdvTypes').mockResolvedValue({ types: [TYPE_A, TYPE_B] } as any);
    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [TYPE_B.uri] } as any);

    const retenus = render(<RdvView />);
    await waitFor(() => expect(retenus.container.textContent).toContain('Séance enfant'));
    expect([...retenus.container.querySelectorAll('input[type="radio"]')]).toHaveLength(1);
    cleanup();

    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [] } as any);
    const tous = render(<RdvView />);
    await waitFor(() => expect(tous.container.querySelectorAll('input[type="radio"]')).toHaveLength(2));
  });

  /**
   * Le lieu est exigé par Calendly pour un type « custom », et la question
   * obligatoire l'est tout autant — un 400 « Required Questions and Answers
   * cannot be blank » l'a appris. Les deux arrivent donc pré-remplis : le lieu
   * depuis le type, et la question à choix unique cochée d'office.
   */
  it('pré-remplit le lieu et la question à choix unique du type choisi', async () => {
    vi.spyOn(Api, 'fetchRdvTypes').mockResolvedValue({ types: [TYPE_A] } as any);
    vi.spyOn(Api, 'fetchRdvSelection').mockResolvedValue({ types: [] } as any);
    vi.spyOn(Api, 'fetchRdvCreneaux').mockResolvedValue({ creneaux: [], depuis: '', jusqua: '', libre: false } as any);

    const { container } = render(<RdvView />);
    await waitFor(() => expect(container.querySelector('input[type="radio"]')).not.toBeNull());
    fireEvent.click(container.querySelector('input[type="radio"]')!);

    await waitFor(() => {
      const valeurs = [...container.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
      expect(valeurs).toContain('2 Avenue de Verdun');
      expect(container.textContent).toContain('Conditions d’annulation');
    });

    const coches = [...container.querySelectorAll('input[name="q-1"]')] as HTMLInputElement[];
    expect(coches.some((c) => c.checked)).toBe(true);
  });
});

describe('les listes de Contenus (SPEC §13)', () => {
  const etapesDe = (items: ContentItem[]) =>
    Object.fromEntries(items.map(i => [i.id, etapeCourante({ contenu: i })]));
  const conversations = (items: ContentItem[], over: Record<string, unknown> = {}) => (
    <ConversationsView items={items} tous={items} series={[]} etapes={etapesDe(items)} derniers={{}}
      searchQuery="" onSearchChange={noop} filtre="tout" onFiltre={noop}
      onOuvrir={noop} onOuvrirPlan={noop} onNouvelleIdee={noop}
      onCreerSerie={asyncNoop} onCreerVideoDirecte={asyncNoop} {...over} />
  );

  it('Conversations se monte vide et peuplée, avec l’étape de chaque contenu', () => {
    const vide = render(conversations([]));
    expect(vide.container.textContent).toContain('Aucune conversation en cours');
    cleanup();
    const { container } = render(conversations([{ ...ITEM, coachStatus: 'in_progress' }]));
    expect(container.textContent).toContain('Le piège chinois');
    expect(container.textContent).toContain('Hors série');
    expect(container.textContent).toContain('Atelier en cours');
  });

  it('range une publication de série dans la carte de sa série, avec son rang', () => {
    const pub = { ...ITEM, id: 'p2', serieId: SERIE.id, seriePosition: 2, title: 'Deuxième publication' };
    const { container } = render(conversations([pub], { series: [SERIE], tous: [pub, { ...pub, id: 'p1', seriePosition: 1, status: ContentStatus.PUBLISHED }] }));
    expect(container.textContent).toContain(`Série · ${SERIE.titre}`);
    expect(container.textContent).toContain('2 publications · 1 publiée');
    expect(container.textContent).toContain('2/2');
    expect(container.textContent).not.toContain('Hors série');
  });

  it('filtre par geste, avec un compte par filtre', () => {
    const pret = { ...ITEM, id: 'pret', status: ContentStatus.READY, draft: '{"format":"Post Texte"}', targetFormat: 'Post Texte (Court)' as any, title: 'Un post prêt' };
    const items = [ITEM, pret];
    const choisis: string[] = [];
    const { container } = render(conversations(items, { onFiltre: (f: string) => choisis.push(f) }));
    const publier = Array.from(container.querySelectorAll('[role="radio"]')).find(b => b.textContent?.startsWith('Publier'))!;
    expect(publier.textContent).toBe('Publier1');
    fireEvent.click(publier);
    expect(choisis).toEqual(['publier']);
    cleanup();
    const filtree = render(conversations(items, { filtre: 'publier' }));
    expect(filtree.container.textContent).toContain('Un post prêt');
    expect(filtree.container.textContent).not.toContain('Le piège chinois');
  });

  it('« Nouveau » propose idée, série et vidéo directe, et crée une vidéo directe', async () => {
    const crees: string[] = [];
    const { container, getByText } = render(conversations([], { onCreerVideoDirecte: async (t: string) => { crees.push(t); } }));
    fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Nouveau'))!);
    expect(container.textContent).toContain('Une ligne dans Idées');
    fireEvent.click(getByText('Vidéo directe'));
    fireEvent.change(container.querySelector('#nouveau-titre')!, { target: { value: 'Pourquoi consulter ?' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(crees).toEqual(['Pourquoi consulter ?']));
  });

  it('Idées se monte vide et peuplée, sans verdict, et exige un format', () => {
    const vide = render(<IdeesView items={[]} searchQuery="" onSearchChange={noop} onOuvrir={noop} onAjouter={asyncNoop} onPreparer={noop} />);
    expect(vide.container.textContent).toContain('Aucune idée en réserve');
    cleanup();
    const idee = { ...ITEM, status: ContentStatus.IDEA, verdict: 'Valide' as const, analyzedAt: now };
    const { container } = render(<IdeesView items={[idee, { ...ITEM, id: 'i2', status: ContentStatus.IDEA }]} searchQuery="" onSearchChange={noop} onOuvrir={noop} onAjouter={asyncNoop} onPreparer={noop} />);
    expect(container.textContent).toContain('Préparée');
    expect(container.textContent).toContain('À préparer');
    expect(container.textContent).not.toContain('Valide');
    fireEvent.change(container.querySelector('input')!, { target: { value: 'Une idée' } });
    const ajouter = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Ajouter'))!;
    expect(ajouter.disabled).toBe(true);
  });

  it('Publiés se monte en liste et en calendrier', () => {
    const publie = { ...ITEM, status: ContentStatus.PUBLISHED, scheduledDate: '2026-10-12' };
    const props = { items: [publie], etapes: etapesDe([publie]), onVue: noop, searchQuery: '', onSearchChange: noop, onOuvrir: noop };
    const liste = render(<PubliesView {...props} vue="liste" />);
    expect(liste.container.textContent).toContain('Publié le 12 oct.');
    cleanup();
    expect(() => render(<PubliesView {...props} vue="calendrier" />)).not.toThrow();
    cleanup();
    expect(render(<PubliesView {...props} items={[]} vue="liste" />).container.textContent).toContain('Rien de publié');
  });
});

describe('séries', () => {
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
    etapes: {},
    suppressionDemandee: false,
    onFermerSuppression: noop,
    onUpdate: asyncNoop,
    onDelete: asyncNoop,
    onCreateContents: asyncNoop,
    onOpenContent: noop,
    onGeneratePlan: async () => [],
  };

  it('le panneau Série : le plan, puis chaque publication avec son étape, qui s’ouvre d’un clic (SPEC §13.12)', () => {
    const pubs = [
      { ...ITEM, id: 'p1', title: 'Première', serieId: SERIE.id, seriePosition: 1, status: ContentStatus.PUBLISHED },
      { ...ITEM, id: 'p2', title: 'Deuxième', serieId: SERIE.id, seriePosition: 2, coachStatus: 'in_progress' as const },
    ];
    const etapes = Object.fromEntries(pubs.map(p => [p.id, etapeCourante({ contenu: p })]));
    const ouvertes: string[] = [];
    let plan = 0;
    const { container, getByText } = render(<PanneauSerie serie={SERIE} publications={pubs} etapes={etapes} active="p2"
      onPlan={() => { plan += 1; }} onOuvrir={(i) => ouvertes.push(i.id)} />);
    expect(container.textContent).toContain('Atelier en cours');
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('Deuxième');
    fireEvent.click(getByText('Première'));
    fireEvent.click(getByText('Plan de la série'));
    expect(ouvertes).toEqual(['p1']);
    expect(plan).toBe(1);
    cleanup();
    const avancement = render(<AvancementSerie publications={pubs} etapes={etapes} />);
    expect(avancement.container.textContent).toContain('1 sur 2 publiée');
  });

  it('le plan n’a qu’une action principale : une publication de plus, demandée à l’Éclateur', async () => {
    const demandes: number[] = [];
    const { getByText } = render(<SeriePlanView {...(planProps as any)} serie={SERIE}
      onGeneratePlan={async (n: number) => { demandes.push(n); return []; }} />);
    fireEvent.click(getByText('Générer une publication de plus'));
    await waitFor(() => expect(demandes).toEqual([1]));
  });

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

  /**
   * NORMATIF — « à jour » est un état, pas une raison de retirer le geste.
   *
   * L'écran affichait « à jour » À LA PLACE du bouton : une surface posée
   * n'avait plus aucun moyen d'être reprise. Signalé le 14/09 — le collage
   * dans le Gem avait échoué alors que la pose était déjà enregistrée, et il
   * n'y avait plus de bouton pour recommencer. On redépose aussi pour
   * vérifier, ou pour un deuxième Gem.
   */
  it('une surface à jour garde son bouton — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({
      poses: { gpt: { profil: 'noyau', hash: 'aaaaaaaa', poseeLe: 1 } },
    } as any);
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('à jour'));

    const lignes = [...container.querySelectorAll('tr')];
    const ligneGpt = lignes.find(l => l.textContent?.includes('Projet ChatGPT — instructions'));
    expect(ligneGpt, 'la ligne du projet ChatGPT est introuvable').toBeTruthy();
    expect(ligneGpt!.textContent).toContain('à jour');
    expect(ligneGpt!.querySelector('button'), 'plus aucun geste possible').toBeTruthy();
  });

  /**
   * Un espace de connaissance ne se colle pas : il s'alimente en fichiers. Le
   * profil complet fait 35 000 caractères et n'entre dans aucun champ
   * d'instructions — c'est ce qui a échoué le 14/09.
   */
  it('un dépôt en fichier propose de télécharger, pas de copier', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({ poses: {} } as any);
    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('Gem Gemini'));

    const lignes = [...container.querySelectorAll('tr')];
    const fichier = lignes.find(l => l.textContent?.includes('Gem Gemini — fichier de connaissance'));
    const instructions = lignes.find(l => l.textContent?.includes('Gem Gemini — instructions'));
    expect(fichier!.querySelector('button')!.textContent).toContain('Télécharger');
    expect(instructions!.querySelector('button')!.textContent).toContain('Copier');
  });

  it('télécharger enregistre la pose sans passer par le presse-papier', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT);
    vi.spyOn(Api, 'fetchPoses').mockResolvedValue({ poses: {} } as any);
    const contexte = vi.spyOn(Api, 'fetchContexte').mockResolvedValue({
      profil: 'complet', texte: '# Contexte Luminose', hash: 'bbbbbbbb', taille: 19, documents: [],
    } as any);
    const pose = vi.spyOn(Api, 'setPose').mockResolvedValue({
      surface: 'gem-fichier', pose: { profil: 'complet', hash: 'bbbbbbbb', poseeLe: 2 },
    } as any);

    // jsdom n'a ni URL d'objet ni navigation : on remplace les deux.
    const creerURL = vi.fn(() => 'blob:test');
    (URL as any).createObjectURL = creerURL;
    (URL as any).revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { container } = render(<CorpusSpace section="etat" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('Gem Gemini'));

    const ligne = [...container.querySelectorAll('tr')]
      .find(l => l.textContent?.includes('Gem Gemini — fichier de connaissance'))!;
    fireEvent.click(ligne.querySelector('button')!);

    await waitFor(() => expect(pose).toHaveBeenCalledWith('gem-fichier', 'complet', 'bbbbbbbb'));
    expect(contexte).toHaveBeenCalledWith('complet');
    expect(creerURL).toHaveBeenCalled();
    // Le nom porte le hash : deux fichiers dans un dossier se ressemblent.
    const lien = clic.mock.instances[0] as HTMLAnchorElement;
    expect(lien.download).toBe('luminose-complet-bbbbbbbb.txt');
  });
});

/**
 * La carte — la documentation interne du corpus.
 *
 * CE QUE CES TESTS PROTÈGENT, ET C'EST TOUT LEUR OBJET. Cet écran a été écrit
 * le 13/09/2026, le jour même où on retirait des README du corpus cinq
 * annonces « Vide aujourd'hui » qui dataient d'un corpus vide. Une
 * documentation qui recopie des chiffres les fige, et rien ne la contredit
 * quand ils bougent.
 *
 * D'où la règle de `CarteView` : aucun effectif n'est écrit dans le composant.
 * Le test le plus important ci-dessous est celui qui le vérifie — il sert un
 * corpus inventé et exige que l'écran affiche CES chiffres-là.
 */
describe('Corpus — la carte', () => {
  const ETAT_CARTE: Api.EtatCorpus = {
    date: '2026-09-13',
    documents: 4,
    blocs: ['socle', 'voix'],
    statuts: ['actif', 'candidat', 'statut-inconnu-de-l-ecran'],
    profils: [
      { profil: 'noyau', titre: 'n', intention: 'x', hash: 'aaaaaaaa', taille: 1234, documents: 1, plafond: 7500, depasse: false },
      { profil: 'complet', titre: 'c', intention: 'y', hash: 'bbbbbbbb', taille: 5678, documents: 4, plafond: null, depasse: false },
      { profil: 'strategie', titre: 's', intention: 'z', hash: 'cccccccc', taille: 91011, documents: 0, plafond: null, depasse: false },
    ],
    offres: [],
    aRevoir: [],
    absencesDeliberees: [],
  };

  const DOCS = {
    documents: [
      { chemin: 'socle/identite', bloc: 'socle', titre: 'Identité', statut: 'actif', type: 'fact', revu: '2026-08', review_at: null, expose: 'public', taille: 10 },
      { chemin: 'socle/audiences', bloc: 'socle', titre: 'Audiences', statut: 'actif', type: 'fact', revu: '2026-08', review_at: null, expose: 'prive', taille: 10 },
      { chemin: 'socle/offres/oracle', bloc: 'socle', titre: 'Oracle', statut: 'actif', type: 'fact', revu: '2026-08', review_at: null, expose: 'public', taille: 10 },
      { chemin: 'voix/regles-de-voix', bloc: 'voix', titre: 'Regles de voix', statut: 'actif', type: 'instruction', revu: '2026-09', review_at: null, expose: 'prive', taille: 10 },
    ],
  } as any;

  const FEUILLES = {
    feuilles: [
      { action: 'DRAFT_CONTENT', chemins: ['socle'], neRecoitRien: false, taille: 42424, documents: 3 },
      { action: 'COLD_READ', chemins: null, neRecoitRien: true, taille: 0, documents: 0 },
    ],
  } as any;

  afterEach(() => { vi.restoreAllMocks(); cleanup(); });

  it('se monte pendant le chargement', () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockReturnValue(new Promise(() => {}) as any);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockReturnValue(new Promise(() => {}) as any);
    vi.spyOn(Api, 'fetchFeuilles').mockReturnValue(new Promise(() => {}) as any);
    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    expect(container.textContent).toContain('Lecture du corpus');
  });

  it('se monte en panne, sans page blanche', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockRejectedValue(new Error('Worker injoignable'));
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockRejectedValue(new Error('Worker injoignable'));
    vi.spyOn(Api, 'fetchFeuilles').mockRejectedValue(new Error('Worker injoignable'));
    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('Worker injoignable'));
  });

  /**
   * NORMATIF — la carte compte, elle ne récite pas.
   *
   * Le corpus servi ici est inventé : 4 fiches, 3 dans `socle`, 1 dans `voix`,
   * un profil `strategie` à 91 011 caractères. Si l'écran affichait les vrais
   * chiffres du jour où il a été écrit, ce test le dirait.
   */
  it('affiche les chiffres du corpus servi, jamais les siens — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockResolvedValue(FEUILLES);

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));

    const texte = container.textContent ?? '';
    expect(texte).toContain('socle/ \u00b7 3');
    expect(texte).toContain('voix/ \u00b7 1');
    expect(texte).toContain('canaux/ \u00b7 0');
    expect(texte).toMatch(/91.011/);
    expect(texte).toMatch(/42.424/);
  });

  /**
   * Cette route est plus récente que le reste de l'API : un Worker déployé
   * avant elle ne doit pas vider la page, seulement laisser les poids en
   * attente.
   */
  it('survit à un Worker qui ne sert pas encore les feuilles', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockRejectedValue(new Error('404'));

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));
    expect(container.textContent).toContain('Le flux \u00e9ditorial');
  });

  /**
   * Le Lecteur froid ne reçoit rien, et la carte doit le DIRE. Un tableau qui
   * laisse la case vide se lit comme un oubli — c'est exactement la confusion
   * que la décision du 26/08 cherche à empêcher.
   */
  it('dit qu\u2019un r\u00f4le ne re\u00e7oit rien par d\u00e9cision — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockResolvedValue(FEUILLES);

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));
    expect(container.textContent).toContain('rien \u2014 d\u00e9cision');
    expect(container.textContent).toContain("et c'est voulu");
  });

  /**
   * Les rôles et leurs feuilles viennent de `@luminose/editorial`. Ajouter une
   * action au catalogue sans qu'elle apparaisse ici rendrait la carte muette
   * sur un pan du flux, sans que rien ne le signale.
   */
  /**
   * NORMATIF — le vocabulaire des statuts vient du Worker.
   *
   * La garde qui refuse un statut inconnu au commit et la documentation qui
   * l'explique doivent nommer la même liste. Si l'écran tenait sa propre
   * liste, un septième statut entrerait dans le corpus sans jamais apparaître
   * ici — et personne ne saurait ce qu'il veut dire.
   */
  it('sert la liste de statuts du Worker, et signale celui qu’il ne sait pas décrire', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockResolvedValue(FEUILLES);

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));

    const texte = container.textContent ?? '';
    expect(texte).toContain('statut-inconnu-de-l-ecran');
    expect(texte).toContain('ajouter sa d\u00e9finition');
    // Un statut que le Worker ne sert pas n'est pas inventé par l'écran.
    expect(texte).not.toContain('volontairement-absent');
  });

  /**
   * La première version de ce schéma rangeait la relecture à froid et
   * l'ajustement en file, comme si on relisait une fois avant de passer à la
   * suite. Le Lecteur froid JUGE et ne produit aucun texte : avec l'Ajustement
   * il forme une boucle qui tourne tant que le verdict n'est pas « publiable ».
   */
  it('montre la boucle de relecture, pas une file — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockResolvedValue(FEUILLES);

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));
    expect(container.textContent).toContain('puis on relit');
    expect(container.textContent).toContain('une branche,');
  });

  it('nomme toutes les actions du catalogue', async () => {
    vi.spyOn(Api, 'fetchEtatCorpus').mockResolvedValue(ETAT_CARTE);
    vi.spyOn(Api, 'fetchDocumentsCorpus').mockResolvedValue(DOCS);
    vi.spyOn(Api, 'fetchFeuilles').mockResolvedValue(FEUILLES);

    const { container } = render(<CorpusSpace section="carte" bloc={null} />);
    await waitFor(() => expect(container.textContent).toContain('4 fiches'));
    for (const a of AI_ACTION_CATALOG) {
      expect(container.textContent, `${a.id} manque \u00e0 la carte`).toContain(a.id);
    }
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

  /**
   * NORMATIF — une fiche périmée le dit, en lecture, après rechargement.
   *
   * L'encart vert « commité, pas déployé » ne connaît que le commit qu'on vient
   * de faire : il ne survit pas à un F5. Le 01/09/2026, Florent a corrigé une
   * fiche depuis la console, rafraîchi, et relu l'ancienne version sans qu'aucun
   * écran ne le signale. Ce que l'on lit ici EST ce que reçoivent les prompts,
   * et c'est ça qu'il faut dire.
   */
  it('une fiche en retard sur le dépôt le dit en lecture — NORMATIF', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({
      configure: true, etat: null, source: null,
      ecart: {
        comparable: true, raison: null,
        differents: [{ chemin: 'socle/offres/le-seuil', etat: 'modifie' }],
      },
    } as any);

    const { container } = await ouvrirUneFiche();
    await waitFor(() => expect(container.textContent).toContain('version plus récente'));
    expect(container.textContent).toContain('celle que reçoivent les prompts');
    // Et le geste est là où le constat se fait.
    expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Déployer maintenant'))).toBe(true);
  });

  /** Une fiche à jour ne porte aucun avertissement — seulement le rappel général. */
  it('une fiche à jour ne s’alarme pas', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({
      configure: true, etat: null, source: null,
      ecart: { comparable: true, raison: null, differents: [] },
    } as any);

    const { container } = await ouvrirUneFiche();
    await waitFor(() => expect(container.textContent).toContain("n'entre dans les prompts qu'au déploiement"));
    expect(container.textContent).not.toContain('version plus récente');
  });

  /**
   * Comparaison impossible : on n'invente rien, dans un sens comme dans l'autre.
   * Pas d'alarme, et pas non plus d'acquittement.
   */
  it('ne s’alarme pas quand l’écart n’est pas calculable', async () => {
    vi.spyOn(Api, 'fetchDeploiement').mockResolvedValue({
      configure: true, etat: null, source: null,
      ecart: { comparable: false, raison: 'Le dépôt est injoignable.', differents: [] },
    } as any);

    const { container } = await ouvrirUneFiche();
    await waitFor(() => expect(container.textContent).toContain('Le Seuil'));
    expect(container.textContent).not.toContain('version plus récente');
  });

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
  it('un message garde ses retours à la ligne et ses numéros ; un document rejoint ses lignes', () => {
    const texte = 'Accroche face caméra\n« Je veux mieux contrôler mes émotions. »\n\n1. Humour.\n2. Pédagogie.';
    const message = render(<Markdown texte={texte} variante="message" />);
    expect(message.container.querySelectorAll('br')).toHaveLength(1);
    expect(message.container.textContent).toContain('1.Humour.');
    cleanup();
    const document = render(<Markdown texte={texte} />);
    expect(document.container.querySelectorAll('br')).toHaveLength(0);
    expect(document.container.textContent).toContain('·Humour.');
  });

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
    currentSocialTab: 'conversations' as const,
    currentSettingsSection: 'display' as const,
    currentSettingsPersona: null,
    onNavigate: () => {},
    onNavigateSettings: () => {},
    counts: { conversations: 0, ideas: 0, publies: 0 },
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
    expect(deuxieme.className).toContain('w-[232px]');
    expect(troisieme.className).toContain('w-[232px]');
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
    currentTab: 'conversations' as const,
    currentSettingsSection: 'display' as const,
    onNavigate: () => {},
    onNavigateSettings: () => {},
    counts: { conversations: 0, ideas: 0, publies: 0 },
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

describe('Article — la publication sous le brouillon', () => {
  afterEach(cleanup);

  const article = (champs: Record<string, unknown>) => JSON.stringify({
    format: 'Article',
    titre_h1: 'Le stress : visite guidée',
    introduction: 'Vous êtes stressé.',
    sections: [{ sous_titre_h2: 'Le courant normal', contenu: 'Le stress n\u2019est pas une panne.' }],
    ...champs,
  });

  it('livre le fichier du site, les prompts et les posts', () => {
    const { container } = render(<BodyRenderer datePublication="2026-10-01" body={article({
      slug: 'stress-installation-electrique', categorie: 'stress', meta_description: 'Stress aigu ou chronique.',
      resume: ['Un.', 'Deux.'], cta: { titre: 'Alors ?', texte: 'Écrivez-moi.', chute: 'Fin.' },
      illustrations: [{ emplacement: 'banniere', prompt: 'Un tableau électrique. Format carré 1:1.' }],
      post_reseaux: { texte: 'Je suis stressé.', cta: 'L\u2019article fait le tour des pannes.', hashtags: ['#stress'] },
    })} />);
    expect(container.textContent).toContain('_posts/2026-10-01-stress-installation-electrique.html');
    expect(container.textContent).toContain('Un tableau électrique');
    expect(container.textContent).toContain('https://www.luminose.fr/blog/stress/stress-installation-electrique.html');
    expect(container.textContent).toContain('Lien en bio');
  });

  it('montre le brouillon mis en forme, pas son balisage', () => {
    const { container } = render(<BodyRenderer body={article({
      introduction: 'Le **stress** est *partout*.\n\n- une puce\n- une autre',
    })} />);
    expect(container.querySelector('strong')?.textContent).toBe('stress');
    expect(container.querySelector('em')?.textContent).toBe('partout');
    expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain('**');
  });

  it('livre aussi un article de l\u2019ancienne grille, en disant ce qui manque', () => {
    const { container } = render(<BodyRenderer body={article({ cta: 'Prenez rendez-vous.' })} />);
    expect(container.textContent).toContain('Fichier du site');
    expect(container.textContent).toContain('Catégorie absente');
  });
});

/**
 * Le Reel expliqué (SPEC §12) : le storyboard est le document de tournage. Il
 * se monte sain, et il se monte À CORRIGER — c'est l'état où l'écran doit
 * parler, puisqu'un script dont le contrôle sait déjà qu'il ne tiendra pas ne
 * doit pas partir au tournage.
 */
describe('Reel expliqué — storyboard', () => {
  const reel = (modifier: (d: any) => void = () => {}) => {
    const d: any = {
      format: 'Reel expliqué',
      sequences: [
        { plan: 'camera', role: 'Accroche', voix: "Vous relisez trois fois un message avant de l'envoyer ?" },
        { plan: 'camera', role: 'Ancrage', voix: "En séance, je l'entends presque chaque semaine. Et ce n'est pas de la politesse : c'est un système d'alarme qui s'est réglé trop fort." },
        {
          plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
          voix: "Le perfectionnisme fonctionne comme une alarme incendie. Elle était utile quand vous étiez enfant et qu'une erreur coûtait cher. Aujourd'hui, elle sonne pour une virgule. Et chaque fois qu'elle sonne, vous payez en fatigue.",
          titre: 'Une alarme [trop sensible]',
          elements: [
            { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Enfant : erreur = danger', apparait_sur: 'quand vous étiez enfant' },
            { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Adulte : une [virgule]', apparait_sur: 'elle sonne pour une virgule' },
            { type: 'carte', taille: 'grande', ton: 'ombre', texte: 'Le prix : la [fatigue]', visuel: { nature: 'schema', description: "Une jauge d'alarme bloquée dans le rouge." }, apparait_sur: 'vous payez en fatigue' },
          ],
        },
        {
          plan: 'scene', role: 'Bascule', registre: 'humour',
          voix: "Imaginez un détecteur de fumée qui se déclenche dès que vous allumez une bougie. Vous ne le jetez pas : vous le réglez.",
          titre: 'On ne le jette [pas]',
          elements: [
            { type: 'carte', taille: 'grande', ton: 'neutre', texte: null, visuel: { nature: 'illustration', description: 'Un détecteur de fumée paniqué au-dessus d\u2019une bougie.' }, apparait_sur: 'dès que vous allumez une bougie' },
            { type: 'pastille', ton: 'lumière', texte: 'On le [règle]', apparait_sur: 'vous le réglez' },
          ],
        },
        { plan: 'camera', role: "Appel à l'action", voix: "C'est ce travail-là qu'on fait en séance : baisser le volume, sans couper le son. Si ça vous parle, tout est sur luminose.fr, lien en bio." },
      ],
      accroche_pub: { voix: "Relire trois fois un message avant de l'envoyer : on croit que c'est de la politesse." },
      legende: { texte: 'Trois relectures pour deux lignes.', cta: 'Lien en bio → luminose.fr', hashtags: ['#perfectionnisme'] },
    };
    modifier(d);
    return JSON.stringify(d);
  };

  /** Des visuels sans dépôt : la carte se lit, rien n'est encore déposé. */
  const VISUELS = { visuel: () => undefined, deLaScene: () => ({}), desIllustrations: () => ({}), deposer: asyncNoop, retirer: asyncNoop, indisponible: false } as any;

  it('la carte d\u2019une scène : la voix, ses repères numérotés, ce qu\u2019il reste à produire', () => {
    const data = JSON.parse(reel());
    const { container } = render(<SequenceScene reel={data} sequence={data.sequences[2]} numero={3} visuels={VISUELS} deposable />);
    const texte = container.textContent ?? '';
    expect(texte).toContain('3. Scène · Mécanique · pédagogie');
    expect(texte).toContain('À produire');
    expect(texte).toContain("Schéma — Une jauge d'alarme bloquée dans le rouge.");
    // Les trois repères de la scène sont soulignés et numérotés.
    expect(Array.from(container.querySelectorAll('sup')).map(s => s.textContent)).toEqual(['1', '2', '3']);
    // Un écran à la fois (v2.26) : la scène se montre en trois miniatures, une par écran.
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(3);
  });

  it('un écran à la fois (v2.26) : schémas dessinés par l\u2019outil, illustration du Reel décrite une fois', () => {
    const data: any = {
      format: 'Reel expliqué',
      illustrations: [{ id: 'digue', description: 'En haut, une digue fissurée ; en bas, un petit personnage qui court.' }],
      sequences: [
        { plan: 'camera', role: 'Accroche', voix: 'Je veux mieux contrôler mes émotions.' },
        {
          plan: 'scene', role: 'Constat', registre: 'humour',
          voix: 'Imaginez une digue. Derrière, tout ce que vous ressentez, qui monte et qui pousse.',
          elements: [
            { texte: null, ton: 'neutre', visuel: { illustration: 'digue', cadrage: 'haut' }, apparait_sur: 'Imaginez une digue' },
            { texte: 'Ça [monte]', ton: 'ombre', visuel: { schema: 'niveau', de: 30, a: 95 }, apparait_sur: 'tout ce que vous ressentez' },
            { texte: null, ton: 'ombre', visuel: { schema: 'liste', items: ['Colère', 'Larmes'], barres: true }, apparait_sur: 'qui monte et qui pousse' },
          ],
        },
        { plan: 'camera', role: 'Appel', voix: 'Tout est sur luminose.fr.' },
      ],
    };
    const deposes: any[] = [];
    const visuels = { ...VISUELS, deposer: async (...a: any[]) => { deposes.push(a); } };
    const bloc = render(<IllustrationsDuReel reel={data} visuels={visuels} deposable />);
    expect(bloc.container.textContent).toContain('Illustrations de la métaphore');
    expect(bloc.container.textContent).toContain('Illustration « digue » — En haut, une digue fissurée');
    cleanup();
    const { container } = render(<SequenceScene reel={data} sequence={data.sequences[1]} numero={2} visuels={visuels} deposable />);
    const ecrans = Array.from(container.querySelectorAll('[role="img"]'));
    expect(ecrans).toHaveLength(3);
    // Sans image, le storyboard montre la commande ; les schémas, l'outil les dessine.
    expect(ecrans[0].textContent).toContain('Illustration « digue » · haut');
    expect(ecrans[1].textContent).toContain('Ça monte');
    expect(ecrans[2].textContent).toContain('Colère');
    expect(ecrans[2].textContent).toContain('Larmes');
    // Rien à produire écran par écran : l'illustration se dépose une fois, pour tout le Reel.
    expect(container.textContent).not.toContain('À produire');
  });

  it('le script se lit séquence par séquence, minuté au débit estimé', () => {
    const { container } = render(<LectureScript draft={reel()} format="Reel expliqué (scènes animées)" />);
    expect(container.textContent).toContain('1 · Accroche');
    expect(container.textContent).toContain('Face caméra · 0 à');
    expect(container.textContent).toContain('3 · Mécanique');
    expect(container.textContent).toContain('Seconde accroche · publicité');
  });

  it('un Script Reel se lit aussi, section par section', () => {
    const { container } = render(<LectureScript draft={JSON.stringify({
      format: 'Script Reel', sections: [{ timing: '[0-3s]', role: 'Accroche', texte: 'Bonjour.' }],
    })} format="Script Vidéo (Reel/Short)" />);
    expect(container.textContent).toContain('1 · Accroche');
    expect(container.textContent).toContain('Bonjour.');
  });

  it('monte une scène dont aucun élément n\u2019est encore apparu', () => {
    const sequence = JSON.parse(reel()).sequences[2];
    expect(() => render(<SceneLuminose sequence={sequence} largeur={216} anime={{ ecran: 0, entree: 0, ecoule: 0, duree: 3 }} />)).not.toThrow();
  });
});

/**
 * Étape V2 (SPEC §12.4) : la scène se pilote de l'extérieur, porte les visuels
 * déposés, et le storyboard d'un contenu enregistré se monte — y compris quand
 * le navigateur refuse ce dont le montage a besoin, ce qui est le cas de jsdom
 * comme d'une navigation privée : ni IndexedDB, ni WebCodecs.
 */
describe('Reel expliqué — montage', () => {
  // Les simulations d'environnement ne doivent pas déborder sur l'écran suivant.
  afterEach(() => vi.unstubAllGlobals());

  const reel = () => ({
    format: 'Reel expliqué',
    sequences: [
      { plan: 'camera', role: 'Accroche', voix: 'Vous relisez trois fois un message avant de l\u2019envoyer ?' },
      {
        plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
        voix: 'Elle sonne pour une virgule, et vous payez en fatigue.',
        titre: 'Une alarme [trop sensible]',
        elements: [
          { type: 'carte', taille: 'moyenne', ton: 'ombre', texte: 'Une [virgule]', apparait_sur: 'pour une virgule' },
          { type: 'carte', taille: 'grande', ton: 'ombre', texte: 'La [fatigue]', visuel: { nature: 'schema', description: 'Une jauge bloquée dans le rouge.' }, apparait_sur: 'vous payez en fatigue' },
        ],
      },
      {
        plan: 'scene', role: 'Bascule', registre: 'humour',
        voix: 'Vous ne le jetez pas : vous le réglez.',
        titre: 'On le [règle]',
        elements: [{ type: 'pastille', ton: 'lumiere', texte: 'On le [règle]', apparait_sur: 'vous le réglez' }],
      },
      { plan: 'camera', role: 'Appel', voix: 'Tout est sur luminose.fr, lien en bio.' },
    ],
  }) as any;

  it('une scène pilotée montre l\u2019écran en cours, qui entre, et le visuel déposé à la place du gabarit', () => {
    const { container } = render(
      <SceneLuminose sequence={reel().sequences[1]} largeur={216} anime={{ ecran: 1, entree: 0, ecoule: 0, duree: 3 }} visuels={{ 1: 'blob:visuel-depose' }} />
    );
    const image = container.querySelector('img[src="blob:visuel-depose"]');
    expect(image).not.toBeNull();
    // Le gabarit pointillé disparaît quand l'image est là.
    expect(container.textContent).not.toContain('Une jauge bloquée dans le rouge.');
    // Un écran à la fois : le premier a laissé la place.
    expect(container.textContent).not.toContain('virgule');
    // L'écran qui entre part de la transparence.
    const enAttente = image!.closest('div[style*="opacity"]') as HTMLElement | null;
    expect(enAttente?.style.opacity).toBe('0');
  });

  it('la vidéo ne montre jamais la description d’un visuel absent : la carte garde son texte (28/10/2026)', () => {
    const storyboard = render(<SceneLuminose sequence={reel().sequences[1]} ecran={1} largeur={216} />);
    expect(storyboard.container.textContent).toContain('Une jauge bloquée dans le rouge.');
    cleanup();
    const video = render(<SceneLuminose sequence={reel().sequences[1]} ecran={1} largeur={216} gabarits={false} />);
    expect(video.container.textContent).not.toContain('Une jauge bloquée dans le rouge.');
    expect(video.container.textContent).toContain('fatigue');
  });

  it('le panneau se monte, et nomme les navigateurs qu\u2019il faut quand WebCodecs manque', () => {
    // jsdom passe pour une page sécurisée : c'est l'absence de WebCodecs qu'on voit.
    vi.stubGlobal('isSecureContext', true);
    const { container, getByTestId } = render(<PanneauMontage data={reel()} contentId="c1" montage={MONTAGE_SANS_R2} />);
    expect(getByTestId('lecteur-remotion')).toBeTruthy();
    expect(container.textContent).toContain('150 mots par minute');
    expect(container.textContent).toContain("L'export demande WebCodecs");
    expect(container.textContent).toContain('Chrome 94, Firefox 130 ou Safari 26');
    // Les scènes seules se demandent : elles ne sont plus une étape, Final Cut n'en est plus une.
    fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Exporter les scènes seules')!);
    const exports = Array.from(container.querySelectorAll('button')).filter(b => /^Exporter( la vidéo)?$/.test(b.textContent?.trim() ?? ''));
    // Deux scènes, et la vidéo entière — qui attend une prise.
    expect(exports).toHaveLength(3);
    expect(exports.every(b => b.disabled)).toBe(true);
    expect(container.textContent).toContain('Il faut une prise calée pour exporter.');
    // Le schéma de la jauge n'a pas d'image : l'export le dit avant de partir.
    expect(container.textContent).toContain('1 visuel n’a pas d’image : il ne sortira pas dans la vidéo, la carte gardera son texte.');
  });

  it('dit la vraie raison quand la page n\u2019est pas sécurisée, même dans Chrome', () => {
    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('VideoEncoder', class {});
    const { container } = render(<PanneauMontage data={reel()} contentId="c1" montage={MONTAGE_SANS_R2} />);
    expect(container.textContent).toContain("L'export demande une page sécurisée (https)");
    expect(container.textContent).not.toContain("L'export demande WebCodecs");
  });

  it('le débit change la durée de l\u2019aperçu', () => {
    const { container, getByTestId } = render(<PanneauMontage data={reel()} contentId="c1" montage={MONTAGE_SANS_R2} />);
    const avant = Number(getByTestId('lecteur-remotion').dataset.images);
    fireEvent.change(container.querySelector('#debit-reel')!, { target: { value: '200' } });
    expect(Number(getByTestId('lecteur-remotion').dataset.images)).toBeLessThan(avant);
  });

  it('le studio se monte sans R2, en le disant, et ne propose aucun dépôt', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(MONTAGE_SANS_R2.etat), { status: 200 }));
    const { findByTestId, findByText, container, getByRole } = render(<Studio contentId="c1" draft={JSON.stringify(reel())} format="Reel expliqué (scènes animées)" />);
    expect(await findByTestId('lecteur-remotion')).toBeTruthy();
    expect(await findByText("Le stockage Cloudflare (R2) n'est pas configuré sur le Worker : aucune prise ne peut être déposée.")).toBeTruthy();
    // Sans prise transcrite, Texte et Rythme attendent ; Scènes, non : les visuels se déposent avant le tournage.
    expect((getByRole('tab', { name: 'Texte' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByRole('tab', { name: /Scènes/ }));
    expect(container.textContent).toContain("les visuels ne peuvent pas être déposés");
    // Sans R2, on ne propose pas un dépôt qui serait refusé.
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent?.includes('Déposer'))).toBe(false);
  });
});

/**
 * Étapes V3 et V4 (SPEC §12.5, §12.6) : la prise se dépose, se transcrit, se
 * cale ; les repères se corrigent à la main. Les écrans se montent dans leurs
 * états — vide, au travail, calée, s'écartant du script, en échec.
 */
describe('Reel expliqué — prise et rendu', () => {
  afterEach(() => vi.unstubAllGlobals());

  const reel = () => ({
    format: 'Reel expliqué',
    sequences: [
      { plan: 'camera', role: 'Accroche', voix: 'Vous relisez trois fois un message ?' },
      {
        plan: 'scene', role: 'Mécanique', registre: 'pedagogie', voix: 'Une alarme qui sonne pour une virgule.',
        titre: 'Une [alarme]',
        elements: [
          { type: 'carte', texte: 'Une [alarme]', apparait_sur: 'une alarme' },
          { type: 'pastille', texte: 'Une [virgule]', apparait_sur: 'une virgule' },
        ],
      },
      { plan: 'camera', role: 'Appel', voix: 'Lien en bio.' },
    ],
    accroche_pub: { voix: 'Relire trois fois un message.' },
  }) as any;
  const lire = (texte: string, pas = 0.4) => texte.split(/\s+/).map((mot, i) => ({ mot, debut: 1 + i * pas, fin: 1 + i * pas + 0.3 }));
  const priseCalee = (couverture?: number) => {
    const data = reel();
    const calage = calerSurLaPrise(voixEntiere(data), lire(voixEntiere(data)));
    return {
      prise: { id: 'p1', contentId: 'c1', role: 'principale', nom: 'prise.mov', type: 'video/quicktime', taille: 312_000_000, duree: 12.5, largeur: 1080, hauteur: 1920, r2Cle: 'prises/c1/principale-1', pretLe: 1, transcription: { mots: [], texte: '', duree: 12.5 }, transcriteLe: 1, reperes: {}, createdAt: 1, updatedAt: 1 },
      url: 'blob:prise',
      calage: couverture === undefined ? calage : { ...calage, couverture },
    } as any;
  };

  it('le panneau sans stockage le dit, et n\u2019offre ni dépôt ni export de la vidéo', () => {
    vi.stubGlobal('isSecureContext', true);
    const { container } = render(<PanneauMontage data={reel()} contentId="c1" montage={MONTAGE_SANS_R2} />);
    expect(container.textContent).toContain('Il faut une prise calée pour exporter.');
    const pub = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Publicité');
    expect(pub?.disabled).toBe(true);
  });

  it('une prise vide dit ce qu\u2019on attend d\u2019elle', () => {
    const { container } = render(<DepotPrise titre="La prise" consigne="Déposez la prise." deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(container.textContent).toContain('Déposez la prise.');
    expect(container.textContent).toContain('Déposer la prise');
  });

  it('une prise au travail dit l\u2019étape et porte une barre', () => {
    const { container } = render(<DepotPrise titre="La prise" consigne="" prise={priseCalee()} enCours={{ etape: 'son', part: 0.4 }} deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(container.textContent).toContain('Extraction du son…');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
  });

  it('une prise calée dit la part du script retrouvée, et alerte quand elle s\u2019en écarte', () => {
    const sure = render(<DepotPrise titre="La prise" consigne="" prise={priseCalee()} deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(sure.container.textContent).toContain('Calée : 100 % des mots du script retrouvés');
    expect(sure.container.textContent).toContain('prise.mov — 12,5 s, 1080 × 1920, 312 Mo');
    cleanup();
    const ecart = render(<DepotPrise titre="La prise" consigne="" prise={priseCalee(0.6)} deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(ecart.container.textContent).toContain('vérifiez les repères avant d\u2019exporter');
  });

  it('une prise se retranscrit avec le moteur voulu, et dit lequel l\u2019a transcrite (SPEC §12.5.6)', () => {
    const moteurs: string[] = [];
    const calee = priseCalee();
    const { container } = render(<DepotPrise titre="La prise" consigne="" prise={calee} deposable onDeposer={noop} onTranscrire={(m) => moteurs.push(m)} onRetirer={noop} />);
    expect(container.textContent).toContain('(transcrite par Whisper)');
    expect(container.textContent).toContain('Transcrire à nouveau');
    fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Nova-3')!);
    expect(moteurs).toEqual(['nova-3']);
    cleanup();
    const parNova = priseCalee();
    parNova.prise.transcription = { ...parNova.prise.transcription, moteur: 'nova-3' };
    const nova = render(<DepotPrise titre="La prise" consigne="" prise={parNova} deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(nova.container.textContent).toContain('(transcrite par Nova-3)');
  });

  it('une vidéo directe sans script dit que la transcription servira de texte, et n\u2019a ni scène ni repère (SPEC §12.7)', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ prises: [], visuels: [], stockage: { octets: 0, plafond: 10e9, disponible: true } }), { status: 200 }));
    const { container, findByText } = render(<Studio contentId="d1" draft={JSON.stringify({ format: 'Script Reel', sections: [] })} format="Script Vidéo (Reel/Short)" />);
    await findByText(/sa transcription servira de texte/);
    expect(container.textContent).toContain('L’aperçu apparaîtra avec la prise.');
    expect(container.textContent).not.toContain('Exporter les scènes seules');
    expect(container.textContent).not.toContain('Scènes');
  });

  it('une vidéo directe avec script attend sa prise, sans scène à exporter ni débit', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ prises: [], visuels: [], stockage: { octets: 0, plafond: 10e9, disponible: true } }), { status: 200 }));
    const { container, findByText } = render(<Studio contentId="d2" format="Script Vidéo (Reel/Short)"
      draft={JSON.stringify({ format: 'Script Reel', sections: [{ role: 'Accroche', texte: 'Suis-je le bon thérapeute pour vous ?' }, { role: 'Ouverture', texte: 'Ça dépend de vous.' }] })} />);
    await findByText(/ses silences et ses phrases reprises se coupent ici/);
    expect(container.textContent).not.toContain('Exporter les scènes seules');
    expect(container.textContent).not.toContain('mots par minute');
  });

  it('les réglages d\u2019une prise pivotent l\u2019image et recalent le son d\u2019une image à la fois (SPEC §12.5.7)', () => {
    const reglages: any[] = [];
    const brut = render(<ReglagesPrise decalageSon={0} rotation={0} onRegler={(r) => reglages.push(r)} />);
    expect(brut.container.textContent).toContain('son d\u2019origine');
    expect(brut.container.textContent).toContain('droite');
    const bouton = (texte: string) => Array.from(brut.container.querySelectorAll('button')).find(b => b.textContent?.trim() === texte)!;
    fireEvent.click(bouton('Pivoter'));
    fireEvent.click(bouton('Son en retard'));
    expect(reglages).toEqual([{ rotation: 90 }, { decalageSon: 0.033 }]);
    expect(Array.from(brut.container.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Rétablir')).toBe(false);
    cleanup();

    const recale = render(<ReglagesPrise decalageSon={0.2} rotation={270} onRegler={(r) => reglages.push(r)} />);
    expect(recale.container.textContent).toContain('il arrivait 200 ms après les lèvres');
    expect(recale.container.textContent).toContain('tournée de 270°');
    fireEvent.click(Array.from(recale.container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Pivoter')!);
    fireEvent.click(Array.from(recale.container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Rétablir')!);
    expect(reglages.slice(-2)).toEqual([{ rotation: 0 }, { decalageSon: 0 }]);
    // On compte en images : à 200 ms (six images), un clic de plus fait 233 ms, pas 233,3 ni 231.
    fireEvent.click(Array.from(recale.container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Son en retard')!);
    expect(reglages[reglages.length - 1]).toEqual({ decalageSon: 0.233 });
    cleanup();

    // Une prise horizontale le dit (28/10/2026) ; une prise couchée qu'on a pivotée, non.
    const webcam = render(<ReglagesPrise decalageSon={0} rotation={0} largeur={1920} hauteur={1080} onRegler={noop} />);
    expect(webcam.container.textContent).toContain('Prise horizontale : en 9:16, la vidéo n\'en garde que le tiers central, agrandi 1,8 fois.');
    cleanup();
    const couchee = render(<ReglagesPrise decalageSon={0} rotation={90} largeur={3840} hauteur={2160} onRegler={noop} />);
    expect(couchee.container.textContent).not.toContain('Prise horizontale');
  });

  it('un envoi interrompu, sur ce poste ou un autre, se dit, et ne propose pas de transcrire', () => {
    const interrompue = priseCalee();
    interrompue.prise.pretLe = null;
    interrompue.calage = null;
    interrompue.url = undefined;
    const { container } = render(<DepotPrise titre="La prise" consigne="" prise={interrompue} deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(container.textContent).toContain('Envoi interrompu');
    expect(container.textContent).not.toContain('Transcrire à nouveau');
  });

  it('une prise en échec garde le message', () => {
    const { container } = render(<DepotPrise titre="La prise" consigne="" erreur="ce fichier n'a pas de son." deposable onDeposer={noop} onTranscrire={noop} onRetirer={noop} />);
    expect(container.textContent).toContain("ce fichier n'a pas de son.");
  });

  /** Les séquences du fixture, comme le studio les passe au montage par le texte. */
  const sequencesDe = (data: any) => data.sequences.map((s: any, i: number) => ({ repere: `${i + 1} · ${s.role}`, mots: compterMots(s.voix) }));

  it('le montage par le texte dit qu\u2019une transcription vide n\u2019a rien à monter', () => {
    const calage = calerSurLaPrise(voixEntiere(reel()), []);
    const { container } = render(<MontageTexte sequences={sequencesDe(reel())} calage={calage} coupes={[]} appliquees={[]} gardes={null} choix={{}}
      dureePrise={12} dureeGardee={0} situer={() => 0} onAller={noop} onTrancher={noop} onTrancherPassage={noop}
      onChoisirVersion={noop} onReinitialiser={noop} />);
    expect(container.textContent).toContain('La transcription est vide');
  });

  it('le montage par le texte se lit par séquence, barre ce qui est coupé, et tout s\u2019y tranche (SPEC §12.5.5)', () => {
    const data = reel();
    const texte = voixEntiere(data);
    // Deux versions de la phrase de la scène, un long silence, une improvisation.
    const dits: Array<{ mot: string; debut: number; fin: number }> = [];
    let t = 1;
    const dire = (bout: string) => bout.split(' ').forEach(mot => { dits.push({ mot, debut: t, fin: t + 0.3 }); t += 0.4; });
    dire('Vous relisez trois fois un message ?'); t += 0.3;
    dire('Une alarme qui sonne pour'); t += 1;
    dire('Une alarme qui sonne pour une virgule.'); t += 0.3;
    dire('comme je dis souvent'); t += 2;
    dire('Lien en bio.');
    const calage = calerSurLaPrise(texte, dits);
    const coupes = coupesProposees(calage);
    const appliquees = coupesAppliquees(coupes, {});
    const plan = planDeMontage(data, { calage, duree: 30 }, { coupes: appliquees });

    const gestes: any[] = [];
    const proprietes = {
      sequences: sequencesDe(data), calage, coupes, choix: {}, dureePrise: 30,
      situer: (x: number) => instantDansLaVideo(plan, 'principale', x),
      onAller: (x: number) => gestes.push(['aller', x]),
      onTrancher: (d: any[]) => gestes.push(['trancher', d[0].coupe.motif, d[0].coupee]),
      onTrancherPassage: (p: any, c: boolean) => gestes.push(['passage', p, c]),
      onChoisirVersion: (ph: number, d: number) => gestes.push(['version', ph, d]),
      onReinitialiser: noop,
    };
    const { container, rerender } = render(<MontageTexte {...proprietes} appliquees={appliquees}
      gardes={plan.segments.map(x => ({ debut: x.depuis, fin: x.jusqua }))} dureeGardee={plan.duree} />);
    const mot = (i: number) => container.querySelector(`[data-mot="${i}"]`)!;
    const bloc = (i: number) => mot(i).closest('.grid');
    const bouton = (texte: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === texte)!;

    // Un bloc par séquence. La reprise écartée se lit avec sa phrase ; l'improvisation, avec celle qu'elle prolonge.
    expect(container.textContent).toContain('2 · Mécanique');
    expect(bloc(6)).toBe(bloc(11));
    expect(bloc(6)).not.toBe(bloc(0));
    expect(bloc(18)).toBe(bloc(11));
    expect(bloc(22)).not.toBe(bloc(11));

    // La première version est barrée, la seconde retenue ; la puce passe de l'une à l'autre.
    // Le « ? » de Whisper n'est pas un mot affiché : « Une » est le 7ᵉ mot dit, le 8ᵉ de la liste.
    expect(mot(6).className).toContain('line-through');
    expect(mot(11).className).not.toContain('line-through');
    fireEvent.click(bouton('version 2 sur 2'));
    expect(gestes[0]).toEqual(['version', 1, dits[7].debut]);
    // Cliquer la version barrée la prend, elle aussi.
    fireEvent.click(mot(6));
    expect(gestes[1]).toEqual(['version', 1, dits[7].debut]);

    // Le long silence est une pastille qui se rétablit.
    fireEvent.click(container.querySelector('button[title="Silence raccourci : le rétablir"]')!);
    expect(gestes[2]).toEqual(['trancher', 'silence', false]);

    // Un clic choisit le passage et y mène l'aperçu ; « Barrer » le coupe, en entier.
    fireEvent.click(mot(19));
    expect(gestes[3][0]).toBe('aller');
    fireEvent.click(bouton('Barrer'));
    expect(gestes[4][2]).toBe(true);
    expect(gestes[4][1].debut).toBeLessThanOrEqual(dits[19].debut);
    expect(gestes[4][1].fin).toBeGreaterThanOrEqual(dits[22].fin);

    // Maj + clic en choisit le détail.
    fireEvent.click(mot(18));
    fireEvent.click(mot(20), { shiftKey: true });
    fireEvent.click(bouton('Barrer'));
    expect(gestes[6][1].fin).toBeGreaterThanOrEqual(dits[21].fin);
    expect(gestes[6][1].fin).toBeLessThan(dits[22].debut);

    // Un passage barré se rétablit d'un clic.
    rerender(<MontageTexte {...proprietes} appliquees={[{ debut: dits[19].debut - 0.1, fin: dits[22].fin + 0.1 }]} gardes={null} dureeGardee={null} />);
    expect(mot(19).className).toContain('line-through');
    fireEvent.click(mot(19));
    expect(gestes[7][2]).toBe(false);
    expect(gestes[7][1].debut).toBeLessThanOrEqual(dits[19].debut);
    expect(gestes[7][1].fin).toBeGreaterThanOrEqual(dits[22].fin);
  });

  it('le rythme dit quand l\u2019image reste figée, et y mène (SPEC §12.5.3)', () => {
    const data = reel();
    const calme = render(<RythmeReel data={data} figes={[]} surLaPrise={false} onAller={noop} />);
    expect(calme.container.textContent).toContain('L\'image change au moins toutes les 5 secondes, au débit estimé.');
    cleanup();
    const vus: number[] = [];
    const { container } = render(<RythmeReel data={data} figes={[{ debut: 3.2, fin: 9.8, sequence: 1 }]} surLaPrise onAller={(s) => vus.push(s)} />);
    expect(container.textContent).toContain('Un moment où rien ne bouge plus de 5 secondes.');
    expect(container.textContent).toContain('6,6 s sans changement — séquence 2, scène · Mécanique');
    fireEvent.click(container.querySelector('button[title="Voir ce moment dans l\'aperçu"]')!);
    expect(vus).toEqual([3.2]);
  });

  it('le coup de poing se dessine, et le storyboard le montre sur son passage face caméra', () => {
    const { container } = render(<CoupDePoingLuminose texte="Pas un [défaut]" largeur={108} />);
    expect(container.querySelector('[aria-label="Coup de poing : Pas un défaut"]')).not.toBeNull();
    cleanup();
    const data = reel();
    data.sequences.splice(2, 0, { plan: 'camera', role: 'Bascule', voix: 'Ce n\'est pas un défaut de caractère.', coup: { texte: 'Pas un [défaut]', apparait_sur: 'pas un défaut' } });
    const story = render(<SequenceCamera sequence={data.sequences[2]} numero={3} />);
    expect(story.container.textContent).toContain('Coup de poing : l\'écran passe aux mots');
    expect(story.container.querySelector('[aria-label="Coup de poing : Pas un défaut"]')).not.toBeNull();
    expect(story.container.textContent).toContain('pas un défautcoup');
  });

  it('les repères se corrigent au dixième, et se rendent au calage', () => {
    const data = reel();
    const { calage } = priseCalee();
    const brut = minuterReel(data, calage.horloge);
    const plan = planDeMontage(data, { calage, duree: 12.5 }, { reperes: { '1:1': 6 } });
    const corrections: Array<[number, number, number | null]> = [];
    const { container } = render(<ReperesPrise data={data} calage={brut} plan={plan} reperes={{ '1:1': 6 }}
      onCorriger={(i, j, t) => corrections.push([i, j, t])} onAller={noop} />);
    expect(container.textContent).toContain('2.1');
    expect(container.textContent).toContain('6,0 s');
    const plus = container.querySelectorAll('button[title="Un dixième plus tard"]');
    fireEvent.click(plus[0]);
    fireEvent.click(container.querySelector('button[title="Rendre le repère au calage"]')!);
    expect(corrections[0][0]).toBe(1);
    expect(corrections[0][2]).toBeCloseTo(brut.sequences[1].debut + brut.sequences[1].apparitions[0]! + 0.1);
    expect(corrections[1]).toEqual([1, 1, null]);
  });
});

/**
 * L'espace Vidéos → Montage (SPEC §12.4.3) : la porte d'entrée des Reels
 * expliqués. Il a un retour anticipé (aucun Reel), et se monte donc dans ses
 * deux états.
 */
describe('la navigation de Contenus (SPEC §13)', () => {
  it('trois entrées, chacune avec son compteur, et plus d’espace Vidéos', () => {
    const { container } = render(<Sidebar
      currentSpace="social" currentSocialTab="conversations" currentSettingsSection="display" currentSettingsPersona={null}
      currentCorpusSection="etat" currentCorpusBloc={null}
      onNavigate={noop} onNavigateSettings={noop} onNavigateCorpus={noop}
      counts={{ conversations: 25, ideas: 44, publies: 17 }} isMobileOpen={false} onMobileClose={noop} />);
    expect(container.textContent).toContain('Conversations25');
    expect(container.textContent).toContain('Idées44');
    expect(container.textContent).toContain('Publiés17');
    expect(container.querySelector('[title="Vidéos"]')).toBeNull();
    const mobile = render(<MobileSubTabs space="social" currentTab="ideas" currentSettingsSection="display"
      onNavigate={noop} onNavigateSettings={noop} counts={{ conversations: 25, ideas: 44, publies: 17 }} />);
    expect(mobile.container.textContent).toContain('Publiés');
  });
});
