import React from 'react';
import { enBlocsHtml, enLigneHtml, SITE_URL } from '@luminose/editorial';

/**
 * Le texte d'un article tel qu'il sera publié : gras, italique, listes, liens.
 *
 * ── Pourquoi le convertisseur du site, et pas un rendu markdown de plus ─────
 *
 * Le Rédacteur écrit un balisage léger que `packages/editorial/src/jekyll.ts`
 * transforme en HTML pour le site. Un second interprète, ici, finirait par ne
 * pas lire les mêmes règles — une liste reconnue d'un côté et pas de l'autre —
 * et l'aperçu mentirait sur ce que le fichier publiera. On affiche donc le HTML
 * même que le fichier contiendra.
 *
 * ── Pourquoi `dangerouslySetInnerHTML` est sûr ici ───────────────────────
 *
 * Le convertisseur échappe TOUT le texte du modèle (`<`, `>`, `&`) et ne laisse
 * passer que les balises qu'il produit lui-même, sans attribut, plus `<a href>`
 * dont la cible est filtrée : lien interne, http(s) ou mailto, jamais
 * `javascript:`. Un test le tient (`jekyll.test.ts`, « liens sûrs »).
 */

/**
 * Les liens, adaptés à l'application : une page du site s'ouvre sur le site,
 * dans un autre onglet ; un lien vers un article n'a d'adresse qu'au build de
 * Jekyll (`{% post_url %}`), il est montré sans être cliquable.
 */
const pourApercu = (html: string): string =>
    html.replace(/<a href="([^"]*)">/g, (_, href: string) => {
        const article = /^\{% post_url (\S+) %\}$/.exec(href);
        if (article) return `<a title="Article du blog : ${article[1]}">`;
        const adresse = href.startsWith('/') ? `${SITE_URL}${href}` : href;
        return `<a href="${adresse}" target="_blank" rel="noopener noreferrer">`;
    });

const CLASSES_TEXTE =
    'space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_h3]:font-bold [&_strong]:font-bold [&_em]:italic ' +
    '[&_a]:underline [&_a]:underline-offset-2';

export const TexteLeger: React.FC<{ source: string; className?: string }> = ({ source, className = '' }) => (
    <div
        className={`${CLASSES_TEXTE} ${className}`}
        dangerouslySetInnerHTML={{ __html: pourApercu(enBlocsHtml(source, '').join('\n')) }}
    />
);

/** Une seule ligne — un paragraphe du résumé, la chute, une référence. */
export const LigneLegere: React.FC<{ source: string }> = ({ source }) => (
    <span className="[&_strong]:font-bold [&_em]:italic [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: pourApercu(enLigneHtml(source)) }} />
);
