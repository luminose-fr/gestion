---
type: fact
statut: actif
revu: 2026-08
expose: prive
---

# Parc d'outils

| Domaine | Outil |
| :--- | :--- |
| Rendez-vous | Calendly |
| Encaissement — **séances individuelles** | **Stancer** |
| Encaissement — **stages en groupe** | **Stripe** |
| Base de données de clients et séances | Notion |
| Automatisation | Make |
| Programmation réseaux sociaux | Publer |
| Mesure | Mixpanel (via Google Tag Manager) |
| Site | Jekyll sur GitHub Pages `www.luminose.fr` |
| Production éditoriale | `gestion.luminose.fr` |
| Publicité | Google Ads — son état et ses valeurs de conversion vivent dans `../canaux/google-ads.md` |
| Transcription et sous-titrage | Whisper (sans filtre particulier — ce fonctionnement convient) |

> Les deux encaissements coexistent : ni « Stripe » ni « Stancer » seuls n'étaient exacts.
>
> **Ce fichier fait foi sur le prestataire d'encaissement.** Les deux noms sont repris dans
> `../socle/offres/seance-individuelle.md` et `../socle/offres/breathwork-groupe.md` : un
> changement de prestataire se répercute dans les trois.

## Préférence technique

Déclencheurs GTM basés sur des attributs **`data-track`** plutôt que sur des sélecteurs CSS
fragiles.

## Écartés ou explorés sans suite

Matomo (écarté). Explorés : AddingWell, GTM server-side, Fly.io, AWS, Umami, Mixpanel.

## Ce qui ne charge rien du corpus

Transcription, sous-titrage, automatisation, questions d'outillage : **zéro contexte
Luminose**. Une absence de besoin est une information.
