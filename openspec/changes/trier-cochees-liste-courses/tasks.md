# Tâches

## 1. Répartition des lignes

- [x] 1.1 Ajouter `repartirCourses(courses, rangees, cochees)` dans `public/js/outils.js`, et vérifier par `npm test` les cas : rien de rangé, liste partiellement rangée, ligne rangée puis décochée, ligne cochée après l'appui restée en place, rayon, passage et bloc à vérifier vidés, ordre d'origine conservé.

## 2. Page Courses

- [x] 2.1 Ajouter dans `etat` les lignes rangées, lues et écrites avec `lireLocal` et `ecrireLocal` sous `courses_rangees_<id de période>`, et vérifier qu'elles tiennent après un rechargement, qu'une autre période repart de zéro et que la page marche quand `localStorage` échoue.
- [x] 2.2 Ajouter le bouton « Mettre les cochées en bas » et son action dans l'en-tête de `vueCourses`, et vérifier qu'il range les lignes cochées d'un appui, qu'il ne reste pas enfoncé et qu'il n'apparaît que s'il reste une ligne cochée hors de la section.
- [x] 2.3 Afficher les lignes réparties dans `vueCourses`, avec la section « Déjà cochées (N) » après « Déjà à la maison » (le bouton « Tout décocher » étant supprimé), et vérifier que la page ne change pas, à part le bouton, tant que personne n'a appuyé.
- [x] 2.4 Redessiner quand une ligne rangée est décochée, et vérifier qu'elle retourne à sa place avec le focus sur sa case, qu'une ligne cochée après l'appui ne bouge pas et qu'une erreur simulée laisse la ligne rangée et cochée.
- [x] 2.5 Ajouter les styles du bouton et de la section dans `public/style.css`, et vérifier le rendu à 360 px de large, en clair et en sombre si le site le propose, sans défilement horizontal.
- [x] 2.6 Vérifier avec deux navigateurs qu'une ligne cochée sur l'un reste en place sur l'autre, qu'une ligne rangée décochée sur l'un retourne à sa place sur l'autre en 10 s environ, et qu'un appui sur un appareil ne range rien sur l'autre.

## 3. Livraison

- [x] 3.1 Lancer `npm test` et vérifier que toute la suite passe.
- [ ] 3.2 Construire l'image `xblaster/quick-cooking:<AAAAMMJJ-sha7>` et mettre à jour son tag dans `deploy/k8s/` selon `docs/deploiement.md`, puis vérifier que l'image répond 200 sur `GET /` en local.
- [ ] 3.3 Faire valider par un humain le déploiement réel sur le cluster `catwo`, puis vérifier sur https://quick-cooking.lo2k.net/#/courses que le bouton fonctionne sur téléphone.

## Workflow follow-up

- Archiver le change après validation du déploiement.
