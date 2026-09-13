# voix/

Voix, ton, vocabulaire, interdits de langue, direction artistique.

Chargé par la rédaction, les visuels et les pages du site. Pas par la stratégie.

`regles-de-voix.md` est la **source unique** des règles de voix : `packages/editorial/src/voice.ts`
en est engendré par `npm run embarquer`. Les interdits de langue — les anti-patterns — y
vivent aussi, dans la même fiche : deux listes séparées finiraient par diverger, et c'est la
divergence qu'on essaie d'éliminer.

**Aucune feuille de salle ne sert `regles-de-voix.md`.** Les prompts de rédaction la portent
déjà ; la servir en plus reviendrait à la payer deux fois à chaque appel. Un test NORMATIF
vérifie qu'aucune feuille ne la nomme.

`direction-artistique.md` porte trois sujets et trois traitements, dont une **absence
délibérée** : les illustrations réseaux sociaux n'ont pas de règle, et la ligne qui le dit
existe pour empêcher qu'une IA comble le vide en inventant une charte.
