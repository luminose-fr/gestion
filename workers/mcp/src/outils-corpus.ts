/**
 * Le corpus de Luminose, depuis une conversation — décision du 03/10/2026
 * (workers/mcp/decisions/2026-10-03-corpus.md).
 *
 * LIRE : la branche `main` du dépôt, telle que GitHub la porte — l'index des
 * fiches, leur texte exact, ou un profil composé par le même `composer()` que
 * la console. C'est la version commitée, pas la photo qu'en garde la console
 * jusqu'à son prochain déploiement.
 *
 * ÉCRIRE : par commit sur `main`, en deux temps, comme le bouton « Modifier »
 * de la console — modifier une fiche existante, ajouter une décision, et
 * lancer le déploiement qui publie. Rien d'autre : ni suppression, ni
 * renommage, ni README, ni réécriture d'une décision, ni les règles de voix
 * (github.ts, `ecritureAdmise`). Le README du corpus le dit : la conversation
 * propose, Git porte — ce serveur ne fait que raccourcir le chemin.
 */
import { z } from 'zod';
import { composer, refusDeContenu, separerFrontmatter, PROFILS, type Document, type Profil } from '@luminose/corpus';
import { diffLignes } from './diff';
import { exigerEcritureCorpus, type Temps } from './ecriture';
import { ecrireCorpus, type PlanCorpus } from './ecriture-corpus';
import { BLOCS, dernierDeploiement, derniersCommitsCorpus, ecritureAdmise, lireCorpus, type Commit, type Fiche } from './github';
import { LECTURE, outil, texte } from './outil';
import { JETON } from './outils-ecriture';
import { Refus } from './refus';

const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const DEUX_TEMPS =
  'Deux temps, toujours. 1) Appeler SANS jeton : rien ne part, l’outil rend un aperçu — le diff exact — et un jeton. ' +
  "2) Montrer l'aperçu à Florent ; s'il valide, rappeler avec les MÊMES arguments et le jeton. Un jeton vaut dix minutes, " +
  'une fois, et seulement pour le contenu de son aperçu.';

const COMMIT_NE_PUBLIE_PAS =
  'Le commit ne publie rien : la console (gestion.luminose.fr) sert le corpus de son dernier déploiement, et le garde jusqu’au ' +
  'suivant — corpus_deployer, ou Corpus → État → Déployer. Les outils corpus_* lisent main : ils voient le commit tout de suite.';

const CHEMIN = z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, 'chemin de fiche : bloc/fiche, minuscules et tirets, sans .md');

const court = (oid: string) => oid.slice(0, 7);
const decrireCommit = (c: Commit) => `main @ ${court(c.oid)} (${c.date.slice(0, 10)}, « ${c.titre} »)`;

/** Le jour, à Paris : une décision prise le soir ne doit pas porter la date du lendemain. */
const aujourdhui = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now()));

const titreDe = (corps: string, chemin: string) => corps.match(/^#\s+(.+)$/m)?.[1].trim() ?? chemin.split('/').pop()!;

/** Les mêmes `Document[]` que `charger()` produit depuis le disque — ici depuis GitHub. */
const documents = (fiches: Fiche[]): Document[] => fiches
  .map((f) => ({ chemin: f.chemin, bloc: f.chemin.split('/')[0], ...separerFrontmatter(f.texte) }))
  .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));

const fermerBloc = (lignes: string[]) => ['```diff', ...lignes, '```'];

// ── corpus_index ─────────────────────────────────────────────────────────

const index = outil({
  name: 'corpus_index',
  title: 'Corpus — les fiches',
  description: [
    "Liste les fiches du corpus de Luminose — sa source de vérité : identité, offres et leur statut, voix, canaux, stratégie, " +
    'matière réutilisable — telles que la branche main du dépôt les porte : chemin, titre, type, statut, dates de revue. Lecture seule.',
    '',
    'Pour le texte : corpus_lire (des fiches, telles quelles) ou corpus_contexte (un profil composé, prêt à servir de contexte).',
  ].join('\n'),
  schema: z.object({}).strict(),
  annotations: LECTURE,
  async executer(_args, env) {
    const { commit, fiches } = await lireCorpus(env);
    const docs = documents(fiches);
    const mois = aujourdhui().slice(0, 7);
    const ligne = (d: Document) => {
      const m = d.meta;
      const echu = typeof m.review_at === 'string' && /^\d{4}-\d{2}/.test(m.review_at) && m.review_at.slice(0, 7) <= mois;
      return `- ${d.chemin} — ${titreDe(d.corps, d.chemin)}` +
        [m.type, m.statut, m.revu ? `revu ${m.revu}` : null, m.review_at ? `à revoir ${m.review_at}${echu ? ' (ÉCHU)' : ''}` : null]
          .filter(Boolean).map((x) => ` · ${x}`).join('');
    };
    const parBloc = BLOCS.map((b) => [b, docs.filter((d) => d.bloc === b)] as const).filter(([, ds]) => ds.length > 0);
    return texte([
      `Corpus — ${decrireCommit(commit)}, ${docs.length} fiches.`,
      ...parBloc.flatMap(([b, ds]) => ['', `## ${b} (${ds.length})`, ...ds.map(ligne)]),
      '',
      "Statuts : actif/active = en vigueur ; suspendu, termine = ne pas proposer ; candidat = pas un fait ; " +
      'volontairement-absent = pas de règle, et c’est délibéré. strategie/ n’entre jamais dans un prompt qui écrit un contenu.',
    ].join('\n'));
  },
});

// ── corpus_lire ──────────────────────────────────────────────────────────

const lire = outil({
  name: 'corpus_lire',
  title: 'Corpus — lire des fiches',
  description: [
    'Rend le texte exact de fiches du corpus, frontmatter compris, tel que la branche main du dépôt le porte — c’est ce texte que ' +
    'corpus_modifier remplace. 10 fiches au plus par appel ; les chemins se lisent dans corpus_index (ex. socle/offres/le-seuil). Lecture seule.',
    '',
    'Pour servir de contexte à l’écriture d’un contenu, préférer corpus_contexte : il compose les fiches avec l’en-tête et le tableau des offres.',
  ].join('\n'),
  schema: z.object({
    chemins: z.array(CHEMIN).min(1).max(10).describe('Chemins de fiches, sans .md.'),
  }).strict(),
  annotations: LECTURE,
  async executer({ chemins }, env) {
    const { commit, fiches } = await lireCorpus(env);
    const inconnus = chemins.filter((c) => !fiches.some((f) => f.chemin === c));
    if (inconnus.length > 0) {
      throw new Refus(`Fiche(s) introuvable(s) dans le corpus : ${inconnus.join(', ')}. corpus_index liste les chemins.`, 404);
    }
    return texte([
      `Corpus — ${decrireCommit(commit)}.`,
      ...[...new Set(chemins)].flatMap((c) => {
        const f = fiches.find((x) => x.chemin === c)!;
        return ['', `<!-- ${f.chemin}.md — empreinte ${court(f.sha)} -->`, f.texte.trimEnd()];
      }),
    ].join('\n'));
  },
});

// ── corpus_contexte ──────────────────────────────────────────────────────

const contexte = outil({
  name: 'corpus_contexte',
  title: 'Corpus — un profil composé',
  description: [
    'Compose le corpus de Luminose en un texte à suivre, par le même composeur que la console : en-tête (ce qui fait autorité, ' +
    'et ce qui n’arbitre pas les demandes de Florent), tableau des offres dérivé des statuts, hiérarchie des règles, puis les fiches. Lecture seule.',
    '',
    'Profils : noyau — l’essentiel (identité, cadre, offres) ; complet — tout le stable, SANS la stratégie : pour produire un contenu ; ' +
    'strategie — décisions datées, hypothèses, questions ouvertes : pour une conversation de stratégie, JAMAIS pour rédiger un contenu.',
    '',
    'Version de main : un commit pas encore déployé y figure déjà, et le hash peut alors différer de celui que la console affiche.',
  ].join('\n'),
  schema: z.object({
    profil: z.enum(['noyau', 'complet', 'strategie']),
  }).strict(),
  annotations: LECTURE,
  async executer({ profil }, env) {
    const { commit, fiches } = await lireCorpus(env);
    const c = composer(documents(fiches), profil as Profil, aujourdhui());
    return texte([
      `Profil « ${profil} » (${PROFILS[profil as Profil].titre}) — hash ${c.hash}, ${c.taille} caractères, ${c.documents.length} fiches, ${decrireCommit(commit)}.`,
      '',
      c.texte,
    ].join('\n'));
  },
});

// ── corpus_modifier ──────────────────────────────────────────────────────

type Remplacement = { avant: string; apres: string };

/** Chaque passage `avant` doit être présent une fois exactement — sinon on ne sait pas lequel remplacer. */
const remplacer = (texteInitial: string, remplacements: Remplacement[]): string => {
  let t = texteInitial;
  const fautes: string[] = [];
  for (const [i, r] of remplacements.entries()) {
    const n = t.split(r.avant).length - 1;
    if (n !== 1) {
      fautes.push(`- remplacement ${i + 1} (« ${r.avant.slice(0, 60)}${r.avant.length > 60 ? '…' : ''} ») : ` +
        (n === 0 ? 'introuvable dans la fiche' : `présent ${n} fois — allonger le passage pour qu'il soit unique`));
      continue;
    }
    t = t.replace(r.avant, () => r.apres);
  }
  if (fautes.length) throw new Refus(['Modification refusée, rien n’est parti :', ...fautes, '', 'corpus_lire rend le texte exact.'].join('\n'));
  return t;
};

const modifier = outil({
  name: 'corpus_modifier',
  title: 'Corpus — modifier une fiche',
  description: [
    'Modifie une fiche EXISTANTE du corpus, par un commit sur main. Deux façons : `remplacements` — des passages exacts à remplacer, ' +
    'chacun présent une fois dans la fiche (le plus sûr pour une correction) — ou `contenu` — la fiche entière, frontmatter compris. ' +
    'Lire d’abord la fiche avec corpus_lire.',
    '',
    DEUX_TEMPS,
    '',
    'Refusé : une fiche inexistante (une décision se crée avec corpus_decision_ajouter), une décision de strategie/decisions/ ' +
    '(elle ne se réécrit pas : on en ajoute une qui la supersède), voix/regles-de-voix (elle engendre les prompts : à changer dans ' +
    'le dépôt, avec ses fixtures), un README, un frontmatter disparu, une fiche sans titre « # », un statut inconnu. ' +
    'Une fiche modifiée sur GitHub entre l’aperçu et l’exécution n’est jamais écrasée.',
    '',
    COMMIT_NE_PUBLIE_PAS,
  ].join('\n'),
  schema: z.object({
    chemin: CHEMIN.describe('La fiche, sans .md (ex. canaux/google-ads).'),
    remplacements: z.array(z.object({
      avant: z.string().min(1).max(5000).describe('Le passage exact, tel que corpus_lire le rend.'),
      apres: z.string().max(5000).describe('Ce qui le remplace (vide : le supprimer).'),
    }).strict()).min(1).max(20).optional(),
    contenu: z.string().min(1).max(100_000).optional().describe('La fiche entière, frontmatter compris — à la place de remplacements.'),
    message: z.string().min(1).max(200).optional().describe('Le message du commit. Par défaut : « Corpus : <chemin> ».'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ chemin, remplacements, contenu, message, jeton }, env, ctx) {
    exigerEcritureCorpus(ctx);
    if ((remplacements === undefined) === (contenu === undefined)) {
      throw new Refus('Donner `remplacements` OU `contenu` — l’un des deux, pas les deux.');
    }
    const interdit = ecritureAdmise(chemin, false);
    if (interdit) throw new Refus(`Modification refusée : ${interdit}.`);

    const { commit, fiches } = await lireCorpus(env);
    const fiche = fiches.find((f) => f.chemin === chemin);
    if (!fiche) {
      throw new Refus(`« ${chemin} » n'est pas une fiche du corpus (corpus_index les liste). Seule une décision se crée : corpus_decision_ajouter.`, 404);
    }

    return texte(await ecrireCorpus(env, ctx, {
      outil: 'corpus_modifier',
      jeton,
      preparer: async (temps: Temps): Promise<PlanCorpus> => {
        // À l'exécution, la base est celle que l'aperçu a montrée. Si la fiche a
        // bougé depuis, on refuse plutôt que de recalculer sur un texte que
        // Florent n'a pas vu.
        if (temps.execution && (temps.fige as { s?: string } | undefined)?.s !== fiche.sha) {
          throw new Refus(`« ${chemin} » a changé sur GitHub depuis l'aperçu (main est à ${court(commit.oid)}) : rien n'est parti. Refaites un aperçu.`, 409);
        }
        const brut = contenu ?? remplacer(fiche.texte, remplacements!);
        const nouveau = brut.endsWith('\n') ? brut : `${brut}\n`;
        if (nouveau === fiche.texte) throw new Refus(`Aucun changement : « ${chemin} » est déjà ainsi. Rien n'est parti.`);
        const refus = refusDeContenu(nouveau);
        if (refus) throw new Refus(`Modification refusée, rien n'est parti — ${refus}`);

        const avant = separerFrontmatter(fiche.texte).meta;
        const apres = separerFrontmatter(nouveau).meta;
        const notes = [
          ...(avant.statut !== apres.statut
            ? [`STATUT : ${String(avant.statut ?? '(aucun)')} → ${String(apres.statut ?? '(aucun)')}` +
              (chemin.startsWith('socle/offres/') ? ' — le tableau des offres des trois profils le dira.' : '.')]
            : []),
          ...(avant.revu !== undefined && avant.revu === apres.revu ? [`revu: inchangé (${String(avant.revu)}) — à mettre à jour si le contenu est reconfirmé.`] : []),
        ];
        const titreCommit = message ?? `Corpus : ${chemin}`;
        return {
          operation: { type: 'commit', chemin, contenu: nouveau, sha: fiche.sha, message: `${titreCommit}\n\nPréparé dans une conversation Claude, par le serveur MCP (mcp.luminose.fr).` },
          fige: { s: fiche.sha },
          description: [
            `Fiche « ${chemin} » — ${titreDe(separerFrontmatter(nouveau).corps, chemin)}, depuis ${decrireCommit(commit)}. Commit sur main :`,
            ...fermerBloc(diffLignes(fiche.texte, nouveau)),
            ...(notes.length ? ['', ...notes] : []),
            '',
            `Message du commit : « ${titreCommit} ».`,
            COMMIT_NE_PUBLIE_PAS,
          ].join('\n'),
          bilan: `Fiche « ${chemin} » commitée sur main. Pour la publier : corpus_deployer.`,
        };
      },
    }));
  },
});

// ── corpus_decision_ajouter ──────────────────────────────────────────────

const DECISION = /^\d{4}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;

const decisionAjouter = outil({
  name: 'corpus_decision_ajouter',
  title: 'Corpus — ajouter une décision',
  description: [
    'Ajoute une décision datée dans strategie/decisions/, par un commit sur main : le POURQUOI d’un changement, et ce qui la ' +
    'réactiverait. Le serveur écrit le frontmatter (type: decision, statut: active, decide_le du jour, expose: prive) et le titre ; ' +
    'le fichier se nomme AAAA-MM-<slug>.',
    '',
    DEUX_TEMPS,
    '',
    'Une décision ne se réécrit jamais : pour en changer une, en ajouter une nouvelle avec supersedes. Une décision ne devient vraie ' +
    'que dans la fiche : l’état (un statut d’offre, une règle de canal) se change dans la fiche concernée avec corpus_modifier — la ' +
    'décision garde la trace. strategie/ n’entre jamais dans un prompt qui écrit un contenu.',
    '',
    COMMIT_NE_PUBLIE_PAS,
  ].join('\n'),
  schema: z.object({
    slug: z.string().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'minuscules, chiffres et tirets').describe('ex. seuil-en-groupe — le serveur préfixe le mois.'),
    titre: z.string().min(1).max(120).describe('Le titre de la décision, sans « # ».'),
    corps: z.string().min(1).max(20_000).describe('Le markdown, sans frontmatter ni titre : « **Décidé.** … », ## Pourquoi, ## Ce qui la réactiverait.'),
    touche: z.array(z.string().max(80).regex(/^[a-z0-9/-]+$/, 'chemin ou bloc, sans accents')).max(10).optional().describe('Ce que la décision touche, ex. offres/le-seuil, strategie/notoriete.'),
    lie_a: z.array(z.string().regex(DECISION, 'une décision : AAAA-MM-slug')).max(10).optional().describe('Décisions liées, ex. 2026-08-seuil-suspendu.'),
    supersedes: z.string().regex(DECISION, 'une décision : AAAA-MM-slug').optional().describe('La décision que celle-ci remplace ; elle n’est pas modifiée.'),
    review_at: z.string().regex(/^\d{4}-\d{2}$/, 'AAAA-MM').optional().describe('Quand se reposer la question.'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ slug, titre, corps, touche, lie_a, supersedes, review_at, jeton }, env, ctx) {
    exigerEcritureCorpus(ctx);
    if (corps.trimStart().startsWith('---')) throw new Refus('Le corps ne porte pas de frontmatter : le serveur l’écrit.');
    if (/^#\s/m.test(corps)) throw new Refus('Le corps ne porte pas de titre « # » : il se passe dans `titre`. Les sections commencent à « ## ».');

    const { commit, fiches } = await lireCorpus(env);
    const decisions = new Set(fiches.filter((f) => f.chemin.startsWith('strategie/decisions/')).map((f) => f.chemin.slice('strategie/decisions/'.length)));
    const absentes = [...(supersedes ? [supersedes] : []), ...(lie_a ?? [])].filter((d) => !decisions.has(d));
    if (absentes.length) throw new Refus(`Décision(s) introuvable(s) : ${absentes.join(', ')}. corpus_index liste strategie/decisions/.`, 404);

    return texte(await ecrireCorpus(env, ctx, {
      outil: 'corpus_decision_ajouter',
      jeton,
      preparer: async (temps: Temps): Promise<PlanCorpus> => {
        // La date de l'aperçu, pas celle de l'exécution : un aperçu validé à minuit passé reste le même fichier.
        const date = (temps.execution ? (temps.fige as { d?: string } | undefined)?.d : undefined) ?? aujourdhui();
        const chemin = `strategie/decisions/${date.slice(0, 7)}-${slug}`;
        if (fiches.some((f) => f.chemin === chemin)) throw new Refus(`« ${chemin} » existe déjà : une décision ne se réécrit pas. Choisir un autre slug, ou supersedes.`, 409);
        const liste = (xs: string[]) => `[${xs.join(', ')}]`;
        const contenu = [
          '---',
          'type: decision',
          'statut: active',
          `decide_le: ${date}`,
          ...(review_at ? [`review_at: ${review_at}`] : []),
          'expose: prive',
          ...(touche?.length ? [`touche: ${liste(touche)}`] : []),
          ...(lie_a?.length ? [`lie_a: ${liste(lie_a)}`] : []),
          ...(supersedes ? [`supersedes: ${supersedes}`] : []),
          '---',
          '',
          `# ${titre.trim()}`,
          '',
          corps.trim(),
          '',
        ].join('\n');
        const refus = refusDeContenu(contenu);
        if (refus) throw new Refus(`Décision refusée, rien n'est parti — ${refus}`);
        return {
          operation: { type: 'commit', chemin, contenu, sha: null, message: `Corpus : ${chemin}\n\nPréparé dans une conversation Claude, par le serveur MCP (mcp.luminose.fr).` },
          fige: { d: date },
          description: [
            `Nouvelle décision « ${chemin} », depuis ${decrireCommit(commit)}. Commit sur main :`,
            ...fermerBloc(contenu.trimEnd().split('\n').map((l) => `+ ${l}`)),
            '',
            ...(supersedes ? [`Elle supersède « strategie/decisions/${supersedes} », qui n'est pas modifiée : la nouvelle la cite.`] : []),
            'Une décision ne devient vraie que dans la fiche : l’état se change dans la fiche concernée (corpus_modifier).',
            COMMIT_NE_PUBLIE_PAS,
          ].join('\n'),
          bilan: `Décision « ${chemin} » commitée sur main. Pour la publier : corpus_deployer.`,
        };
      },
    }));
  },
});

// ── corpus_deployer ──────────────────────────────────────────────────────

const ETATS: Record<string, string> = { queued: 'en attente', in_progress: 'en cours', waiting: 'en attente', requested: 'en attente', pending: 'en attente' };

const deployer = outil({
  name: 'corpus_deployer',
  title: 'Corpus — publier (déployer la console)',
  description: [
    'Lance le workflow « Déploiement Cloudflare » du dépôt, cible api, sur main : c’est ce qui publie un commit du corpus dans la ' +
    'console (gestion.luminose.fr) et ses profils. Le workflow joue d’abord les tests et le typecheck, bloquants, puis embarque le ' +
    'corpus, applique les migrations D1 et déploie le Worker de la console. Ni le front ni ce serveur ne sont redéployés.',
    '',
    DEUX_TEMPS,
    '',
    'L’aperçu dit ce qui partirait : le commit de main, les derniers commits du corpus, et le dernier passage du workflow. ' +
    'Si main bouge entre l’aperçu et l’exécution, rien ne part : refaire un aperçu.',
  ].join('\n'),
  schema: z.object({ jeton: JETON }).strict(),
  annotations: ECRITURE,
  async executer({ jeton }, env, ctx) {
    exigerEcritureCorpus(ctx);
    const { commit } = await lireCorpus(env);
    const [commits, dernier] = jeton ? [[], null] : await Promise.all([derniersCommitsCorpus(env, 5), dernierDeploiement(env)]);

    return texte(await ecrireCorpus(env, ctx, {
      outil: 'corpus_deployer',
      jeton,
      preparer: async (temps: Temps): Promise<PlanCorpus> => {
        const vu = temps.execution ? (temps.fige as { c?: string } | undefined)?.c : commit.oid;
        if (vu !== commit.oid) {
          throw new Refus(`main a bougé depuis l'aperçu (${court(vu ?? '?')} → ${court(commit.oid)}) : rien n'est parti. Refaites un aperçu pour voir ce qui partirait.`, 409);
        }
        const passage = dernier
          ? `Dernier passage du workflow : ${dernier.statut === 'completed' ? (dernier.conclusion === 'success' ? 'réussi' : `échoué (${dernier.conclusion})`) : (ETATS[dernier.statut] ?? dernier.statut)}` +
            ` le ${dernier.date.slice(0, 10)}, sur ${court(dernier.commit)} — ${dernier.lien}` +
            (dernier.statut === 'completed' ? '' : '. Celui-ci attendra son tour.')
          : 'Aucun passage du workflow pour l’instant.';
        return {
          operation: { type: 'deploiement', cible: 'api', commit: commit.oid },
          fige: { c: commit.oid },
          description: [
            `Déployer la console (cible api) depuis ${decrireCommit(commit)}.`,
            'Tests et typecheck d’abord, bloquants : une fiche qui contredit un test (une offre arrêtée devenue proposable) fait échouer le déploiement, pas le commit.',
            '',
            'Derniers commits du corpus :',
            ...commits.map((c) => `- ${court(c.oid)} ${c.date.slice(0, 10)} ${c.titre}`),
            '',
            passage,
            'Un déploiement lancé depuis la VM (npm run deploy) n’apparaît pas ici.',
          ].join('\n'),
          bilan: `Déploiement lancé : cible api, ${decrireCommit(commit)}. Il prend quelques minutes ; le résultat se lit dans le workflow du dépôt, ou dans la console : Corpus → État.`,
        };
      },
    }));
  },
});

export const OUTILS_CORPUS = [index, lire, contexte, modifier, decisionAjouter, deployer] as const;
