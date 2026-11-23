# Design

## Context
L'alias machine existant (`/api/export/choix` et `/api/export/avis`, lecture seule) retire le préfixe `export` et
rejoue le routeur du site avec `machine = true` : pas de porte d'identité, jeton exigé avant. L'Ingress
`quick-cooking-machine` exempte déjà `/api/export/` (Prefix).

## Decisions
- **Réutiliser le gestionnaire du site** plutôt que le dupliquer : l'alias accepte aussi
  `PUT /api/export/choix/<période>/repas/<repasId>` (5 segments) ; le routeur voit `choix/<période>/repas/<id>` et applique
  `validerMajRepas`, période close → 409, `reste`, effacement par `ref: null`.
- **Marque machine** : `via: "batch-cooking"`, `appareil: null`. On n'écrase pas `par` (J, P, G ou null) : le skill peut
  reporter le choix d'une personne, et l'interface lit `par` comme un code de personne. Une écriture du site remplace
  l'entrée entière, donc `via` disparaît.
- **Rien d'autre n'est ouvert** : `PUT /api/export/choix` (sans période), `PUT /api/export/avis/…`, `DELETE` restent 404.
- **Alternative écartée** : exempter `/api/choix` de l'auth. Les requêtes du site lui-même perdraient leurs
  en-têtes d'identité.

## Risks
- Le jeton écrit des choix au nom de n'importe qui : même niveau de confiance que le dépôt de l'export.
