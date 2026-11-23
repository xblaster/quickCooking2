# Proposal

## Why

Quick Cooking gère lui-même ses passkeys (RP ID `quick-cooking.lo2k.net`), ses codes d'invitation et ses
sessions. Les autres sites `*.lo2k.net` (noel, vinted, encaisse, foyer, kata) sont désormais protégés par un
service commun, `auth.lo2k.net` (change `auth-lo2k-passkeys` du dépôt `lo2k_infrastructure`) : une passkey par
appareil, des droits par site, une page d'administration. Garder une deuxième identité dans Quick Cooking
oblige la famille à créer deux passkeys, double le code à maintenir et laisse la lecture des menus ouverte à
tout Internet. On veut une seule identité : `auth` décide qui entre, Quick Cooking lit seulement qui est là.

## What Changes

- Le serveur lit l'identité dans les en-têtes `X-Auth-Personne`, `X-Auth-Appareil` et `X-Auth-Admin`, posés
  par ingress-nginx après la décision d'`auth.lo2k.net`. Les codes de personnes (`J`, `P`, `G`) sont ceux d'`auth`.
- **Sans identité, toute route d'API réservée à la famille répond 401** (la lecture n'est plus ouverte).
  Les fichiers statiques et `/healthz` restent sans contrôle : l'Ingress protège déjà les pages.
- `GET /api/session` renvoie la personne et l'indicateur administrateur lus dans les en-têtes.
- La personne qui coche une course ou donne un avis est **toujours celle de l'identité**, jamais celle du corps
  de la requête.
- Retrait du module `lib/passkeys.mjs`, du cookie `qc_session`, des routes `/api/passkeys*`, `/api/invitations`
  et `DELETE /api/session`, des variables `RP_ID`, `RP_ORIGIN`, `ADMINS`, et des écrans passkeys, invitation et
  administration du site. La page « Mon identité » devient une page simple qui renvoie vers `auth.lo2k.net`.
- **BREAKING** — Les passkeys déjà créées dans Quick Cooking (RP ID `quick-cooking.lo2k.net`) ne sont pas
  transférables vers `auth` (RP ID `lo2k.net`) : chaque appareil se réenregistre une fois sur `auth.lo2k.net`.
  Le fichier `passkeys.json` du PVC n'est plus lu ; sa suppression est une action séparée, plus tard.
- **BREAKING** — Les lectures de « batch cooking » passent sous `/api/export/` : `GET /api/export/choix[/<id>]`
  et `GET /api/export/avis[/<id>]` remplacent `GET /api/choix` et `GET /api/avis` avec jeton. Seul le préfixe
  `/api/export` est exempté de la décision d'`auth` ; les routes du site (`/api/choix`, `/api/avis`) ne le sont
  pas, sinon elles perdraient les en-têtes d'identité.
- Garde d'écriture : toute écriture du site exige un corps JSON et, si `Origin` est présent, l'origine du site
  (le cookie d'`auth` est `SameSite=Lax` et couvre tout `*.lo2k.net`, plus strict que l'ancien `Strict`).
- IaC : NetworkPolicy n'admettant que ingress-nginx (les en-têtes ne sont fiables qu'à cette condition),
  Ingress `quick-cooking-machine` (exemption `/api/export`), annotations forward-auth sur `quick-cooking-ingress`.

Hors périmètre : le registre des appareils (`X-Appareil`, `appareils.json`, mode `libre`) reste tel quel ;
le déploiement réel sur le cluster (tâche distincte, validée par Jérôme).

## Capabilities

### New Capabilities
- `identite-auth-lo2k`: identité du site lue dans les en-têtes d'`auth.lo2k.net`, refus sans identité, session,
  attribution des actions à la personne authentifiée, garde d'écriture, retrait des passkeys locales.
- `api-machine-export`: routes de « batch cooking » sous `/api/export/` avec `IMPORT_TOKEN`, exemptées de la
  décision d'`auth`, sans jamais lire les en-têtes d'identité.

### Modified Capabilities
<!-- Aucune spec principale n'existe encore dans ce dépôt (openspec/specs est vide). Le change
     `avis-plats-et-passkeys` (non archivé) définit `identite-passkeys` et `avis-plats` ; ce change remplace
     l'identité par passkey locale et ne modifie pas le contenu des avis. -->

## Impact

- **Code** : `server.mjs`, `lib/stockage.mjs`, `lib/passkeys.mjs` (supprimé), `public/js/app.js`,
  `public/style.css`, tests (`test/serveur.test.mjs`, `test/passkeys.test.mjs` supprimé, `test/webauthn-faux.mjs`
  supprimé), `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/donnees-entree-batch-cooking.md`, `deploy/k8s/`.
- **Cluster** (`lo2k_infrastructure/namespaces/quick-cooking/`) : Deployment (variables `RP_ID`, `RP_ORIGIN`,
  `ADMINS` retirées), NetworkPolicy, Ingress d'exemption, annotations d'`auth`, runbook.
- **Dépendance** : `auth.lo2k.net` devient indispensable à Quick Cooking (s'il tombe, le site refuse l'accès).
- **Clients externes** : le skill/le script « batch cooking » doit changer deux URL de lecture.
- **Données** : `passkeys.json` reste sur le PVC, inutilisé. Les avis et courses existants (clés `J`/`P`/`G`)
  restent valides.
