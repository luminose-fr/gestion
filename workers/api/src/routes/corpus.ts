/**
 * Le corpus, en lecture — et rien d'autre.
 *
 * **Aucune route n'écrit ici, et c'est structurel plutôt que disciplinaire :**
 * le corpus est une constante embarquée dans le bundle du Worker au
 * déploiement (`src/genere/corpus.ts`, produit par
 * `npm run embarquer -w packages/corpus`). L'application ne PEUT pas le
 * modifier. Git reste le seul endroit où le corpus change, et le déploiement
 * est la synchronisation.
 *
 * Conséquence utile : **zéro requête D1** sur toutes ces routes. Le budget des
 * 50 par invocation (SPEC §3.6) n'est pas entamé.
 */
import { Hono } from 'hono';
import { composer, composerFeuille, separerFrontmatter, PROFILS, type Profil } from '@luminose/corpus';
import { actionConnue, feuillePour } from '@luminose/editorial';
import { SourceCorpusSchema, DeploiementSchema } from '@luminose/shared';
import { DOCUMENTS, EMPREINTES } from '../genere/corpus';
import { Refus } from '../refus';
import {
  lireSource, ecrireSource, lienEdition, depotConfigure,
  lancerDeploiement, etatDeploiement, dernierCommitCorpus, empreintesDepot,
} from '../github';
import type { Env } from '../env';

export const corpus = new Hono<{ Bindings: Env }>();

const PROFILS_VALIDES = Object.keys(PROFILS) as Profil[];

/** Le jour courant, en ISO — l'en-tête du contexte le porte. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** `2027-08` ou `2027-08-15` → est-ce dépassé ? Une forme illisible ne l'est jamais. */
function echu(valeur: unknown, ref: string): boolean {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}/.test(valeur)) return false;
  return valeur.slice(0, 7) <= ref.slice(0, 7);
}

function titreDe(corps: string, chemin: string): string {
  const m = corps.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : chemin.split('/').pop()!;
}

/**
 * L'état du corpus. C'est ce que l'écran affiche en premier : pas une
 * arborescence de fichiers — GitHub le fait déjà, et mieux — mais **ce qui
 * demande une décision**.
 */
corpus.get('/', (c) => {
  const date = aujourdhui();

  const profils = PROFILS_VALIDES.map((p) => {
    const compose = composer(DOCUMENTS, p, date);
    const plafond = PROFILS[p].plafond;
    return {
      profil: p,
      titre: PROFILS[p].titre,
      intention: PROFILS[p].intention,
      hash: compose.hash,
      taille: compose.taille,
      documents: compose.documents.length,
      plafond,
      // Un plafond dépassé n'est pas une erreur : le texte reste valide, il ne
      // tient simplement plus dans le champ visé. L'écran le signale, il ne bloque pas.
      depasse: plafond !== null && compose.taille > plafond,
    };
  });

  const aRevoir = DOCUMENTS.filter((d) => echu(d.meta.review_at, date)).map((d) => ({
    chemin: d.chemin,
    titre: titreDe(d.corps, d.chemin),
    review_at: String(d.meta.review_at),
  }));

  // Une absence délibérée se re-confirme, elle ne se comble pas : on la
  // remonte pour qu'elle soit revue, jamais pour qu'elle soit remplie.
  const absencesDeliberees = DOCUMENTS.filter(
    (d) => d.meta.statut === 'volontairement-absent',
  ).map((d) => ({ chemin: d.chemin, revu: String(d.meta.revu ?? '') }));

  const offres = DOCUMENTS.filter((d) => d.chemin.startsWith('socle/offres/')).map((d) => ({
    chemin: d.chemin,
    titre: titreDe(d.corps, d.chemin),
    statut: String(d.meta.statut ?? 'actif'),
  }));

  return c.json({
    date,
    documents: DOCUMENTS.length,
    blocs: [...new Set(DOCUMENTS.map((d) => d.bloc))].sort(),
    profils,
    offres,
    aRevoir,
    absencesDeliberees,
  });
});

/** La liste des documents, avec leur statut. Le texte se lit sur GitHub. */
corpus.get('/documents', (c) =>
  c.json({
    documents: DOCUMENTS.map((d) => ({
      chemin: d.chemin,
      bloc: d.bloc,
      titre: titreDe(d.corps, d.chemin),
      statut: (d.meta.statut as string) ?? null,
      type: (d.meta.type as string) ?? null,
      revu: (d.meta.revu as string) ?? null,
      review_at: (d.meta.review_at as string) ?? null,
      expose: (d.meta.expose as string) ?? null,
      taille: d.corps.length,
    })),
  }),
);

/**
 * Le texte à coller, composé à la demande.
 *
 * Le hash rendu ici est celui du contenu seul — jamais de l'en-tête, qui porte
 * la date. C'est ce qui permet à l'écran de comparer « la version posée » à
 * « la version courante » sans qu'un simple changement de jour fasse passer
 * une surface pour périmée.
 */
corpus.get('/contexte/:profil', (c) => {
  const profil = c.req.param('profil') as Profil;
  if (!PROFILS_VALIDES.includes(profil)) {
    return c.json(
      { error: `Profil inconnu : « ${profil} ». Attendu : ${PROFILS_VALIDES.join(', ')}.` },
      404,
    );
  }
  return c.json(composer(DOCUMENTS, profil, aujourdhui()));
});

/**
 * Un document, entier.
 *
 * Le chemin passe en query et non en segment : `socle/offres/le-seuil` en
 * contient déjà deux, et un `/:a/:b/:c` figerait la profondeur de
 * l'arborescence dans la route.
 */
corpus.get('/document', (c) => {
  const chemin = c.req.query('chemin') ?? '';
  const doc = DOCUMENTS.find((d) => d.chemin === chemin);
  if (!doc) return c.json({ error: `Document inconnu : « ${chemin} ».` }, 404);
  return c.json({
    chemin: doc.chemin,
    bloc: doc.bloc,
    titre: titreDe(doc.corps, doc.chemin),
    meta: doc.meta,
    corps: doc.corps,
  });
});

/**
 * La feuille de salle d'un rôle, telle qu'elle partira.
 *
 * L'écran Personas la DEMANDE plutôt que de la recomposer : recomposer côté
 * navigateur exposerait à afficher autre chose que ce qui est envoyé, et un
 * écran de vérification qui ment est pire que pas d'écran.
 *
 * Une feuille vide n'est pas une erreur : le Lecteur froid et l'Artiste ne
 * reçoivent rien, par décision. La réponse le dit explicitement.
 */
corpus.get('/feuille/:action', (c) => {
  const action = c.req.param('action');
  if (!actionConnue(action)) {
    return c.json({ error: `Action inconnue : « ${action} ».` }, 404);
  }
  const chemins = feuillePour(action);
  const feuille = composerFeuille(DOCUMENTS, chemins, aujourdhui());
  return c.json({
    action,
    chemins,
    /** `true` = ce rôle ne reçoit rien, et c'est voulu. */
    neRecoitRien: chemins === null,
    ...feuille,
  });
});

/* ══ Écriture — et pourquoi ça ne contredit pas l'en-tête de ce fichier ══
 *
 * Les routes ci-dessous n'écrivent pas le corpus SERVI : elles écrivent dans
 * Git, qui reste la copie unique et modifiable. Le bundle, lui, ne change
 * qu'au déploiement. L'invariant tenait à « une seule copie modifiable », pas
 * à « l'application ne parle jamais à Git » — et le zigzag qu'imposait la
 * seconde lecture coûtait un aller-retour par correction.
 *
 * Elles restent à **zéro requête D1** : tout passe par l'API GitHub.
 */

/** Les statuts que le composeur sait interpréter. Un autre passerait en silence. */
const STATUTS = ['actif', 'active', 'suspendu', 'termine', 'candidat', 'volontairement-absent'];

/**
 * Ce qu'on refuse de commiter.
 *
 * Un frontmatter cassé ne fait échouer aucun test et ne lève aucune erreur :
 * le parseur est tolérant par conception, donc le document part dans les
 * prompts amputé de son statut. `statut: actiff` rendrait Le Seuil proposable
 * sans que rien ne l'annonce. On vérifie ici, avant que ce soit dans l'histoire
 * du dépôt.
 */
function refusDeContenu(contenu: string): string | null {
  const { meta, corps } = separerFrontmatter(contenu);

  if (!contenu.trimStart().startsWith('---')) {
    return 'Le frontmatter a disparu — le fichier doit commencer par une ligne « --- ».';
  }
  if (!corps.trim()) {
    return 'Le corps est vide : il ne resterait que des métadonnées.';
  }
  if (!/^#\s+\S/m.test(corps)) {
    return 'Aucun titre « # … » dans le corps — c\'est lui qui nomme la fiche dans les écrans et les prompts.';
  }
  const statut = meta.statut;
  if (statut !== undefined && !STATUTS.includes(String(statut))) {
    return `Statut « ${statut} » inconnu. Attendus : ${STATUTS.join(', ')}.`;
  }
  return null;
}

/** Le fichier tel qu'il est sur GitHub — la seule version qu'on ait le droit d'éditer. */
corpus.get('/source', async (c) => {
  const chemin = c.req.query('chemin');
  if (!chemin || !DOCUMENTS.some((d) => d.chemin === chemin)) {
    return c.json({ error: `Document inconnu : « ${chemin ?? ''} ».` }, 404);
  }
  const source = await lireSource(c.env, chemin);
  return c.json({ ...source, lien: lienEdition(chemin) });
});

corpus.put('/source', async (c) => {
  const chemin = c.req.query('chemin');
  if (!chemin || !DOCUMENTS.some((d) => d.chemin === chemin)) {
    return c.json({ error: `Document inconnu : « ${chemin ?? ''} ».` }, 404);
  }

  const { contenu, sha, message } = SourceCorpusSchema.parse(await c.req.json());

  const refus = refusDeContenu(contenu);
  if (refus) throw new Refus(refus, 409);

  const ecrit = await ecrireSource(
    c.env,
    chemin,
    // Un fichier sans saut de ligne final se voit dans tous les diffs à venir.
    contenu.endsWith('\n') ? contenu : `${contenu}\n`,
    sha,
    message?.trim() || `Corpus : ${chemin}`,
  );

  // Le commit ne déploie rien : le bundle porte encore l'ancienne version, et
  // l'écran doit pouvoir le dire plutôt que de laisser croire que c'est fait.
  return c.json({ ...ecrit, deploiementRequis: true });
});

/* ── Déploiement ────────────────────────────────────────────────────── */

/**
 * L'écart entre ce qui est servi et ce qui est commité.
 *
 * Même question que les « poses » de ChatGPT et Gemini, tournée vers la
 * maison : le corpus que le Worker sert est-il celui du dépôt ? Le Worker
 * connaît le commit sur lequel il a été construit — il compare.
 */
interface Ecart {
  /** Faux = on ne sait pas. Ce n'est PAS « pas d'écart » : voir ci-dessous. */
  comparable: boolean;
  raison: string | null;
  differents: { chemin: string; etat: 'modifie' | 'ajoute' | 'supprime' }[];
}

/**
 * Ce que le Worker sert, comparé à ce que le dépôt contient.
 *
 * NORMATIF — un état inconnu ne se rend jamais comme un état sain.
 *
 * L'écran affichait « Aucun écart connu » chaque fois qu'il manquait un point
 * de comparaison, c'est-à-dire tout le temps : il comparait la date du dernier
 * commit à celle du dernier run GitHub Actions, alors que la voie normale de
 * déploiement est `npm run deploy` depuis la VM, qui n'en produit aucun. Une
 * fiche corrigée depuis la console s'affichait donc dans son ancienne version
 * pendant que l'écran se disait rassurant.
 *
 * La comparaison porte maintenant sur les CONTENUS — empreintes git de part et
 * d'autre — et quand elle est impossible, elle le dit.
 */
const calculerEcart = async (env: Env): Promise<Ecart> => {
  // Un bundle embarqué avant cette version ne porte pas d'empreintes. On ne
  // peut rien affirmer, et le prochain déploiement règlera le cas tout seul.
  if (Object.keys(EMPREINTES ?? {}).length === 0) {
    return {
      comparable: false,
      differents: [],
      raison: 'Le corpus servi date d’avant les empreintes. Le prochain déploiement les posera.',
    };
  }

  let depot: Record<string, string>;
  try {
    const r = await empreintesDepot(env);
    if (r.tronque) {
      return { comparable: false, differents: [], raison: 'GitHub a renvoyé un arbre tronqué.' };
    }
    depot = r.empreintes;
  } catch (e: any) {
    return { comparable: false, differents: [], raison: e?.message ?? 'Le dépôt est injoignable.' };
  }

  const differents: Ecart['differents'] = [];
  for (const [chemin, sha] of Object.entries(EMPREINTES)) {
    const distant = depot[chemin];
    if (!distant) differents.push({ chemin, etat: 'supprime' });
    else if (distant !== sha) differents.push({ chemin, etat: 'modifie' });
  }
  for (const chemin of Object.keys(depot)) {
    if (!(chemin in EMPREINTES)) differents.push({ chemin, etat: 'ajoute' });
  }
  differents.sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));

  return { comparable: true, raison: null, differents };
};

corpus.get('/deploiement', async (c) => {
  if (!depotConfigure(c.env)) {
    return c.json({ configure: false, etat: null, source: null, ecart: null });
  }
  const [etat, source, ecart] = await Promise.all([
    etatDeploiement(c.env),
    dernierCommitCorpus(c.env),
    calculerEcart(c.env),
  ]);
  return c.json({ configure: true, etat, source, ecart });
});

corpus.post('/deploiement', async (c) => {
  const brut = await c.req.json().catch(() => ({}));
  const { cible } = DeploiementSchema.parse(brut);
  await lancerDeploiement(c.env, cible);
  // GitHub rend 204 sans corps : rien à renvoyer d'utile, sinon que c'est parti.
  return c.json({ lance: true, cible });
});
