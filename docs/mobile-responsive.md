# ItemsTracker — refonte mobile

Les maquettes du PDF « Mobile UX/UI Redesign » et les exigences des pages 7–8 servent de référence. Le périmètre demandé est limité aux téléphones : les nouveaux styles sont activés sous 768 px. La navigation et la présentation déjà présentes sur tablette et ordinateur sont conservées.

## Changements

- Barre inférieure Accueil / Items / Flashcards / Plus ; la sidebar est masquée sur téléphone.
- Panneau Plus : profil, Collèges, Insights (toujours indisponible), objectif quotidien existant, thème, paramètres, support et déconnexion.
- Dashboard : actions compactes, progression sur toute la largeur, série et révisions dues côte à côte, calendrier et progression par collège conservés.
- Items : cartes tactiles, titres complets, recherche accessible, progression et accès à la fiche. Filtres et tous les tris existants regroupés dans un bottom sheet.
- Fiche : retour à la liste, action de révision visible, quatre onglets accessibles. Ressources, aperçu des liens et lecture YouTube conservés.
- Révision : carte compacte dont la hauteur suit le contenu, progression visible, précédent/suivant, révélation de la réponse et les quatre évaluations existantes. Les contenus longs restent accessibles en faisant défiler la fenêtre.
- Panneaux : focus contenu dans le dialogue, fermeture par Échap ou fond, restauration du focus, retour navigateur pour les vues et filtres.
- Zones tactiles de 44 px minimum, champs de 16 px minimum, safe areas, prise en compte du visualViewport et des préférences de réduction des animations.

Les données, les calculs, l’authentification, les routes API et les handlers de sauvegarde/révision restent les mêmes. Aucun compte ni service de production n’a été modifié pendant les tests.

## Fichiers

`src/styles/13-mobile.css` contient les règles dédiées au téléphone. `MobileNavigation` et `MobileSheet` fournissent les nouveaux accès mobiles ; `App.tsx` les relie aux actions et états existants. Le viewport inclut `viewport-fit=cover`.

## Validation

Chrome et WebKit sont testés aux formats 320×568, 360×780, 375×667, 390×844, 430×932, 667×375 et 767×600. Les vérifications couvrent recherche, filtres, tri, réinitialisation, retour, thèmes, onglets, ressources, création, révision et sauvegarde d’une évaluation. Des contrôles complémentaires couvrent QCM, réponses longues, éditeur, recherche globale, focus, fermeture par fond et clavier simulé.

La comparaison à la version desktop de référence `d64466a` porte sur les dimensions et styles du dashboard, des Items, de la fiche et de l’éditeur à 1024 et 1440 px. Les captures et résultats sont conservés dans `exports/mobile-redesign-2026-10-10`.

Les appareils iPhone physiques ne sont pas disponibles dans cette session : WebKit et une simulation du clavier ont été utilisés. Vérifier une dernière fois le clavier logiciel et les safe areas sur un iPhone réel après installation.

Pour reproduire les tests :

```sh
npm run build
npx playwright install webkit
npm run test:browser:mobile
```

`MOBILE_QA_OUTPUT` permet de choisir le dossier des résultats. Les API sont intégralement simulées et les autres requêtes externes bloquées.

## Installation

Le dossier `deploy-full` et le fichier `deploy-full.zip` existants sont mis à jour dans le projet principal. Le ZIP correspond au chemin public `/itemstracker/` et à l’API de production déjà configurée. Remplacer les fichiers du frontend, notamment `app.html` et `assets/main.js` / `assets/main.css`, pour bénéficier des nouvelles versions de cache. Un push Git ne publie pas automatiquement le frontend installé manuellement.
