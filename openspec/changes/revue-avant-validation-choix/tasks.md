# Tasks

## 1. Calcul de la revue

- [x] 1.1 Extraire `poissonParSemaine` et exposer `joursDoubleCarne` et `poisson` dans `evaluerPeriode` ; vérifier que les tests existants du bilan passent (`npm test`)
- [x] 1.2 Ajouter `revuePeriode` (stocks, règles, impact, repas manquants) dans `public/js/regles.js` ; vérifier avec le test « revue : règle du poisson, stocks sans plat et protéines »
- [x] 1.3 Passer la revue sur `exemple/export.json` et vérifier les sorties (poisson par semaine, plats interdits, protéines)
- [x] 1.4 Compléter les tests : couverture d'un produit pressé (`couverts`), double viande/poisson, plat interdit, export sans `poisson_par_semaine` ; vérifier `npm test` vert

## 2. Fenêtre de revue

- [x] 2.1 Ajouter le dialogue `#revue`, `ouvrirRevue`, les actions `revue` et `valider-choix`, et les styles ; vérifier `node --check public/js/app.js`
- [x] 2.2 Vérifier dans un navigateur (`npm run dev`, page « À choisir ») : ouverture, retour, validation, « Rouvrir nos choix », lecture à 360 px, mode sombre, clavier et lecteur d'écran (titres, niveaux en texte)
- [x] 2.3 Passer la fenêtre en revue visuelle (impeccable) et corriger les écarts de hiérarchie ou de contraste
- [x] 2.4 Mettre à jour `README.md` (section « choisir la période à venir ») et vérifier que la description colle au comportement

## 3. Livraison

- [x] 3.1 Construire l'image au tag daté `AAAAMMJJ-<sha7>`, la pousser, mettre à jour le tag dans `deploy/k8s/` ; vérifier que `kubectl apply --dry-run=server -f deploy/k8s/` passe
- [x] 3.2 Déploiement réel sur le cluster (`quick-cooking`) : tâche distincte, à valider par un humain ; vérifier rollout OK, `/` 200, `/healthz` 200, données du PVC intactes
- [x] 3.3 Consigner la version dans `namespaces/quick-cooking/README.md` (section Stack et Journal) du dépôt d'infrastructure
