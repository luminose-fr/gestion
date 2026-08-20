# Workflows

`deploy.yml.disabled` — ancien déploiement vers GitHub Pages.

Désactivé le 20/08/2026 : `gestion.luminose.fr` est désormais servi par
Cloudflare Pages, et le Worker capte `/api/*` sur cette même origine (SPEC §1.2).
Laisser le workflow actif publierait à chaque push sur une branche `gh-pages`
que plus rien ne consulte — deux déploiements qui se croisent sans se rencontrer.

Le déploiement se fait maintenant par `./scripts/deploy.sh` (Worker puis front).
Conservé plutôt que supprimé : il documente d'où l'on vient, et il resterait le
chemin de repli si l'on devait revenir à GitHub Pages.
