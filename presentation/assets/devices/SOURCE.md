# Captures d’interface ItemsTracker

Source : frontend déployé à https://setup-hub.com/itemstracker, capturé le 9 octobre 2026.

- dashboard-desktop.png : navigateur 1440 × 900, densité 1,5.
- items-mobile.png : navigateur 390 × 844, densité 1,5 ; liste des items, menu replié via son contrôle natif.

Les captures montrent l’interface réellement déployée, pas une illustration générée. Toutes les routes API ont été interceptées dans un navigateur isolé pour servir des données de démonstration (profil Julien Démo, adresse demo@example.com, suivi fictif). Aucun compte réel connecté, aucune donnée personnelle, aucune écriture à l’API de la plateforme. Le code de l’application n’a pas été modifié. Les contenus portent sur les révisions médicales ; aucun contenu de gestion d’objets ou logo cubique de la référence n’est réutilisé.

## Visuels utilisés après validation de la nouvelle composition

- dashboard-principal.png (1520 × 1028) : capture à densité 2 du tableau de bord HTML/SVG de cette page de présentation, avec activité figée à 37 lectures (21 %). Reprise exacte du visuel de référence approuvé par l’utilisateur ; il s’agit d’un aperçu illustratif avec données d’exemple, pas d’une capture de compte connecté.
- flashcard-mobile.png (537 × 807) : capture du panneau de révision du frontend déployé, issue de qa/device-focus-mobile.png. Données médicales de démonstration interceptées localement, aucun compte réel ni appel de mutation envoyé. La capture du téléphone de la proposition validée est conservée sans modification.
- Les cadres navigateur/téléphone sont construits en CSS ; aucun appareil raster généré.

## Écran du téléphone désormais natif

À la demande d’amélioration de la netteté, le téléphone ne charge plus flashcard-mobile.png : son aperçu est construit en HTML/SVG et unités relatives au cadre. Contenu médical illustratif de l’item 233, question et réponse issues de l’exemple déjà validé. Aucun compte connecté, aucune capture raster ou génération AI utilisée pour le téléphone actuel. La plateforme réelle reste inchangée.
