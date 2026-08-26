import type { Meta } from './types.ts';

/**
 * Parseur de frontmatter YAML, volontairement partiel et sans dépendance.
 *
 * Il couvre exactement ce que le corpus emploie : des scalaires, des booléens,
 * des nombres, et des listes en ligne `[a, b]`. Tout le reste est rendu en
 * chaîne. Une forme non reconnue ne fait pas échouer la lecture — elle passe
 * telle quelle : un corpus ne doit pas cesser d'être lisible parce qu'une
 * ligne de métadonnée est mal formée.
 */
export function separerFrontmatter(brut: string): { meta: Meta; corps: string } {
  const texte = brut.replace(/^﻿/, '');
  if (!texte.startsWith('---')) return { meta: {}, corps: texte.trim() };

  const fin = texte.indexOf('\n---', 3);
  if (fin === -1) return { meta: {}, corps: texte.trim() };

  const bloc = texte.slice(texte.indexOf('\n') + 1, fin);
  const corps = texte.slice(texte.indexOf('\n', fin + 1) + 1).trim();
  return { meta: analyser(bloc), corps };
}

function analyser(bloc: string): Meta {
  const meta: Meta = {};
  for (const ligne of bloc.split('\n')) {
    const nette = ligne.trim();
    if (!nette || nette.startsWith('#')) continue;
    const sep = nette.indexOf(':');
    if (sep === -1) continue;
    const cle = nette.slice(0, sep).trim();
    const valeur = nette.slice(sep + 1).trim();
    if (!cle) continue;
    meta[cle] = convertir(valeur);
  }
  return meta;
}

function convertir(v: string): unknown {
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\[.*\]$/.test(v)) {
    return v
      .slice(1, -1)
      .split(',')
      .map((x) => x.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return v.replace(/^["']|["']$/g, '');
}
