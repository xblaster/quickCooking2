# Tasks

## 1. Serveur

- [x] 1.1 Autoriser `PUT choix/<période>/repas/<repasId>` dans l'alias machine de `server.mjs` et marquer l'entrée (`via`, `appareil: null`) ; vérifier par `npm test`
- [x] 1.2 Tests : corriger, vider, sans jeton + en-tête forgé (401), validation (400/409), routes voisines (404), reprise par le site (`via` disparaît) ; vérifier `npm test` vert

## 2. Documentation

- [x] 2.1 `docs/donnees-entree-batch-cooking.md` (tableau des routes machine) et `README.md` (routes machine) ; vérifier que la route y figure

## 3. Livraison

- [ ] 3.1 Construire et pousser `xblaster/quick-cooking:<AAAAMMJJ-sha7>`, tester en conteneur local ; vérifier `PUT /api/export/choix/…` 200 avec jeton et 401 sans
- [ ] 3.2 Mettre le tag dans `deploy/k8s/deployment.yaml` et l'IaC du repo infra, `kubectl apply --dry-run=server` ; vérifier l'acceptation
- [ ] 3.3 Déployer (validation de Jérôme, coupure `Recreate` de quelques secondes) ; vérifier `/healthz` et un `PUT` machine réel

## Workflow follow-up

- Mettre à jour le skill `batch-cooking-famille` (`publier_site.py`, SKILL.md) : `PUT /api/export/choix/…`.
