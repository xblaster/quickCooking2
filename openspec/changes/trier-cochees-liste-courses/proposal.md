# Proposition

## Why

En magasin, les lignes déjà cochées restent mêlées à celles qu'il reste à acheter : le 06/11/2026, sur 48 lignes dont 35 cochées, il a fallu produire un document à part pour obtenir une liste lisible. La page Courses doit offrir cette vue directement, sur le téléphone.

## What Changes

- Ajout sur la page Courses d'un bouton « Mettre les cochées en bas ». Un appui fait basculer toutes les lignes cochées à ce moment dans une section « Déjà cochées », plus bas dans la page. Le bouton ne reste pas enfoncé.
- Les lignes restantes gardent leurs blocs et leurs rayons. Un bloc ou un rayon vide n'est plus affiché.
- Une ligne cochée ensuite reste à sa place jusqu'au prochain appui : la liste ne bouge pas sous le doigt pendant les courses.
- Une ligne décochée dans la section « Déjà cochées » retourne à sa place d'origine.
- Le rangement est retenu sur l'appareil, pour la période en cours. Sans appui, la page reste identique à aujourd'hui, à part le bouton.
- Aucun changement de format de données ni d'API : les cases restent partagées, le rangement ne change que l'affichage de l'appareil.

Hors périmètre : un mode permanent, le masquage complet des lignes cochées, le tri par rayon de magasin, le tableau « Déjà à la maison », un document imprimable.

## Capabilities

### New Capabilities

- `liste-de-courses` : affichage de la liste de courses partagée et mise de côté des lignes cochées.

### Modified Capabilities

Aucune : `openspec/specs/` ne contient encore aucune spécification.

## Impact

- `public/js/app.js` : vue `vueCourses`, action du bouton, redessin quand une ligne rangée est décochée.
- `public/js/outils.js` : répartition des lignes, testable sans navigateur.
- `public/style.css` : présentation du bouton et de la section.
- `test/regles.test.mjs` : tests de la répartition.
- Image Docker et `deploy/k8s/` : nouvelle image à construire. Aucun changement de persistance serveur, de secret ni d'API.
