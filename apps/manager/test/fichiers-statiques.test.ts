/**
 * Un fichier du dépôt ne se cite pas par un chemin écrit en dur.
 *
 * `fonts/` n'est pas dans `public/` : le build ne copie un fichier — sous un nom
 * haché, dans `/assets/` — que si le CSS ou un `import` le cite. Un chemin
 * `/fonts/…` écrit dans le code marche en développement, où Vite sert tout le
 * dossier, et rend en ligne la page d'accueil en HTML. Le 27/10/2026, l'export
 * vidéo échouait ainsi sur « Invalid font data in ArrayBuffer » ; ni le
 * typecheck ni le développement ne pouvaient le voir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(import.meta.dirname, '..');
const IGNORES = new Set(['node_modules', 'dist', 'test']);

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entree) => {
        if (IGNORES.has(entree)) return [];
        const p = join(dir, entree);
        return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(p) ? [p] : [];
    });

describe('les fichiers statiques', () => {
    it('ne sont jamais cités par un chemin /fonts/… dans le code', () => {
        const fautifs = sources(RACINE)
            .filter(f => /['"`]\/fonts\//.test(readFileSync(f, 'utf8')))
            .map(f => f.replace(RACINE + '/', ''));
        expect(fautifs).toEqual([]);
    });
});
