/**
 * Le dossier privé de l'import (SPEC §14.9.1) : un seul, pour tout ce que
 * l'outil produit — l'export, le fichier SQL, le rapport, les fichiers
 * temporaires, et la base locale elle-même.
 *
 * **Jamais dans un arbre git**, quel qu'il soit. Le dossier du dépôt est
 * partagé entre plusieurs machines et ouvert à des sessions d'agents : une base
 * rangée sous `workers/api/.wrangler/` y serait lisible, ignorée de git ou non.
 * `.gitignore` ne protège de rien ; c'est le refus du chemin qui protège.
 *
 * Le chemin est résolu dans sa forme RÉELLE, liens symboliques suivis : un
 * lien posé hors du dépôt qui y mène est refusé comme le dépôt lui-même. Chaque
 * sortie repasse par `cheminPrive`, qui refait la vérification : un nom de
 * fichier qui serait lui-même un lien vers le dépôt est refusé aussi.
 */
import { existsSync, mkdirSync, realpathSync, chmodSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

/** Par défaut : un dossier du poste, hors de tout dépôt. */
export const DOSSIER_PAR_DEFAUT = join(homedir(), '.luminose-import');

export class DossierRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DossierRefuse';
  }
}

/**
 * Le chemin réel d'un chemin qui n'existe peut-être pas encore : le plus proche
 * parent qui existe, résolu, puis le reste tel quel.
 */
export const cheminReel = (chemin: string, profondeur = 0): string => {
  const absolu = resolve(chemin);
  if (existsSync(absolu)) return realpathSync(absolu);
  // Un lien qui ne mène encore à rien (sa cible n'existe pas) : on suit sa cible quand même.
  if (profondeur < 40 && lstatSync(absolu, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return cheminReel(resolve(dirname(absolu), readlinkSync(absolu)), profondeur + 1);
  }
  const parent = dirname(absolu);
  if (parent === absolu) return absolu;
  return join(cheminReel(parent, profondeur), basename(absolu));
};

/** Le dépôt git qui contient ce chemin réel, s'il y en a un (un `.git`, dossier ou fichier de worktree). */
export const arbreGit = (cheminReelAbsolu: string): string | null => {
  let courant = cheminReelAbsolu;
  for (;;) {
    if (existsSync(join(courant, '.git'))) return courant;
    const parent = dirname(courant);
    if (parent === courant) return null;
    courant = parent;
  }
};

const refuserSiGit = (reel: string, demande: string) => {
  const arbre = arbreGit(reel);
  if (arbre) {
    throw new DossierRefuse(
      `Refusé : « ${demande} » est dans un arbre git (${arbre}). Les fichiers de l'import contiennent des données ` +
      'réelles : ils vivent hors de tout dépôt. Choisir un dossier privé du poste, par exemple ~/.luminose-import.',
    );
  }
};

/**
 * Le dossier privé, créé s'il manque, avec des droits réservés à l'utilisateur.
 * Rend son chemin réel. Refuse tout dossier situé dans un arbre git.
 */
export const dossierPrive = (demande: string = DOSSIER_PAR_DEFAUT): string => {
  const absolu = resolve(demande);
  refuserSiGit(cheminReel(absolu), demande);
  mkdirSync(absolu, { recursive: true, mode: 0o700 });
  const reel = realpathSync(absolu);
  // Vérifié une seconde fois sur le chemin créé : rien ne doit avoir changé entre-temps.
  refuserSiGit(reel, demande);
  if (!statSync(reel).isDirectory()) throw new DossierRefuse(`« ${demande} » n'est pas un dossier.`);
  chmodSync(reel, 0o700);
  return reel;
};

/** Une sortie dans le dossier privé : vérifiée à son tour, liens symboliques compris. */
export const cheminPrive = (dossier: string, nom: string): string => {
  if (nom.includes('/') || nom.includes('\\') || nom === '..' || nom === '.') {
    throw new DossierRefuse(`« ${nom} » : un nom de fichier, pas un chemin.`);
  }
  const chemin = join(dossierPrive(dossier), nom);
  refuserSiGit(cheminReel(chemin), chemin);
  return chemin;
};
