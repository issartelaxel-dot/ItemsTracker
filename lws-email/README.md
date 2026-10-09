# Relais d’e-mails ItemsTracker sur LWS

L’API Node transmet une demande signée en HTTPS à ce dossier. Le PHP sur LWS envoie l’e-mail avec la messagerie `hello@setup-hub.com`. Render ne se connecte plus au SMTP ; aucun service d’envoi tiers n’est nécessaire. La création du compte et la vérification des codes restent sur l’API.

## Première installation

1. Dans le dossier local du projet, exécuter `npm run setup:mail-relay`. La commande crée `installation-mail-lws/relay-config.local.php` et `installation-mail-lws/render.env.local`, sans afficher leur secret. Réexécuter la commande conserve le secret et la configuration existants.
2. Téléverser et extraire `deploy-full.zip` dans `/itemstracker/` sur LWS. Le paquet contient `email-relay/send.php`, le relais et PHPMailer. Le dossier `installation-mail-lws` reste local.
3. **Avant de téléverser des secrets**, ouvrir `https://setup-hub.com/itemstracker/email-relay/send.php`. PHP doit répondre en JSON avec `MAIL_RELAY_METHOD_NOT_ALLOWED` (HTTP 405). Un téléchargement du fichier PHP, son code source ou un 404 signifie que PHP/le chemin n’est pas encore opérationnel. Activer PHP sur LWS avant de poursuivre. PHP 7.4+ avec OpenSSL est requis.
4. Ouvrir le fichier local `installation-mail-lws/relay-config.local.php` et renseigner uniquement `smtpPass` avec le mot de passe actuel de la boîte `hello@setup-hub.com`. Téléverser ce fichier dans `/itemstracker/email-relay/`. Ne pas renommer le fichier ni le placer à la racine du site. Le serveur SMTP LWS est prérempli (`mail89.lwspanel.com`, SSL, 465) ; `mail.setup-hub.com` peut aussi être utilisé selon la configuration de la boîte.
5. Dans **Render → service backend → Environment**, copier les trois variables du fichier `installation-mail-lws/render.env.local` : `EMAIL_PROVIDER=lws`, `MAIL_RELAY_URL`, `MAIL_RELAY_SECRET`. Enregistrer et redéployer le backend. Le mot de passe de la boîte reste sur LWS ; le secret de signature doit correspondre sur les deux serveurs.
6. Effectuer une inscription depuis l’application. Le code de vérification doit être reçu par e-mail. La réinitialisation du mot de passe utilise le même relais.

## Mises à jour

Les archives habituelles ne contiennent **jamais** `relay-config.local.php` : elles préservent la configuration déjà installée sur LWS. Le fichier d’exemple ne contient aucun secret. Ne pas supprimer le dossier distant avant de mettre à jour ses scripts ; remplacer les fichiers du nouveau paquet.

Les deux fichiers générés dans `installation-mail-lws/` sont privés et exclus de Git. Ne pas les copier dans le frontend, les ajouter au dépôt ou partager leur contenu. Si le mot de passe de la boîte change, actualiser `smtpPass` sur LWS et la copie locale.

## Diagnostic

- `MAIL_RELAY_NOT_CONFIGURED` : configuration absente, secret non valide ou mot de passe SMTP vide.
- `MAIL_RELAY_AUTH_FAILED` : les secrets LWS/Render ne correspondent pas.
- `MAIL_RELAY_SMTP_AUTH_FAILED` : le serveur SMTP refuse l’authentification de la boîte.
- `MAIL_RELAY_SMTP_FAILED` / `MAIL_RELAY_SMTP_TIMEOUT` : vérifier l’hôte, le port et la connexion SMTP depuis LWS.
- `MAIL_RELAY_RATE_LIMITED` : plafond de cinq messages par destinataire sur quinze minutes, ou de soixante par minute pour le relais.

Le relais refuse les requêtes non signées, les messages libres, les corps supplémentaires et les signatures expirées. Une demande déjà traitée ne renvoie pas d’e-mail en double. Les traces ne contiennent aucun code, contenu, destinataire ou mot de passe. La vérification TLS reste active. Le suivi est conservé dans un fichier temporaire privé, avec verrou pour sérialiser les envois.

PHPMailer est fourni sans Composer, avec sa licence et sa version dans `vendor/phpmailer/SOURCE.json`. Projet officiel : https://github.com/PHPMailer/PHPMailer.
