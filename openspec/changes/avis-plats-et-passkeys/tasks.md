# Tâches

## 1. Passkeys côté serveur

- [x] 1.1 Créer `lib/passkeys.mjs` : registre `DATA_DIR/passkeys.json` (format D6, cache + `modifierFichier`), défis en mémoire 5 min à usage unique (D3), codes d'invitation base32 Crockford hachés, 24 h, purge à 30 j (D4). Vérif : tests unitaires `test/passkeys.test.mjs` (code valide/expiré/consommé, défi rejoué/expiré).
- [x] 1.2 Vérification WebAuthn avec `node:crypto` (D1) : `clientDataJSON` (type, défi, origine), `authenticatorData` (rpIdHash, UP, UV, compteur), signature ES256/Ed25519/RS256 sur `authData ‖ sha256(clientDataJSON)`. Vérif : tests avec une paire de clés générée dans le test qui signe des réponses fabriquées (succès, mauvaise origine, mauvais rpId, UV absent, signature altérée).
- [x] 1.3 Sessions (D5) : jeton 32 octets, cookie `qc_session` (`HttpOnly`, `SameSite=Strict`, `Secure` hors localhost, 180 j), empreinte stockée, prolongation ≤ 10 min, invalidation si passkey révoquée. Vérif : test de bout en bout (cookie posé, `GET /api/session` renvoie la personne, révocation ⇒ `personne: null`).
- [x] 1.4 Routes D8 dans `server.mjs` : `/api/session`, `/api/passkeys/creation[/options]`, `/api/passkeys/connexion[/options]`, `/api/passkeys` (GET, DELETE), `/api/invitations` ; admin = session dont la personne est dans `ADMINS` (défaut `J`) ou jeton `IMPORT_TOKEN` ; limite 10 essais de code/min/IP (429) ; routes accessibles en `APPAREILS_MODE=autorises`. Vérif : `test/serveur.test.mjs` étendu (401 sans droit, 403 pour P, 429, code consommé seulement après création vérifiée).

## 2. Avis côté serveur

- [x] 2.1 Ajouter à `lib/contrat.mjs` les verdicts et étiquettes fermés (D9) et `validerAvis` (verdict obligatoire, étiquettes connues sans doublon, commentaire ≤ 500). Vérif : tests unitaires dans `test/regles.test.mjs` ou nouveau `test/avis.test.mjs`.
- [x] 2.2 Créer `lib/avis.mjs` + accès `DATA_DIR/avis/<période>.json` dans `lib/stockage.mjs` (format D9, copie de `numero` et `plat` à l'écriture). Vérif : test lecture d'un fichier absent ⇒ structure vide.
- [x] 2.3 Routes `GET /api/avis`, `GET /api/avis/<période>` (règle de `/api/donnees` ou jeton), `PUT`/`DELETE /api/avis/<période>/<repas>` (session obligatoire, personne de la session, 409 si période non courante, 404 si repas inconnu ou sans plat). Vérif : tests de bout en bout couvrant chaque scénario de `specs/avis-plats/spec.md` (401 sans session, P ne peut pas toucher l'avis de J, période ancienne lisible).

## 3. Client : identité

- [x] 3.1 Charger `GET /api/session` au démarrage ; avec session, `etat.moi` = personne de la session et l'en-tête n'affiche que sa pilule verrouillée vers `#/moi` ; sans session, « Je suis » actuel + lien « Me connecter » (D10). Vérif : manuelle, desktop et mobile, avec et sans cookie.
- [x] 3.2 Route `#/moi` (« Mon identité ») : connexion passkey, formulaire de création (« Qui je suis » sans défaut, code d'invitation, nom d'appareil prérempli), déconnexion, message si `PublicKeyCredential`/`getPublicKey` absents ; y déplacer le formulaire de nom d'appareil. Vérif : création et connexion réelles sur `localhost` (Chrome + gestionnaire de passkeys ou authentificateur virtuel des DevTools).
- [x] 3.3 Section « Administration » de `#/moi` : génération de code (affichage grand, expiration, copier), liste des passkeys, révocation avec `<dialog>` de confirmation et avertissement « dernière passkey admin ». Vérif : manuelle ; la passkey révoquée apparaît « révoquée » et sa session tombe.

## 4. Client : composant d'avis (impeccable)

- [x] 4.1 Avant toute édition UI, lancer `impeccable context --target public/js/app.js` et lire `reference/craft-floor.md` ; implémenter le tiroir `#avis` selon D11 (tête, verdicts radio en pilules 2×2, étiquettes en chips, `textarea` avec compteur, pied collant « Enregistrer » / « Retirer mon avis », section « Les autres »). Vérif : navigation clavier complète, lecteur d'écran (fieldset/legend annoncés), thème sombre, mouvement réduit.
- [x] 4.2 États du tiroir : sans session (encadré + « Me connecter » direct), envoi en cours, erreur (saisie conservée), succès (toast « Avis enregistré »), fermeture avec saisie modifiée (confirmation), aide « Recette modifiée » sans commentaire. Vérif : chaque état provoqué à la main (serveur coupé pour l'erreur).
- [x] 4.3 Ligne compacte des avis et lien « Donner mon avis » / « Mon avis : … · modifier » dans les lignes de départ de Semaine et « Ensuite » ; rien quand aucun avis ; pas d'entrée sur le panneau du prochain repas. Vérif : capture mobile 390 px et bureau 1280 px.
- [x] 4.4 Rafraîchissement des avis toutes les 30 s sur accueil et Semaine, suspendu si `#avis` ouvert ou champ actif. Vérif : avis posé depuis un 2ᵉ navigateur visible en moins d'une minute.
- [x] 4.5 Passe de vérification impeccable unique (desktop + mobile, clair + sombre), corrections en un lot, au plus une seconde passe ; ajouter la section « Composant d'avis » à `DESIGN.md`. Vérif : `DESIGN.md` à jour, captures dans `.impeccable/review/`.

## 5. Documentation et contrat

- [x] 5.1 `docs/donnees-entree-batch-cooking.md` : nouvelle section « Relire les avis de la famille » (`GET /api/avis`, format `quick-cooking/avis` v1, étiquettes, correspondance verdict ⇒ ⭐/⚠️/❌ indicative). Vérif : exemple JSON du doc identique à une réponse réelle du test.
- [x] 5.2 `README.md` (passkeys, amorçage par `curl` + `IMPORT_TOKEN`, `RP_ID`/`RP_ORIGIN`/`ADMINS`, passkeys synchronisées et révocation, dev sur localhost) et `PRODUCT.md` (identification par passkey). Vérif : relecture.

## 6. Build et manifestes

- [x] 6.1 `npm test` vert en entier. Vérif : sortie de `npm test`.
- [x] 6.2 Construire l'image `xblaster/quick-cooking:<AAAAMMJJ-sha7>` (linux/amd64) et vérifier en local `GET /` 200, `/healthz`, création et connexion passkey avec `RP_ID=localhost`. Vérif : `docker run` local selon `docs/deploiement.md`.
- [x] 6.3 Mettre à jour `deploy/k8s/deployment.yaml` : nouveau tag daté, variables `RP_ID=quick-cooking.lo2k.net`, `RP_ORIGIN=https://quick-cooking.lo2k.net`, `ADMINS=J` ; commentaire du volume listant `passkeys.json` et `avis/`. Vérif : `kubectl apply --dry-run=server -f deploy/k8s/deployment.yaml` sans erreur.

## 7. Déploiement (validation humaine)

- [ ] 7.1 Déployer sur `catwo`/`quick-cooking` après accord explicite de Jérôme, puis amorcer : code par `IMPORT_TOKEN`, passkey de Jérôme sur son téléphone, codes pour Pauline et Grégoire. Mettre à jour le runbook `namespaces/quick-cooking/README.md` du dépôt d'infrastructure. Vérif : trois passkeys actives visibles dans l'écran admin, un avis test posé puis retiré.

## Workflow follow-up

- Dépôt « batch cooking » (hors de ce dépôt) : ajouter `python outils/publier_site.py avis [--periode <id>]` qui écrit `06_Site/avis_<période>.json`, et mentionner dans le skill `batch-cooking-famille` (§8) la lecture des avis avant le raffinement de la période suivante et leur report dans `Preferences_Famille.md`.
- Archiver le change (`/opsx:archive`) après déploiement validé.
