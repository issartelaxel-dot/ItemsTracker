# ItemsTracker v0.1.0 — 8 octobre 2026

Dossier de travail : **ItemsTracker v0.1.0 - 2026-10-08**.

Source : copie du dossier « ItemsTracker sauvegarde 20 avril », commit `d52149a`. Le code du dossier d’avril est préservé.

Changements : stockage PostgreSQL par item/carte ; écritures transactionnelles avec version et identifiant stable ; reprise locale via IndexedDB ; médias immuables dédupliqués ; rétention des historiques ; archives chiffrées avec test de restauration ; commande d’activation du PITR Neon.

État : version préparée pour publication sur GitHub ; déploiement chez Neon, Render ou Hetzner non confirmé. Les secrets et les paramètres de ces comptes ne sont pas disponibles dans ce dossier.

Installation : `npm ci`. Instructions : [MISE_EN_SERVICE.md](MISE_EN_SERVICE.md).
