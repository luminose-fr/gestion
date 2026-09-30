/**
 * Substitut de `cloudflare:workers` pour vitest. La bibliothèque OAuth ne s'en
 * sert que pour reconnaître les classes qui en héritent ; ce Worker n'en
 * déclare aucune.
 */
export class WorkerEntrypoint {}
