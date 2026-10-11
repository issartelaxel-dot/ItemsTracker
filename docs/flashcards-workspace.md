# Flashcards — présentation responsive

La page reprend la référence visuelle fournie : titre et compteurs, création et révision en haut, panneau de filtres à gauche, regroupement Statut/Collège/Item, vues Ligne/Galerie, puis cartes avec les icônes médicales existantes, progression et actions.

Le nombre de thématiques et les compteurs proviennent des données actuelles. Le compteur d'items maîtrisés indique les items ayant des flashcards dont toutes les évaluations sont « Facile » ou « Très facile ». Les pourcentages des cartes gardent les calculs existants.

Les filtres de statut s'appuient sur ces pourcentages : Non maîtrisés = 0 %, En cours = entre 0 et 100 %, Maîtrisés = 100 %. Les compteurs portent sur les résultats des autres filtres, avant sélection du statut. « Organiser par Statut » classe ces groupes en conservant le tri choisi dans chaque groupe. « Collège » conserve la galerie de collèges ; « Item » affiche les items ayant des cartes.

La recherche du panneau latéral porte sur le numéro et le titre des items associés. La recherche supérieure porte sur les thématiques, ou les items dans la vue Item. Les deux commandes de niveau et de tri sont synchronisées. Réinitialiser efface recherches, niveau, tri, statut et éventuel filtre de collège. Un filtre de collège ouvert depuis les options est signalé au-dessus des résultats et peut être effacé.

Les boutons de quiz, de liste des cartes, d'options et de création utilisent les handlers existants. Les filtres et changements de présentation ne modifient ni les cartes ni leur suivi. Le code du formulaire de création, de l'éditeur et des sessions de révision reste celui de l'application.

## Responsive et validation

Les contrôles sont partagés entre téléphone, tablette et PC. Les règles de mise en page PC/tablette restent limitées à partir de 768 px. La largeur disponible détermine le nombre de colonnes. Sur tablette étroite, le panneau de filtres passe au-dessus des cartes et s'ouvre avec son bouton ; sur téléphone, le catalogue propose Créer/Réviser, une recherche, les onglets Statut/Collège/Item et Ligne/Galerie. Les filtres s’ouvrent dans un panneau inférieur modal avec titre, fermeture et validation toujours visibles. Seul son contenu défile ; les statuts ont des repères colorés, adaptés aux thèmes clair et sombre. Les icônes médicales et la barre de navigation existantes sont conservées. Les boutons ont une cible d'au moins 44 px, les contrôles utilisent les états accessibles `aria-pressed` et `aria-expanded`, et le thème sombre est adapté.

`node tests/browser-flashcards.mjs` vérifie Chrome et WebKit à 1920×1080, 1440×1000, 1280×800, 1024×768, 820×1180 et 768×1024. Les cas incluent données non nulles, filtres combinés, recherches séparées, reset, niveaux/tri synchronisés, regroupements, Ligne/Galerie, listes, options, création, révision, clavier, thèmes, état vide et changement téléphone/PC. Les appels API sont simulés. `npm run test:browser:mobile` couvre les sept formats de téléphone et leurs actions existantes.

Les captures et sauvegardes se trouvent dans `exports/flashcards-workspace-2026-10-11`. Ces vérifications utilisent des viewports simulés, pas des appareils physiques.

## Installation

Le dossier et le ZIP `deploy-full` du projet principal sont mis à jour après validation. Une sauvegarde du ZIP précédent est conservée. Seuls `app.html`, `assets/main.js` et `assets/main.css` sont remplacés ; les autres fichiers de l'archive sont conservés. Installer sur LWS en remplaçant ces fichiers dans le dossier public ItemsTracker. Le push Git ne met pas à jour cette installation manuelle.

`node tests/browser-flashcards-mobile-workspace.mjs` vérifie les actions du nouveau catalogue et du panneau de filtres, les recherches combinées, les niveaux et statuts, la navigation au clavier, le retour du focus, les thèmes et les changements de breakpoint à 320, 375, 390, 430 et 767 px dans Chrome et WebKit. Les captures et le ZIP mis à jour sont documentés dans `exports/flashcards-mobile-2026-10-12`.
