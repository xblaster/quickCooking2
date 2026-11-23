# Delta de spécification

## Purpose

Faire reconnaître à Quick Cooking la personne authentifiée par `auth.lo2k.net`, sans gérer lui-même ni passkey,
ni code d'invitation, ni session, et attribuer à cette personne ses courses et ses avis.

## ADDED Requirements

### Requirement: Identité lue dans les en-têtes d'auth
Le serveur SHALL déduire la personne qui agit des en-têtes `X-Auth-Personne` (code de la personne, une
majuscule suivie de 0 à 7 lettres ou chiffres) et `X-Auth-Admin` (`1` pour un administrateur). Une valeur qui ne
respecte pas ce format MUST être traitée comme une absence d'identité.

#### Scenario: Identité valide
- **WHEN** une requête arrive avec `X-Auth-Personne: P` et `X-Auth-Admin: 0`
- **THEN** le serveur agit pour la personne `P`, non administratrice

#### Scenario: Valeur invalide
- **WHEN** `X-Auth-Personne` vaut `p; drop` ou une chaîne de plus de 8 caractères
- **THEN** le serveur considère qu'il n'y a pas d'identité et répond 401

### Requirement: Refus sans identité
Toute route d'API du site (`/api/donnees`, `/api/choix`, `/api/courses`, `/api/avis`, `/api/appareil`,
`/api/session`) SHALL répondre 401 avec un message demandant de passer par `auth.lo2k.net` quand aucune
identité valide n'est présente. Les fichiers statiques et `/healthz` MUST rester servis sans identité.

#### Scenario: Lecture sans identité
- **WHEN** `GET /api/donnees` arrive sans en-tête `X-Auth-Personne`
- **THEN** le serveur répond 401 et ne renvoie aucune donnée

#### Scenario: Sonde de santé
- **WHEN** le kubelet appelle `GET /healthz` sans en-tête
- **THEN** le serveur répond 200 `ok`

### Requirement: Session lue dans les en-têtes
`GET /api/session` SHALL renvoyer `{ personne, admin }` pour l'identité de la requête. Aucun cookie n'est émis
ni lu par le serveur de Quick Cooking.

#### Scenario: Personne connectée
- **WHEN** `GET /api/session` arrive avec `X-Auth-Personne: J` et `X-Auth-Admin: 1`
- **THEN** la réponse est `{ "personne": "J", "admin": true }` et ne contient aucun en-tête `Set-Cookie`

### Requirement: Actions attribuées à la personne authentifiée
La personne qui donne un avis (`PUT` et `DELETE /api/avis/<période>/<repas>`) ou qui coche une ligne de
courses SHALL être celle de l'identité de la requête, jamais une valeur fournie dans le corps.

#### Scenario: Avis avec une personne forgée dans le corps
- **GIVEN** une requête authentifiée comme `G`
- **WHEN** `PUT /api/avis/<période>/<repas>` porte `{ "verdict": "bof", "par": "J" }`
- **THEN** l'avis est enregistré pour `G` et celui de `J` n'est pas modifié

#### Scenario: Case de courses
- **GIVEN** une requête authentifiée comme `P`
- **WHEN** elle coche une ligne de courses en indiquant `"par": "G"`
- **THEN** la case est notée cochée par `P`

### Requirement: Garde des écritures
Toute écriture (`PUT`, `POST`, `DELETE`) sur une route du site SHALL exiger un corps de type
`application/json` et, quand l'en-tête `Origin` est présent, que sa valeur soit l'origine du site
(`SITE_ORIGIN`, par défaut `https://quick-cooking.lo2k.net`).

#### Scenario: Écriture depuis un autre site du domaine
- **WHEN** une page de `https://noel.lo2k.net` envoie une écriture avec `Origin: https://noel.lo2k.net`
- **THEN** le serveur répond 403 sans rien modifier

#### Scenario: Corps non JSON
- **WHEN** une écriture arrive avec `Content-Type: text/plain`
- **THEN** le serveur répond 415

### Requirement: Retrait de l'identité par passkey locale
Le serveur MUST ne plus proposer de passkey, de code d'invitation ni de session propres : `/api/passkeys*`,
`/api/invitations` et `DELETE /api/session` répondent 404, et le site n'affiche plus d'écran de création de
passkey, de connexion, de code ou de liste de passkeys. La page « Mon identité » SHALL afficher la personne
connectée, le nom de l'appareil modifiable, et des liens vers `auth.lo2k.net` (connexion, et administration pour
un administrateur).

#### Scenario: Ancienne route
- **WHEN** `POST /api/passkeys/connexion` arrive avec une identité valide
- **THEN** le serveur répond 404

#### Scenario: Page Mon identité
- **GIVEN** une session de `J`, administrateur
- **WHEN** il ouvre `#/moi`
- **THEN** la page affiche « Jérôme », le formulaire de nom de l'appareil, un lien vers `auth.lo2k.net/connexion` et un lien vers `auth.lo2k.net/admin`

### Requirement: Page de connexion requise
Quand le chargement initial reçoit un 401, le site SHALL afficher une page « Connexion requise » avec un bouton
vers `https://auth.lo2k.net/connexion?rd=<adresse courante>`, sans redirection automatique (pas de boucle si
la protection est mal configurée).

#### Scenario: Session expirée
- **WHEN** `GET /api/session` répond 401 au démarrage
- **THEN** le site affiche « Connexion requise » et un bouton « Me connecter », et ne redirige pas tout seul

### Requirement: En-têtes fiables seulement derrière l'entrée HTTP
Le namespace `quick-cooking` SHALL porter une NetworkPolicy qui n'admet en entrée que ingress-nginx (namespace
`default`), afin qu'aucun pod ne puisse forger `X-Auth-*`. Cette condition MUST être consignée dans le runbook
du namespace.

#### Scenario: Pod voisin
- **WHEN** un pod d'un autre namespace appelle `quick-cooking-service` avec `X-Auth-Personne: J`
- **THEN** la connexion est refusée par la NetworkPolicy
