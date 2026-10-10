# Correction du frontend ItemsTracker dans Coolify

Ressource frontend : `fcf2vtvk5myl8d3l1f8m9l0z`, port 80.
La ressource API `uezy8ya3aeq334okyw1n8944`, port 8787, reste indépendante.

1. Dans Configuration → General du frontend, remplacer **Custom Nginx Configuration** par le contenu complet de `coolify-nginx.conf`.
2. Dans **Container Labels**, ajouter les cinq lignes de `coolify-public-files.labels` aux labels existants. Conserver les labels existants et les domaines actuels. Cette route supplémentaire ne concerne que `/robots.txt` et `/llms.txt` sur `setup-hub.com`; elle ne retire aucun préfixe.
3. Enregistrer et redéployer le frontend après la publication de ce commit.

Le build copie les deux fichiers texte dans `dist/`. Leur présence seule ne suffit pas : la route actuelle du proxy ne couvre que `/itemstracker`.

La configuration Nginx gère le préfixe conservé ou retiré, active gzip, met en cache un an uniquement les fichiers portant un hash de contenu et demande la revalidation des autres fichiers.

Vérification après déploiement :

```sh
curl -sSI https://setup-hub.com/robots.txt
curl -sSI https://setup-hub.com/llms.txt
curl -sSI -H 'Accept-Encoding: gzip' https://setup-hub.com/itemstracker/presentation/landing.958d4d60c2cc7f28.css
```

Attendre HTTP 200 et `text/plain` pour les deux fichiers texte, `Cache-Control: public, max-age=31536000, immutable` pour le bundle CSS et `Content-Encoding: gzip` pour sa réponse compressée.

Ces réglages sont persistants dans Coolify; une modification avec `docker exec` seul serait perdue au prochain déploiement.

Documentation : https://coolify.io/docs/applications/builds/static
