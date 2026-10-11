# Dashboard PC et tablette — 11 octobre 2026

Cette évolution reprend la référence fournie : recherche large, salutation, bandeau montagne et lancement de révision, parcours et raccourcis, régularité compacte, puis collèges. La sidebar et ses icônes restent celles de l'application.

Le bandeau de révision est compact : 168 px de hauteur minimale, avec un titre et des espacements réduits. Le bouton garde une hauteur de 44 px sur tablette. Le panneau peut grandir si un message supplémentaire ou un texte sur plusieurs lignes le nécessite.

Le composant de dashboard existant est partagé entre les tailles d'écran. Les valeurs et actions utilisent les calculs et handlers déjà présents : progression réelle, révisions dues, durée estimée, série actuelle, historique annuel, progression par collège, création et révision. Aucune donnée de compte ni route API n'est modifiée.

Les styles PC/tablette sont isolés dans `src/styles/16-desktop-dashboard.css`, à partir de 768 px. Les container queries tiennent compte de la largeur réellement disponible, avec la sidebar ouverte ou repliée. Au-dessus de 780 px de contenu, parcours et raccourcis se partagent une ligne et le calendrier accompagne la semaine. En dessous, les panneaux et le calendrier se placent verticalement. Les deux raccourcis restent côte à côte. Le contenu défile pour rendre les collèges accessibles sur les écrans bas ; les cartes ne sont pas étirées à la hauteur de la fenêtre.

Le calendrier garde les 53 semaines sur une ligne, avec une taille de case ajustée à la largeur et une hauteur limitée. Il reste repliable au clavier et au toucher. Le thème sombre et la préférence de réduction des animations sont pris en compte. Les règles et la barre de navigation du téléphone restent inchangées.

## Vérification

`node tests/browser-dashboard.mjs` vérifie Chrome et WebKit aux formats 1920×1080, 1440×900, 1280×800, 1024×768, 820×1180 et 768×1024 : position des panneaux, absence de débordement, calendrier complet, accès aux collèges, sidebar ouverte/repliée, thèmes, recherche, raccourcis et lancement de révision. Des cas complémentaires contrôlent les données non nulles (42 % de progression), l'état vide et le passage téléphone/tablette.

`npm run test:browser:mobile` couvre les sept tailles de téléphone et les interactions existantes. Les API sont simulées ; aucun compte de production n'est utilisé. Ces vérifications sont des simulations de viewports, pas des tests sur des appareils physiques.

Les captures, résultats et la sauvegarde avant modification se trouvent dans `exports/dashboard-desktop-2026-10-11`. La compilation est effectuée dans une copie isolée pour préserver la page de vente et les fichiers de déploiement existants.

## Installation LWS

Le ZIP habituel `deploy-full.zip` et le dossier `deploy-full` du projet principal sont remplacés par la nouvelle version, avec sauvegarde préalable. Le frontend mis à jour comprend `app.html`, `assets/main.js` et `assets/main.css`. Les URLs des bundles portent une nouvelle empreinte pour renouveler le cache. Dézipper dans le dossier public ItemsTracker sur LWS en remplaçant ces fichiers. Le push Git ne publie pas cette installation manuelle.
