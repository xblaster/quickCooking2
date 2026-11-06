# Conception

## Context

`vueCourses` (`public/js/app.js`) produit toute la page en une chaîne HTML à partir de `periode_courante.courses` et de `etat.courses.coches`. Trois comportements actuels comptent ici :

- `cocher()` met à jour l'état et le serveur, mais ne redessine la page qu'en cas d'erreur : c'est la case native qui change d'aspect.
- Une mise à jour périodique (10 s) redessine la page quand une case a changé ailleurs.
- `lireLocal` et `ecrireLocal` gardent déjà les préférences de l'appareil et tolèrent un stockage indisponible.

Le bloc « Déjà à la maison » existe déjà en bas de page. Le bouton « Tout décocher » a été retiré (inutile et source d'erreurs en magasin). Voir proposal.md pour la motivation.

## Goals / Non-Goals

**Goals :**
- Une répartition des lignes testable sans navigateur.
- Une page identique à aujourd'hui, à part le bouton, tant que personne n'a appuyé.

**Non-Goals :**
- Aucune modification de l'API, du format `courses` ni du stockage serveur.
- Aucune animation de déplacement des lignes.

## Decisions

**1. Mémoriser les lignes rangées, pas un mode.** Un appui enregistre l'ensemble des `id` cochés à cet instant. Une ligne n'apparaît dans la section que si son `id` est rangé **et** toujours coché. Le déplacement n'a donc lieu qu'à l'appui, et un décochage la remet à sa place sans code particulier. Alternative écartée : un mode actif qui trie en direct, refusé par le foyer et source de lignes qui bougent sous le doigt.

**2. Fonction pure de répartition dans `public/js/outils.js`.** `repartirCourses(courses, rangees, cochees)` renvoie le bloc à vérifier et les passages sans les lignes rangées encore cochées, les rayons et passages vides retirés, et la liste plate des lignes rangées dans l'ordre d'origine. `test/regles.test.mjs` importe déjà ce module. Alternative écartée : filtrer dans le gabarit, testable seulement à travers le navigateur.

**3. Section finale unique et plate.** Les lignes rangées ne gardent pas leurs titres de rayon : cette section sert à retrouver une ligne pour la décocher, pas à faire les courses. Alternative écartée : conserver les rayons, ce qui rallonge le bas de page sans utilité.

**4. Ordre en bas de page : « Déjà à la maison », puis « Déjà cochées ».** La section « Déjà cochées » est la dernière de la page. Le bouton « Tout décocher » a été supprimé car inutile et source d'erreurs en magasin. Alternative écartée : placer la section avant « Déjà à la maison », qui resterait sous des lignes inutiles en magasin.

**5. Stockage local par période.** La clé `courses_rangees_<id de période>` passe par `lireLocal` et `ecrireLocal`, avec un champ de `etat` qui garde le rangement jusqu'au rechargement si le stockage échoue. Une nouvelle période a donc une liste neuve. Alternative écartée : un rangement partagé par le serveur, alors que deux personnes dans le magasin peuvent vouloir deux vues différentes.

**6. Redessiner seulement quand une ligne rangée est décochée.** Cocher une ligne reste sans redessin, comme aujourd'hui. Décocher une ligne rangée redessine la page dès la mise à jour optimiste ; en cas d'erreur, le code existant restaure l'état et redessine.

**7. Bouton d'action classique dans l'en-tête de la page.** Un `<button>` « Mettre les cochées en bas » suit le modèle `data-action` et le style `bouton secondaire`, sans `aria-pressed`. Il n'apparaît que s'il reste au moins une ligne cochée hors de la section. Un compte « (N) » n'est pas ajouté : l'en-tête affiche déjà le nombre de lignes cochées.

**8. Focus préservé.** Après un appui, le bouton peut disparaître : le focus va alors sur le titre « Courses ». Après le retour d'une ligne décochée, le focus revient sur sa case grâce à son `data-id`.

## Risks / Trade-offs

- [Des lignes cochées restent dans la liste jusqu'au prochain appui] → C'est le comportement voulu : le bouton reste visible tant qu'il y en a.
- [Un autre téléphone ne range pas en même temps] → Accepté : chaque personne appuie quand elle veut.
- [Clés locales laissées par les anciennes périodes] → Accepté : quelques `id` sans effet sur l'affichage. Pas de purge prévue.

## Migration Plan

Aucune migration de données. Déploiement par une nouvelle image ; retour arrière par l'image précédente, selon `docs/deploiement.md`. La clé locale restée sur un appareil n'a aucun effet sur une ancienne version.
