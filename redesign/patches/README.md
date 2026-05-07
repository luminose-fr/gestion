# Patches complémentaires pour l'intégration

Ces patches corrigent les 4 écarts détectés après la première passe d'intégration de Claude Code.

## 1. Polices — `font-sans` (Futura LT) et `font-display` (Abril Display)

L'app a déjà ses polices configurées dans `index.css` via `@theme`.
**À demander à Claude Code :** dans tous les composants intégrés, faire la passe :

| Maquette | À remplacer par |
|---|---|
| `font-family: 'Inter', sans-serif` | rien (c'est le défaut `font-sans`) |
| `font-family: 'Lora', Georgia, serif` | `className="font-display"` |
| `style={{fontFamily:"'Lora',Georgia,serif",fontStyle:'italic'}}` | `className="font-display italic"` |

Le **logo "L"** dans le rail de la sidebar : `<span className="font-display italic text-white text-base">L</span>`

## 2. LoginPage — voir `LoginPage.tsx`

Fichier complet prêt à coller en remplacement de `components/LoginPage.tsx`.
- Garde la signature `onLoginSuccess` et l'appel `login(username, password)` depuis `../auth`
- Ajoute : toggle voir/masquer mot de passe, état error en bandeau soft, bouton avec spinner, autoFocus sur identifiant, footer copyright
- Utilise les couleurs du thème (`brand-main`, `brand-light`, `brand-hover`, `dark-*`)

## 3. App.tsx — supprimer le header global

**À demander à Claude Code :**

> Dans `App.tsx`, supprime le header global qui apparaît en haut au-dessus de la sidebar.
> La structure du shell doit être :
>
> ```tsx
> <div className="flex h-screen bg-brand-light dark:bg-dark-bg">
>   <Sidebar ... />
>   <div className="flex-1 flex flex-col overflow-hidden min-w-0">
>     <Header ... />        {/* À l'intérieur de la zone main, pas au-dessus */}
>     <MobileSubTabs ... /> {/* Optionnel, en dessous du Header sur mobile */}
>     <main className="flex-1 overflow-y-auto px-6 py-5">
>       {/* contenu */}
>     </main>
>   </div>
> </div>
> ```
>
> Le Header (avec titre de page, bouton sync Notion, bouton déconnexion, burger mobile) reste en place mais à l'intérieur de la zone main.

## 4. SocialGridView > DraftCard — voir `SocialGridView.DraftCard.snippet.tsx`

Patch chirurgical sur `components/Views/SocialGridView.tsx` :
1. Ajouter `Sparkles` aux imports lucide-react
2. Ajouter `Verdict` aux imports depuis `../../types`
3. Ajouter la constante `VERDICT_STRIPE` (en dehors du composant)
4. Remplacer entièrement le composant `DraftCard`

Ce que ça apporte par rapport à la version actuelle :
- **Bande verticale colorée** à gauche selon `item.verdict`, pilotée par `prefs.showVerdictStripe`
- **Angle stratégique** affiché en italique violet avec icône Sparkles, entre titre et preview
- **Badge profondeur** (`item.depth`) si `prefs.showDepth`, en plus du format

Aucun changement nécessaire dans `ReadyTable` (la table actuelle suit déjà bien le `prefs`).

## Ordre d'intégration suggéré

1. `LoginPage.tsx` (remplacement complet, sûr)
2. `App.tsx` — restructuration du shell (header dans la zone main)
3. `SocialGridView.tsx` — patch DraftCard
4. Passe globale font-display sur les composants intégrés
