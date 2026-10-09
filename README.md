# ItemsTracker — application et page de vente

## Page de vente intégrée au déploiement LWS

La page de vente est désormais l’accueil de `/itemstracker/`. L’application React est accessible à `/itemstracker/app.html`. Les boutons de connexion et de demande d’accès de la page de vente pointent vers cette application sur le même hébergement. L’API et la connexion de l’application ne sont pas modifiées.

```bash
npm run package:full
```

La commande crée aussi `deploy-full.zip` et `deploy-full/Archive.zip`, à téléverser puis extraire directement dans votre dossier LWS. `package:deploy` crée `deploy/Archive.zip`. La création des archives utilise la commande `zip` (disponible sur ce Mac).

Déposez le **contenu** de `deploy-full/` dans votre dossier LWS `/itemstracker/`, comme auparavant : `index.html`, `app.html`, `.htaccess`, `assets/`, `presentation/`, les icônes. `npm run package:deploy` produit la même organisation dans `deploy/`. Aucun build sur LWS n’est nécessaire.

## Inscription et vérification de l’e-mail

« Créer un compte » ouvre directement `app.html?auth=register`. Le serveur envoie un code à **6 chiffres à l’utilisateur**, valable 15 minutes. Le compte et la session sont créés seulement après vérification. Le renvoi est disponible après 60 secondes ; cinq codes incorrects imposent de recommencer l’inscription. Les comptes existants restent accessibles.

**Cette fonctionnalité nécessite aussi de redéployer le backend Node**, en plus de téléverser le frontend sur LWS. Configurer le service d’envoi sur le serveur de l’API (voir `.env.server.example` et les options ci-dessous). `ADMIN_APPROVAL_EMAIL` n’est plus utilisé. Le démarrage ajoute automatiquement la colonne nécessaire aux inscriptions en attente ; aucune suppression des utilisateurs existants n’est requise. Les anciennes demandes de code administrateur doivent être recommencées.

### Envoi des e-mails sur Render

Render Free bloque les connexions SMTP sortantes sur les ports 25, 465 et 587 ([documentation Render](https://render.com/docs/free)). L’inscription et la réinitialisation peuvent utiliser une API HTTPS :

- **Resend** : `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` et `MAIL_FROM`, par exemple `ItemsTracker <noreply@setup-hub.com>`. Vérifier le domaine d’envoi et les DNS demandés chez LWS avant d’utiliser cette adresse. [Domaines Resend](https://resend.com/docs/dashboard/domains/introduction).
- **Brevo** : `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` et `MAIL_FROM` correspondant à un expéditeur vérifié. [API Brevo](https://developers.brevo.com/reference/send-transac-email).
- **SMTP** : `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` et `SMTP_FROM` (ou `MAIL_FROM`), si l’hébergement autorise ce trafic.

Sans `EMAIL_PROVIDER`, la sélection est automatique : clé Resend, sinon clé Brevo, sinon SMTP. Les clés restent exclusivement sur le backend. Il n’y a aucun basculement automatique après un échec d’envoi, pour éviter les doublons. Les logs du backend indiquent seulement le fournisseur, un code d’erreur et un statut HTTP/SMTP éventuel (`SMTP_CONFIG_MISSING`, `SMTP_AUTH_FAILED`, `SMTP_TIMEOUT`, `EMAIL_API_KEY_MISSING`, `EMAIL_API_REJECTED`, etc.) ; aucun contenu du message, destinataire ou secret n’est enregistré. Une erreur d’envoi ne crée pas le compte.

`npm run test:auth` vérifie l’inscription sur PostgreSQL temporaire et un serveur SMTP local, ainsi que les API Resend/Brevo simulées, sans envoi d’e-mail réel : vérification, consommation unique, expiration, renvoi, limites de tentatives, diagnostics et échecs d’envoi.

- `marketing/` : source durable de la page de vente (HTML/CSS/JS et médias). Modifiez cette version pour les prochains déploiements.
- `src/` : source de l’application React.
- `dist/index.html` : page de vente générée ; `dist/app.html` : entrée React.
- `presentation/` : styles/scripts/médias de la page de vente, distincts de `assets/` de l’application.
- La section d’essai reste masquée. Les animations, le parcours médecine et la gratuité validés sont conservés.

Le build inclut les deux pages automatiquement. `export:ready` prépare aussi l’export à la racine du projet avec la même organisation. La restauration du modèle `index.dev.html` avant le build et le démarrage du développement reste active ; le développement React avec Vite fonctionne comme avant.

Les archives de déploiement contiennent le frontend et la page de vente ; votre API existante conserve son déploiement et sa configuration.

## API configuration (production)

The frontend calls `/api/...` by default on the same domain.
If your backend is hosted elsewhere, set:

```bash
VITE_API_BASE_URL=https://your-backend-domain.com
```

Example for local dev:

```bash
VITE_API_BASE_URL=http://localhost:8787
```

Then rebuild and redeploy the frontend.

Auth session note:
- Backend still sets an httpOnly cookie.
- Frontend also stores a rotating auth token from API responses and sends it as `Authorization: Bearer ...`.
- This reduces login/session issues when some browsers block or drop cross-site cookies.
- Backend CORS must allow and expose auth/version headers:
  - `allowedHeaders`: `Content-Type, Authorization, X-Client-Version`
  - `exposedHeaders`: `x-app-version, x-min-client-version`

### Session reliability (recommended)

For the most reliable auth cookies, serve API on the same site (for example `https://setup-hub.com/api` via reverse proxy).

- Preferred: frontend uses same-origin `/api`
- Fallback: set `VITE_API_BASE_URL=https://your-backend-domain.com`

The app now tries same-origin first, then falls back to `VITE_API_BASE_URL` if the proxy route is unavailable.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Render (frontend)

Use a Render **Static Site** that publishes `dist`:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_BASE_PATH=/itemstracker/`

If you use Render Blueprint, this repo already includes [`render.yaml`](./render.yaml) with this setup.

## Deploy application and sales page (manual upload)

To prepare the application and sales page together for manual upload, run:

```bash
npm run package:full
```

Then upload the **contents** of `deploy-full/` to `/itemstracker/`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
