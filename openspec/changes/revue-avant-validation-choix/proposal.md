# Proposal

## Why

Pauline voudrait, avant de valider la session de choix, une revue qui dise si des produits du frigo
n'ont été utilisés par aucun plat, si les règles du poisson (et les autres règles de la famille) sont
respectées, et ce que les choix font concrètement. Aujourd'hui « On a fini de choisir » valide d'un
toucher : les repères existent (bloc « Équilibre de la période », panneau des stocks) mais sont dispersés
et ne forment pas un dernier contrôle avant d'envoyer les choix à « batch cooking ».

## What Changes

- Le bouton « On a fini de choisir » n'enregistre plus le statut `termine` directement : il ouvre une
  fenêtre « Dernier coup d'œil avant de valider ».
- La fenêtre résume en trois blocs :
  - **Le frigo et les stocks** : produits à consommer (date limite proche, présents depuis longtemps) ou
    marqués « à finir » qu'aucun plat prévu ne consomme ; repli listant les produits utilisés et le repas
    qui les emploie.
  - **Les règles de la famille** : un seul repas viande/poisson par jour, poisson par semaine (n sur
    cible), poisson gras sur la période, limites de période (pommes de terre, bœuf, soupes…), aucun plat
    interdit (avec les repas concernés).
  - **Ce que ces choix changent** : protéines par personne (moyenne par jour, jours au-dessus du plafond
    ou sous la cible), nombre de plats différents, plats jamais cuisinés, repas en restes.
- Deux actions : « Retourner modifier » (ferme la fenêtre) et « Valider ce menu » (enregistre `termine`).
  Un bandeau signale les repas sans plat choisi.
- « Rouvrir nos choix » reste direct. La revue est purement informative : elle ne bloque jamais la
  validation, même avec des alertes.
- Aucun changement du contrat d'export, du format des choix ni de l'API.

## Capabilities

### New Capabilities
- `revue-avant-validation`: revue de la période à venir (stocks, règles, impact) présentée avant la validation des choix.

### Modified Capabilities

## Impact

- Code : `public/js/regles.js` (`revuePeriode`, `poissonParSemaine` ; `evaluerPeriode` expose en plus
  `joursDoubleCarne` et `poisson`), `public/js/app.js` (`ouvrirRevue`, actions `revue` et `valider-choix`),
  `public/index.html` (dialogue `#revue`), `public/style.css`, `test/regles.test.mjs`.
- Runtime : front uniquement, nouvelle image à construire et à déployer (tag daté, namespace
  `quick-cooking`) ; aucune variable, aucun volume, aucun secret nouveaux.
- Documentation : README du projet (description de « choisir la période à venir »), runbook
  `namespaces/quick-cooking/README.md` du dépôt d'infrastructure après déploiement.
