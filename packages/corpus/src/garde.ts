import { separerFrontmatter } from './frontmatter.ts';

/**
 * Les statuts que le composeur sait interpréter.
 *
 * Un seul propriétaire, trois usages : la garde d'écriture de la console et
 * celle du serveur MCP refusent tout ce qui n'est pas dans cette liste, et
 * l'écran Carte la documente sans la recopier. Un septième statut ajouté ici
 * apparaît partout le même jour.
 */
export const STATUTS = ['actif', 'active', 'suspendu', 'termine', 'candidat', 'volontairement-absent'] as const;

/**
 * Ce qu'on refuse de commiter, d'où que vienne l'écriture.
 *
 * Un frontmatter cassé ne fait échouer aucun test et ne lève aucune erreur :
 * le parseur est tolérant par conception, donc le document part dans les
 * prompts amputé de son statut. `statut: actiff` rendrait Le Seuil proposable
 * sans que rien ne l'annonce. On vérifie avant que ce soit dans l'histoire du
 * dépôt — et à un seul endroit, pour que la console et le serveur MCP ne
 * divergent pas sur ce qui est acceptable.
 *
 * Rend la raison du refus, en clair, ou `null`.
 */
export function refusDeContenu(contenu: string): string | null {
  const { meta, corps } = separerFrontmatter(contenu);

  if (!contenu.trimStart().startsWith('---')) {
    return 'Le frontmatter a disparu — le fichier doit commencer par une ligne « --- ».';
  }
  if (!corps.trim()) {
    return 'Le corps est vide : il ne resterait que des métadonnées.';
  }
  if (!/^#\s+\S/m.test(corps)) {
    return 'Aucun titre « # … » dans le corps — c\'est lui qui nomme la fiche dans les écrans et les prompts.';
  }
  const statut = meta.statut;
  if (statut !== undefined && !(STATUTS as readonly string[]).includes(String(statut))) {
    return `Statut « ${statut} » inconnu. Attendus : ${STATUTS.join(', ')}.`;
  }
  return null;
}
