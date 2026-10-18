# Version de test indépendante — 15 octobre 2026

Cette configuration déploie uniquement la copie de test. Elle ne réutilise ni l’API, ni la base, ni les comptes, ni les clés de production. Ne pas appliquer ces fichiers à la ressource de production Coolify.

- Projet Compose : `itemstracker-test-20261015`.
- Serveur : `/opt/itemstracker-test-20261015/ops/test-preview`.
- Deux services : PostgreSQL privé et application Node avec passerelle d’accès par code.
- La passerelle (8080) est la seule entrée Traefik. Aucun port Docker n’est publié sur l’hôte ; l’API (8787) écoute en loopback dans le conteneur.
- Le nom d’hôte de test possède son propre certificat HTTPS et une origine distincte de la production (cookies et stockage du navigateur séparés).
- Chaque code ouvre son propre compte de test. Les modifications et données persistent dans le volume de test.
- L’API d’inscription, de réinitialisation, d’administration et de génération IA externe est bloquée sur la passerelle. Aucun fournisseur d’e-mail ou stockage de production n’est configuré.
- CalDAV reste accessible avec les identifiants d’appareil émis par la seule base de test ; un client Apple ne peut pas fournir le cookie de la passerelle.
- Les pages ne sont pas indexables ; le code est transmis par POST, jamais dans l’URL.

Les secrets sont dans `.env` (600, ignoré par Git et par le contexte Docker). Le code d’accès en clair n’est pas copié sur le serveur ; seul son SHA-256 est conservé dans la configuration. Le partage d’un code donne accès aux mêmes données de test. Pour un autre testeur, créer un utilisateur distinct dans la seule base de test et ajouter `{accessHash,email,password}` au tableau JSON `PREVIEW_EXTRA_ACCOUNTS` du `.env` distant, puis recréer uniquement `app`. Le compte initial utilise toujours les variables `PREVIEW_ACCESS_HASH` et `BOOTSTRAP_*` ; conserver ces variables et le secret de session pour maintenir son accès. Les comptes supplémentaires démarrent sans parcours ni suivi.

## Construire la copie

Depuis le dépôt, compiler avec `npx tsc -b` puis `npx vite build --config ops/test-preview/vite.config.mjs`. Le build indépendant est écrit dans `.test-preview-dist/` et ne remplace aucun export de production. La valeur `VITE_API_BASE_URL` est forcée à vide pour appeler l’API de test sur la même origine.

Le Dockerfile attend uniquement `package.json`, `package-lock.json`, `server/` (sans base GeoIP), `src/data/`, `ops/test-preview/` et `.test-preview-dist/`. N’inclure ni `.git`, ni `.env.production`, ni la base locale, ni des exports ou sauvegardes de production.

## Exploitation

Dans le dossier de test distant :

- État : `docker compose ps`.
- Journaux : `docker compose logs --tail 50 app` (ne pas afficher `.env` ou la configuration résolue).
- Arrêter le test : `docker compose down` (le volume de test est conservé).
- Relancer : `docker compose up -d`.

Ne pas ajouter `--volumes` pour un simple arrêt et ne pas lancer de commande Compose depuis les dossiers de production. Pour changer le code, mettre à jour uniquement `PREVIEW_ACCESS_HASH` et `PREVIEW_SESSION_SECRET` dans le `.env` de ce projet, puis recréer le service `app`.
