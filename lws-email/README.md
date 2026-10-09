# Relais d’e-mails ItemsTracker sur LWS

L’API Node transmet une demande signée en HTTPS à ce dossier. Le PHP sur LWS envoie l’e-mail avec la messagerie `hello@setup-hub.com`. Render ne se connecte plus au SMTP ; aucun service d’envoi tiers n’est nécessaire. La création du compte et la vérification des codes restent sur l’API.

## Première installation

1. Dans le dossier local du projet, exécuter `npm run setup:mail-relay`. La commande crée `installation-mail-lws/relay-config.local.php` et `installation-mail-lws/render.env.local`, sans afficher leur secret. Réexécuter la commande conserve le secret et la configuration existants.
2. Dans LWS → Zone DNS, ajouter un enregistrement **A**, nom `mail-relay`, valeur `193.203.239.86`. Ne pas modifier l’enregistrement `@` : le site principal utilise un autre serveur.
3. Dans LWS → Sous domaines, créer `mail-relay.setup-hub.com`. Utiliser le dossier existant `ItemsTracker` comme racine si le panneau le permet. Sinon, copier le dossier `email-relay` dans la racine créée pour ce sous-domaine. Activer son certificat HTTPS dans LWS → SSL. L’URL finale doit être `https://mail-relay.setup-hub.com/email-relay/send.php`.
4. Renseigner `smtpPass` dans `installation-mail-lws/relay-config.local.php`, puis exécuter `node scripts/prepare-full-deploy.mjs`. Le paquet privé `deploy-full.zip` inclut alors la configuration existante. Installer son dossier `email-relay` dans la racine du sous-domaine. PHP 7.4+ avec OpenSSL est requis. Ouvrir l’URL précédente : elle doit répondre en JSON avec `MAIL_RELAY_METHOD_NOT_ALLOWED` (HTTP 405). Le serveur SMTP est prérempli (`mail89.lwspanel.com`, SSL, 465).
5. Dans **Render → service backend → Environment**, copier les trois variables du fichier `installation-mail-lws/render.env.local` : `EMAIL_PROVIDER=lws`, `MAIL_RELAY_URL`, `MAIL_RELAY_SECRET`. Enregistrer et redéployer le backend. Le mot de passe de la boîte reste sur LWS ; le secret de signature doit correspondre sur les deux serveurs.
6. Effectuer une inscription depuis l’application. Le code de vérification doit être reçu par e-mail. La réinitialisation du mot de passe utilise le même relais.

## Mises à jour

Sans configuration locale, les archives ne contiennent aucun secret. Lorsque `installation-mail-lws/relay-config.local.php` existe, le paquet complet inclut cette configuration : cette archive est privée et ne doit pas être partagée. Le fichier d’exemple ne contient aucun secret. Ne pas supprimer le dossier distant avant de mettre à jour ses scripts ; remplacer les fichiers du nouveau paquet.

Les deux fichiers générés dans `installation-mail-lws/` sont privés et exclus de Git. Ne pas les copier dans le frontend, les ajouter au dépôt ou partager leur contenu. Si le mot de passe de la boîte change, actualiser `smtpPass` sur LWS et la copie locale.

## Diagnostic

- `MAIL_RELAY_NOT_CONFIGURED` : configuration absente, secret non valide ou mot de passe SMTP vide.
- `MAIL_RELAY_AUTH_FAILED` : les secrets LWS/Render ne correspondent pas.
- `MAIL_RELAY_SMTP_AUTH_FAILED` : le serveur SMTP refuse l’authentification de la boîte.
- `MAIL_RELAY_SMTP_FAILED` / `MAIL_RELAY_SMTP_TIMEOUT` : vérifier l’hôte, le port et la connexion SMTP depuis LWS.
- `MAIL_RELAY_RATE_LIMITED` : plafond de cinq messages par destinataire sur quinze minutes, ou de soixante par minute pour le relais.

Le relais refuse les requêtes non signées, les messages libres, les corps supplémentaires et les signatures expirées. Une demande déjà traitée ne renvoie pas d’e-mail en double. Les traces ne contiennent aucun code, contenu, destinataire ou mot de passe. La vérification TLS reste active. Le suivi est conservé dans un fichier temporaire privé, avec verrou pour sérialiser les envois.

PHPMailer est fourni sans Composer, avec sa licence et sa version dans `vendor/phpmailer/SOURCE.json`. Projet officiel : https://github.com/PHPMailer/PHPMailer.
