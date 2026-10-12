# Administration des annonces

L’unique entrée est `/itemstracker/admin-app.html`. Aucun lien ni bouton admin n’est ajouté au site. Connectez-vous auparavant dans l’application avec `hello@setup-hub.com`, puis ouvrez directement cette adresse dans le même navigateur.

Le serveur vérifie le compte connecté dans PostgreSQL avant chaque accès administrateur. La liste d’administrateurs peut être remplacée par la variable serveur `ANNOUNCEMENT_ADMIN_EMAILS` (adresses séparées par des virgules). Par défaut : `hello@setup-hub.com`. Cette autorisation ne crée pas le compte : celui-ci doit exister et être accessible normalement.

## Utilisation

1. Renseigner titre, résumé, détails et éventuellement version.
2. Enregistrer le brouillon ; utiliser Aperçu ou Modifier / aperçu.
3. Publier le brouillon depuis la liste après confirmation.
4. Les utilisateurs découvrent l’annonce à leur connexion, au retour sur l’onglet ou à l’ouverture de la cloche. Aucun e-mail ni push téléphone n’est envoyé.
5. Retirer masque une annonce publiée. Les annonces publiées sont immuables ; créer une nouvelle annonce pour une correction.

Les détails utilisent du texte simple, avec retours à la ligne ; le HTML est affiché comme texte, jamais exécuté. Ouvrir la cloche ne marque rien comme lu. Cliquer sur une annonce ou Tout marquer comme lu enregistre la lecture côté serveur pour ce compte uniquement. Les 100 annonces publiées les plus récentes sont affichées.

## Déploiement

Deux déploiements sont nécessaires :

- Frontend LWS : extraire le ZIP statique mis à jour dans `/itemstracker/`. Il contient `admin-app.html`, `app.html` et les assets.
- Backend Node : déployer le code de ce commit, incluant `server/index.mjs` et `server/announcements.mjs`, puis redémarrer le service habituel (`npm run server`). Au démarrage, deux tables additives sont créées automatiquement : `app_announcements` et `app_announcement_reads`. Les données métier existantes restent intactes. Le compte PostgreSQL doit pouvoir créer ces tables.

Ne pas téléverser les fichiers serveur ni la racine du projet dans le répertoire web public LWS. Les paramètres PostgreSQL/JWT existants restent ceux du serveur. Installer seulement le ZIP frontend ne suffit pas à activer les annonces.

## Validation

- `node --test tests/announcements.test.mjs` : accès anonyme et utilisateur interdit, brouillon invisible, publication, lectures isolées par utilisateur, retrait. PostgreSQL est simulé dans ce test.
- `node tests/browser-announcements.mjs` sur un build : parcours brouillon / aperçu / publication / cloche, sécurité du texte et rendu mobile/desktop sur Chromium/WebKit ; API simulée.

Cette livraison implémente les annonces et patchnotes. Les alertes automatiques de révision, d’inactivité et les séries sont un travail distinct, défini lors de la conception précédente.
