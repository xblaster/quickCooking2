# Proposal

## Why

Depuis le passage derrière `auth.lo2k.net`, les routes du site (`/api/choix/…`) exigent une personne connectée.
« Batch cooking » ne peut plus corriger un choix ni vider une case pré-remplie (`PUT /api/choix/<période>/repas/<repasId>`
avec `ref: null`) : il reçoit un 302. Or le skill en a besoin pour qu'un nouvel envoi de `periode_a_venir` ne laisse
pas de cases anciennes cochées (« les choix déjà stockés survivent à un nouvel envoi »).

## What Changes

- Nouvelle route machine `PUT /api/export/choix/<période>/repas/<repasId>` : jeton `IMPORT_TOKEN` seulement, jamais les
  en-têtes `X-Auth-*`. Même validation et mêmes effets que la route du site, y compris l'effacement (`ref: null`).
- L'entrée écrite par la machine porte `via: "batch-cooking"` et aucun appareil ; une écriture du site la remplace.
- Les routes du site et l'Ingress `quick-cooking-machine` ne changent pas (`/api/export/` est déjà exempté).

## Capabilities

### New Capabilities
- `ecriture-machine-choix`: correction ou effacement d'un choix de repas par « batch cooking », par le jeton.

### Modified Capabilities

## Impact

- `server.mjs` (alias machine), tests, `docs/donnees-entree-batch-cooking.md`, `README.md`.
- Nouvelle image, redéploiement `Recreate` (quelques secondes de coupure), à valider par Jérôme.
- Skill `batch-cooking-famille` : remplacer les appels `PUT /api/choix/…` par `PUT /api/export/choix/…`.
