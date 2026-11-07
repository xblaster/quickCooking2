# Proposition : avis sur les plats et identification par passkey

## Why

Pendant la semaine, Jérôme, Pauline et Grégoire savent ce qui a plu, ce qu'il a fallu changer (portion,
assaisonnement, cuisson…) et ce qu'on ne veut plus revoir, mais ce retour se perd avant que « batch
cooking » prépare la période suivante. Il manque un endroit pour le noter sur le plat, au moment où on
l'a mangé, et une identité fiable pour savoir **qui** le dit : aujourd'hui « Je suis » est un bouton que
n'importe qui bascule, et la clé d'appareil est anonyme.

## What Changes

- **Avis sur les plats de la période courante.** Sur chaque repas `{N}` de `periode_courante`, chaque
  personne identifiée donne un verdict parmi quatre (« Coup de cœur », « Bien », « Bof »,
  « Plus jamais »), coche des étiquettes rapides facultatives (portion, assaisonnement, texture, temps,
  recette modifiée…) et écrit un commentaire libre facultatif. Elle peut le modifier ou l'effacer
  tant que la période est courante. Les avis des autres sont visibles en ligne compacte sous le plat.
- **Composant de saisie d'avis** conçu avec impeccable dans le monde « tableau des départs » : tiroir
  modal ouvert depuis la ligne de départ (Semaine, Accueil), verdicts en grandes pilules, étiquettes en
  chips, champ texte, enregistrement explicite.
- **Récupération par « batch cooking ».** Nouvelle route lue avec le jeton d'administration
  (`GET /api/avis` et `GET /api/avis/<période>`) qui renvoie tous les avis d'une période, pour le
  raffinement de la semaine suivante ; contrat documenté dans `docs/donnees-entree-batch-cooking.md`.
- **Identification par passkey (WebAuthn).** Sur son téléphone, une personne crée une passkey
  (empreinte, visage ou code de l'appareil) en choisissant « Qui je suis » (Jérôme, Pauline ou
  Grégoire) et en saisissant un **code d'invitation** à usage unique. Ensuite, se connecter = toucher
  le capteur ; une session (cookie) porte l'identité. Le serveur ne garde que la clé publique.
- **Mode admin.** Les passkeys de Jérôme ont le droit d'administration : écran qui liste les passkeys
  (personne, appareil, création, dernier usage), les **révoque**, et génère les codes d'invitation.
  Le jeton `IMPORT_TOKEN` peut aussi générer un code (amorçage de la toute première passkey, secours).
- **Lecture inchangée.** Le site reste consultable sans passkey ; seule la saisie d'un avis l'exige.
  Quand une session existe, « Je suis » prend l'identité de la passkey (verrouillé) ; sans session, le
  bouton manuel actuel reste pour les cases de courses et les choix. Le registre d'appareils et
  `APPAREILS_MODE` sont conservés tels quels.

Pas de changement cassant : export, choix et courses gardent leur format.

## Capabilities

### New Capabilities

- `identite-passkeys` : création de passkeys liées à une personne du foyer par code d'invitation,
  connexion, session, identité exposée au site, administration (liste, révocation, codes).
- `avis-plats` : verdict, étiquettes et commentaire d'une personne sur un repas de la période courante,
  lecture par la famille, export vers « batch cooking ».

### Modified Capabilities

Aucune : `openspec/specs/` ne contient encore aucune capacité archivée.

## Impact

- **Serveur** (`server.mjs`, nouveaux `lib/passkeys.mjs`, `lib/avis.mjs`, `lib/stockage.mjs`) :
  routes `/api/passkeys/*`, `/api/session`, `/api/avis/*` ; vérification WebAuthn avec `node:crypto`
  seulement (toujours zéro dépendance).
- **Client** (`public/js/app.js`, `public/index.html`, `public/style.css`) : tiroir d'avis, ligne des
  avis sous le départ, écran « Cet appareil » (créer / se connecter), écran admin.
- **Persistance** : sur le PVC existant `quick-cooking-data` (RWO, reclaim `Delete`, 1 réplique),
  nouveaux fichiers `DATA_DIR/passkeys.json` (clés publiques, invitations hachées, sessions hachées)
  et `DATA_DIR/avis/<période>.json`. Aucune base de données. Ces fichiers sont perdus si le PVC est
  supprimé (AGENTS.md règle 7).
- **Configuration** : variables `RP_ID` (défaut `quick-cooking.lo2k.net`, `localhost` en local) et
  `RP_ORIGIN` ; aucun nouveau secret (le cookie de session est un jeton aléatoire dont seul le hachage
  est stocké).
- **Déploiement** : nouvelle image, `deploy/k8s/deployment.yaml` mis à jour (tag, variables). Passkeys
  exigent HTTPS : déjà fourni par Cloudflare.
- **Projet « batch cooking »** (dépôt séparé) : commande `python outils/publier_site.py avis` à ajouter
  pour rapatrier `06_Site/avis_<période>.json` — hors de ce dépôt, listée comme suite dans les tâches.
- **Docs** : `docs/donnees-entree-batch-cooking.md` (§ avis), `README.md` (passkeys, admin),
  `PRODUCT.md` (identification), `DESIGN.md` (composant d'avis).
