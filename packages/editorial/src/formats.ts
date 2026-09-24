/**
 * Registre centralisé des formats de contenu.
 *
 * Ce fichier est la source unique de vérité pour tout ce qui est format-spécifique :
 * - Champ de stockage dans Notion (body, scriptVideo, slides)
 * - Tab de destination dans l'éditeur
 * - Template de production (prompt) pour le Rédacteur
 * - Extraction de texte brut (pour recherche, preview)
 * - Clé de format court (pour la détection dans les JSON IA)
 */

import { TargetFormat } from './domain';
import { SITE_URL } from './config';
import { composerArticleJekyll, type LivrableArticle } from './jekyll';

// ── Types ────────────────────────────────────────────────────────────

export type EditorTab = 'atelier' | 'brouillon' | 'slides' | 'postcourt' | 'script';

export interface FormatDefinition {
    /** Valeur exacte du TargetFormat enum */
    key: TargetFormat;
    /** Clé courte utilisée dans les JSON IA (ex: "Post Texte", "Carrousel") */
    shortKey: string;
    /** Étape de l'éditeur où atterrir juste après la rédaction */
    editorTab: EditorTab;
    /** Ce format bénéficie-t-il de la relecture à froid ? */
    /**
     * La relecture à froid est-elle ouverte sur ce format ?
     *
     * **Le drapeau garde DEUX portes à la fois** : le bouton « Relire à froid »
     * de l'éditeur, et le déclenchement automatique qui suit chaque rédaction.
     * `false` ferme les deux — sur ces formats, on ne peut pas relire même en
     * le voulant.
     *
     * **Trois formats sur sept, et c'est une décision, pas une sédimentation**
     * (tranchée le 26/08/2026). Les formats longs — article SEO, script
     * YouTube, newsletter — sont relus par Florent lui-même, plusieurs fois,
     * et un verdict automatique à chaque régénération se paierait
     * proportionnellement à leur longueur sans rien lui apprendre. Le carrousel
     * et le post court, écrits d'un jet, sont l'inverse.
     *
     * « Prompt d'image » reste dehors pour une autre raison : il n'y a pas de
     * prose à relire.
     *
     * Ne pas « réparer » ce déséquilibre sans rouvrir la question.
     */
    supportsColdRead: boolean;
    /** Template de production JSON (injecté dans le prompt du Rédacteur) */
    promptTemplate: string;
    /** Extrait un texte lisible depuis les données JSON parsées */
    toPlainText: (data: any) => string;
    /**
     * Ce que le format sait livrer prêt à publier hors de l'application — le
     * fichier du site, les prompts d'illustration, les posts qui l'annoncent.
     * Absent : le format se copie depuis l'écran, rien de plus. `null` : le
     * JSON ne permet pas (encore) de livrer.
     *
     * Porté par le registre pour que l'écran demande « ce format livre-t-il
     * quelque chose ? » sans jamais nommer l'article (règle n°3 du CLAUDE.md).
     */
    livrable?: (data: any, options: { date: string }) => LivrableArticle | null;
}

// ── Helpers internes ─────────────────────────────────────────────────

const t = (v: any): string => (typeof v === 'string' ? v.trim() : '');

// ── Définitions de format ────────────────────────────────────────────

const POST_TEXTE: FormatDefinition = {
    key: TargetFormat.POST_TEXTE_COURT,
    shortKey: 'Post Texte',
    editorTab: 'postcourt',
    supportsColdRead: true,
    promptTemplate: `
GRILLE DE PRODUCTION — Post "Punchline" (Texte + Image fixe) — LinkedIn, Facebook
Le format idéal pour LinkedIn et Facebook. Il repose sur un contraste entre un visuel fort et un texte court qui bouscule une idée reçue.
{
  "format": "Post Texte",
  "accroche": "1 phrase isolée, percutante. Question, affirmation paradoxale ou image choc. C'est le hook qui arrête le scroll.",
  "corps": "Court et tendu : 8-12 lignes MAX. Chaque phrase doit faire avancer le propos — aucun paragraphe explicatif, aucune glose. SUJET RÉEL TÔT (OBLIGATOIRE) : dans les 3 premières lignes, un inconnu doit savoir de quoi parle le post pour LUI (le sujet réel nommé dans ses mots — rumination, perfectionnisme...), même si la métaphore ouvre. Ne DIS PAS au lecteur ce qu'il ressent ou pourquoi ça marche (pas de 'Le truc, c'est que...', 'Ce n'est même pas confortable', 'Et le connu, ça rassure'). Montre par l'image et la scène, le lecteur comprend tout seul. Paragraphes de 1-2 phrases. Alternance prose/listes (→). UNE SEULE BASCULE : un seul retournement par post — s'il y en a deux dans la matière, garde le plus fort. ANCRAGE CABINET (OBLIGATOIRE, DANS LE PREMIER TIERS) : dès le premier tiers du texte, raccroche explicitement la métaphore à ta pratique de thérapeute en cabinet — une phrase qui montre que ça vient de ce que tu observes en séance ('En cabinet, je vois...', 'La semaine dernière, un patient...', 'Sur mon divan...'). Sans ça, la métaphore ne parle qu'à ceux qui te connaissent déjà : le lecteur de passage doit comprendre tôt que tu es praticien et que ce propos est clinique, pas théorique. La conclusion percutante fait partie du corps — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse. Coupe tout ce qui ralentit : si une phrase n'ajoute pas de tension ou d'image nouvelle, elle n'a rien à faire là.",
  "cta": "OBLIGATOIRE, jamais vide. Aligné sur les règles CTA de l'objectif (fournies plus haut) : une seule action, le lecteur sait à qui ça s'adresse et quel est le pas concret suivant. Tisse naturellement le lien ${SITE_URL} dans la phrase (ex : 'On en parle en consultation ? → ${SITE_URL}'). Reprends l'URL EXACTEMENT, sans la modifier ni l'abréger. JAMAIS d'emoji.",
  "hashtags": ["OBLIGATOIRE : 5 à 10 hashtags pertinents (string commençant par #, sans espace), mêlant thérapie/psychologie et la niche du sujet. Pas de # générique creux (#motivation, #life)."],
  "visuel": "Description de l'image suggérée (format 1:1 ou 4:5). Préfère une scène avec un personnage plutôt qu'un détail abstrait isolé. L'accroche à incruster sur l'image gagne à reprendre la métaphore centrale du texte plutôt qu'un concept détaché.",
  "prompt_dzine": "Prompt détaillé en anglais, prêt à coller dans Dzine. 50-80 mots. Composition épurée, éclairage dramatique, mood émotionnel et introspectif. Évite les références à des peintres classiques (pas de 'Caravaggio', 'Rembrandt'...). Pas de texte à générer dans l'image. Cohérent avec le visuel suggéré."
}
Ton : Direct, oralisé, percutant. On entend la voix. Fluide — le texte doit se lire d'une traite, sans qu'on ait envie de sauter un paragraphe.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.accroche) out.push(t(data.accroche));
        if (data.corps) out.push(t(data.corps));
        if (data.cta) out.push(t(data.cta));
        return out.filter(Boolean).join(' ');
    }
};

const ARTICLE: FormatDefinition = {
    key: TargetFormat.ARTICLE_LONG_SEO,
    shortKey: 'Article',
    editorTab: 'brouillon',
    supportsColdRead: false,
    promptTemplate: `
GRILLE DE PRODUCTION — Article (Long/SEO) — Blog luminose.fr
L'application compose elle-même le fichier du site à partir de ce JSON : front matter, balisage HTML, espaces insécables, encadré final, bouton de rendez-vous, bandeaux. Tu écris le TEXTE, jamais de HTML. Balisage autorisé dans les textes : paragraphes séparés par une ligne vide, puces avec "- " en début de ligne, **gras**, *italique*, [lien](adresse).
{
  "format": "Article",
  "titre_h1": "Titre de l'article, qui sert aussi de titre dans Google. Le sujet dans les mots qu'un lecteur taperait, PUIS la métaphore (ex : 'Le stress : visite guidée de votre installation électrique intérieure'). 70 caractères max.",
  "slug": "Adresse de l'article : 3 à 6 mots-clés en minuscules, sans accents ni articles, séparés par des tirets (ex : 'stress-installation-electrique'). Sert aussi de nom à l'image principale.",
  "categorie": "UNE catégorie du blog, recopiée telle quelle depuis la fiche canal Blog. N'en crée une nouvelle que si aucune ne convient : elle fait partie de l'adresse et ne se change plus après publication.",
  "tag": "'exclusif' (article de fond, mis en avant sur le blog) ou 'basique' (fiche sur un trouble précis, rangée sous « L'hypnose vous aide pour… »). Par défaut : 'exclusif'.",
  "meta_description": "140 à 160 caractères. Le sujet au début, puis la promesse concrète de l'article. Pas de métaphore opaque : c'est la phrase que Google affiche sous le titre.",
  "resume": ["Encadré « En résumé », affiché à côté de l'image et sur la carte du blog : EXACTEMENT 2 paragraphes courts. Le 1er nomme le problème dans les mots du lecteur et pose la métaphore ; le 2e dit ce que l'article lui apporte. **Gras** sur l'expression clé."],
  "introduction": "4 à 6 paragraphes courts. Le sujet réel est nommé dans les 3 premières lignes, la métaphore centrale est posée avant la fin de l'introduction.",
  "sections": [
    {
      "sous_titre_h2": "Titre qui fait avancer la métaphore ET dit de quoi parle la section : un lecteur qui ne lit que les titres doit suivre l'article.",
      "contenu": "5 à 7 sections, 1 500 à 2 500 mots au total. Paragraphes courts ; puces ouvertes par leur idée en **gras**. Alterner rigueur nommée (auteurs, concepts, dates) et scènes concrètes. ANCRAGE PRATIQUE : au moins une section raccroche le propos à ce que tu vois en séance ('En séance, à Villefranche-de-Lauragais…', 'dans ma pratique…'). LIENS INTERNES : [texte](post:AAAA-MM-JJ-slug) vers un article du blog, [texte](/page.html) vers une page du site — UNIQUEMENT des adresses listées dans la fiche canal Blog, jamais inventées. Quand le sujet touche au soin (trauma, dépression, addiction…), un paragraphe renvoie le diagnostic à un professionnel de santé."
    }
  ],
  "conclusion": "1 à 2 paragraphes qui ferment la dernière section : l'angle de rupture, pas un résumé plat.",
  "cta": {
    "titre": "La question de l'encadré final, dans la métaphore (ex : 'Alors, c'est quoi, votre stress ?').",
    "texte": "2 paragraphes alignés sur les règles CTA de l'objectif : à qui ça s'adresse, le pas concret suivant. Le bouton de prise de rendez-vous est ajouté par l'application : ne l'écris pas.",
    "chute": "Une phrase courte qui referme la métaphore. Elle sera mise en gras."
  },
  "references": ["3 à 8 références effectivement mobilisées dans l'article, au format 'Nom, I. (année). *Titre*. Éditeur.' UNIQUEMENT des références dont tu es certain — auteur, année, titre, éditeur. Une référence douteuse est pire que pas de référence : dans le doute, ne la mets pas."],
  "illustrations": [
    {
      "emplacement": "'banniere' pour l'image principale (OBLIGATOIRE, une seule), ou 'apres_section_N' pour une illustration dans le corps (0 à 2, seulement si une section gagne vraiment à être montrée).",
      "fichier": "Nom du fichier, en minuscules et tirets. Pour la bannière, reprends le slug.",
      "alt": "Ce que montre l'image, en une phrase, pour les lecteurs d'écran.",
      "prompt": "Le prompt de génération, prêt à coller. Il suit le STYLE DU SITE de la direction artistique — sa formule et son image de référence font foi : applique-les telles quelles, dans la langue où elles sont écrites. Le sujet est une scène figurative qui porte la métaphore centrale, jamais un concept abstrait ni un schéma ; silhouettes sans visage détaillé ; aucun texte ni lettre dans l'image. La bannière est CARRÉE (1:1) et sera recadrée en 16:9 dans la liste du blog : le sujet tient au centre. Termine par le format."
    }
  ],
  "post_reseaux": {
    "texte": "Le post qui annonce l'article sur Facebook, LinkedIn et Instagram. 4 à 7 lignes courtes : une accroche qui arrête le scroll (la métaphore ou le paradoxe de l'article), puis UNE idée forte de l'article. C'est une bande-annonce, pas un résumé : ne donne pas la réponse, le lecteur doit avoir une raison de cliquer.",
    "cta": "Une phrase qui promet précisément ce que l'article contient (ex : 'L'article fait le tour des quatre pannes, et de ce qu'on répare pour chacune.'). SANS lien : l'application ajoute l'adresse exacte de l'article, et « lien en bio » pour Instagram.",
    "hashtags": ["3 à 5 hashtags (string commençant par #, sans espace) : le sujet et sa niche. Pas de # générique creux."]
  }
}
Le post_reseaux suit TOUJOURS la logique « Trafic contenu long », quel que soit l'objectif : les règles CTA de l'objectif gouvernent l'encadré final de l'article, pas le post. L'image principale sert aussi de visuel au post.
Ton : Expert, posé, pédagogique, mais garde la radicalité du seuil (le choix face auquel le lecteur est mis) et l'oralité de Florent.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.titre_h1) out.push(t(data.titre_h1));
        if (data.introduction) out.push(t(data.introduction));
        (data.sections || []).forEach((s: any) => {
            if (s.sous_titre_h2) out.push(t(s.sous_titre_h2));
            if (s.contenu) out.push(t(s.contenu));
        });
        if (data.conclusion) out.push(t(data.conclusion));
        return out.filter(Boolean).join(' ');
    },
    livrable: composerArticleJekyll,
};

const SCRIPT_REEL: FormatDefinition = {
    key: TargetFormat.SCRIPT_VIDEO_REEL_SHORT,
    shortKey: 'Script Reel',
    editorTab: 'script',
    supportsColdRead: true,
    promptTemplate: `
GRILLE DE PRODUCTION — Script "Vidéo Courte" (Reel/Short) — Insta, TikTok, Shorts
Ce format mise sur l'incarnation. Il utilise la matière des réponses vocales pour créer un script naturel de moins de 60 secondes.
{
  "format": "Script Reel",
  "contrainte": "60 secondes max",
  "sections": [
    { "timing": "[0-3s]",   "role": "Accroche",   "texte": "L'accroche visuelle et verbale (le 'Quoi'). La phrase qui arrête le scroll.", "intention": "Note de rythme, ton, regard caméra, etc." },
    { "timing": "[3-15s]",  "role": "Constat",     "texte": "Empathie avec la douleur du client. On nomme ce qu'il vit.", "intention": "Note de rythme, pause, ton empathique, etc." },
    { "timing": "[15-45s]", "role": "Bascule",     "texte": "L'apport de l'expertise via une image forte. La métaphore qui éclaire. ANCRAGE CABINET (OBLIGATOIRE) : dis face caméra que ça vient de ta pratique de thérapeute ('En cabinet, je vois…', 'Un patient me disait…') pour que l'inconnu qui tombe sur le Reel comprenne que tu es praticien et que le propos est clinique.", "intention": "Note de rythme, changement de ton, montée en intensité, etc." },
    { "timing": "[45-60s]", "role": "Ouverture",   "texte": "Une réflexion qui reste en tête. Pas de résumé — une ouverture.", "intention": "Note de rythme, regard, silence final, etc." }
  ],
  "legende": {
    "texte": "La description écrite du Reel (≠ texte parlé). Première ligne qui arrête le scroll, puis 1-3 phrases qui prolongent le propos. Voix de Florent, avec un ancrage cabinet.",
    "cta": "Une phrase d'appel à l'action, alignée sur les règles CTA de l'objectif (fournies plus haut). Liens non cliquables sur Reels/TikTok : invite via 'lien en bio' en précisant l'adresse en clair (ex : 'Lien en bio → ${SITE_URL}'). Reprends l'URL exactement. Sans emoji.",
    "hashtags": ["#therapie", "#psychologie", "#... 5 à 10 hashtags pertinents, sans espace, sans # générique creux"]
  }
}
Ton : Parlé, naturel, comme le transcript sur l'injustice. L'humour et le paradoxe sont les moteurs.
Le script inclut des notes de rythme et d'intentions (pauses, ton) dans le champ "intention" de chaque section.
Le bloc "legende" est OBLIGATOIRE : c'est la description publiée sous la vidéo (algorithme + engagement), distincte du script parlé.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        (data.sections || []).forEach((s: any) => {
            if (s.texte) out.push(t(s.texte));
        });
        if (data.legende?.texte) out.push(t(data.legende.texte));
        if (data.legende?.cta) out.push(t(data.legende.cta));
        return out.filter(Boolean).join(' ');
    }
};

const SCRIPT_YOUTUBE: FormatDefinition = {
    key: TargetFormat.SCRIPT_VIDEO_YOUTUBE,
    shortKey: 'Script Youtube',
    editorTab: 'script',
    supportsColdRead: false,
    promptTemplate: `
GRILLE DE PRODUCTION — Script Vidéo (Youtube)
{
  "format": "Script Youtube",
  "intro": "Hook + Promesse claire. Pourquoi rester jusqu'au bout.",
  "developpement": [
    {
      "point": "Titre du point",
      "contenu": "Développement narratif. Métaphores filées. Anecdotes de cabinet."
    }
  ],
  "conclusion": "Ouverture + angle de rupture. Pas de résumé mécanique."
}
Ton : Narratif, profond, utilisant des métaphores filées. Plus long, plus contemplatif, mais toujours incarné.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.intro) out.push(t(data.intro));
        (data.developpement || []).forEach((s: any) => {
            if (s.contenu) out.push(t(s.contenu));
        });
        if (data.conclusion) out.push(t(data.conclusion));
        return out.filter(Boolean).join(' ');
    }
};

const CARROUSEL: FormatDefinition = {
    key: TargetFormat.CARROUSEL_SLIDE,
    shortKey: 'Carrousel',
    editorTab: 'brouillon',
    supportsColdRead: true,
    promptTemplate: `
GRILLE DE PRODUCTION — Carrousel — Instagram, LinkedIn
Format pédagogique. Ta production alimente directement la trame finale : zéro champ à réécrire après coup, tout est calibré pour le montage des slides dans Sketch (format 1:1 Instagram).

LONGUEUR ET TRAME (souple mais disciplinée) :
- Entre 5 et 10 slides. Vise 7 par défaut (standard qui marche sur les réseaux) — ajuste à la densité du propos.
- Au moins 1 slide ILLUSTRÉE pour porter la métaphore centrale. Tu peux en faire jusqu'à 3 si la matière s'y prête, mais pas plus (sinon le carrousel perd en lisibilité).
- Une slide TYPO a un fond texturé/coloré simple : le texte fait tout le travail. Utilise-la pour les transitions, les listes, le CTA.
- Une slide ILLUSTRÉE a un visuel IA en arrière-plan. Utilise-la pour la couverture, les moments à forte charge métaphorique, la clôture.
- N'ajoute PAS de slide de signature ou de présentation de Florent : elle est ajoutée automatiquement après ta génération.

RÈGLES "LECTEUR D'ABORD" (NON NÉGOCIABLES — l'inconnu qui scrolle ne connaît pas Florent) :
- Slide 1 : le lecteur doit s'y reconnaître — sa situation, ses mots, sa douleur. Une ouverture 100 % conte/parabole à la 3e personne, sans point de contact avec la vie du lecteur, est interdite. Si le contenu s'appuie sur une histoire, la slide 1 fait le pont (ex : "Vous ruminez à 3h du matin ? Un vieux conte parle exactement de ça.") — l'histoire commence slide 2.
- Le sujet réel du post (rumination, perfectionnisme, insomnie...) est nommé au plus tard sur la slide 2, dans les mots du lecteur.
- L'ancrage cabinet ("En séance, je vois...") apparaît au plus tard sur la slide 3 : l'inconnu doit comprendre tôt que l'auteur est praticien et que le propos est clinique.

RÔLES ÉDITORIAUX (colonne vertébrale — reste interne, n'apparaît pas dans la slide finale) :
Pour chaque slide, choisis un "role" parmi :
- "Accroche" : donne envie de swiper. 1re slide en général.
- "Le Problème / Le Ressenti" : le client se reconnaît dans la douleur décrite.
- "L'Image Centrale" : la métaphore visualisée. Typiquement ILLUSTRÉE.
- "L'Explication / La Mécanique" : la mécanique psychique nommée et traduite en vécu.
- "Le Basculement" : le moment où le choix se pose. L'approche thérapeutique.
- "La Pépite / Synthèse" : la phrase à retenir, qui cristallise le propos.
- "CTA Luminose" : appel à l'action aligné sur les règles CTA de l'objectif (fournies plus haut). Une seule action. Sans emoji.
Tu n'es pas obligé d'utiliser tous ces rôles ni de les mettre dans cet ordre — sers la logique du propos. Mais chaque slide doit avoir un rôle explicite.

DENSITÉ (NON NÉGOCIABLE — l'œil lit en 2 secondes, et tout doit tenir sur une slide 1:1) :
- "titre" : 35 caractères MAXIMUM, espaces compris. Court, percutant, lisible en miniature.
- "texte" : 140 caractères MAXIMUM, espaces compris (soit ~2 phrases courtes). Compte avant de rendre.
- Si tu ne sais pas comment dire plus court : coupe plutôt que d'allonger. Ces limites sont vérifiées automatiquement après ta génération — un dépassement déclenche une correction.

LÉGENDE DE PUBLICATION (le texte qui accompagne les images sous le post) :
Le carrousel ne se suffit pas à lui-même : sous les images, il y a la légende — le texte du post Instagram/LinkedIn. Tu la rédiges dans un objet "legende" au niveau racine du JSON (à côté de "slides"), avec :
- "texte" : l'accroche + le corps de la légende. Une première ligne qui arrête le scroll ET qui parle de la situation du lecteur, pas seulement du conte ou de l'image (les réseaux coupent après ~125 caractères, donc l'essentiel passe au début), puis 2-4 courts paragraphes qui PORTENT CE QUE LES SLIDES NE PEUVENT PAS PORTER : un exemple anonymisé et concret, ce que ça change dans le travail, la nuance qui ne tenait pas en 140 caractères. Reprendre la métaphore centrale et l'accroche est normal — c'est le même post ; ce qu'on ne veut pas, c'est une phrase entière recopiée d'une slide qui n'ajoute rien. C'est la voix de Florent, incarnée, avec sa métaphore filée. ANCRAGE CABINET (OBLIGATOIRE) : à un moment, raccroche la métaphore à ta pratique de thérapeute en cabinet ("En séance, je vois…", "Un patient me disait…") pour que le lecteur de passage comprenne que c'est clinique, pas théorique — sinon l'image ne parle qu'à ceux qui te connaissent déjà. Sauts de ligne autorisés (\\n).
- "cta" : une seule phrase d'appel à l'action, alignée sur les règles CTA de l'objectif (fournies plus haut). Comme les liens ne sont pas cliquables sur Instagram, invite via "lien en bio" et précise l'adresse en clair (ex : "Tout est sur le site, lien en bio → ${SITE_URL}"). Reprends l'URL exactement. Sans emoji.
- "hashtags" : un tableau de 5 à 12 hashtags pertinents (string commençant par #, sans espace), mélangeant thématique psy/thérapie et niche de l'offre.

FORMAT JSON ATTENDU :
{
  "format": "Carrousel",
  "legende": {
    "texte": "Accroche forte en première ligne.\\n\\nPuis 2-4 paragraphes courts qui prolongent le propos, dans la voix de Florent.",
    "cta": "Phrase d'appel à l'action, sans emoji.",
    "hashtags": ["#therapie", "#psychologie", "#..."]
  },
  "slides": [
    {
      "numero": 1,
      "role": "Accroche",
      "type": "TYPO",
      "titre": "Titre accrocheur (≤ 6 mots)",
      "texte": "Phrase d'appel, 1-2 phrases courtes. ≤ 25 mots.",
      "intention_visuelle": null
    },
    {
      "numero": 3,
      "role": "L'Image Centrale",
      "type": "ILLUSTRÉE",
      "titre": "Légende courte (≤ 6 mots)",
      "texte": "Une phrase qui accompagne l'image. ≤ 25 mots.",
      "intention_visuelle": "Description FR de ce que l'image doit montrer concrètement (la métaphore visualisée, pas un concept abstrait). 2-3 phrases, en français. Sera traduite en prompt Dzine par le Directeur Artistique."
    }
    // ... autres slides selon la logique du propos
  ]
}

RÈGLES STRICTES :
- "intention_visuelle" est OBLIGATOIRE pour chaque slide de type ILLUSTRÉE, et DOIT être null pour TYPO.
- "intention_visuelle" est rédigée en français, c'est une direction éditoriale (ce qu'on veut voir), pas un prompt technique.
- Le bloc "legende" (texte + cta + hashtags) est OBLIGATOIRE, au niveau racine, à côté de "slides".
- Pas de champ "visuel" ni de champ "contenu" : utilise exactement les champs nommés ci-dessus.
- Retourne UNIQUEMENT le JSON, sans balises markdown ni texte d'intro.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        (data.slides || []).forEach((s: any) => {
            if (s.titre) out.push(t(s.titre));
            if (s.texte) out.push(t(s.texte));
        });
        if (data.legende?.texte) out.push(t(data.legende.texte));
        if (data.legende?.cta) out.push(t(data.legende.cta));
        return out.filter(Boolean).join(' ');
    }
};

const NEWSLETTER: FormatDefinition = {
    key: TargetFormat.NEWSLETTER,
    shortKey: 'Newsletter',
    editorTab: 'brouillon',
    supportsColdRead: false,
    promptTemplate: `
GRILLE DE PRODUCTION — Newsletter — Mailing-list
Contenu pour la newsletter de Florent. Ton personnel et chaleureux. Vouvoiement obligatoire (jamais de tutoiement).
On sent la relation directe praticien → abonné.
{
  "format": "Newsletter",
  "objet": "Objet de l'email : court, intrigant, qui donne envie d'ouvrir.",
  "accroche": "Les premières phrases qui captent l'attention : citations, questions rhétoriques, images choc. Elles posent le décor émotionnel.",
  "corps": "Développement en paragraphes. Vouvoiement. Explication du pourquoi, proposition concrète (date, lieu, contexte). Alterner prose et listes à puces (•) pour les détails pratiques. Chaque paragraphe fait progresser vers l'action.",
  "repositionnement": "Paragraphe qui requalifie la pratique ou l'offre — ce que c'est vraiment vs. ce qu'on croit. La phrase qui recadre.",
  "baffe": "Phrase finale percutante — la vérité que le lecteur ne voulait pas entendre.",
  "cta": "Appel à l'action avec lien. Utiliser le format : 👉 __Texte du lien__"
}
Ton : Personnel, chaleureux, vouvoiement. Direct mais bienveillant.
Contrainte de longueur : 300-500 mots.
Ne PAS inclure de salutation (Bonjour) ni de signature (Chaleureusement, Florent Jaouali) — ils sont ajoutés automatiquement par l'outil d'envoi.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.accroche) out.push(t(data.accroche));
        if (data.corps) out.push(t(data.corps));
        if (data.repositionnement) out.push(t(data.repositionnement));
        if (data.baffe) out.push(t(data.baffe));
        if (data.cta) out.push(t(data.cta));
        return out.filter(Boolean).join(' ');
    }
};

const PROMPT_IMAGE: FormatDefinition = {
    key: TargetFormat.PROMPT_IMAGE,
    shortKey: 'Prompt Image',
    editorTab: 'brouillon',
    supportsColdRead: false,
    promptTemplate: `
GRILLE DE PRODUCTION — Prompt Image (IA Générative)
{
  "format": "Prompt Image",
  "prompt": "Prompt détaillé et artistique en anglais pour Midjourney/DALL-E illustrant la métaphore centrale.",
  "legende": {
    "texte": "La légende qui accompagne l'image sur les réseaux. 2-4 phrases. Voix de Florent. ANCRAGE CABINET (OBLIGATOIRE) : raccroche la métaphore de l'image à ta pratique de thérapeute en cabinet ('En séance, je vois…') pour que l'inconnu comprenne que c'est clinique, pas une simple jolie image.",
    "cta": "Une phrase d'appel à l'action. Liens non cliquables sur Instagram : invite via 'lien en bio' en précisant l'adresse en clair (ex : 'Lien en bio → ${SITE_URL}'). Reprends l'URL exactement. Sans emoji.",
    "hashtags": ["#therapie", "#psychologie", "#... 5 à 10 hashtags pertinents, sans espace, sans # générique creux"]
  }
}
Interdiction absolue : Aucun autre texte.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.prompt) out.push(t(data.prompt));
        // legende : objet {texte, cta, hashtags} (nouveau) ou string (ancienne trame)
        if (typeof data.legende === 'string') out.push(t(data.legende));
        else if (data.legende) {
            if (data.legende.texte) out.push(t(data.legende.texte));
            if (data.legende.cta) out.push(t(data.legende.cta));
        }
        return out.filter(Boolean).join(' ');
    }
};

// ── Registre ─────────────────────────────────────────────────────────

export const FORMAT_REGISTRY: Record<TargetFormat, FormatDefinition> = {
    [TargetFormat.POST_TEXTE_COURT]: POST_TEXTE,
    [TargetFormat.ARTICLE_LONG_SEO]: ARTICLE,
    [TargetFormat.SCRIPT_VIDEO_REEL_SHORT]: SCRIPT_REEL,
    [TargetFormat.SCRIPT_VIDEO_YOUTUBE]: SCRIPT_YOUTUBE,
    [TargetFormat.CARROUSEL_SLIDE]: CARROUSEL,
    [TargetFormat.PROMPT_IMAGE]: PROMPT_IMAGE,
    [TargetFormat.NEWSLETTER]: NEWSLETTER,
};

// ── Lookup helpers ───────────────────────────────────────────────────

/** Clés courtes reconnues dans les JSON retournés par l'IA */
const SHORT_KEY_MAP: Record<string, TargetFormat> = {};
for (const def of Object.values(FORMAT_REGISTRY)) {
    SHORT_KEY_MAP[def.shortKey] = def.key;
}

/**
 * Ramène une désignation de format à sa forme comparable : minuscules, sans
 * accents, sans ponctuation. « Script Vidéo (Reel/Short) », « Script Video
 * (Reel / Short) » et « script video reel short » deviennent la même clé.
 */
const clefDeFormat = (valeur: string): string =>
    valeur
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

/** Les deux vocabulaires du registre, indexés sous leur forme comparable. */
const FORMATS_PAR_CLEF: Record<string, TargetFormat> = {};
for (const def of Object.values(FORMAT_REGISTRY)) {
    FORMATS_PAR_CLEF[clefDeFormat(def.key)] = def.key;
    FORMATS_PAR_CLEF[clefDeFormat(def.shortKey)] = def.key;
}

/**
 * Les mots qui désignent un format SANS ambiguïté. Dernier recours, quand le
 * modèle a écrit « Reel » ou « un carrousel » au lieu de la valeur du registre.
 *
 * « vidéo » et « script » n'y sont volontairement PAS : seuls, ils ne
 * départagent pas le Reel du Youtube. Deviner là serait pire que rendre null —
 * on choisirait un format à la place de Florent, sans le lui dire.
 */
const MOTS_DECISIFS: ReadonlyArray<[string, TargetFormat]> = [
    ['carrousel', TargetFormat.CARROUSEL_SLIDE],
    ['slide', TargetFormat.CARROUSEL_SLIDE],
    ['newsletter', TargetFormat.NEWSLETTER],
    ['youtube', TargetFormat.SCRIPT_VIDEO_YOUTUBE],
    ['reel', TargetFormat.SCRIPT_VIDEO_REEL_SHORT],
    ['short', TargetFormat.SCRIPT_VIDEO_REEL_SHORT],
    ['promptimage', TargetFormat.PROMPT_IMAGE],
    ['seo', TargetFormat.ARTICLE_LONG_SEO],
    ['article', TargetFormat.ARTICLE_LONG_SEO],
    ['posttexte', TargetFormat.POST_TEXTE_COURT],
];

/**
 * Le format voulu, quelle que soit la façon dont il a été écrit.
 *
 * Pourquoi cette tolérance existe : le 24/08/2026, un plan de série est arrivé
 * avec des publications sans format alors que l'Éclateur en avait clairement
 * désigné un. La comparaison était une ÉGALITÉ STRICTE de chaîne, accents et
 * parenthèses compris — et le prompt, deux lignes après avoir exigé « la valeur
 * EXACTE », abrège lui-même en « Post Texte », « Carrousel », « Script Vidéo ».
 * L'intention du modèle était jetée en silence.
 *
 * Rend `null` quand la désignation reste ambiguë : c'est alors à Florent de
 * trancher, et l'écran doit le lui demander plutôt que de deviner.
 */
export function resoudreFormat(valeur: unknown): TargetFormat | null {
    if (typeof valeur !== 'string') return null;
    const clef = clefDeFormat(valeur);
    if (!clef) return null;

    const exact = FORMATS_PAR_CLEF[clef];
    if (exact) return exact;

    const trouves = MOTS_DECISIFS.filter(([mot]) => clef.includes(mot)).map(([, format]) => format);
    const uniques = [...new Set(trouves)];
    // Deux formats possibles dans la même chaîne : on ne tranche pas.
    return uniques.length === 1 ? uniques[0] : null;
}

/**
 * Retrouve la définition de format à partir du TargetFormat enum
 * OU depuis le shortKey dans un JSON IA (ex: "Post Texte", "Carrousel").
 */
export function getFormatDef(formatOrShortKey: string | undefined | null): FormatDefinition | undefined {
    if (!formatOrShortKey) return undefined;
    // Essai direct par enum value
    if (formatOrShortKey in FORMAT_REGISTRY) {
        return FORMAT_REGISTRY[formatOrShortKey as TargetFormat];
    }
    // Essai par shortKey
    const mapped = SHORT_KEY_MAP[formatOrShortKey];
    if (mapped) return FORMAT_REGISTRY[mapped];
    return undefined;
}

/**
 * Extrait un texte brut lisible depuis un body JSON structuré.
 * Remplace bodyJsonToText() — centralisé ici pour éliminer la duplication.
 */
export function bodyJsonToText(body: string): string {
    if (!body) return '';
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);

        // Édition manuelle libre
        if (data.edited_raw) return data.edited_raw;

        // Trouve la définition de format depuis le champ "format" du JSON
        const formatDef = getFormatDef(data.format);
        if (formatDef) {
            return formatDef.toPlainText(data);
        }

        // Fallback : retourner le texte brut
        return body;
    } catch {
        // Pas du JSON → texte brut (ancien contenu ou édition manuelle)
        return body;
    }
}

/**
 * Parse un body JSON en nettoyant les balises markdown et la signature.
 * Retourne l'objet parsé ou null.
 */
export function parseBodyJson(raw: string): any | null {
    if (!raw) return null;
    try {
        const lastBrace = raw.lastIndexOf('}');
        if (lastBrace === -1) return null;
        const cleaned = raw.slice(0, lastBrace + 1);
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

/**
 * Étape de l'éditeur où atterrir après la rédaction.
 *
 * Il n'y a plus de `storageField` : le brouillon va toujours dans `draft`,
 * quel que soit le format (SPEC §2.5). Seul l'écran d'arrivée varie encore.
 */
export function getEditorTab(format: TargetFormat | null | undefined): EditorTab {
    if (!format) return 'brouillon';
    const def = FORMAT_REGISTRY[format];
    return def?.editorTab || 'brouillon';
}

/** Le format bénéficie-t-il d'une relecture à froid après rédaction ? */
export function supportsColdRead(format: TargetFormat | null | undefined): boolean {
    if (!format) return false;
    return FORMAT_REGISTRY[format]?.supportsColdRead === true;
}

/**
 * Obtient le promptTemplate du format cible pour injection dans le prompt du Rédacteur.
 */
export function getFormatPromptTemplate(format: TargetFormat | null | undefined): string {
    if (!format) return '';
    const def = FORMAT_REGISTRY[format];
    return def?.promptTemplate || '';
}

/**
 * Liste des shortKeys valides (pour valider les réponses IA)
 */
export const VALID_SHORT_KEYS = Object.values(FORMAT_REGISTRY).map(d => d.shortKey);
