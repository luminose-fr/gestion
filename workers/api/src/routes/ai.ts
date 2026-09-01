/**
 * Routes IA (SPEC §3.5).
 *
 * Le front envoie un IDENTIFIANT DE MODÈLE, jamais un fournisseur. Le Worker
 * lit la ligne du catalogue, prend sa colonne `provider` comme clé de routage
 * et instancie l'adaptateur correspondant.
 *
 * Conséquence : faire passer un modèle de 1min.ai à un accès direct se fait en
 * changeant une valeur en base, sans toucher au code ni redéployer le front.
 */
import { Hono, type Context } from 'hono';
import { getProvider, PROVIDER_IDS, type AIProvider, type UsageIA } from '@luminose/ai';
import { ChatRequestSchema, TestModelSchema, type ChatRequestInput } from '@luminose/shared';
import { composerFeuille } from '@luminose/corpus';
import { feuillePour } from '@luminose/editorial';
import { DOCUMENTS } from '../genere/corpus';
import type { Env } from '../env';
import { Refus } from '../refus';
import { rowToModel, newId, now } from '../db';
import { resolveApiKey } from '../keys';

export const ai = new Hono<{ Bindings: Env }>();

/**
 * Résout un adaptateur : d'abord son existence, ensuite sa clé. Inverser les
 * deux produirait un message trompeur pour un fournisseur inconnu — le
 * problème serait alors qu'aucun adaptateur ne porte ce nom, pas qu'une clé
 * manque.
 *
 * 1 requête (la clé posée en base) ; l'environnement sert de repli.
 */
const resolve = async (providerId: string, env: Env): Promise<AIProvider> => {
  if (!PROVIDER_IDS.includes(providerId)) {
    // La ligne du modèle nomme un adaptateur que le code ne connaît pas :
    // l'état stocké contredit ce qui est servi, d'où 409 plutôt que 400 —
    // rien à corriger dans la requête, tout à corriger dans le catalogue.
    throw new Refus(
      `Fournisseur inconnu : « ${providerId} ». Connus : ${PROVIDER_IDS.join(', ')}.`,
      409,
    );
  }

  const apiKey = await resolveApiKey(env, providerId);
  if (!apiKey) {
    throw new Refus(
      `Aucune clé configurée pour le fournisseur « ${providerId} ». ` +
      `Renseignez-la dans Réglages → Fournisseurs.`,
      409,
    );
  }
  return getProvider(providerId, { apiKey });
};

/** 1 requête : la ligne du modèle. */
export const loadModel = async (env: Env, id: string) => {
  const row = await env.DB
    .prepare('SELECT * FROM ai_models WHERE id = ? AND deleted_at IS NULL')
    .bind(id).first();
  return row ? rowToModel(row) : null;
};

/**
 * La « feuille de salle » d'un rôle — ce qu'il doit savoir de Luminose.
 *
 * Elle est ajoutée ICI, en aval de `buildSystemPrompt`, et jamais dans
 * `packages/editorial`. La raison est mécanique : les fixtures golden
 * photographient ce que la composition produit. Si la feuille y entrait, les
 * dix-neuf fixtures changeraient à chaque modification du corpus — et la règle
 * n°5 du CLAUDE.md, « la revue du diff de fixture EST la revue du changement »,
 * deviendrait du bruit qu'on valide sans lire.
 *
 * Second effet, celui du §3.5.1 : `/api/ai/chat` est le passage obligé des neuf
 * actions. Neuf appelants qui doivent chacun penser à joindre la feuille, c'est
 * neuf occasions d'oublier ; un seul passage, c'est zéro.
 *
 * Zéro requête D1 : le corpus est une constante du bundle.
 */
const prefixerFeuille = (
  action: string | undefined,
  system: string | undefined,
): { system: string | undefined; car: number } => {
  if (!action) return { system, car: 0 };
  const chemins = feuillePour(action);
  if (!chemins) return { system, car: 0 };   // ce rôle ne reçoit rien — décision, pas oubli
  const date = new Date().toISOString().slice(0, 10);
  const { texte } = composerFeuille(DOCUMENTS, chemins, date);
  if (!texte) return { system, car: 0 };
  return { system: system ? `${texte}\n---\n\n${system}` : texte, car: texte.length };
};

/**
 * Écrit la mesure de l'appel : jetons, durée, issue.
 *
 * ICI, et pas chez les appelants, pour la raison qui vaut déjà pour la feuille
 * de salle et pour le signalement des échecs (§3.5.1) : neuf actions qui
 * doivent chacune penser à se mesurer, c'est neuf occasions d'oublier ; un
 * seul passage, c'est zéro. Le Coach, qui n'écrit jamais dans `generations`,
 * se trouve mesuré sans avoir rien à faire — et c'était précisément le trou.
 *
 * Deux garanties, et la seconde compte davantage que la première :
 *   - l'appel n'attend pas sa propre mesure (`waitUntil`) ;
 *   - une mesure qui échoue ne fait échouer personne. Une fonctionnalité en
 *     plus ne doit jamais pouvoir emporter celles d'avant — c'est ce que
 *     garantit déjà le test du jeton GitHub, et ça vaut ici mot pour mot.
 */
const consigner = (
  c: Context<{ Bindings: Env }>,
  m: {
    input: ChatRequestInput;
    model: { id: string; name: string; provider: string };
    feuilleCar: number;
    dureeMs: number;
    /** `null` pour un échec : le fournisseur n'a rien déclaré. */
    usage: UsageIA | null;
    ok: boolean;
    erreur: string | null;
  },
) => {
  // UN seul try, et il couvre tout : la base peut refuser à la préparation
  // (synchrone, elle échapperait au `.then`), et `executionCtx` n'existe pas
  // hors du runtime Workers — les tests appellent `app.fetch(request, env)`
  // sans lui. Dans ce dernier cas l'écriture est déjà partie quand la réserve
  // de temps échoue : personne ne l'attend, et c'est exactement ce qu'on veut.
  try {
    const ecriture = c.env.DB.prepare(
      `INSERT INTO mesures_ia (id, action, format, model_id, model_label, provider,
                               prompt_tokens, completion_tokens, cost_usd,
                               duree_ms, feuille_car, ok, erreur, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId(), m.input.action ?? null, m.input.format ?? null,
      m.model.id, m.model.name, m.model.provider,
      m.usage?.entree ?? null, m.usage?.sortie ?? null, m.usage?.coutUsd ?? null,
      m.dureeMs, m.feuilleCar, m.ok ? 1 : 0, m.erreur, now(),
    ).run().then(() => undefined, () => undefined);

    c.executionCtx.waitUntil(ecriture);
  } catch {
    /* mesurer ne doit jamais coûter un appel : une mesure perdue est perdue */
  }
};

ai.post('/chat', async (c) => {
  const input = ChatRequestSchema.parse(await c.req.json());

  const model = await loadModel(c.env, input.modelId);
  if (!model) return c.json({ error: 'Modèle introuvable dans le catalogue' }, 404);

  // L'ordre compte : on valide d'abord que l'adaptateur existe (voir resolve)
  const provider = await resolve(model.provider, c.env);

  const { system, car: feuilleCar } = prefixerFeuille(input.action, input.system);
  const depart = Date.now();

  let result;
  try {
    result = await provider.chat({
      model: model.apiCode,
      system,
      messages: input.messages,
      json: input.json,
    });
  } catch (e: any) {
    const message = e?.message ?? 'Le fournisseur IA n’a pas répondu.';
    // L'échec se mesure comme le succès, et c'est tout l'intérêt : un appel qui
    // meurt au bout de cinq minutes ne produit rien, donc n'apparaît nulle part
    // ailleurs. C'est pourtant la seule trace qui montrera une reprise en train
    // de doubler une attente.
    consigner(c, {
      input, model, feuilleCar, dureeMs: Date.now() - depart,
      usage: null, ok: false, erreur: message,
    });
    // Une panne du fournisseur n'est pas une panne du Worker : 502, et son
    // message EN CLAIR. Passer par le gestionnaire générique le reléguerait
    // dans `detail`, et le front afficherait « Erreur interne » là où le
    // fournisseur disait précisément ce qui manquait (crédits, quota, modèle
    // retiré). C'est la différence entre un diagnostic et une devinette.
    return c.json({ error: message }, 502);
  }

  consigner(c, {
    input, model, feuilleCar, dureeMs: Date.now() - depart,
    usage: result.usage, ok: true, erreur: null,
  });

  // `raw` reste au Worker : le front n'a que faire de la forme du fournisseur,
  // et la lui exposer inviterait à s'y accrocher. Le DÉCOMPTE, lui, remonte :
  // c'est le front qui journalise la production, donc lui qui doit pouvoir y
  // attacher ce qu'elle a coûté (SPEC §2.6).
  return c.json({ text: result.text, modelLabel: model.name, usage: result.usage });
});

/**
 * Vérifie qu'un code d'API répond réellement, au coût le plus bas (SPEC §5.4).
 *
 * Il porte sur un CODE, pas sur un modèle du catalogue : le testeur sert
 * précisément à valider avant d'enregistrer. C'est l'adaptateur du fournisseur
 * qui sait comment sonder son API — le test est devenu générique.
 */
ai.post('/test', async (c) => {
  const { apiCode, provider } = TestModelSchema.parse(await c.req.json());
  const adaptateur = await resolve(provider, c.env);
  return c.json(await adaptateur.test(apiCode));
});
