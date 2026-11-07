# Delta de spécification

## Purpose

Recueillir, plat par plat pendant la période courante, ce que chaque personne du foyer a aimé ou dû changer, et le rendre à « batch cooking » pour raffiner la période suivante.

## ADDED Requirements

### Requirement: Un avis par personne et par repas de la période courante
Le site SHALL permettre à une personne connectée par passkey de donner un avis sur chaque repas de `periode_courante` qui porte un plat. Il y a au plus un avis par personne et par repas ; l'avis porte la personne de la session, jamais une personne choisie à la main.

#### Scenario: Premier avis
- **GIVEN** une session de Jérôme et le repas `{31}` de la période courante
- **WHEN** Jérôme enregistre un avis sur ce repas
- **THEN** l'avis est stocké pour Jérôme sur ce repas, avec la date

#### Scenario: Sans session
- **GIVEN** aucune session passkey
- **WHEN** quelqu'un veut donner un avis
- **THEN** le site propose de se connecter ou de créer une passkey, et le serveur refuse toute écriture avec 401

#### Scenario: Repas hors période courante
- **WHEN** un avis vise un repas absent de la période courante ou un repas sans plat
- **THEN** le serveur répond 404 et n'enregistre rien

### Requirement: Contenu d'un avis
Un avis SHALL comporter un verdict obligatoire parmi `coup_de_coeur` (« Coup de cœur »), `bien` (« Bien »), `bof` (« Bof »), `plus_jamais` (« Plus jamais »), des étiquettes facultatives prises dans une liste fermée, et un commentaire libre facultatif de 500 caractères au plus. Le serveur MUST refuser toute autre valeur.

#### Scenario: Liste des étiquettes
- **WHEN** le composant d'avis s'affiche
- **THEN** il propose les étiquettes « Portion trop petite », « Portion trop grande », « Trop salé ou épicé », « Fade », « Texture ratée », « Réchauffe mal », « Trop long à préparer », « Recette modifiée »

#### Scenario: Verdict manquant
- **WHEN** un avis est envoyé sans verdict ou avec un verdict inconnu
- **THEN** le serveur répond 400 et n'enregistre rien

#### Scenario: Commentaire trop long
- **WHEN** le commentaire dépasse 500 caractères
- **THEN** le serveur répond 400 et le composant l'empêche avant l'envoi en affichant le compte restant

#### Scenario: Recette modifiée sans détail
- **GIVEN** l'étiquette « Recette modifiée » cochée
- **WHEN** le commentaire est vide
- **THEN** le composant invite à écrire ce qui a été changé, sans bloquer l'enregistrement

### Requirement: Modifier ou retirer son avis
Une personne SHALL pouvoir modifier ou retirer son propre avis tant que le repas appartient à la période courante. Elle MUST NOT pouvoir modifier ni retirer l'avis d'une autre personne.

#### Scenario: Modification
- **GIVEN** l'avis « Bien » de Pauline sur `{32}`
- **WHEN** Pauline le passe à « Coup de cœur » et ajoute un commentaire
- **THEN** l'avis est remplacé et sa date de mise à jour change

#### Scenario: Retrait
- **WHEN** Pauline retire son avis sur `{32}`
- **THEN** il n'existe plus et n'apparaît plus sous le plat

#### Scenario: Période changée
- **GIVEN** une nouvelle période courante déposée par « batch cooking »
- **WHEN** quelqu'un tente de modifier un avis de l'ancienne période
- **THEN** le serveur refuse ; les avis de l'ancienne période restent lisibles par « batch cooking »

### Requirement: Avis visibles par la famille
Sous chaque repas de la période courante, la page Semaine et les lignes « Ensuite » de l'accueil SHALL afficher les avis existants en une ligne compacte (initiale et verdict de chaque personne, mention « + commentaire »). Le détail (étiquettes, commentaires, auteurs, dates) MUST être lisible dans le composant d'avis, sans session.

#### Scenario: Deux avis
- **GIVEN** Jérôme « Coup de cœur » avec commentaire et Grégoire « Bof »
- **WHEN** la page Semaine s'affiche
- **THEN** la ligne du repas montre « J Coup de cœur + commentaire · G Bof »

#### Scenario: Aucun avis
- **WHEN** un repas n'a aucun avis
- **THEN** la ligne n'affiche qu'une action « Donner mon avis », sans ligne vide

#### Scenario: Avis d'un autre appareil
- **GIVEN** la page Semaine ouverte sur la tablette
- **WHEN** Pauline enregistre un avis depuis son téléphone
- **THEN** la tablette l'affiche sans rechargement complet dans la minute

### Requirement: Composant de saisie d'avis
L'avis SHALL se saisir dans un tiroir ouvert depuis le repas, titré par la pastille `{N}` et le nom du plat. Verdicts et étiquettes MUST être des cibles d'au moins 44 px utilisables au pouce, l'enregistrement MUST être explicite (bouton « Enregistrer »), et le tiroir MUST se lire au clavier et au lecteur d'écran (groupe de verdicts à choix unique, étiquettes à cocher, champ nommé).

#### Scenario: Ouverture pré-remplie
- **GIVEN** un avis existant de Jérôme
- **WHEN** Jérôme ouvre le tiroir
- **THEN** son verdict, ses étiquettes et son commentaire sont pré-remplis et le bouton « Retirer mon avis » est proposé

#### Scenario: Enregistrement hors ligne
- **WHEN** l'enregistrement échoue (réseau, serveur)
- **THEN** le tiroir reste ouvert avec la saisie intacte et un message d'erreur, et rien n'est affiché comme enregistré

#### Scenario: Fermeture avec saisie non enregistrée
- **WHEN** l'utilisateur ferme le tiroir après avoir modifié la saisie sans l'enregistrer
- **THEN** le site demande confirmation avant de perdre la saisie

### Requirement: Récupération des avis par « batch cooking »
Le serveur SHALL renvoyer, aux requêtes portant le jeton `IMPORT_TOKEN`, tous les avis d'une période au format `quick-cooking/avis` version 1 : pour chaque repas, son id, son numéro `{N}`, la référence et le nom du plat, et les avis (personne, verdict, étiquettes, commentaire, dates). `GET /api/avis` vise la période courante, `GET /api/avis/<id période>` une période donnée.

#### Scenario: Lecture par batch cooking
- **GIVEN** des avis sur la période courante
- **WHEN** « batch cooking » appelle `GET /api/avis` avec le jeton
- **THEN** il reçoit chaque repas noté avec `numero`, `plat.ref`, `plat.nom` et ses avis

#### Scenario: Période sans avis
- **WHEN** la période demandée n'a aucun avis
- **THEN** la réponse est 200 avec une liste de repas vide

#### Scenario: Période ancienne
- **GIVEN** une période qui n'est plus courante mais a reçu des avis
- **WHEN** « batch cooking » appelle `GET /api/avis/<son id>` avec le jeton
- **THEN** il reçoit ses avis, la référence et le nom du plat étant ceux enregistrés au moment de l'avis
