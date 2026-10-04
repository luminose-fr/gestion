import { describe, expect, it } from 'vitest';
import { charger } from '../src/charger.ts';
import { STATUTS, refusDeContenu } from '../src/garde.ts';

/**
 * La garde d'écriture a deux appelants — la console (workers/api) et le
 * serveur MCP — et un seul propriétaire, ici. Ce qu'elle refuse, elle le
 * refuse pour les deux.
 */
describe('refusDeContenu — ce qu’on refuse de commiter', () => {
  const fiche = (meta: string, corps = '# Titre\n\nDu texte.') => `---\n${meta}\n---\n\n${corps}\n`;

  it('accepte une fiche complète, et chaque statut connu', () => {
    for (const statut of STATUTS) expect(refusDeContenu(fiche(`type: fact\nstatut: ${statut}`)), statut).toBeNull();
    expect(refusDeContenu(fiche('type: fact'))).toBeNull();
  });

  it('refuse un frontmatter disparu, un corps vide, une fiche sans titre, un statut inconnu', () => {
    expect(refusDeContenu('# Titre\n\nDu texte.')).toMatch(/frontmatter a disparu/);
    expect(refusDeContenu(fiche('statut: actif', ''))).toMatch(/corps est vide/);
    expect(refusDeContenu(fiche('statut: actif', 'Du texte sans titre.'))).toMatch(/Aucun titre/);
    expect(refusDeContenu(fiche('statut: actiff'))).toMatch(/Statut « actiff » inconnu/);
  });

  it('chaque fiche du corpus actuel passe la garde', () => {
    // Sinon, la première modification d'une fiche existante serait refusée
    // pour une faute qu'elle n'a pas introduite.
    for (const d of charger()) {
      const meta = Object.entries(d.meta).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : String(v)}`).join('\n');
      expect(refusDeContenu(`---\n${meta}\n---\n\n${d.corps}\n`), d.chemin).toBeNull();
    }
  });
});
