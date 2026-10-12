# ItemsTracker v0.1.1 — 12 octobre 2026

Dossier de travail : **ItemsTracker v0.1.1 - 2026-10-12**.

Source : copie intégrale de `ItemsTracker v0.1.0 - 2026-10-08`. Ce dossier est conservé séparément pour permettre le retour à la version précédente.

Changements principaux : interface administrateur harmonisée avec l’application, navigation adaptée au téléphone, thème clair par défaut avec mode sombre et écran de connexion dédié. L’aperçu local de l’administration lit les statistiques réelles du serveur de production après connexion au compte administrateur ; il n’injecte pas de chiffres fictifs et reste en lecture seule. Les routes d’administration du serveur continuent à vérifier l’identité et les droits du compte sur chaque requête.

Pour l’aperçu local et le déploiement, suivre [ADMIN_ANALYTICS.md](ADMIN_ANALYTICS.md). La publication du frontend et celle du backend restent distinctes.
