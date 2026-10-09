# Version 0.1.0 — sauvegardes

Dossier du 8 octobre 2026. Le dossier « sauvegarde 20 avril » conserve son code initial. Les rapports de l’audit sont recopiés dans `rapports/` ; ils décrivent le fonctionnement avant ces corrections.

## Ce qui est appliqué dans le code

- **PostgreSQL est conservé.** L’état courant est réparti entre `user_tracking_items`, `user_quiz_cards` et un petit en-tête `user_state`. Une modification de carte réécrit cette carte ; les autres cartes et items restent inchangés. Le format de lecture de l’application reste compatible.
- **Les écritures sont atomiques.** État, médias, version, snapshot et accusé de réception sont enregistrés dans une transaction. Deux écritures portant la même version ne peuvent pas toutes les deux réussir. Les anciennes pages sans version/identifiant sont refusées. Une tentative interrompue reprend avec le même identifiant et le même contenu.
- **La reprise locale conserve les changements.** IndexedDB garde un brouillon complet et les images en attente. En cas de conflit, l’application conserve les changements locaux, fusionne les modifications indépendantes et propose un choix lorsque les mêmes données ont changé. Un export local est disponible. Cet export local contient les images présentes sur cet appareil ; l’export complet synchronise puis charge aussi les images cloud qui n’ont pas été affichées.
- **Les historiques techniques sont bornés.** Copies applicatives : 30 jours, au plus une nouvelle copie par jour avec modifications. Accusés de réception : 72 heures. La purge quotidienne est déclenchée par une sauvegarde utilisateur et par la tâche de sauvegarde externe ; elle ne lance pas de requêtes SQL à intervalle court pendant l’inactivité. Les données courantes et les historiques métier dans les items restent conservés.
- **Les médias ne sont plus répétés dans les nouveaux snapshots.** Ils sont dédupliqués dans PostgreSQL par défaut. Un bucket S3 privé peut les externaliser. Les nouvelles copies d’état gardent des références vers les médias immuables. Les objets remplacés sont supprimables après 45 jours depuis leur retrait et seulement s’ils ne sont plus référencés ; activer `MEDIA_GC_ENABLED=true` dans la tâche de backup après configuration. Les uploads interrompus avant validation SQL peuvent laisser des objets orphelins ; leur contrôle reste une opération séparée.
- **Les vérifications de session sont regroupées.** Un seul appel toutes les 5 minutes quand la page est visible, à une route qui renouvelle le jeton sans requête PostgreSQL. La lecture initiale du compte et les sauvegardes vérifient toujours son existence.
- **Les sauvegardes externes sont chiffrées.** Dump PostgreSQL cohérent avec les médias référencés, archive AES-256-GCM, contrôle d’intégrité. Rétention : une copie par jour pour les 7 derniers jours et jusqu’à 4 copies hebdomadaires pour les 28 derniers jours. La restauration refuse une base cible contenant déjà des tables.

Le quota affiché de 2 Gio porte sur les données actives logiques. Il ne correspond pas à l’espace physique facturé par Neon : indexes, anciennes versions de lignes, historiques, rétention PITR et stockage objet ont leurs propres coûts. Le nombre d’utilisateurs seul ne permet pas de les chiffrer.

## Ordre de mise en service

1. **Avant le changement du serveur**, faire un snapshot Neon et créer une archive externe vérifiée de la base actuelle. Le script de backup accepte aussi l’ancien schéma. Tester la restauration de l’archive dans une base vide isolée. Garder la clé de chiffrement dans un emplacement séparé des archives.
2. Installer la nouvelle version (`npm ci`, Node 22) et les outils `pg_dump`/`pg_restore` d’une version au moins aussi récente que le serveur PostgreSQL. Configurer les variables de `.env.server.example` dans le service Render existant. Ces fichiers sont des exemples ; ils ne doivent pas contenir les identifiants réels dans un dépôt ou un site public.
3. Déployer serveur et frontend dans la même fenêtre de maintenance. `APP_VERSION`, `MIN_CLIENT_VERSION` et `VITE_APP_VERSION` doivent valoir `0.1.0`. Le démarrage ajoute les tables ; la migration des données d’un utilisateur se fait transactionnellement lors de sa première lecture/écriture. Aucun contenu utilisateur n’est tronqué pour réduire artificiellement la taille des sauvegardes.
4. Pour le frontend, `npm run package:full` prépare **uniquement les fichiers statiques** dans `deploy-full/`. Publier le contenu de ce sous-dossier chez l’hébergeur frontend. Ne pas publier la racine du projet : elle contient le serveur, les outils et potentiellement des données locales. Le backend Render reste un service séparé lancé avec `npm run server`.
5. Installer la tâche quotidienne sur le serveur de sauvegarde déjà disponible (par exemple Hetzner), avec un volume persistant hors du site public. Les modèles `ops/itemstracker-backup.service` et `.timer` utilisent `/opt/itemstracker`, `/etc/itemstracker/backup.env`, `/var/backups/itemstracker` et un utilisateur `itemstracker` ; adapter ces chemins et le chemin Node. Installer les dépendances serveur avec `npm ci --omit=dev`. Une archive conservée seulement sur le serveur applicatif ne protège pas contre la perte de ce serveur.
6. Vérifier la première exécution et tester régulièrement une restauration isolée. Sur le serveur Linux, la tâche se programme avec `systemctl enable --now itemstracker-backup.timer` après installation des unités et `systemctl daemon-reload`. Aucune tâche système n’a été installée sur cet ordinateur.

## PITR Neon

Objectif validé : **7 jours de restauration à un instant précis**, si l’offre du compte le permet. Dans le compte Neon, récupérer `NEON_PROJECT_ID` et une clé `NEON_API_KEY`. Le script ne change pas l’offre ni les paramètres de compute. Il conserve une fenêtre existante plus longue.

```bash
# Charger ces variables depuis un fichier privé ou le gestionnaire de secrets.
npm run neon:pitr
# Après configuration, appliquer et relire la fenêtre pour vérifier :
npm run neon:pitr -- --apply
```

Le PITR n’est **pas activé à ce stade** : aucun accès Neon n’est présent. La commande de lecture indique la fenêtre existante et le changement demandé ; `--apply` enregistre les 7 jours et vérifie le résultat. Une offre ne permettant pas cette durée renvoie une erreur. La fenêtre de restauration se constitue progressivement après activation ; elle ne recrée pas sept jours d’historique antérieur.

La tarification publiée est de **0,20 $ par Gio-mois de données modifiées retenues**, avec un maximum de 7 jours en Launch et 30 jours en Scale. Le coût dépend donc du volume d’écritures retenues. Références : [offres Neon](https://neon.com/docs/introduction/plans), [API de mise à jour du projet](https://api-docs.neon.tech/reference/updateproject), [spécification officielle](https://neon.com/api_spec/release/v2.json).

Le dump quotidien est une protection indépendante ; il peut perdre les modifications faites depuis la dernière archive. Il complète le PITR. Les copies applicatives par utilisateur servent à conserver un état ancien ; elles ne remplacent pas un backup complet de la base.

## Commandes des archives

Configurer les variables de `.env.backup.example` sur le serveur de sauvegarde. Utiliser la connexion Neon **directe**, sans `-pooler`. Les identifiants PostgreSQL passent dans l’environnement du processus, pas dans les arguments de commande.

```bash
npm run backup:create
npm run backup:verify -- /var/backups/itemstracker/ARCHIVE.itbackup
# RESTORE_DATABASE_URL doit viser une autre base, vide et isolée.
npm run backup:restore -- /var/backups/itemstracker/ARCHIVE.itbackup
```

Le dump inclut les tables applicatives, les données et les images stockées en SQL. Si S3 est activé, l’archive inclut les objets nécessaires aux références courantes et aux snapshots. Le test de restauration S3 impose un bucket de test distinct via `RESTORE_MEDIA_S3_*`. Les rôles PostgreSQL globaux et les secrets d’infrastructure ne sont pas inclus dans `pg_dump` ; conserver leur configuration séparément.

Le stockage objet reste optionnel. Activer le bucket pour les nouveaux médias ne migre pas immédiatement toutes les anciennes images. Les anciennes images SQL restent lisibles ; elles sont converties lorsqu’elles sont renvoyées au serveur. Mesurer leur volume avant de décider si une migration complète vers un bucket vaut un abonnement supplémentaire.

## Vérifications de cette version

**Validation locale : 20 tests réussis, scénario navigateur réussi, compilation et paquet frontend réussis.**

`npm run test:backup` teste le protocole sur une vraie base PostgreSQL temporaire, les conflits simultanés, la répétition d’une requête, les migrations, les quotas, la rétention, la déduplication des médias, le chiffrement, le PITR via une API simulée et une vraie restauration `pg_dump`/`pg_restore`.

`npm run test:browser` vérifie dans Chrome le brouillon persistant et la reprise après perte d’un accusé de réception et rechargement de la page, puis la conservation des modifications faites pendant une sauvegarde en cours. Le test utilise la compilation dans `dist/` : exécuter `npm run package:full` avant le test navigateur. Sur macOS, le test utilise Google Chrome installé ; ailleurs installer Chromium Playwright ou renseigner `TEST_BROWSER_PATH`.

Ces vérifications ne consultent aucune donnée de production. Les versions de `pg_dump`/`pg_restore` doivent être disponibles via `PG_DUMP_PATH`/`PG_RESTORE_PATH`. Pour `test:backup`, sur macOS les chemins Homebrew libpq@18 sont utilisés par défaut ; sur Linux les outils doivent être dans `PATH`. PostgreSQL embarqué ne fonctionne pas en tant que root ; exécuter les tests avec un utilisateur normal.

La compilation frontend produit un avertissement sur la taille du bundle déjà présent dans l’application. L’installation npm signale également des vulnérabilités dans les dépendances existantes ; cette version n’a pas appliqué de mise à jour globale qui pourrait modifier d’autres fonctions.

## Correctif mémoire de la connexion (9 octobre 2026)

Une ancienne sauvegarde pouvait contenir toutes les images dans son JSON. La première lecture déclenchait leur migration en chargeant ces octets plusieurs fois dans Node, ce qui pouvait dépasser la mémoire de Render et provoquer des erreurs 502/503. L’extraction et la déduplication des médias se font désormais dans PostgreSQL, dans la transaction existante ; Node ne reçoit que les cartes sans leurs images. Les images restent disponibles à la demande.

Ce correctif nécessite le **déploiement du backend Render depuis le dernier commit de main**, en plus du remplacement des fichiers frontend sur LWS. Un simple upload du ZIP LWS ne modifie pas le serveur Node. Après le déploiement, `https://api.setup-hub.com/api/health` doit renvoyer `stateMigration: "sql-media-v1"`. La migration se déclenche à la lecture du compte et conserve sa version, ses cartes et ses images.

Test de charge local : 96 Mio d’images héritées, serveur Node limité à 128 Mio de heap. Le code précédent sature cette mémoire ; le correctif renvoie les métadonnées et permet de charger une image séparément. Les tests de sauvegarde/restauration et de concurrence restent applicables.
