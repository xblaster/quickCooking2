# Delta de spécification

## Purpose

Permettre à la famille de lire la liste de courses partagée en magasin, en rangeant d'un appui ce qui est déjà coché.

## ADDED Requirements

### Requirement: Bouton de rangement des lignes cochées
La page Courses SHALL proposer un bouton d'action nommé « Mettre les cochées en bas », visible tant qu'au moins une ligne cochée reste dans la liste. Ce bouton MUST NOT garder d'état enfoncé.

#### Scenario: Lignes cochées dans la liste
- **GIVEN** au moins une ligne cochée encore dans la liste
- **WHEN** la page Courses s'affiche
- **THEN** le bouton est visible

#### Scenario: Rien à ranger
- **GIVEN** aucune ligne cochée hors de la section « Déjà cochées »
- **WHEN** la page Courses s'affiche
- **THEN** le bouton n'est pas affiché

#### Scenario: Pas de liste de courses
- **WHEN** la période courante n'a pas de liste de courses
- **THEN** la page affiche le message habituel et aucun bouton

### Requirement: Un appui range toutes les lignes cochées
Un appui sur le bouton SHALL faire basculer toutes les lignes cochées à cet instant dans une section « Déjà cochées », placée après les autres blocs de la liste et portant le nombre de lignes qu'elle contient. Chaque ligne restante MUST garder son bloc, son rayon et son ordre.

#### Scenario: Liste partiellement cochée
- **GIVEN** un rayon contenant une ligne cochée et une ligne non cochée
- **WHEN** une personne appuie sur le bouton
- **THEN** la ligne non cochée reste dans son rayon et la ligne cochée passe dans la section « Déjà cochées »

#### Scenario: Lignes à vérifier à la maison
- **GIVEN** une ligne cochée du bloc « À vérifier à la maison »
- **WHEN** une personne appuie sur le bouton
- **THEN** cette ligne passe dans la section « Déjà cochées » avec son texte d'origine

#### Scenario: Rayon ou bloc entièrement coché
- **GIVEN** un rayon, un passage ou le bloc « À vérifier à la maison » dont toutes les lignes sont cochées
- **WHEN** une personne appuie sur le bouton
- **THEN** son titre n'est plus affiché

#### Scenario: Toutes les lignes cochées
- **GIVEN** toutes les lignes sont cochées
- **WHEN** une personne appuie sur le bouton
- **THEN** seule la section « Déjà cochées » contient des lignes et le tableau « Déjà à la maison » reste affiché s'il existe

### Requirement: La liste ne bouge qu'à l'appui
Une ligne cochée après un appui SHALL rester à sa place jusqu'à l'appui suivant, que la case soit cochée sur cet appareil ou sur un autre.

#### Scenario: Cocher une ligne après un appui
- **WHEN** une personne coche une ligne de la liste après avoir appuyé sur le bouton
- **THEN** la ligne reste à sa place, cochée, et le bouton reste disponible

#### Scenario: Case cochée sur un autre téléphone
- **WHEN** la mise à jour périodique rapporte une ligne cochée ailleurs
- **THEN** la ligne s'affiche cochée à sa place, sans changer de section

#### Scenario: Nouvel appui
- **GIVEN** des lignes cochées depuis le dernier appui
- **WHEN** une personne appuie de nouveau sur le bouton
- **THEN** ces lignes rejoignent la section « Déjà cochées »

### Requirement: Une ligne décochée retourne à sa place
Une ligne de la section « Déjà cochées » SHALL retourner à sa place d'origine dès qu'elle est décochée, sur cet appareil ou sur un autre. Si l'enregistrement échoue, la ligne MUST rester rangée et cochée, et l'erreur habituelle MUST s'afficher.

#### Scenario: Décocher une ligne rangée
- **WHEN** une personne décoche une ligne de la section « Déjà cochées »
- **THEN** la ligne retourne dans son bloc et son rayon d'origine

#### Scenario: Décochée sur un autre téléphone
- **WHEN** la mise à jour périodique rapporte qu'une ligne rangée a été décochée ailleurs
- **THEN** la ligne retourne à sa place d'origine sur cet appareil

#### Scenario: Échec de l'enregistrement
- **WHEN** le décochage d'une ligne rangée échoue
- **THEN** la ligne reste dans la section « Déjà cochées », cochée, et un message d'erreur s'affiche

### Requirement: Le rangement reste propre à l'appareil
Le rangement SHALL être retenu sur l'appareil entre deux visites, pour la période en cours seulement. Il MUST NOT modifier les cases partagées ni l'affichage des autres appareils. Si le stockage local est indisponible, la page MUST rester utilisable.

#### Scenario: Première visite
- **WHEN** un appareil ouvre la page sans rangement enregistré
- **THEN** la liste garde sa présentation habituelle, avec le bouton s'il y a des lignes cochées

#### Scenario: Visite suivante
- **WHEN** un appareil revient sur la page après un appui
- **THEN** les lignes rangées qui sont toujours cochées restent dans la section « Déjà cochées »

#### Scenario: Autre appareil
- **WHEN** un appareil appuie sur le bouton
- **THEN** les cases partagées restent inchangées et un autre appareil garde son propre affichage

#### Scenario: Nouvelle période
- **WHEN** une nouvelle période courante est publiée
- **THEN** son affichage ne reprend pas le rangement de la période précédente

#### Scenario: Stockage local indisponible
- **WHEN** le stockage local du navigateur refuse la lecture ou l'écriture
- **THEN** le rangement fonctionne jusqu'au rechargement de la page, sans erreur affichée
