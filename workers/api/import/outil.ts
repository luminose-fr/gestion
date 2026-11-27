/**
 * L'outil d'import de Notion (SPEC §14.9.1) — en LOCAL, sur le poste de Florent.
 *
 *   npm run import -w workers/api -- exporter      lire Notion → export.json
 *   npm run import -w workers/api -- preparer      export.json → import.sql et rapport.md
 *   npm run import -w workers/api -- appliquer     import.sql → la base locale du dossier privé
 *   npm run import -w workers/api -- verifier      l'export contre la base, champ par champ
 *   npm run import -w workers/api -- voir          l'API locale sur cette base (wrangler dev)
 *   npm run import -w workers/api -- detruire --oui   effacer le dossier privé
 *
 * Option commune : `--dossier <chemin>` (par défaut ~/.luminose-import). Tout
 * ce que l'outil produit vit là, et nulle part ailleurs ; un dossier situé
 * dans un arbre git est refusé. Il n'existe AUCUNE option pour viser une base
 * distante : `--remote` est refusé, et rien ne le compose.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cheminPrive, dossierPrive, DOSSIER_PAR_DEFAUT } from './prive.ts';
import { exporter } from './notion.ts';
import { transformer, rapportEnTexte, type Transformation } from './transformer.ts';
import { enSql, disparues, lignesImportees } from './ecrire.ts';
import { appliquer, lireBase, argsLocaux, environnementSansReseau } from './appliquer.ts';
import { comparer, ecartsEnTexte } from './verifier.ts';
import { DOSSIER_API } from '../essai/cible.ts';
import type { Export } from './lire.ts';

const COMMANDES = ['exporter', 'preparer', 'appliquer', 'verifier', 'voir', 'detruire'] as const;
type Commande = (typeof COMMANDES)[number];

export const lireArguments = (args: string[]): { commande: Commande; dossier: string; oui: boolean } => {
  if (args.some((a) => a === '--remote' || a.startsWith('--remote=') || a === '--env' || a.startsWith('--env='))) {
    throw new Error('Refusé : l’import n’écrit que dans la base locale du dossier privé. Aucune option ne vise une autre base.');
  }
  const commande = args[0] as Commande;
  if (!COMMANDES.includes(commande)) throw new Error(`Commande attendue : ${COMMANDES.join(', ')}.`);
  const i = args.indexOf('--dossier');
  const dossier = i >= 0 ? args[i + 1] : DOSSIER_PAR_DEFAUT;
  if (!dossier) throw new Error('--dossier attend un chemin.');
  return { commande, dossier, oui: args.includes('--oui') };
};

const lireExport = (dossier: string): Export => JSON.parse(readFileSync(cheminPrive(dossier, 'export.json'), 'utf8'));

/** Prépare l'import : le SQL et le rapport, dans le dossier privé. Rend la transformation. */
export const preparer = (dossier: string, maintenant: number): Transformation => {
  const exp = lireExport(dossier);
  const t = transformer(exp, maintenant);
  const precedentes = cheminPrive(dossier, 'importees.json');
  if (existsSync(precedentes)) t.rapport.disparues.push(...disparues(JSON.parse(readFileSync(precedentes, 'utf8')), t));
  writeFileSync(cheminPrive(dossier, 'import.sql'), enSql(t), { mode: 0o600 });
  writeFileSync(cheminPrive(dossier, 'rapport.md'), rapportEnTexte(t.rapport), { mode: 0o600 });
  writeFileSync(cheminPrive(dossier, '.transformation.json'), JSON.stringify(lignesImportees(t)), { mode: 0o600 });
  return t;
};

const principal = async (args: string[]) => {
  const { commande, dossier: demande, oui } = lireArguments(args);
  const dossier = dossierPrive(demande);
  switch (commande) {
    case 'exporter': {
      const cle = process.env.NOTION_API_KEY;
      if (!cle) throw new Error('NOTION_API_KEY manque dans l’environnement du poste.');
      const configuration = cheminPrive(dossier, 'config.json');
      if (!existsSync(configuration)) {
        throw new Error(`La configuration manque : copier import/config.modele.json vers ${configuration} et y poser les identifiants des quatre bases.`);
      }
      const { bases } = JSON.parse(readFileSync(configuration, 'utf8'));
      const fichier = await exporter({ cle, bases }, dossier, new Date().toISOString());
      console.log(`Export écrit : ${fichier}`);
      break;
    }
    case 'preparer': {
      const t = preparer(dossier, Date.now());
      const n = Object.values(t.lignes).reduce((s, l) => s + l.length, 0);
      console.log(`${n} lignes préparées. SQL : ${cheminPrive(dossier, 'import.sql')}\nÀ lire : ${cheminPrive(dossier, 'rapport.md')}`);
      break;
    }
    case 'appliquer': {
      appliquer(dossier, 'import.sql');
      // La liste de ce qui a été écrit sert à l'import suivant : ce qui disparaîtra de Notion sera listé.
      writeFileSync(cheminPrive(dossier, 'importees.json'), readFileSync(cheminPrive(dossier, '.transformation.json'), 'utf8'), { mode: 0o600 });
      console.log('Appliqué à la base locale du dossier privé.');
      break;
    }
    case 'verifier': {
      const exp = lireExport(dossier);
      const t = transformer(exp, Date.now());
      const ecarts = comparer(t, exp, lireBase(dossier), Date.now());
      console.log(ecartsEnTexte(ecarts));
      if (ecarts.length) process.exitCode = 1;
      break;
    }
    case 'voir': {
      // Les deux bases locales dans le dossier privé : l'éditoriale y est vide, celle des clients porte l'import.
      const env = environnementSansReseau();
      spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', ...argsLocaux(dossier)], { cwd: DOSSIER_API, stdio: 'inherit', env });
      spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'CLIENTS', ...argsLocaux(dossier)], { cwd: DOSSIER_API, stdio: 'inherit', env });
      const devArgs = argsLocaux(dossier).filter((a) => a !== '--local');
      spawnSync('npx', ['wrangler', 'dev', ...devArgs], { cwd: DOSSIER_API, stdio: 'inherit', env });
      break;
    }
    case 'detruire': {
      if (!oui) throw new Error(`Ajouter --oui pour effacer ${dossier} et tout ce qu’il contient (export, SQL, rapport, base locale).`);
      rmSync(dossier, { recursive: true, force: true });
      console.log(`Effacé : ${dossier}`);
      break;
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  principal(process.argv.slice(2)).catch((err) => {
    // Le message seul : une trace pourrait citer une valeur lue dans l'export.
    console.error(err instanceof Error ? err.message : 'Erreur.');
    process.exitCode = 1;
  });
}
