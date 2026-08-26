/**
 * Rendu markdown minimal, sans dépendance.
 *
 * Il couvre exactement ce que le corpus emploie — titres, gras, code, listes,
 * tableaux, citations, filets — et rien de plus. Ajouter une bibliothèque pour
 * lire vingt-six fiches internes serait payer une dépendance pour un besoin
 * borné et stable.
 *
 * Ce qu'il ne sait pas faire, il le rend **tel quel** plutôt que de l'avaler :
 * un lecteur doit voir la syntaxe brute d'une forme non reconnue, pas un trou.
 */
import React from 'react';

const inline = (texte: string, cle: string): React.ReactNode[] =>
  texte
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={`${cle}-${i}`} className="font-semibold text-brand-main dark:text-white">{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        return (
          <code key={`${cle}-${i}`} className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-brand-light dark:bg-dark-sec-bg">
            {p.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={`${cle}-${i}`}>{p}</React.Fragment>;
    });

const cellules = (ligne: string) =>
  ligne.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export const Markdown: React.FC<{ texte: string }> = ({ texte }) => {
  const lignes = texte.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lignes.length) {
    const l = lignes[i];

    if (!l.trim()) { i++; continue; }

    // Filet
    if (/^---+$/.test(l.trim())) {
      out.push(<hr key={i} className="my-4 border-brand-light dark:border-dark-sec-bg" />);
      i++; continue;
    }

    // Titres
    const titre = l.match(/^(#{1,4})\s+(.*)$/);
    if (titre) {
      const n = titre[1].length;
      const taille = ['text-lg', 'text-base', 'text-sm', 'text-sm'][n - 1];
      out.push(
        <p key={i} className={`${taille} font-bold text-brand-main dark:text-white mt-4 mb-1.5 first:mt-0`}>
          {inline(titre[2], `h${i}`)}
        </p>,
      );
      i++; continue;
    }

    // Bloc de code
    if (l.startsWith('```')) {
      const debut = ++i;
      while (i < lignes.length && !lignes[i].startsWith('```')) i++;
      out.push(
        <pre key={debut} className="my-2 p-3 rounded-lg bg-brand-light dark:bg-dark-sec-bg overflow-x-auto text-[11px] font-mono leading-relaxed">
          {lignes.slice(debut, i).join('\n')}
        </pre>,
      );
      i++; continue;
    }

    // Tableau
    if (l.trim().startsWith('|') && lignes[i + 1]?.includes('--')) {
      const entete = cellules(l);
      i += 2;
      const corps: string[][] = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) corps.push(cellules(lignes[i++]));
      out.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-brand-main/50 dark:text-dark-text/40">
                {entete.map((c, k) => <th key={k} className="text-left font-semibold pb-1.5 pr-3">{inline(c, `th${k}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {corps.map((r, k) => (
                <tr key={k} className="border-t border-brand-light dark:border-dark-sec-bg">
                  {r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top text-brand-main/80 dark:text-dark-text/75">{inline(c, `td${k}${j}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
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
          {inline(bloc.join(' '), `q${debut}`)}
        </blockquote>,
      );
      continue;
    }

    // Liste
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const debut = i;
      const items: string[] = [];
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) {
        items.push(lignes[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      }
      out.push(
        <ul key={debut} className="my-2 space-y-1 text-sm">
          {items.map((t, k) => (
            <li key={k} className="flex gap-2 text-brand-main/80 dark:text-dark-text/75">
              <span className="text-brand-main/35 dark:text-dark-text/30 select-none">·</span>
              <span>{inline(t, `li${debut}${k}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraphe : on agrège les lignes contiguës, le corpus étant enroulé à 90 colonnes.
    const debut = i;
    const para: string[] = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,4}\s|>|\||```|---+$|\s*([-*]|\d+\.)\s)/.test(lignes[i])) {
      para.push(lignes[i++].trim());
    }
    out.push(
      <p key={debut} className="my-2 text-sm leading-relaxed text-brand-main/80 dark:text-dark-text/75">
        {inline(para.join(' '), `p${debut}`)}
      </p>,
    );
  }

  return <div>{out}</div>;
};

export default Markdown;
