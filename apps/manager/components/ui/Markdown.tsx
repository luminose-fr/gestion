/**
 * Rendu markdown minimal, sans dépendance.
 *
 * Il couvre exactement ce que le corpus et les messages du Coach emploient —
 * titres, gras, italique, code, listes, tableaux, citations, filets — et rien
 * de plus. Ajouter une bibliothèque pour ce besoin borné et stable serait payer
 * une dépendance pour rien.
 *
 * Ce qu'il ne sait pas faire, il le rend **tel quel** plutôt que de l'avaler :
 * un lecteur doit voir la syntaxe brute d'une forme non reconnue, pas un trou.
 *
 * Deux variantes, parce que deux textes n'ont pas la même forme :
 * - `document`, une fiche du corpus, enroulée à 90 colonnes : les lignes d'un
 *   paragraphe se rejoignent ;
 * - `message`, ce qu'écrit le Coach dans le fil : un retour à la ligne y est
 *   voulu, une liste numérotée garde ses numéros, et le texte prend la couleur
 *   de sa bulle. Le Coach y pose la carte de la métaphore en tableau depuis le
 *   28/10/2026 — sans ce rendu, elle s'affichait en barres verticales.
 */
import React from 'react';
import { CLASSES_SURTITRE } from './Etiquette';

export type VarianteMarkdown = 'document' | 'message';

// Le gras d'une fiche ressort en pleine couleur sur son texte atténué ; celui
// d'un message garde la couleur de sa bulle.
const GRAS = { document: 'font-semibold text-brand-main dark:text-white', message: 'font-bold' } as const;

const inline = (texte: string, cle: string, variante: VarianteMarkdown = 'document'): React.ReactNode[] =>
  texte
    .split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
        return <strong key={`${cle}-${i}`} className={GRAS[variante]}>{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        return (
          <code key={`${cle}-${i}`} className="font-mono text-[0.85em] px-1 py-0.5 rounded-md bg-brand-light dark:bg-dark-sec-bg">
            {p.slice(1, -1)}
          </code>
        );
      }
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
        return <em key={`${cle}-${i}`} className="italic">{p.slice(1, -1)}</em>;
      }
      return <React.Fragment key={`${cle}-${i}`}>{p}</React.Fragment>;
    });

const cellules = (ligne: string) =>
  ligne.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Un tableau de lecture : en-tête en sur-titre, lignes séparées d'un filet. */
export const Tableau: React.FC<{ entete: React.ReactNode[]; lignes: React.ReactNode[][]; className?: string }> = ({ entete, lignes, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="text-xs w-full">
      <thead>
        <tr className={CLASSES_SURTITRE}>
          {entete.map((c, k) => <th key={k} className="text-left pb-1.5 pr-3 align-bottom">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {lignes.map((r, k) => (
          <tr key={k} className="border-t border-brand-border dark:border-dark-sec-border">
            {r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const LISTE = /^\s*([-*•]|\d+\.)\s+/;

export const Markdown: React.FC<{ texte: string; variante?: VarianteMarkdown }> = ({ texte, variante = 'document' }) => {
  const message = variante === 'message';
  // Un document atténue son texte courant ; un message garde la couleur de sa bulle.
  const couleur = message ? '' : 'text-brand-main/80 dark:text-dark-text/75';
  const marge = message ? 'my-2 first:mt-0 last:mb-0' : 'my-2';
  const lignes = texte.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lignes.length) {
    const l = lignes[i];

    if (!l.trim()) { i++; continue; }

    // Filet
    if (/^---+$/.test(l.trim())) {
      out.push(<hr key={i} className="my-4 border-brand-border dark:border-dark-sec-border" />);
      i++; continue;
    }

    // Titres
    const titre = l.match(/^(#{1,4})\s+(.*)$/);
    if (titre) {
      const n = titre[1].length;
      const taille = ['text-lg', 'text-sm', 'text-sm', 'text-sm'][n - 1];
      out.push(
        <p key={i} className={`${taille} font-bold ${message ? '' : 'text-brand-main dark:text-white'} mt-4 mb-1.5 first:mt-0`}>
          {inline(titre[2], `h${i}`, variante)}
        </p>,
      );
      i++; continue;
    }

    // Bloc de code
    if (l.startsWith('```')) {
      const debut = ++i;
      while (i < lignes.length && !lignes[i].startsWith('```')) i++;
      out.push(
        <pre key={debut} className="my-2 p-3 rounded-lg bg-brand-light dark:bg-dark-sec-bg overflow-x-auto text-micro font-mono leading-relaxed">
          {lignes.slice(debut, i).join('\n')}
        </pre>,
      );
      i++; continue;
    }

    // Tableau : une ligne d'en-tête, une ligne de tirets, puis le corps.
    if (l.trim().startsWith('|') && /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(lignes[i + 1] ?? '')) {
      const debut = i;
      const entete = cellules(l);
      i += 2;
      const corps: string[][] = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) corps.push(cellules(lignes[i++]));
      out.push(
        <Tableau
          key={`t${debut}`}
          className="my-3"
          entete={entete.map((c, k) => inline(c, `th${debut}${k}`, variante))}
          lignes={corps.map((r, k) => r.map((c, j) => <span key={j} className={couleur}>{inline(c, `td${debut}${k}${j}`, variante)}</span>))}
        />,
      );
      continue;
    }

    // Citation
    if (l.startsWith('>')) {
      const debut = i;
      const bloc: string[] = [];
      while (i < lignes.length && lignes[i].startsWith('>')) bloc.push(lignes[i++].replace(/^>\s?/, ''));
      out.push(
        <blockquote key={debut} className="my-3 pl-3 border-l-2 border-brand-main/30 dark:border-dark-text/25 text-brand-main/70 dark:text-dark-text/65 text-sm">
          {inline(bloc.join(' '), `q${debut}`, variante)}
        </blockquote>,
      );
      continue;
    }

    // Liste
    if (LISTE.test(l)) {
      const debut = i;
      const items: Array<{ puce: string; texte: string }> = [];
      while (i < lignes.length && LISTE.test(lignes[i])) {
        const puce = lignes[i].match(LISTE)![1];
        items.push({ puce: /\d/.test(puce) && message ? puce : '·', texte: lignes[i++].replace(LISTE, '') });
      }
      out.push(
        <ul key={debut} className={`${marge} space-y-1 text-sm`}>
          {items.map((t, k) => (
            <li key={k} className={`flex gap-2 ${couleur}`}>
              <span className="text-brand-main/35 dark:text-dark-text/30 select-none">{t.puce}</span>
              <span>{inline(t.texte, `li${debut}${k}`, variante)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraphe : les lignes contiguës. Un document les rejoint, un message
    // garde ses retours à la ligne.
    const debut = i;
    const para: string[] = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,4}\s|>|\||```|---+$)/.test(lignes[i]) && !LISTE.test(lignes[i])) {
      para.push(lignes[i++].trim());
    }
    out.push(
      <p key={debut} className={`${marge} text-sm leading-relaxed ${couleur}`}>
        {message
          ? para.map((ligne, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(ligne, `p${debut}${k}`, variante)}</React.Fragment>)
          : inline(para.join(' '), `p${debut}`, variante)}
      </p>,
    );
  }

  return <div>{out}</div>;
};

export default Markdown;
