/**
 * L'article du blog, tel que le site Jekyll de luminose.fr l'attend.
 *
 * ── Pourquoi le modèle n'écrit pas le HTML ────────────────────────────────
 *
 * Le fichier d'un article, c'est quatre choses qui n'ont rien d'éditorial : un
 * front matter YAML aux guillemets piégeux, un gabarit Bulma (résumé en deux
 * colonnes, encadré final, bandeaux), des espaces insécables devant chaque
 * « : ; ? ! », et des includes Liquid. Demander tout ça au Rédacteur, c'est lui
 * faire porter en plus de la voix une discipline de typographe qu'il tiendrait
 * un article sur deux — et une faute de YAML casse le build du site entier.
 *
 * Le modèle écrit donc du texte, avec un balisage léger (paragraphes séparés par
 * une ligne vide, « - » pour les puces, **gras**, *italique*, [lien](cible)), et
 * ce module compose le fichier. Même logique que la slide Signature : ce qui
 * doit être exact ne passe pas par le modèle.
 *
 * ── D'où vient le gabarit ─────────────────────────────────────────────────
 *
 * Recopié de `_posts/2026-07-05-stress-installation-electrique.html` du dépôt
 * luminose.fr, l'article que Florent a désigné comme référence le 23/09/2026.
 * Si le gabarit du site change, c'est ici qu'on le suit — et le test qui
 * compare la structure à cet article avec.
 */

import { SITE_URL } from './config';

// ── Ce que produit le module ─────────────────────────────────────────

export interface IllustrationArticle {
    /** `null` pour l'image principale, sinon le numéro de section (1 = la première) après laquelle elle s'insère. */
    apresSection: number | null;
    /** Nom de fichier sans extension, dans /images/blog/. */
    fichier: string;
    alt: string;
    prompt: string;
}

export interface PostAccompagnement {
    plateforme: string;
    texte: string;
}

export interface LivrableArticle {
    fichier: { nom: string; contenu: string };
    /** L'adresse publique, déduite du permalink du site : /blog/:categories/:title.html */
    url: string;
    illustrations: IllustrationArticle[];
    posts: PostAccompagnement[];
    /**
     * Ce qui a dû être deviné ou qui mérite un œil avant publication. Un
     * article rédigé avec l'ancienne grille n'a ni catégorie ni résumé : on
     * livre quand même le fichier, mais on le dit.
     */
    avertissements: string[];
}

// ── Petites fonctions de texte ───────────────────────────────────────

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Une valeur qui peut arriver en chaîne ou en tableau de paragraphes. */
const paragraphesDe = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(texte).filter(Boolean);
    return texte(v).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
};

/**
 * Minuscules, sans accents, des tirets. Les articles existants du site s'écrivent
 * ainsi (`la-theorie-de-attachement`) et l'URL en dépend : un accent dans un slug,
 * c'est une adresse encodée en %C3%A9 dans chaque partage.
 */
export const slugifier = (valeur: string): string =>
    valeur
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/, '');

/**
 * Échappe le texte pour le HTML, en laissant passer les entités déjà écrites
 * (`&nbsp;` que le modèle recopie parfois de l'exemple) et les trois balises
 * qu'un modèle glisse malgré la consigne — les montrer telles quelles à
 * l'écran serait pire que les accepter.
 */
const BALISES_TOLEREES = /<\/?(?:strong|em)>|<br\s*\/?>/g;

const echapper = (s: string): string => {
    const tolerees: string[] = [];
    return s
        .replace(BALISES_TOLEREES, b => `\u0000${tolerees.push(b) - 1}\u0000`)
        .replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\u0000(\d+)\u0000/g, (_, i) => tolerees[Number(i)]);
};

/**
 * Les espaces insécables de la typographie française, comme dans l'article de
 * référence : sans eux, un « ? » se retrouve seul en début de ligne sur mobile.
 * On ne touche qu'aux espaces déjà présents — un « ? » collé à une URL n'est
 * pas de la ponctuation.
 */
export const typographier = (s: string): string =>
    s
        .replace(/«[ \u00A0\u202F]*/g, '«&nbsp;')
        .replace(/[ \u00A0\u202F]*»/g, '&nbsp;»')
        .replace(/[ \u00A0\u202F]+([:;?!])/g, '&nbsp;$1');

/**
 * `post:AAAA-MM-JJ-slug` devient le tag Liquid qui résout l'adresse au build :
 * si un article change un jour de catégorie, le lien suit. Tout le reste est
 * une adresse, recopiée telle quelle.
 */
const cibleDuLien = (cible: string): string => {
    const article = /^post:\s*(\S+)$/.exec(cible.trim());
    if (article) return `{% post_url ${article[1]} %}`;
    return cible.trim().replace(/"/g, '%22');
};

/**
 * Gras, italique, liens. `insecables: false` pour le H1 et les H2 de section :
 * l'article de référence ne les y met pas (seul le titre de l'encadré final en
 * porte), et le fichier doit ressortir identique à ce que Florent écrit à la main.
 */
const enLigne = (s: string, { insecables = true } = {}): string =>
    (insecables ? typographier(echapper(s)) : echapper(s))
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, libelle, cible) => `<a href="${cibleDuLien(cible)}">${libelle}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');

const PUCE = /^\s*[-•*]\s+/;

/**
 * Le balisage léger en blocs HTML, à l'indentation de l'article de référence.
 *
 * Un bloc qui mêle une phrase et des puces (« Vous la reconnaissez quand :\n-
 * … ») est découpé : la phrase en paragraphe, les puces en liste. C'est la
 * forme que les modèles produisent spontanément, et la refuser reviendrait à
 * perdre la liste.
 */
export const enBlocsHtml = (source: string, indentation = '      '): string[] => {
    const blocs: string[] = [];
    for (const bloc of source.split(/\n\s*\n/)) {
        const lignes = bloc.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
        let paragraphe: string[] = [];
        let puces: string[] = [];
        const viderParagraphe = () => {
            if (paragraphe.length) blocs.push(`${indentation}<p>${enLigne(paragraphe.join(' '))}</p>`);
            paragraphe = [];
        };
        const viderPuces = () => {
            if (puces.length) {
                const items = puces.map(p => `${indentation}  <li>${enLigne(p)}</li>`).join('\n');
                blocs.push(`${indentation}<ul>\n${items}\n${indentation}</ul>`);
            }
            puces = [];
        };
        for (const ligne of lignes) {
            const titre = /^#{2,4}\s+(.*)$/.exec(ligne.trim());
            if (titre) {
                viderParagraphe(); viderPuces();
                blocs.push(`${indentation}<h3>${enLigne(titre[1])}</h3>`);
            } else if (PUCE.test(ligne)) {
                viderParagraphe();
                puces.push(ligne.replace(PUCE, ''));
            } else {
                viderPuces();
                paragraphe.push(ligne.trim());
            }
        }
        viderParagraphe(); viderPuces();
    }
    return blocs;
};

/** Une valeur YAML entre guillemets doubles — la fiche canal Blog l'exige dès qu'il y a un deux-points. */
const yamlCite = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ')}"`;

/**
 * L'image, au balisage de l'article de référence : le JPEG et sa variante @2x.
 * Le site sait aussi `{% img_optimized %}` ; l'article désigné comme modèle ne
 * l'emploie pas, on le suit.
 */
const balisageImage = (fichier: string, alt: string): string =>
    `<img class="banner" src="/images/blog/${fichier}.jpg" srcset="/images/blog/${fichier}.jpg, /images/blog/${fichier}@2x.jpg 2x" alt="${echapper(alt).replace(/"/g, '&quot;')}">`;

// ── Lecture du JSON du Rédacteur ─────────────────────────────────────

const TAGS = ['exclusif', 'basique'] as const;

/** « banniere », « apres_section_3 », « après la section 3 » : on ne garde que le numéro. */
const lireEmplacement = (v: unknown): number | null => {
    const n = /(\d+)/.exec(texte(v));
    return n ? Number(n[1]) : null;
};

const lireIllustrations = (data: any, slug: string, titre: string): IllustrationArticle[] => {
    const brutes: any[] = Array.isArray(data.illustrations) ? data.illustrations : [];
    const lues = brutes
        .filter(i => i && texte(i.prompt))
        .map((i): IllustrationArticle => ({
            apresSection: lireEmplacement(i.emplacement),
            fichier: slugifier(texte(i.fichier)),
            alt: texte(i.alt),
            prompt: texte(i.prompt),
        }));
    // L'image principale porte le nom du slug, toujours : c'est `image_name`
    // dans le front matter, et la liste du blog la cherche sous ce nom.
    const principale = lues.find(i => i.apresSection === null);
    if (principale) {
        principale.fichier = slug;
        principale.alt = principale.alt || titre;
    }
    lues.forEach((i, rang) => {
        if (i.apresSection !== null && !i.fichier) i.fichier = `${slug}-${rang + 1}`;
    });
    return lues;
};

const lireHashtags = (v: unknown): string[] =>
    (Array.isArray(v) ? v : texte(v).split(/\s+/))
        .map(texte)
        .filter(Boolean)
        .map(h => `#${h.replace(/^#+/, '').replace(/\s+/g, '')}`)
        .filter(h => h.length > 1);

/**
 * Les deux versions du post d'accompagnement. Le modèle écrit le texte ;
 * l'adresse, c'est le code qui la pose — il est le seul à la connaître
 * exactement, et une URL recopiée à la main par un modèle finit un jour
 * avec une lettre en moins.
 */
const composerPosts = (data: any, url: string): PostAccompagnement[] => {
    const post = data.post_reseaux;
    if (!post || typeof post !== 'object') return [];
    const corps = texte(post.texte);
    // Un lien que le modèle aurait ajouté malgré la consigne ferait doublon.
    const appel = texte(post.cta).replace(/\s*(→\s*)?https?:\/\/\S+/g, '').trim();
    const tags = lireHashtags(post.hashtags).join(' ');
    if (!corps && !appel) return [];
    const adresseEnClair = url.replace(/^https?:\/\/(www\.)?/, '');
    const assembler = (lien: string) => [corps, [appel, lien].filter(Boolean).join('\n'), tags].filter(Boolean).join('\n\n');
    return [
        { plateforme: 'Facebook · LinkedIn', texte: assembler(`→ ${url}`) },
        // Instagram ne rend pas les liens cliquables dans une légende : lien en
        // bio, et l'adresse en clair pour qui la tape (règles CTA « Trafic contenu long »).
        { plateforme: 'Instagram', texte: assembler(`→ Lien en bio (${adresseEnClair})`) },
    ];
};

// ── Le fichier ───────────────────────────────────────────────────────

/**
 * Compose le fichier `_posts/AAAA-MM-JJ-slug.html`, l'illustration et les posts.
 *
 * Rend `null` quand le JSON n'est pas un article exploitable (pas de titre ni de
 * section) : mieux vaut ne rien proposer que livrer un fichier vide qui
 * passerait le build.
 *
 * @param date - AAAA-MM-JJ, la date de publication prévue. Jekyll la lit dans
 *               le nom du fichier.
 */
export function composerArticleJekyll(data: any, options: { date: string }): LivrableArticle | null {
    if (!data || typeof data !== 'object') return null;
    const titre = texte(data.titre_h1);
    const sections: any[] = Array.isArray(data.sections) ? data.sections.filter(Boolean) : [];
    if (!titre || sections.length === 0) return null;

    const avertissements: string[] = [];

    const slug = slugifier(texte(data.slug)) || slugifier(titre);
    if (!texte(data.slug)) avertissements.push(`Adresse déduite du titre (${slug}) — à raccourcir si besoin.`);

    const categorie = slugifier(texte(data.categorie)) || 'a-completer';
    if (categorie === 'a-completer') avertissements.push('Catégorie absente — à choisir avant publication : elle fait partie de l’adresse.');

    const tag = (TAGS as readonly string[]).includes(texte(data.tag)) ? texte(data.tag) : 'exclusif';

    const description = texte(data.meta_description);
    if (!description) avertissements.push('Meta description absente — c’est ce que Google affiche sous le titre.');
    else if (description.length > 160) avertissements.push(`Meta description de ${description.length} caractères — Google coupe vers 160.`);

    const resume = paragraphesDe(data.resume);
    if (resume.length === 0) avertissements.push('Résumé absent — l’encadré « En résumé » et la carte du blog seront vides.');

    const url = `${SITE_URL}/blog/${categorie}/${slug}.html`;
    const illustrations = lireIllustrations(data, slug, titre);
    if (!illustrations.some(i => i.apresSection === null)) {
        avertissements.push('Pas de prompt pour l’image principale — il faudra quand même déposer /images/blog/' + slug + '.jpg.');
    }

    // ── Front matter ──
    const frontMatter = [
        '---',
        'layout: colonne',
        `title: ${yamlCite(titre)}`,
        `image_name: ${slug}`,
        'section: blog',
        `category: ${categorie}`,
        `tag: ${tag}`,
        `description: ${yamlCite(description)}`,
        'summary: |',
        ...(resume.length ? resume.map(p => `  <p>${enLigne(p)}</p>`) : ['  <p></p>']),
        '---',
    ].join('\n');

    // ── Corps ──
    const I = '      ';
    const corps: string[] = [];
    corps.push(`${I}<h1>${enLigne(titre, { insecables: false })}</h1>`);
    corps.push(`${I}{% include liens-partage.html %}`);
    corps.push([
        `${I}<div class="columns summary-container">`,
        `${I}  <div class="column is-5">`,
        `${I}    <span class="banner-image-container"><img class="banner" src="/images/blog/{{ page.image_name }}.jpg" srcset="/images/blog/{{ page.image_name }}.jpg, /images/blog/{{ page.image_name }}@2x.jpg 2x" alt="{{ page.title }}"></span>`,
        `${I}  </div>`,
        `${I}  <div class="column is-7 purple-border">`,
        `${I}      <h3>En résumé</h3>`,
        `${I}      {{ page.summary }}`,
        `${I}  </div>`,
        `${I}</div>`,
    ].join('\n'));

    corps.push(...enBlocsHtml(texte(data.introduction), I));

    sections.forEach((section, index) => {
        const h2 = texte(section.sous_titre_h2 || section.titre);
        if (h2) corps.push(`${I}<h2>${enLigne(h2, { insecables: false })}</h2>`);
        corps.push(...enBlocsHtml(texte(section.contenu), I));
        // La conclusion ferme la dernière section, sans titre à elle : dans
        // l'article de référence, le dernier H2 porte déjà la sortie.
        if (index === sections.length - 1) corps.push(...enBlocsHtml(texte(data.conclusion), I));
        illustrations
            .filter(i => i.apresSection === index + 1)
            .forEach(i => corps.push(`${I}<p>${balisageImage(i.fichier, i.alt)}</p>`));
    });

    // ── Encadré final ──
    const cta = data.cta;
    const encadre: string[] = [`${I}<div class="highlight">`];
    if (cta && typeof cta === 'object') {
        if (texte(cta.titre)) encadre.push(`${I}  <h2 class="subtitle">${enLigne(texte(cta.titre))}</h2>`);
        encadre.push(...enBlocsHtml(texte(Array.isArray(cta.texte) ? cta.texte.join('\n\n') : cta.texte), `${I}  `));
        if (texte(cta.chute)) encadre.push(`${I}  <p><strong>${enLigne(texte(cta.chute))}</strong></p>`);
    } else {
        // Ancienne grille : le CTA était une chaîne, sans titre d'encadré.
        encadre.push(...enBlocsHtml(texte(cta), `${I}  `));
        avertissements.push('Encadré final sans titre (ancienne grille) — à ajouter à la main ou régénérer.');
    }
    encadre.push(`${I}  <p class="has-text-centered">{% bouton_rendez_vous is-white %}</p>`);
    encadre.push(`${I}</div>`);
    corps.push(encadre.join('\n'));

    // ── Références ──
    const references = paragraphesDe(Array.isArray(data.references) ? data.references : texte(data.references).split('\n'))
        .map(r => r.replace(PUCE, ''));
    if (references.length) {
        corps.push(`${I}<h2>Références pour aller plus loin</h2>\n${I}<ul>\n${references.map(r => `${I}  <li>${enLigne(r)}</li>`).join('\n')}\n${I}</ul>`);
    }

    corps.push(`${I}{% include liens-partage.html %}`);

    const contenu = [
        frontMatter,
        '',
        '<section class="section article">',
        '  <div class="container">',
        '    <div class="content">',
        corps.join('\n\n'),
        '',
        '    </div>',
        '',
        '    {% include bandeaux/bandeau-auteur.html %}',
        '    {% include bandeaux/bandeau-temoignages.html %}',
        '    {% include bandeaux/bandeau-plus-loin-hypnose.html %}',
        '',
        '  </div>',
        '</section>',
        '',
    ].join('\n');

    return {
        fichier: { nom: `${options.date}-${slug}.html`, contenu },
        url,
        illustrations,
        posts: composerPosts(data, url),
        avertissements,
    };
}
