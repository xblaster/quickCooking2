# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Le foyer de Jérôme : trois personnes (Jérôme et Pauline, adultes ; Grégoire, adolescent), chacune sur
son appareil. Les adultes pilotent le site ; Grégoire consulte au mieux.

Deux situations dominent :

- **En cuisine, mains prises** : téléphone ou tablette posé pendant la préparation, pour lire le menu
  du jour et la fiche de la recette (plats numérotés `{N}`).
- **Coup d'œil rapide** : « on mange quoi ce soir, qui mange où ? », en quelques secondes.

Les autres usages existent (liste de courses en magasin, choix de la période à venir) mais ne sont pas
les situations principales.

## Product Purpose

Site familial privé (`https://quick-cooking.lo2k.net`) qui rend lisibles les décisions du projet
« batch cooking » : menu de la période en cours jour par jour, fiches recettes, courses, stocks
frigo / congélateur / cellier, macros de la journée par personne. Il recueille aussi les choix de la
famille pour la période à venir et les renvoie à « batch cooking ».

Réussite : chacun sait, sans réfléchir, ce qu'il mange, où, et comment le préparer.

## Positioning

Le site **ne compose pas** les menus. Ils sont délibérés ailleurs (« batch cooking », un collège de
voix : stocks, vie du foyer, nutrition, sécurité et textures, design, preuve) et arrivent par un export
JSON. Le site est la vitrine et le retour de choix de ce système, taillé pour un seul foyer réel, ses
contraintes (aversions, cibles de protéines, qui mange à la maison quel midi) et ses stocks.

## Operating Context

- Données : export JSON déposé par « batch cooking » (contrat `docs/donnees-entree-batch-cooking.md`,
  schéma `public/schema/export-v1.json`) ; choix et cases de courses stockés en JSON côté serveur,
  partagés entre appareils.
- Rythme : périodes (≈ semaines) ; la famille choisit la suivante parmi 1 à 5 propositions par repas,
  puis signale « On a fini de choisir ».
- Les fiches imprimées posées en cuisine (skill `ux-fiches-famille`) partagent les mêmes conventions :
  plats numérotés en pastilles, lecture instantanée.
- Appareils identifiés par une clé aléatoire, sans compte ; fermeture possible aux seuls appareils
  autorisés.

## Capabilities and Constraints

- Vues : Prochain repas (accueil), Semaine, Courses, À choisir, Recettes ; macros du jour et stocks au
  second plan (une ligne en bas de Semaine et À choisir, détail au toucher).
- Recherche de remplacement dans toute la base (type, temps, appareil, protéines, saison, froid,
  jamais cuisinée, coups de cœur) ; contrôles d'équilibre en direct.
- Macros douteuses marquées « chiffres douteux » et exclues des totaux.
- Technique : Node 22 sans dépendance, page unique `public/`, une seule réplique sur Kubernetes ;
  aucun secret dans le dépôt.
- Langue : français uniquement.

## Evidence on Hand

- `exemple/export.json` : 196 fiches recettes réelles, période S40-S41 ; la période à venir de
  l'exemple est fictive (options tirées par script, pas délibérées).
- Aucune donnée d'usage, aucun retour utilisateur formalisé : ne pas en inventer.

## Product Principles

1. **La réponse avant l'outil** : « quoi, qui, où, ce soir » se lit au premier regard.
2. **Utilisable mains prises** : en cuisine, lire et avancer sans effort ni précision du geste.
3. **Le site montre, il ne décide pas** : il reflète fidèlement les décisions de « batch cooking » et
   ne transforme pas ses données.
4. **Un vrai foyer, pas un public** : les noms, aversions et contraintes réels priment sur toute
   généralité.
5. **Honnête sur les chiffres** : ce qui est douteux est signalé, jamais lissé.
