# SocialFlow Manager

SocialFlow Manager est une application web de gestion de contenu pour les réseaux sociaux. Elle centralise vos idées, utilise l'IA (via Puter.js) pour la rédaction, et stocke tout votre travail directement dans Notion.

## 📚 1. Configuration de Notion (OBLIGATOIRE)

Pour que l'application fonctionne, vous devez créer une intégration Notion et deux bases de données avec des noms de colonnes **en français**.

### Étape A : Créer l'intégration
1. Allez sur [Notion My Integrations](https://www.notion.so/my-integrations).
2. Cliquez sur **"New integration"**.
3. Nommez-la (ex: "SocialFlow App").
4. Sélectionnez l'espace de travail associé.
5. Copiez le **"Internal Integration Secret"** (commence par `secret_`). C'est votre `VITE_NOTION_API_KEY`.

### Étape B : Créer la Base de données "Contenu"
Créez une nouvelle base de données Notion (Page vide > Table Database).
Ajoutez les propriétés suivantes **exactement** comme indiqué (respectez les majuscules et les accents) :

| Nom de la propriété | Type | Options (si Select/Multi-select) |
| :--- | :--- | :--- |
| **Titre** | Title | - |
| **Statut** | Select | `Idée`, `Brouillon`, `Prêt`, `Publié` |
| **Plateforme** | Multi-select | `Facebook`, `Instagram`, `LinkedIn`, `Google My Business`, `Youtube`, `Blog`, `Newsletter` |
| **Contenu** | Text | - (Sera le corps du post) |
| **Date de publication** | Date | - (Date de planification) |
| **Notes** | Text | - (Notes internes ou mémo) |

*Note : Récupérez l'ID de cette base de données depuis l'URL (la partie après le `/` et avant le `?`). Ce sera votre `VITE_NOTION_CONTENT_DB_ID`.*

### Étape C : Créer la Base de données "Contextes IA"
Cette base stocke vos différentes "voix" ou personnalités pour l'IA (ex: "LinkedIn Sérieux", "Instagram Fun").

Créez une seconde base de données avec ces propriétés :

| Nom de la propriété | Type | Description |
| :--- | :--- | :--- |
| **Nom** | Title | Le nom du contexte (ex: "Expert Tech") |
| **Description** | Text | Le prompt système pour l'IA (ex: "Tu es un expert concis...") |

*Note : Récupérez l'ID de cette base de données. Ce sera votre `VITE_NOTION_CONTEXT_DB_ID`.*

### Étape D : Connecter l'intégration
**Important :** Par défaut, votre intégration n'a accès à rien.
1. Allez sur la page de votre base de données "Contenu".
2. Cliquez sur les **...** en haut à droite > **Connections** > Ajoutez votre intégration "SocialFlow App".
3. Répétez l'opération pour la base de données "Contextes IA".

---

## 🛠️ 2. Installation et Lancement Local

### Prérequis
- [Node.js](https://nodejs.org/) installé (version 18 ou supérieure recommandée).

### Configuration des variables d'environnement
1. À la racine du projet, créez un fichier nommé `.env`.
2. Ajoutez-y vos clés récupérées ci-dessus :

```env
VITE_NOTION_API_KEY=secret_votre_cle_integration
VITE_NOTION_CONTENT_DB_ID=votre_id_base_contenu
VITE_NOTION_CONTEXT_DB_ID=votre_id_base_contextes
```

### Commandes
Ouvrez un terminal dans le dossier du projet :

1. **Installer les dépendances** :
   ```bash
   npm install
   ```

2. **Lancer le serveur de développement** :
   ```bash
   npm run dev
   ```
   L'application sera accessible à l'adresse indiquée (généralement `http://localhost:7860`).

3. **Construire pour la production** :
   ```bash
   npm run build
   ```
   Cela génère le dossier `dist/` prêt à être hébergé (sur GitHub Pages, Vercel, Netlify, etc.).

---

## 🤖 Note sur l'IA (Puter.js)

L'application utilise **Puter.js** pour les fonctionnalités d'intelligence artificielle.
- Aucune clé API supplémentaire n'est requise pour l'IA.
- Puter.js est chargé directement via un script dans `index.html`.
- Assurez-vous que votre bloqueur de publicités ne bloque pas `js.puter.com`.