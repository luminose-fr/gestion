# Workflows

`deploiement.yml` — **le déploiement Cloudflare**, à la demande.

Créé le 27/08/2026. Le déploiement exigeait un accès à la VM Ubuntu : corriger une ligne
du corpus depuis un téléphone était donc impossible — on pouvait commiter, pas publier.
Ce workflow ouvre la deuxième moitié du geste, sans rien déclencher tout seul.

Il **appelle** `scripts/deploy.sh` plutôt que de le réécrire en YAML. Un déploiement décrit
à deux endroits diverge, et c'est le chemin le moins emprunté qui devient faux.

Secrets requis (Settings → Secrets and variables → Actions) : `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`. Les secrets d'exécution du Worker vivent chez Cloudflare et ne
passent pas par ici.

---

`deploy.yml.disabled` — ancien déploiement vers GitHub Pages.

Désactivé le 20/08/2026 : `gestion.luminose.fr` est désormais servi par
Cloudflare Pages, et le Worker capte `/api/*` sur cette même origine (SPEC §1.2).
Laisser le workflow actif publierait à chaque push sur une branche `gh-pages`
que plus rien ne consulte — deux déploiements qui se croisent sans se rencontrer.

Le déploiement se fait maintenant par `./scripts/deploy.sh` (Worker puis front).
Conservé plutôt que supprimé : il documente d'où l'on vient, et il resterait le
chemin de repli si l'on devait revenir à GitHub Pages.
