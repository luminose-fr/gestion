/**
 * Substitut de `cloudflare:workers` pour vitest, qui tourne sous Node : ce
 * module n'existe que dans workerd (vitest.config.ts l'aliase ici).
 *
 * Une classe minimale suffit : les entrées nommées de gestion n'en attendent
 * que `ctx` et `env`, posés par le constructeur comme le fait workerd. Le
 * routage d'une liaison de service vers une entrée, lui, ne se voit qu'en
 * recette (SPEC §14.10) : ce substitut ne prétend pas l'imiter.
 */
export class WorkerEntrypoint<Env = unknown> {
  protected ctx: ExecutionContext;
  protected env: Env;
  constructor(ctx: ExecutionContext, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
