/**
 * workerd prend chaque export nommé du module principal pour un point d'entrée,
 * et refuse de démarrer le Worker s'il n'en est pas un. `npm run dev:mcp` est
 * tombé ainsi le 09/11/2026, sur `RESSOURCE` puis `OPTIONS` — sans que les tests
 * ni le typecheck ne le voient : c'est ce fichier qui le voit désormais.
 */
import { describe, it, expect } from 'vitest';
import * as pointEntree from '../src/index';

describe('src/index.ts', () => {
  it("n'exporte que le handler par défaut", () => {
    expect(Object.keys(pointEntree)).toEqual(['default']);
  });
});
