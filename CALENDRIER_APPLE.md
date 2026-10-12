# Calendrier ItemsTracker et Apple Calendrier

Cette version ajoute un calendrier de séances ponctuelles et d’examens, sans changer le suivi des items ni les cartes existantes. Les événements sont conservés dans PostgreSQL chez ItemsTracker. Apple Calendrier accède à ce même stockage par CalDAV : ce n’est pas un abonnement ICS en lecture seule, ni une copie dans iCloud.

## Utilisation dans ItemsTracker

- PC : onglet Calendrier dans la barre latérale, vue mensuelle, agenda du jour et déplacement par glisser-déposer.
- Téléphone : Dashboard, Items, Flashcards, Collèges, Calendrier. Le profil et les autres outils restent accessibles par l’icône de profil près de la cloche. Le mois est compact et l’agenda affiche le jour choisi.
- « Planifier » ajoute une séance ou un examen avec titre, début et fin obligatoires. Associer plusieurs items, collèges ou cartes est facultatif.
- « Commencer » ouvre uniquement les contenus associés disponibles. Les séances sans contenu associé restent planifiables ; leur bouton Commencer est désactivé.
- « Terminer » est une action manuelle. Le lancement ou la fin d’une révision ne termine jamais automatiquement une séance.
- Les commandes permettent aussi de rouvrir, modifier, dupliquer et supprimer. Un chevauchement avec un autre événement ItemsTracker est signalé et reste autorisé.
- Les heures s’affichent dans le fuseau réglé dans le profil, ou celui de l’appareil si le réglage est automatique. Les instants UTC sont stockés pour éviter un décalage lors d’un changement de fuseau.
- En cas de modification simultanée depuis un autre appareil, le brouillon reste ouvert. Charger la version récente ou conserver son brouillon comme copie.

## Connecter Apple Calendrier

1. Ouvrir Calendrier → « Connecter Apple Calendrier ».
2. Nommer l’appareil puis créer ses identifiants. Utiliser un identifiant dédié par appareil, révocable individuellement. Le mot de passe dédié n’est affiché qu’une fois ; le serveur n’en conserve qu’une empreinte.
3. Sur iPhone/iPad, ajouter un compte **CalDAV** dans les comptes de Calendrier : Autre → Ajouter un compte CalDAV. Sur Mac, Calendrier → Ajouter un compte → Autre compte CalDAV, configuration manuelle. Les intitulés et l’emplacement exact des réglages dépendent de la version du système.
4. Recopier le serveur, le nom d’utilisateur et le mot de passe affichés. Activer SSL/HTTPS. Si le dialogue demande seulement un nom d’hôte, utiliser l’hôte de l’URL, puis son chemin `/dav/` dans les réglages avancés. L’URL du calendrier individuel est aussi affichée dans ItemsTracker.
5. Le calendrier séparé **ItemsTracker** peut être affiché ou masqué dans Apple Calendrier. Ne pas utiliser le mot de passe habituel d’ItemsTracker, ni celui d’Apple/iCloud.

Les modifications de titre, dates, horaires et notes dans Apple sont visibles dans ItemsTracker après actualisation ; les associations internes et le statut Terminé restent préservés. Une séance créée depuis Apple n’a initialement aucun item/carte associé : les associer dans ItemsTracker si souhaité. Révoquer l’appareil coupe son accès sans supprimer les événements du serveur. Une copie déjà téléchargée sur cet appareil peut rester affichée jusqu’au retrait du compte.

La synchronisation dépend des actualisations d’Apple Calendrier ; ItemsTracker actualise la vue ouverte toutes les minutes et au retour sur la fenêtre. Ce n’est pas une connexion instantanée permanente. L’application Calendrier réelle sur iPhone/Mac doit encore être testée avec le serveur déployé : les essais automatisés valident les échanges CalDAV, pas une connexion de bout en bout sur appareil Apple.

## Rappels

Le rappel est facultatif : au début, 5/15/30/60 minutes ou un jour avant. Il est enregistré en alarme DISPLAY CalDAV pour Apple et alimente la cloche ItemsTracker quand son échéance est atteinte. La cloche est actualisée à l’ouverture, au retour sur la fenêtre et toutes les minutes quand la page est visible. Cliquer sur le rappel le marque lu et ouvre le jour correspondant ; « Tout marquer comme lu » fonctionne aussi. Terminer/supprimer la séance retire le rappel, et il expire à la fin du créneau.

ItemsTracker ne déclenche pas de notification système lorsque son site est fermé. Pour un rappel sur l’écran verrouillé, activer les notifications d’Apple Calendrier. Le calendrier ne consulte pas les autres calendriers personnels pour détecter les conflits.

## Déploiement du serveur obligatoire

Le ZIP `deploy-full.zip` contient la partie web pour LWS. **Il ne suffit pas à activer le calendrier** : PostgreSQL, les routes API et CalDAV tournent dans le serveur Node existant.

1. Déployer aussi `server/index.mjs`, `server/calendar-model.mjs`, `server/calendar-store.mjs`, `server/calendar.mjs`, `package.json` et `package-lock.json`. Ils sont fournis dans `calendar-backend-update.zip`. Conserver les autres modules et la configuration du serveur existant.
2. Faire `npm ci --omit=dev` avec Node 22, puis redémarrer le serveur comme habituellement. Les dépendances nouvelles sont `ical.js` et `@xmldom/xmldom`.
3. Définir `CALENDAR_PUBLIC_URL=https://HOTE_PUBLIC_DU_SERVEUR_NODE` : l’origine HTTPS publique du backend, sans `/api` ni autre préfixe. Le frontend utilise déjà son API habituelle ; la valeur CalDAV sert à générer les adresses pour Apple. Utiliser le domaine frontend uniquement si un reverse proxy transmet réellement les routes DAV au backend.
4. Le proxy doit transmettre `Authorization`, `Depth`, `If-Match`, `If-None-Match`, ainsi que les méthodes OPTIONS, PROPFIND, REPORT, GET, HEAD, PUT, DELETE et PROPPATCH sur `/dav/`. Transmettre HTTPS avec `X-Forwarded-Proto: https` derrière le proxy approuvé par le serveur. Ne pas convertir ces requêtes en pages HTML ou en OPTIONS CORS générique. `/.well-known/caldav` redirige vers `/dav/`.
5. Le démarrage ajoute quatre tables `app_calendars`, `app_calendar_events`, `app_calendar_devices`, `app_calendar_reminder_reads`, sans modifier les données de suivi existantes. Le compte applicatif PostgreSQL doit avoir le droit de les créer.
6. Après déploiement, créer les identifiants d’un appareil et vérifier : apparition du calendrier séparé, création depuis chaque application, modification dans les deux sens, suppression, rappels, révocation et fuseaux horaires. Ne pas annoncer la connexion native comme vérifiée avant cette étape.

Seules les séances ponctuelles avec horaires sont supportées. Les journées entières, répétitions et invitations sont refusées explicitement. La création/suppression d’autres calendriers et le renommage du calendrier ItemsTracker ne sont pas proposés. Maximum actuel : 2 000 événements actifs et 16 appareils autorisés par utilisateur.

## Sauvegardes et tests

Les sauvegardes serveur complètes existantes (`scripts/backup.mjs`) utilisent `pg_dump` pour toutes les tables publiques : elles incluent donc le calendrier et les empreintes des identifiants. Après une restauration, les identifiants conservés peuvent encore fonctionner ; les révoquer si nécessaire. L’export JSON personnel du suivi des items ne contient pas ces nouvelles tables ; il ne constitue pas une sauvegarde du calendrier.

Tests serveur : `node --test tests/calendar.integration.test.mjs tests/announcements.test.mjs tests/state.integration.test.mjs`.
Tests navigateur : après le build dans une copie de travail, `node tests/browser-calendar.mjs` ; ils utilisent uniquement des comptes, événements et réponses API simulés. Chrome et WebKit sont testés en 320, 390, 430, 820 et 1 440 px. Les captures et le rapport sont générés dans le dossier temporaire `itemstracker-calendar-qa`.
