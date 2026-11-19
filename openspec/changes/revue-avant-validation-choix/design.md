# Design

## Context

Le site est une page unique en JavaScript sans dépendance (`public/js/app.js`) ; les contrôles sont des
fonctions pures dans `public/js/regles.js` (`evaluerPeriode`, `usageStocks`, `articlesAConsommer`). Le bloc
« Équilibre de la période » et le panneau des stocks existent déjà ; le statut `termine` s'enregistre via
`PUT /api/choix/<période>`. Les fenêtres utilisent des `<dialog>` modaux (`#fiche`, `#avis`, `#confirmer`).
Voir proposal.md pour la motivation.

## Goals / Non-Goals

**Goals:**
- Une fonction pure `revuePeriode` testable sans navigateur, qui assemble stocks, règles et impact.
- Réutiliser les calculs existants plutôt que dupliquer les règles.

**Non-Goals:**
- Bloquer la validation, ou enregistrer la revue ou une signature de revue.
- Changer l'export, l'API ou le format `choix/<période>.json`.
- Simuler les courses ou les coûts (hors demande).

## Decisions

- **Calcul côté client, pure fonction** dans `regles.js` (`revuePeriode`), à côté des règles existantes.
  Alternative : endpoint serveur, rejeté (les données et règles sont déjà dans le navigateur, un seul pod).
- **Extraction de `poissonParSemaine`** depuis `bilanPeriode` pour que le bilan existant et la revue
  partagent la même règle. `evaluerPeriode` expose en plus `joursDoubleCarne` et `poisson`.
- **Couverture des stocks** : les produits pressés « couverts » sont déterminés par `couverture()` de
  `app.js` (période courante et à venir), passés à `revuePeriode` via `couverts`, pour ne pas signaler un
  produit déjà consommé cette semaine. Les « à finir » sont jugés sur la seule période à venir.
- **Dialogue `#revue`** dans le style des fenêtres existantes ; actions `revue` et `valider-choix` dans le
  gestionnaire de clics. Niveaux affichés avec `symbole()` (icône et texte, jamais la couleur seule).
- **Informative seulement** : décision de produit ; la famille garde la main (un plat interdit ou une
  règle info peut être voulu, ex. invités).

## Risks / Trade-offs

- [Règles de poisson ou de limites propres à l'export] → la revue n'affiche que ce que l'export décrit ; sans `poisson_par_semaine`, rien n'est affiché.
- [Bruit : beaucoup d'alertes sur une période mal remplie] → bandeau des repas manquants en tête ; repli pour les produits utilisés.
- [Extraction de `poissonParSemaine` pouvant altérer le bilan existant] → tests existants du bilan conservés, test dédié.
- [Un toucher de plus avant de valider] → assumé, c'est le but de la demande.

## Migration Plan

Front uniquement : nouvelle image au tag daté `AAAAMMJJ-<sha7>`, `kubectl diff`, `--dry-run=server`, rollout
`Recreate` (quelques secondes de coupure), puis `rollout undo` si besoin. Pas de donnée à migrer.
