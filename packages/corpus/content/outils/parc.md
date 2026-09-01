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
| Transcription et sous-titrage | Whisper (sans filtre particulier — ce fonctionnement convient) |

> Les deux encaissements coexistent : ni « Stripe » ni « Stancer » seuls n'étaient exacts.

## Google Ads — état au 25/08/2026

**Deux campagnes actives uniquement**, vers `luminose.fr`, sur les **séances individuelles**,
à **10 € / jour**. Tout le reste est en pause ou supprimé.

Les campagnes visent les séances individuelles : **80 €** pour une séance simple, **140 €**
pour le breathwork. **Les valeurs de conversion des trackers sont à jour** (confirmé le
25/08/2026) — l'ancienne valeur de 1 470 €, héritée du Seuil, ne s'applique plus.

## Préférence technique

Déclencheurs GTM basés sur des attributs **`data-track`** plutôt que sur des sélecteurs CSS
fragiles.

## Écartés ou explorés sans suite

Matomo (écarté). Explorés : AddingWell, GTM server-side, Fly.io, AWS, Umami, Mixpanel.

## Ce qui ne charge rien du corpus

Transcription, sous-titrage, automatisation, questions d'outillage : **zéro contexte
Luminose**. Une absence de besoin est une information.
