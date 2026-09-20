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

## Ce qu'on ne remet pas — NORMATIF

**Pas de déploiement déclenché par un push**, et pas de retour vers GitHub Pages.

`gestion.luminose.fr` est servi par Cloudflare Pages, et le Worker capte `/api/*` sur la
même origine (SPEC §1.2). Un workflow qui publierait à chaque push sur une branche
`gh-pages` que plus rien ne consulte, ce serait deux déploiements qui se croisent sans se
rencontrer.

Et l'historique porte des commits d'étape : les publier parce qu'ils touchent `main`
transformerait chaque sauvegarde en mise en ligne.

*Un `deploy.yml.disabled` traînait ici depuis le 20/08/2026, gardé « au cas où ». Supprimé
le 20/09 : un fichier inerte n'est pas un chemin de repli, git l'est. Il visait GitHub
Pages, passait des variables Notion qui n'existent plus, et épinglait Node 20.*
