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
import { composer, PROFILS, type Profil } from '@luminose/corpus';
import { DOCUMENTS } from '../genere/corpus';
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
