# Delta de spécification

## Purpose

Permettre à « batch cooking » de corriger ou d'effacer le choix d'un repas de la période à venir par le jeton
machine, sans identité de personne, quand le site est protégé par `auth.lo2k.net`.

## ADDED Requirements

### Requirement: Écriture d'un choix de repas par le jeton
`PUT /api/export/choix/<période>/repas/<repasId>` SHALL exiger `Authorization: Bearer <IMPORT_TOKEN>`, ne SHALL jamais
lire les en-têtes `X-Auth-*`, et SHALL appliquer la même validation que la route du site. L'entrée écrite SHALL porter
`via: "batch-cooking"` et aucun appareil.

#### Scenario: Corriger un choix
- **WHEN** la requête arrive avec le jeton, `{ "ref": "<recette connue>", "origine": "option" }` pour un repas non imposé
- **THEN** le serveur répond 200, le repas porte la recette et `via: "batch-cooking"`

#### Scenario: Vider une case pré-remplie
- **WHEN** la requête arrive avec le jeton et `{ "ref": null }`
- **THEN** le serveur répond 200 et le repas est remis à zéro (`ref: null`, `origine: null`, `par: null`)

#### Scenario: Sans jeton avec en-tête d'identité forgé
- **WHEN** la requête arrive sans jeton avec `X-Auth-Personne: J` et `X-Auth-Admin: 1`
- **THEN** le serveur répond 401

#### Scenario: Validation identique à celle du site
- **WHEN** la recette est inconnue, le repas imposé, la portion invalide ou la période close
- **THEN** le serveur répond 400 (recette, repas imposé, portion) ou 409 (période close), comme la route du site

#### Scenario: Les autres écritures restent fermées
- **WHEN** `PUT /api/export/choix/<période>`, `PUT /api/export/avis/<période>/…` ou `DELETE …` arrive avec le jeton
- **THEN** le serveur répond 404

#### Scenario: Le site reprend la main
- **WHEN** une personne modifie ce repas depuis le site
- **THEN** l'entrée est remplacée et ne porte plus `via`
