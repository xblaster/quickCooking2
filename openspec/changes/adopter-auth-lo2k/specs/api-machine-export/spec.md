# Delta de spécification

## Purpose

Garder une porte réservée aux automates (« batch cooking ») pour déposer l'export et relire les choix et les
avis, protégée par un jeton, sans dépendre de la session d'`auth.lo2k.net`.

## ADDED Requirements

### Requirement: Routes machine sous /api/export
Les routes `PUT /api/export`, `PUT /api/export/<section>`, `POST /api/export/verifier`, `GET /api/export/etat`
et les lectures `GET /api/export/choix[/<période>]` et `GET /api/export/avis[/<période>]` SHALL exiger
`Authorization: Bearer <IMPORT_TOKEN>` et ne SHALL jamais lire les en-têtes `X-Auth-*`.

#### Scenario: Dépôt avec le bon jeton
- **WHEN** `PUT /api/export` arrive avec le jeton valide et un export valide
- **THEN** le serveur répond 200 et l'export est en place

#### Scenario: Sans jeton, avec un en-tête d'identité forgé
- **WHEN** `PUT /api/export/stocks` arrive sans jeton mais avec `X-Auth-Personne: J` et `X-Auth-Admin: 1`
- **THEN** le serveur répond 401 : l'identité ne remplace jamais le jeton

#### Scenario: Lecture des choix par batch cooking
- **WHEN** `GET /api/export/choix` arrive avec le jeton
- **THEN** le serveur renvoie les choix de la période à venir, comme l'ancien `GET /api/choix`

#### Scenario: Lecture des avis par batch cooking
- **WHEN** `GET /api/export/avis` arrive avec le jeton
- **THEN** le serveur renvoie les avis de la période courante, comme l'ancien `GET /api/avis`

#### Scenario: Écriture refusée sur l'alias de lecture
- **WHEN** `PUT /api/export/choix` arrive avec le jeton
- **THEN** le serveur répond 404 : seules les lectures sont proposées sous ce nom

### Requirement: Seul /api/export échappe à la décision d'auth
Au niveau de l'entrée HTTP, seul le chemin `/api/export` (exact) et son préfixe `/api/export/` SHALL être exemptés
de la décision d'`auth.lo2k.net`, par un Ingress distinct `quick-cooking-machine`. Toute autre route reste
protégée.

#### Scenario: Route du site voisine
- **WHEN** un client sans session appelle `GET https://quick-cooking.lo2k.net/api/donnees`
- **THEN** il est renvoyé vers `auth.lo2k.net` (302) ou reçoit 401, jamais les données

#### Scenario: Dépôt de l'export depuis Internet
- **WHEN** batch cooking envoie `PUT https://quick-cooking.lo2k.net/api/export` avec son jeton
- **THEN** la requête atteint l'application sans passer par `auth`
