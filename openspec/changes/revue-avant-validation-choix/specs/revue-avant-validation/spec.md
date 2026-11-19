# Delta de spécification

## Purpose

Donner à la famille un dernier contrôle lisible de la période à venir (stocks employés, règles respectées, effet des choix) avant de déclarer les choix terminés à « batch cooking ».

## ADDED Requirements

### Requirement: La validation des choix passe par une revue
Le site SHALL ouvrir une fenêtre de revue quand la famille touche « On a fini de choisir », et ne SHALL enregistrer le statut `termine` que sur l'action « Valider ce menu ». « Retourner modifier » ou la fermeture de la fenêtre MUST laisser les choix inchangés.

#### Scenario: Ouverture de la revue
- **WHEN** une personne touche « On a fini de choisir »
- **THEN** la fenêtre « Dernier coup d'œil avant de valider » s'ouvre et le statut des choix n'a pas changé

#### Scenario: Validation
- **WHEN** la personne touche « Valider ce menu »
- **THEN** la fenêtre se ferme et le statut `termine` est enregistré

#### Scenario: Retour à la modification
- **WHEN** la personne touche « Retourner modifier » ou ferme la fenêtre
- **THEN** le statut reste inchangé

#### Scenario: Réouverture
- **GIVEN** des choix déjà terminés
- **WHEN** la personne touche « Rouvrir nos choix »
- **THEN** le statut repasse à `brouillon` sans passer par la revue

### Requirement: La revue est informative
La revue SHALL signaler les écarts sans jamais empêcher la validation, y compris en présence d'alertes de niveau « interdit ». Elle MUST indiquer le nombre de repas sans plat choisi.

#### Scenario: Validation malgré des alertes
- **GIVEN** une règle enfreinte et deux repas sans plat
- **WHEN** la revue s'affiche
- **THEN** elle montre l'écart, un bandeau « 2 repas n'ont pas encore de plat choisi », et « Valider ce menu » reste disponible

### Requirement: Revue des stocks
La revue SHALL lister les produits à consommer (date limite proche ou présents depuis longtemps) et les produits marqués « à finir » qu'aucun repas prévu ne consomme avant leur échéance, avec leur urgence. Elle SHALL aussi permettre de voir les produits utilisés et le repas qui les emploie.

#### Scenario: Produit pressé sans plat
- **GIVEN** un produit à consommer avant demain qu'aucun repas de la période courante ou à venir n'utilise
- **WHEN** la revue s'affiche
- **THEN** le produit apparaît avec son échéance et la mention « aucun plat prévu », en niveau urgent

#### Scenario: Produit couvert
- **GIVEN** un produit à consommer qu'un repas choisi utilise avant l'échéance
- **WHEN** la revue s'affiche
- **THEN** il n'est pas listé parmi les produits sans plat et figure dans les produits utilisés avec le repas concerné

#### Scenario: Rien à signaler
- **GIVEN** aucun produit pressé sans plat
- **WHEN** la revue s'affiche
- **THEN** le bloc indique qu'aucun produit pressé ne reste sans plat

### Requirement: Revue des règles de la famille
La revue SHALL présenter, avec un niveau ok, info, attention ou interdit : un seul repas viande ou poisson par jour, le poisson de chaque semaine (choisis sur cible, poissons déjà servis compris), la présence d'un poisson gras, chaque limite de période de l'export, et l'absence de plat interdit avec les repas fautifs.

#### Scenario: Cible de poisson non atteinte
- **GIVEN** une cible de 2 poissons pour une semaine de 5 jours ou plus et 1 poisson choisi
- **WHEN** la revue s'affiche
- **THEN** la ligne de cette semaine indique « 1 sur 2 prévus : il en manque 1 » en niveau info

#### Scenario: Aucun poisson gras
- **WHEN** aucun plat choisi n'est un poisson gras
- **THEN** la ligne « Un poisson gras sur la période » indique « Aucun » en niveau info

#### Scenario: Double viande ou poisson
- **GIVEN** des jours avec viande ou poisson au midi et au soir
- **WHEN** la revue s'affiche
- **THEN** la règle indique ces jours en niveau attention

#### Scenario: Plat interdit
- **GIVEN** un plat contenant un mot interdit ou une boîte froide servie chaude
- **WHEN** la revue s'affiche
- **THEN** la règle « Aucun plat interdit » est en niveau interdit et nomme le repas et le motif

#### Scenario: Export sans objectif de poisson
- **GIVEN** des préférences sans objectif de poisson par semaine
- **WHEN** la revue s'affiche
- **THEN** aucune ligne de poisson n'est affichée

### Requirement: Impact des choix
La revue SHALL résumer, par personne présente, les protéines moyennes par jour avec la cible, le nombre de jours au-dessus du plafond et sous la cible, puis le nombre de plats différents, de plats jamais cuisinés et de repas en restes.

#### Scenario: Jours hors repères
- **GIVEN** une personne dont 2 jours dépassent le plafond de protéines
- **WHEN** la revue s'affiche
- **THEN** sa ligne indique sa moyenne par jour, « 2 jours au-dessus du plafond » et un niveau attention

#### Scenario: Personne absente
- **GIVEN** une personne sans aucun repas sur la période
- **WHEN** la revue s'affiche
- **THEN** elle n'apparaît pas dans l'impact

### Requirement: Revue calculée sur l'état courant
La revue SHALL être calculée à chaque ouverture depuis les choix enregistrés, les stocks et les préférences de l'export, sans stockage ni appel serveur propres.

#### Scenario: Choix modifié puis revue rouverte
- **GIVEN** une revue fermée par « Retourner modifier » puis un plat changé
- **WHEN** la revue est rouverte
- **THEN** elle reflète le nouveau choix
