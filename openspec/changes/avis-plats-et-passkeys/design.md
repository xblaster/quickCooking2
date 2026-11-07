# Design : avis sur les plats et identification par passkey

## Context

Motivation : voir `proposal.md`. Exigences : `specs/identite-passkeys/spec.md` et `specs/avis-plats/spec.md`.

État observé du code :

- `server.mjs` : Node 22 sans dépendance, API JSON maison, admin = en-tête `Authorization: Bearer <IMPORT_TOKEN>` (`estAdmin`).
- `lib/appareils.mjs` : clé aléatoire par navigateur (`X-Appareil`), empreinte SHA-256 seule côté serveur, `APPAREILS_MODE=libre|autorises`. C'est un **contrôle d'appareil**, pas une identité de personne.
- `public/js/app.js` : `etat.moi` est un code `J|P|G` basculé librement par les boutons « Je suis » de l'en-tête (`rendreMoi`) ; il signe les cases de courses (`par`) et les choix.
- `lib/stockage.mjs` : fichiers JSON sous `DATA_DIR`, écritures atomiques sérialisées par fichier (`modifierFichier`). Déploiement : **1 réplique**, stratégie `Recreate`, PVC RWO `quick-cooking-data` (le contexte du dépôt évoque 2 réplicas, le manifeste réel en a 1 : on s'appuie sur le manifeste).
- Fenêtres modales `<dialog class="fenetre">` (fiche, tiroir de remplacement), plein écran sous 560 px ; rafraîchissement par `setInterval` sur Courses (10 s) et À choisir (30 s).
- Foyer de l'export : `foyer.personnes[].code` = `J`, `P`, `G`. Repas de période : `id`, `numero`, `plat.ref`, `plat.nom`.

## Goals / Non-Goals

**Goals :**

- WebAuthn vérifié côté serveur avec `node:crypto` seul, sans CBOR ni bibliothèque.
- Identité de personne fiable pour les avis ; lecture du site inchangée.
- Composant d'avis cohérent avec le monde « tableau des départs » (DESIGN.md), utilisable au pouce.
- Avis récupérables par « batch cooking » dans un format stable.

**Non-Goals :**

- Remplacer le registre d'appareils ou `APPAREILS_MODE` (cohabitent ; fusion éventuelle plus tard).
- Exiger une passkey pour cocher les courses ou faire les choix (signés par la session si elle existe, sinon par le « Je suis » manuel, comme aujourd'hui).
- Attestation d'authentificateur (modèle d'appareil certifié) : `attestation: "none"`.
- Noter des recettes hors période courante, ou une moyenne de notes.
- Écrire `Preferences_Famille.md` automatiquement : « batch cooking » décide (le site montre, il ne décide pas).

## Decisions

### D1. WebAuthn sans CBOR : `getPublicKey()` et `getAuthenticatorData()`

À la création, le client envoie `response.getPublicKey()` (SPKI DER), `response.getPublicKeyAlgorithm()`, `response.getAuthenticatorData()` et `clientDataJSON`, en base64url. Le serveur importe la clé avec `crypto.createPublicKey({ key, format: "der", type: "spki" })` et vérifie `authenticatorData` (empreinte `rpIdHash` = SHA-256 de `RP_ID`, drapeaux UP et UV) et `clientDataJSON` (`type`, `challenge`, `origin`). Connexion : `crypto.verify` de la signature sur `authenticatorData ‖ SHA-256(clientDataJSON)` (ES256 en DER, RS256 PKCS#1 v1.5, Ed25519).

- Alternative écartée : décoder `attestationObject` (CBOR + COSE) à la main, ~150 lignes fragiles ; ou ajouter `@simplewebauthn/server`, contraire à « zéro dépendance ».
- Contrepartie : navigateurs récents seulement (Safari iOS 16+, Chrome 85+, Firefox 119+) ; les téléphones de la famille le sont. Si `getPublicKey` manque, l'écran le dit (scénario « Navigateur sans passkey »).
- Algorithmes acceptés : `-7` (ES256), `-8` (Ed25519), `-257` (RS256).

### D2. Passkeys découvrables, connexion sans nom d'utilisateur

`residentKey: "required"`, `userVerification: "required"`, `user.id` = 16 octets aléatoires par passkey, `user.name` = « Pauline · Quick Cooking ». Connexion avec `allowCredentials` vide : le téléphone propose la passkey du site, un seul geste. `RP_ID` (défaut `quick-cooking.lo2k.net`) et `RP_ORIGIN` (défaut `https://<RP_ID>`) viennent de l'environnement ; en local `RP_ID=localhost`, `RP_ORIGIN=http://localhost:3000`.

Compteur de signature : vérifié croissant seulement s'il est non nul (les passkeys synchronisées renvoient 0).

### D3. Défis en mémoire

Défis (32 octets) dans une `Map` en mémoire, 5 min, supprimés à la première utilisation. Possible grâce à la réplique unique ; un redémarrage invalide seulement les défis en cours (l'utilisateur recommence).

### D4. Codes d'invitation

Code de 8 caractères en base32 de Crockford (sans I, L, O, U), affiché `K7QM-2XPA`, saisie insensible à la casse et aux tirets. Stocké sous SHA-256, `expire` à +24 h, `utilise` à la consommation. Le code est **vérifié** à la demande d'options et **consommé** seulement quand la création est vérifiée (geste annulé = code intact). Limite : 10 essais de code par minute et par IP, puis 429. Génération : session admin (écran) ou jeton `IMPORT_TOKEN` (`POST /api/invitations`, amorçage par `curl` ; documenté dans le README).

### D5. Session par cookie, empreinte stockée

Jeton aléatoire de 32 octets dans le cookie `qc_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` 180 j, `Secure` sauf si `RP_ORIGIN` est en `http://localhost`). Le serveur garde `sessions[sha256(jeton)] = { passkey, personne, cree_le, vu_le }`, prolongé au plus toutes les 10 min (même cadence que `appareils.mjs`). Chaque requête relit la passkey : révoquée ⇒ session supprimée. Les écritures exigent `Content-Type: application/json` ; avec `SameSite=Strict`, cela suffit contre le CSRF pour ce site.

- Alternative écartée : jeton signé HMAC sans état : demanderait un secret à gérer et ne permettrait pas la révocation immédiate.

### D6. Fichier `DATA_DIR/passkeys.json`

```json
{ "format": "quick-cooking/passkeys", "version": 1,
  "passkeys": { "<credentialId b64url>": { "personne": "P", "nom": "iPhone de Pauline", "cle": "<SPKI b64url>",
      "alg": -7, "compteur": 0, "cree_le": "…", "vu_le": "…", "revoquee_le": null } },
  "invitations": { "<sha256>": { "cree_le": "…", "expire": "…", "utilise_le": null, "par": "J|jeton" } },
  "sessions": { "<sha256>": { "passkey": "<credentialId>", "personne": "P", "cree_le": "…", "vu_le": "…" } } }
```

Module `lib/passkeys.mjs`, même schéma que `appareils.mjs` (cache + `modifierFichier`). Invitations utilisées ou expirées purgées après 30 jours.

### D7. Administration

`ADMINS` (défaut `J`) liste les codes personne administrateurs ; constante d'environnement pour ne rien coder en dur. Une session est admin si sa personne y figure. Les routes admin acceptent aussi le jeton `IMPORT_TOKEN`. Révocation = `revoquee_le` daté (jamais d'effacement, traçabilité) + suppression des sessions de la passkey.

### D8. Routes

| Méthode | Route | Droit | Rôle |
|---|---|---|---|
| GET | `/api/session` | aucun | `{ personne, admin, passkey }` ou `{ personne: null }` |
| DELETE | `/api/session` | session | déconnexion |
| POST | `/api/passkeys/creation/options` | code d'invitation | `{ code, personne, nom }` ⇒ options WebAuthn |
| POST | `/api/passkeys/creation` | défi | vérifie, enregistre, consomme le code, ouvre la session |
| POST | `/api/passkeys/connexion/options` | aucun | défi |
| POST | `/api/passkeys/connexion` | défi | vérifie, ouvre la session |
| GET | `/api/passkeys` | admin | liste (sans clé publique) |
| DELETE | `/api/passkeys/<id>` | admin | révoque |
| POST | `/api/invitations` | admin ou jeton | `{ code, expire }` |
| GET | `/api/avis` · `/api/avis/<période>` | comme `/api/donnees` (ou jeton) | avis d'une période |
| PUT | `/api/avis/<période>/<repas>` | session | crée ou remplace l'avis de la personne de la session |
| DELETE | `/api/avis/<période>/<repas>` | session | retire son avis |

Les routes passkeys et session restent accessibles même en `APPAREILS_MODE=autorises` (sinon impossible de se connecter) ; `/api/avis` suit la règle de `/api/donnees`. L'en-tête de corps `par` n'est jamais lu pour les avis : la personne vient de la session.

### D9. Fichier `DATA_DIR/avis/<période>.json` et format `quick-cooking/avis`

```json
{ "format": "quick-cooking/avis", "version": 1, "periode": "2026-11-07", "mis_a_jour": "…",
  "etiquettes": ["portion_petite", "…"],
  "repas": { "sam07-s": { "numero": 12, "plat": { "ref": "10_Cookeo_OnePot/…", "nom": "…" },
      "avis": { "P": { "verdict": "coup_de_coeur", "etiquettes": ["recette_modifiee"],
                       "commentaire": "Moitié moins de crème, parfait", "cree_le": "…", "mis_a_jour": "…" } } } } }
```

`numero` et `plat` sont copiés à l'écriture : l'avis reste interprétable quand la période n'est plus dans l'export. Écriture refusée si `<période>` ≠ `periode_courante.id` (409). Étiquettes fermées (ids ⇒ libellés) définies dans `lib/contrat.mjs` à côté des autres listes du contrat :
`portion_petite` « Portion trop petite », `portion_grande` « Portion trop grande », `trop_sale` « Trop salé ou épicé », `fade` « Fade », `texture` « Texture ratée », `rechauffe_mal` « Réchauffe mal », `trop_long` « Trop long à préparer », `recette_modifiee` « Recette modifiée ».
« Réchauffe mal » répond à la boîte micro-ondes de Jérôme ; « Recette modifiée » au besoin « ce qui a dû être changé ».

Mapping documenté pour « batch cooking » (pas appliqué par le site) : `coup_de_coeur` ⇒ ⭐, `plus_jamais` ⇒ ❌, `bof` ou toute étiquette ⇒ ⚠️ à examiner, `bien` ⇒ rien.

### D10. Client : identité

- `etat.session` chargé au démarrage (`GET /api/session`), en parallèle de `/api/appareil`.
- Avec session : `etat.moi = session.personne`, l'en-tête n'affiche que la pilule de cette personne, pleine et non basculable, qui mène à `#/moi`. Sans session : boutons « Je suis » actuels inchangés, plus un lien « Me connecter ».
- Nouvelle route `#/moi` (« Mon identité ») remplaçant le `<details>` « Cet appareil » du pied d'accueil (le formulaire de nom d'appareil y déménage) :
  - **Sans session** : bouton principal « Me connecter » (geste passkey), puis section « Créer une passkey sur ce téléphone » : liste « Qui je suis » (`<select>` des personnes du foyer, sans valeur par défaut), champ « Code d'invitation » (`autocomplete="one-time-code"`, `inputmode="text"`, `autocapitalize="characters"`), nom d'appareil prérempli (« iPhone · Safari »), bouton « Créer ma passkey ».
  - **Avec session** : « Connecté : Pauline · iPhone de Pauline », bouton secondaire « Me déconnecter ».
  - **Admin** : section « Administration » : bouton « Créer un code d'invitation » ⇒ code affiché en grand (800, chiffres tabulaires), expiration, bouton « Copier » ; liste des passkeys en lignes à filets (personne en pastille-initiale, nom d'appareil, « créée le », « dernier usage », état), bouton secondaire « Révoquer » ⇒ confirmation `<dialog>` (« Révoquer la passkey "iPhone de Grégoire" ? Ce téléphone ne pourra plus donner d'avis. » ; texte renforcé pour sa propre dernière passkey).

### D11. Composant d'avis (brief impeccable, mode Operate)

**Job et public.** Une personne du foyer, téléphone en main après le repas ou en le préparant, veut dire en dix secondes « c'était comment, qu'est-ce qu'on a changé ». Succès : un verdict touché et enregistré sans réfléchir ; le détail n'est qu'un plus.

**Direction.** Monde existant « tableau des départs », raffinement, pas de nouveau langage. Le verdict est une information, pas un signal : **aucun jaune signal** (règle du signal unique), pas d'étoiles, pas d'émoji. Couleurs d'information en couple texte + fond pâle, toujours doublées d'un mot : `coup_de_coeur` ⇒ `ok`, `bien` ⇒ neutre `surface-2`, `bof` ⇒ `attention`, `plus_jamais` ⇒ `interdit`.

**Point d'entrée (dans la ligne de départ, Semaine et Accueil « Ensuite »).** Sous le plat, dans la zone `details` existante :
- ligne compacte des avis (label 600) : initiale en gras + verdict en petite étiquette colorée, séparés par « · » ; un commentaire s'annonce par « + commentaire » en `discret` (pas d'icône). Ex. `J Coup de cœur + commentaire · G Bof` ;
- lien d'action « Donner mon avis » (ou « Mon avis : Bien · modifier »), cible 44 px. Rien d'autre : pas de ligne vide quand aucun avis.
- Le panneau bleu nuit du prochain repas ne reçoit pas le composant (il annonce, il ne recueille pas) ; une fois le repas passé, sa ligne dans « Ensuite »/Semaine porte l'entrée.

**Tiroir `#avis`** (nouvelle `<dialog class="fenetre">`, plein écran sous 560 px, animation `monte` existante, désactivée en mouvement réduit) :
1. **Tête** bleu nuit (`fenetre-tete`) : pastille `{N}` + nom du plat, en dessous jour et moment en `quai-discret`, bouton « Fermer ».
2. **« Mon verdict »** : `fieldset`/`legend`, 4 `input type=radio` habillés en grandes pilules de 56 px, grille 2 × 2 sur téléphone, 4 colonnes au-delà de 560 px, du plus positif au plus négatif. Choisi = plein `quai`/`quai-texte` + contour 2.5 px ; repos = contour 1.5 px `filet`. Focus initial sur le verdict choisi ou le premier.
3. **« Ce qui a compté »** : `fieldset` de chips à cocher (pilules 44 px, style « filtre » existant), retour à la ligne libre.
4. **« Ce qu'on a changé, ce qu'on a aimé »** : `textarea` (style champ, 4 lignes, 500 max), compteur « 120 caractères restants » affiché sous 100 restants (`aria-describedby`). Si « Recette modifiée » est cochée et le champ vide : aide en `discret` « Dis ce que tu as changé : ça aide pour la prochaine fois. »
5. **Pied collant** : bouton principal « Enregistrer » pleine largeur 56 px (désactivé tant qu'aucun verdict ; « Enregistrement… » pendant l'envoi), lien d'action « Retirer mon avis » en `interdit` si un avis existe.
6. **« Les autres »** (sous le pied, lecture seule) : un avis par ligne à filets : initiale, verdict, étiquettes en texte, commentaire, « jeudi 19:42 ».

**États.** Sans session : sections 2–5 remplacées par un encadré `info` « Pour donner ton avis, connecte ce téléphone » + bouton « Me connecter » (geste passkey direct, puis le tiroir se recharge) + lien « Créer une passkey » vers `#/moi`. Erreur d'enregistrement : alerte `attention` en tête du formulaire, saisie conservée. Succès : tiroir fermé, toast « Avis enregistré », ligne mise à jour. Fermeture avec saisie modifiée : `confirm` « Abandonner ton avis non enregistré ? ».

**Rafraîchissement.** `setInterval` 30 s sur les routes `""` et `semaine` (comme À choisir), suspendu si le tiroir `#avis` est ouvert ou si un champ a le focus.

## Risks / Trade-offs

- [Perte du PVC ⇒ passkeys et avis perdus] → c'est le même risque que choix et courses (AGENTS.md règle 7) ; reprise : nouveau code par jeton, recréation des passkeys. Les avis passés sont copiés côté « batch cooking » par `publier_site.py avis`.
- [Jérôme révoque sa dernière passkey] → avertissement dans la confirmation ; amorçage toujours possible par `IMPORT_TOKEN`.
- [Téléphone perdu avec passkey synchronisée (iCloud, Google)] → révocation d'une seule passkey par l'admin ; la passkey synchronisée sur d'autres appareils du même compte est la même et tombe aussi : à expliquer dans le README.
- [Passkey créée en dev sur `localhost` inutilisable en prod] → `RP_ID` différent, comportement attendu ; noté dans le README.
- [Navigateur sans `getPublicKey()`] → message explicite ; la lecture du site reste entière.
- [Défis en mémoire] → suppose 1 réplique ; si un jour 2 répliques, déplacer les défis dans le fichier (noté en commentaire).
- [Code d'invitation deviné] → 32⁸ ≈ 10¹² combinaisons, 24 h, 10 essais/min/IP : risque négligeable pour un foyer.
- [Cloudflare et cookies] → cookie `HttpOnly` de premier niveau, pas de cache sur `/api/*` (`no-store` déjà posé par `json()`).

## Migration Plan

1. Déployer l'image avec `RP_ID`/`RP_ORIGIN`/`ADMINS` dans `deployment.yaml` (valeurs par défaut correctes : aucune action obligatoire). Fichiers `passkeys.json` et `avis/` créés au premier usage ; rien à migrer.
2. Amorçage : `curl -X POST https://quick-cooking.lo2k.net/api/invitations -H "Authorization: Bearer $IMPORT_TOKEN"` ⇒ code ; Jérôme crée sa passkey, puis génère les codes de Pauline et Grégoire depuis l'écran admin.
3. Retour arrière : redéployer le tag précédent ; les nouveaux fichiers sont ignorés par l'ancienne version, aucune donnée existante n'est modifiée.
