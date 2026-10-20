# Production — vérification du 20 octobre 2026

La sauvegarde automatique est déployée sur
https://setup-hub.com/itemstracker/app.html, depuis le commit
`1dbdc837327b029cf5995117cb7a332ab3f886f6` publié sur `main`.

L’API publique Render a été publiée en premier. Sa route de santé confirme
`automaticSync: true` ; les trois tables d’opérations, de livraisons et de
suppression sont présentes ; une lecture authentifiée du nouveau protocole
répond HTTP 200. Le frontend Coolify a ensuite été publié et vérifié sur son URL
publique. Son déploiement est terminé, et son réglage de déploiement automatique
a été rétabli à sa valeur d’origine.

## Sauvegarde et retour arrière

La sauvegarde complète de PostgreSQL, d’environ 255 Mo, a été restaurée dans une
base isolée : 33 tables, 5 comptes et 2 905 cartes. Les empreintes des six tables
de données utilisateur correspondaient à la production. La base temporaire a
ensuite été supprimée. Aucune purge de maintenance n’a été exécutée par la
sauvegarde.

Une copie AES-256-GCM est conservée hors du serveur. Le déchiffrement authentifié
et le SHA-256 de tous les octets ont été vérifiés après transfert. La clé est
stockée séparément dans un emplacement privé. Le manifeste et les rapports sont
conservés avec les sauvegardes, sans clé dans les rapports.

Sauvegarde distante :
`/var/backups/itemstracker-automatic-sync-20261020T161303Z`.
Sauvegarde locale chiffrée :
`/Users/axelissartel/Documents/ItemsTracker-production-autosync-backup-2026-10-20`.

Les anciens fichiers frontend et l’image
`itemstracker-production-before-autosync:20261020` sont conservés. La recette
`rollback-frontend.php`, dans le dossier distant de sauvegarde, peut redéployer
l’ancien frontend via Coolify. Elle n’a pas été exécutée. Conserver la nouvelle
API lors d’un retour arrière du frontend : elle accepte aussi les anciens
clients et continue à recevoir les files des nouveaux clients déjà ouverts.
Les tables ajoutées ne nécessitent aucune suppression lors de ce retour arrière.

## Vérifications fonctionnelles

- Compilation TypeScript et build frontend de production réussis.
- 25 tests PostgreSQL/API et 2 tests du stockage client réussis.
- Parcours complet exécuté sur le site public, avec un compte temporaire et
  deux sessions WebKit indépendantes, dont un téléphone émulé : modifications de
  champs distincts, modifications successives du même champ, coupure réseau,
  rechargement avec API indisponible, reprise, réponse serveur perdue,
  révisions simultanées et hors ligne, créations, préférence partagée et
  restauration depuis l’historique.
- Vérification finale : les deux copies durables des sessions correspondent aux
  cartes, compteurs et préférences du serveur. Aucune demande de choix local/cloud,
  aucun bouton Synchroniser ni bandeau imposant un rechargement n’est apparu.
- Le compte temporaire et son contenu ont été supprimés après les vérifications.

Après nettoyage, les empreintes des six tables correspondent exactement à la
sauvegarde : **5 comptes, 1 835 suivis d’items, 2 905 cartes, 906 images et
795 blobs média**, ainsi que les cinq en-têtes de compte. Les contenus existants
n’ont donc pas été modifiés par le déploiement ou les essais.

Les essais mobiles utilisent WebKit avec un écran et des interactions de
téléphone ; aucun téléphone physique n’a été piloté. Le chargement initial de la
page nécessite le réseau. Les opérations saisies restent conservées localement
et les sessions suspendues par le navigateur reprennent à leur réveil.
