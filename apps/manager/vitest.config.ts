import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config séparée de vite.config.ts : le build de prod n'a pas besoin de React
// en mode test, et on garde les deux fichiers lisibles.
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom seulement là où on monte des composants ; les suites pures et le
    // Worker tournent en environnement node (voir le commentaire en tête de
    // chaque fichier via @vitest-environment).
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,

    /**
     * Node ≥ 25 expose son PROPRE `localStorage` global, et celui-là masque
     * celui que jsdom installe. Les suites d'écran se retrouvent alors avec un
     * objet creux — « localStorage.setItem is not a function » — sur dix-huit
     * tests d'un coup, dont aucun ne parlait de stockage.
     *
     * Le drapeau vit ICI, et pas dans un shell, pour une raison mesurée le
     * 01/09/2026 : le même dépôt tourne sur deux postes, et un correctif posé
     * dans le `.bashrc` de l'un ne suit jamais sur l'autre. Porté par la
     * config, il vaut pour `npm test` comme pour un `npx vitest` lancé à la
     * main dans ce dossier.
     *
     * `pool: 'forks'` est déjà le défaut de Vitest ; on le nomme parce que
     * c'est lui qui donne un sens à `execArgv` — les workers sont alors de
     * vrais processus Node, qui reçoivent le drapeau.
     *
     * `execArgv` est ici À LA RACINE de `test`, et pas sous `poolOptions` :
     * Vitest 4 a supprimé `poolOptions`, et il l'ignore avec un simple
     * avertissement de dépréciation — la config paraissait bonne et ne
     * s'appliquait pas. D'où le test `environnement.test.ts`, qui vérifie que
     * le drapeau atteint réellement le worker : une configuration qui cesse
     * d'agir sans le dire est pire qu'une configuration absente.
     */
    pool: 'forks',
    execArgv: ['--no-experimental-webstorage'],
  },
})
