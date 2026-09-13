/**
 * Qui reçoit quoi du corpus — la « feuille de salle » de chaque rôle.
 *
 * **Ce fichier ne contient qu'une table.** Aucune dépendance, aucun accès au
 * corpus : `packages/editorial` compose des chaînes et n'en lit aucune
 * (SPEC §4.1). Le Worker croise cette table avec le corpus embarqué.
 *
 * ── Pourquoi une feuille par rôle, et pas la même pour tous ───────────────
 *
 * Donner tout à tout le monde noierait la consigne. C'est le raisonnement du
 * §6.4, appliqué ailleurs : « sans elle, le prompt croît et finit par noyer la
 * consigne ». Les deux prompts les plus lourds du flux — le carrousel, en
 * rédaction comme en ajustement — approchent déjà 17 000 caractères.
 *
 * ── Où la feuille est ajoutée, et pourquoi pas ici ────────────────────────
 *
 * Elle préfixe le prompt dans `/api/ai/chat`, EN AVAL de `buildSystemPrompt`.
 * Si elle entrait dans la composition, les fixtures golden changeraient à
 * chaque modification du corpus : ajouter un témoignage ferait bouger dix-neuf
 * fichiers de référence, et la règle n°5 du CLAUDE.md — « la revue du diff de
 * fixture EST la revue du changement » — deviendrait du bruit qu'on valide
 * sans lire.
 */

/**
 * Les chemins du corpus servis à chaque action.
 *
 * Un élément est un PRÉFIXE : `'socle'` prend tout le bloc, `'socle/offres'`
 * ne prend que les offres. `null` veut dire « ce rôle ne reçoit rien », et
 * c'est une décision, jamais un trou à combler.
 */
export const FEUILLE_PAR_ACTION: Record<string, string[] | null> = {

    /** Juger si une idée sert quelque chose qui existe encore. */
    ANALYZE_BATCH: ['socle/identite', 'socle/offres'],

    /**
     * Le strict minimum, et pour une raison de coût : la conversation repart
     * ENTIÈRE à chaque tour. Ce que la feuille pèse ici se paie autant de fois
     * qu'il y a de messages.
     */
    COACH_CHAT: ['socle/identite', 'socle/offres'],

    /** Sa liste d'interdits ne doit pas contredire celle qui existe déjà. */
    LOCK_BRIEF: ['socle/identite', 'socle/offres', 'socle/cadre-deontologique', 'voix'],

    /** Le cœur : c'est là que se disent le tarif, le titre, le CTA. */
    DRAFT_CONTENT: ['socle', 'voix', 'canaux'],

    /** La retouche reçoit ce qui a gouverné la production (SPEC §3.5.2, point 3). */
    ADJUST_CONTENT: ['socle', 'voix', 'canaux'],

    /**
     * Le seul rôle qui décide en voyant l'ensemble, donc le seul qui a besoin
     * des décisions passées : ce qui a été arrêté, ce qui n'a pas marché.
     */
    PLAN_SERIES: ['socle', 'voix', 'strategie'],

    /**
     * NE REÇOIT RIEN — et c'est voulu, pas oublié.
     *
     * Le Lecteur froid lit « avec les yeux d'un inconnu ». C'est toute sa
     * valeur : il voit ce qu'un lecteur qui ne connaît pas Luminose ne
     * comprendra pas. Lui donner le positionnement le rendrait moins inconnu,
     * donc moins utile. Décidé le 26/08/2026.
     */
    COLD_READ: null,

    /**
     * REÇOIT LA DIRECTION ARTISTIQUE — décision du 13/09/2026, qui renverse
     * l'essai du 26/08.
     *
     * L'essai disait : « on commence sans, quitte à en ajouter si les images
     * dérivent. » Elles ont dérivé, et de la pire façon — invisible. Privé de
     * feuille, le persona portait sa propre copie de la charte, écrite en dur
     * dans le prompt ; cette copie a vécu sa vie et annonçait comme « palette
     * de marque » deux couleurs qui sont celles du Seuil, une offre suspendue.
     * Tous les carrousels sortaient donc aux couleurs d'une offre qui n'est
     * plus proposée, sans que rien ne le signale.
     *
     * La leçon n'est pas « l'Artiste avait besoin du corpus » : c'est qu'un
     * rôle privé de source s'en fabrique une. Mieux vaut une feuille qu'une
     * copie clandestine.
     */
    GENERATE_CARROUSEL_SLIDES: ['voix/direction-artistique'],
    ADJUST_DZINE_PROMPTS: ['voix/direction-artistique'],

    /** Flux remplacé par le Coach, aucun écran ne le déclenche. */
    GENERATE_INTERVIEW: null,
};

/** Une action existe-t-elle dans la table ? Sert à refuser une route inconnue. */
export const actionConnue = (action: string): boolean =>
    Object.prototype.hasOwnProperty.call(FEUILLE_PAR_ACTION, action);

/**
 * Les chemins servis à une action, ou `null` si elle ne reçoit rien.
 *
 * Le passage par `actionConnue` n'est pas une précaution de style : `action`
 * arrive du client, et `FEUILLE_PAR_ACTION['constructor']` rendait la fonction
 * `Object` — que `?? null` laissait passer, et sur laquelle `composerFeuille`
 * appelait `.some()`. Une chaîne quelconque pouvait donc faire tomber
 * `/api/ai/chat` en 500. Le test le tient maintenant.
 */
export const feuillePour = (action: string): string[] | null =>
    actionConnue(action) ? FEUILLE_PAR_ACTION[action] : null;
