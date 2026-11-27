/**
 * Fait tourner sous `node` nu un module de `src/` : ses imports relatifs n'ont
 * pas d'extension (le bundler de wrangler les résout), et Node les exige. Ce
 * crochet essaie `.ts`, puis `/index.ts`, avant d'abandonner. Il ne sert qu'aux
 * scripts d'essai (`npm run essai:questionnaire`), jamais au Worker.
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, suivant) {
    try {
      return suivant(specifier, context);
    } catch (erreur) {
      if (!specifier.startsWith('.')) throw erreur;
      for (const suffixe of ['.ts', '/index.ts']) {
        try { return suivant(specifier + suffixe, context); } catch { /* suivant */ }
      }
      throw erreur;
    }
  },
});
