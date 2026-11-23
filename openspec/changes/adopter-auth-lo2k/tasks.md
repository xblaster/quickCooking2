# Tasks

## 1. Serveur : identité par en-têtes

- [x] 1.1 Dans `server.mjs`, ajouter `identite(req)` (format `^[A-Z][A-Za-z0-9]{0,7}$`, `X-Auth-Admin: 1`) et la porte « 401 sans identité » sur les routes du site (hors `/api/export*`, `/api/appareils` à jeton, statiques, `/healthz`) ; vérifier par test : `GET /api/donnees` sans en-tête → 401, avec `X-Auth-Personne: J` → 200, valeur invalide → 401
- [x] 1.2 `GET /api/session` renvoie `{ personne, admin }` sans `Set-Cookie` ; retirer `/api/passkeys*`, `/api/invitations`, `DELETE /api/session`, le cookie `qc_session` et les imports ; vérifier par test : anciennes routes → 404
- [x] 1.3 Avis et courses attribués à `identite.personne` (le `par` du corps des courses est ignoré) ; vérifier par test : `PUT /api/avis/…` avec `par: "J"` sous l'identité `G` enregistre pour `G`
- [x] 1.4 Garde d'écriture (JSON exigé, `Origin` égal à `SITE_ORIGIN` quand présent) ; vérifier par test : `Origin: https://noel.lo2k.net` → 403, `text/plain` → 415
- [x] 1.5 Routes machine : alias en lecture `GET /api/export/choix[/<id>]` et `GET /api/export/avis[/<id>]` (jeton seul, jamais d'en-tête d'identité, `PUT` → 404) ; vérifier par test : jeton → 200, `X-Auth-Admin: 1` sans jeton → 401
- [x] 1.6 Supprimer `lib/passkeys.mjs`, `FICHIER_PASSKEYS` de `lib/stockage.mjs` (et son commentaire), les variables `RP_ID`/`RP_ORIGIN`/`ADMINS` ; vérifier que `node server.mjs` démarre et que le journal de démarrage annonce l'identité `auth`

## 2. Front

- [x] 2.1 `public/js/app.js` : `api()` expose `statut` ; `ouvrirSession` n'utilise que `/api/session` ; l'en-tête « Je suis » montre la personne connectée (plus de boutons de choix ni de clé) ; vérifier par `grep` : plus aucune occurrence de `passkey`, `invitation`, `credentials`, `qc-moi`, `/api/passkeys`, `/api/invitations` dans `public/`
- [x] 2.2 Page `#/moi` : identité, nom de l'appareil, liens `auth.<domaine>/connexion` et `/admin` (administrateur) ; retirer l'administration des passkeys, les formulaires de création, le code d'invitation et le panneau de connexion du tiroir d'avis ; vérifier dans un navigateur local avec des en-têtes injectés (proxy de test) que la page s'affiche pour `J` admin et `P`
- [x] 2.3 Page « Connexion requise » (401 au démarrage) avec bouton vers `auth.<domaine>/connexion?rd=…`, sans redirection automatique ; vérifier en local sans en-tête
- [x] 2.4 `public/style.css` : retirer les règles devenues mortes (`.form-passkey`, `.code-invitation`, `.liste-passkeys`, etc.) et vérifier qu'aucune classe retirée n'est encore utilisée (`grep`)

## 3. Tests

- [x] 3.1 Adapter `test/serveur.test.mjs` : toutes les requêtes du site portent `X-Auth-Personne`, remplacer les tests passkeys/session/invitations par les scénarios des specs `identite-auth-lo2k` et `api-machine-export` ; supprimer `test/passkeys.test.mjs` et `test/webauthn-faux.mjs` ; `npm test` vert

## 4. Documentation du dépôt

- [x] 4.1 `README.md` (variables, fichiers, section identité/avis), `PRODUCT.md`, `DESIGN.md` (section Identité), `docs/donnees-entree-batch-cooking.md` (URL `/api/export/choix` et `/api/export/avis`, note sur `/api/choix` et `/api/avis` réservés au site) ; vérifier par `grep` qu'aucune mention de passkey locale ne subsiste hors `openspec/changes/archive` et `avis-plats-et-passkeys`
- [x] 4.2 `deploy/k8s/` : retirer `RP_ID`/`RP_ORIGIN`/`ADMINS` du Deployment, ajouter `networkpolicy.yaml`, `ingress-machine.yaml` et les annotations d'`auth` ; vérifier par `kubectl apply --dry-run=server -f deploy/k8s/` (sans appliquer)

## 5. IaC et runbook (`lo2k_infrastructure/namespaces/quick-cooking/`)

- [x] 5.1 Reporter les mêmes manifestes dans `iac/` (Deployment, NetworkPolicy, Ingress machine, Ingress annoté) ; vérifier par `kubectl apply --dry-run=server` et `kubectl diff` limité aux différences attendues
- [x] 5.2 Répétition fantôme `scripts/auth/proteger.py fantome quick-cooking quick-cooking-ingress quick-cooking` (sans bascule) ; vérifier « OK »
- [x] 5.3 Mettre à jour `namespaces/quick-cooking/README.md` (identité par `auth`, NetworkPolicy, exemption, procédure de déploiement et de retour arrière, journal) ; vérifier les liens

## 6. Image

- [x] 6.1 Construire et pousser `xblaster/quick-cooking:AAAAMMJJ-<sha7>` (linux/amd64, jamais `latest`) ; vérifier le digest par `docker buildx imagetools inspect` et un démarrage local du conteneur (`/healthz` 200, `/api/donnees` 401 sans en-tête, 200 avec)

## 7. Déploiement (validation humaine, ne pas exécuter sans accord de Jérôme)

- [ ] 7.1 Préparer dans `auth.lo2k.net/admin` : droit `quick-cooking` pour G et P, codes pour les appareils de la famille ; deux appareils de Jérôme inscrits
- [ ] 7.2 Mettre à jour le skill/script de batch cooking (URL de lecture sous `/api/export/`)
- [ ] 7.3 Appliquer NetworkPolicy, Ingress machine et annotations, puis `kubectl set image` aussitôt après ; vérifier `/` 302 sans session, `PUT /api/export` avec jeton 200, avis et courses au nom de la personne connectée, `scripts/verify-cluster.py C7 C11 C12`
- [ ] 7.4 Période de retour arrière, puis supprimer `passkeys.json` du PVC (action séparée, confirmée)

## Workflow follow-up

- Archiver ce change après le déploiement et la période de retour arrière (et archiver `avis-plats-et-passkeys`, dont l'identité par passkey locale est remplacée).
