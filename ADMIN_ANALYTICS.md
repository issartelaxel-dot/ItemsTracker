# Administration ItemsTracker : statistiques et annonces

Accès direct : https://itemstracker.setup-hub.com/itemstracker/admin-app.html

Le serveur vérifie le compte autorisé sur chaque requête admin. Par défaut : `hello@setup-hub.com`, configurable avec `ANNOUNCEMENT_ADMIN_EMAILS`. Aucun lien admin n'est ajouté à l'application ou à la page de vente. Le nouvel onglet Annonces réutilise les brouillons, l'aperçu, la publication, le retrait et l'historique existants.

## Déploiement

1. Déployer le backend de ce commit avec `npm ci` puis `npm run server` (ou le démarrage serveur déjà configuré). Les tables analytics se créent automatiquement, sans modifier les données métier existantes.
2. Installer le nouveau `deploy-full.zip` web : **remplacer aussi `index.html` et le nouveau fichier `presentation/analytics.*.js`**, en plus des bundles et des pages app/admin. Le script de la page de vente est nécessaire pour mesurer ses visiteurs. Les configurations privées existantes du paquet ont été conservées.
3. Garder les origines publiques dans `CLIENT_ORIGINS`, dont `https://itemstracker.setup-hub.com`, ainsi que le bon `VITE_API_BASE_URL` lors du build. L'API n'accepte pas un autre domaine de collecte.
4. Se connecter dans l'application avec le compte administrateur, puis ouvrir l'URL admin. Une session ordinaire reçoit HTTP 403 sur toutes les statistiques et toutes les fonctions de publication.

Le backend doit être mis à jour : le ZIP web seul ne crée pas le suivi ni les statistiques. Un déploiement partiel affiche une erreur explicite ; aucun chiffre de démonstration n'est affiché en production.

## Géolocalisation

Les consultations utilisent une base **DB-IP City Lite** locale. Aucune adresse IP brute n'est enregistrée dans les tables analytics ou renvoyée au dashboard, et aucune requête de géolocalisation d'utilisateur n'est envoyée à un service tiers. Pays, ville et coordonnées arrondies à 0,1 degré sont conservés. Une position indisponible reste inconnue ; aucune demande GPS.

Au premier démarrage, la base est téléchargée en arrière-plan depuis `download.db-ip.com`. Le serveur peut fonctionner pendant sa préparation. Aucun compte ou clé externe n'est requis. Le téléchargement vérifie la base avant remplacement ; en cas d'échec, le dashboard signale l'indisponibilité et le suivi continue sans position.

Le fichier téléchargé (`server/data/dbip-city-lite.mmdb`, environ 120 Mo) est exclu de Git et des fichiers web. Pour préparer la base avant démarrage :

```sh
npm run setup:analytics-geo
```

Pour actualiser les données mensuellement puis redémarrer le serveur :

```sh
npm run setup:analytics-geo -- --refresh
```

Sur un serveur avec disque persistant, définir `GEOIP_DATABASE_PATH` vers un chemin de ce disque. `ANALYTICS_GEO_DOWNLOAD=false` désactive le téléchargement automatique si une base est préinstallée. La résolution utilise `req.ip` avec la configuration de proxy existante ; n'exposer l'API qu'à travers le proxy de confiance configuré.

La base Lite est approximative, notamment avec les réseaux mobiles et les VPN. L'attribution « IP Geolocation by DB-IP » figure dans l'admin. Source et licence : [DB-IP Lite, CC BY 4.0](https://db-ip.com/db/lite.php). Les continents du globe proviennent de [Natural Earth](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), données du domaine public.

## Mesures et limites

- **Inscrits** : les comptes de la table utilisateurs, y compris les comptes sans session mesurée. Les inscriptions et leur courbe sont globales ; elles ne sont pas filtrées géographiquement.
- **En ligne** : signal actif reçu depuis moins de 90 secondes. Le client exige un onglet visible avec focus et une interaction depuis moins de deux minutes. Actualisation du dashboard toutes les 30 secondes pendant qu'il est visible.
- **Temps actif** : compteurs par section, suspendus pendant les pauses, les onglets masqués et l'absence de focus. Les requêtes cumulatives et leur séquence évitent les doubles comptes lors de renvois. Le serveur borne les durées par son propre temps écoulé.
- **Cartes révisées** : nombre d'évaluations, sans contenu ni résultat d'apprentissage. Les visites d'une section sont également comptées. Pas de suivi du texte saisi ou de l'édition des cartes.
- **Utilisateurs** : codes aléatoires stables `USR-…`. Ni noms, ni e-mails, ni identifiants internes ne sont exposés par l'API analytics. La correspondance avec un compte reste exclusivement côté serveur : il s'agit de pseudonymisation.
- **Visiteurs** : codes `VIS-…`, propres à l'onglet de navigation via `sessionStorage`. Aucun rapprochement avec les comptes, même après inscription. Une nouvelle visite dans un autre onglet/navigateur peut créer un nouveau code ; ce n'est pas une mesure exacte des personnes physiques. Pas de rapprochement par IP.
- Les demandes Do Not Track et Global Privacy Control sont respectées. Les robots déclarés et le compte administrateur sont exclus de la collecte d'usage.
- Historique des sessions détaillé sur **12 mois**, avec purge au démarrage et quotidienne, y compris les mesures par section. Les comptes et leur code restent présents tant que le compte existe. La suppression d'un compte supprime ses données analytics par clés étrangères.
- Les statistiques d'activité commencent à la mise en service. Les dates d'inscription existantes restent utilisables ; l'ancien temps d'utilisation n'est pas reconstruit.
- Vue d’ensemble compacte de 5 identifiants ; listes paginées de 50 identifiants ; fiche avec les 200 dernières sessions de la période. « Exporter la vue » exporte les indicateurs et la page de liste actuellement chargée, en CSV.
- Le suivi est une mesure d'usage déclarée par le navigateur : blocage de scripts, fermeture brutale ou réseau indisponible peuvent réduire les comptes. Il n'intervient jamais dans les sauvegardes métier.

## Vérification

```sh
node --test tests/analytics-tracker.test.mjs tests/analytics.integration.test.mjs tests/announcements.test.mjs
ADMIN_TEST_DIST=/chemin/vers/dist node tests/browser-admin-analytics.mjs
```

Les tests utilisent PostgreSQL isolé, comptes fictifs et routes locales ; aucune annonce ou donnée réelle n'est modifiée.
