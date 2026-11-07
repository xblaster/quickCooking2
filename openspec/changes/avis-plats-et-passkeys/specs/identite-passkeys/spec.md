# Delta de spécification

## Purpose

Savoir avec certitude qui, de Jérôme, Pauline ou Grégoire, agit sur le site, grâce à une passkey créée sur son téléphone et liée à sa personne, et permettre à l'administrateur de révoquer ces clés.

## ADDED Requirements

### Requirement: Code d'invitation à usage unique
Le site SHALL exiger un code d'invitation valide pour créer une passkey. Un code MUST être à usage unique, expirer 24 h après sa création, et n'être stocké côté serveur que sous forme d'empreinte. Un code peut être généré par une session administrateur ou par une requête portant le jeton d'administration `IMPORT_TOKEN`.

#### Scenario: Génération par l'administrateur
- **GIVEN** une session dont la personne a le droit d'administration
- **WHEN** elle demande un code d'invitation
- **THEN** le site affiche un code court lisible une seule fois, avec son heure d'expiration

#### Scenario: Amorçage par le jeton
- **GIVEN** aucune passkey enregistrée
- **WHEN** une requête portant le jeton `IMPORT_TOKEN` demande un code d'invitation
- **THEN** le serveur renvoie un code valide 24 h

#### Scenario: Code déjà utilisé ou expiré
- **WHEN** une création de passkey présente un code déjà consommé, expiré ou inconnu
- **THEN** le serveur refuse avec le message « Code d'invitation invalide ou expiré » et n'enregistre rien

#### Scenario: Requête sans droit
- **WHEN** une requête sans session administrateur ni jeton demande un code
- **THEN** le serveur répond 401 et ne crée aucun code

### Requirement: Création d'une passkey liée à une personne
Le site SHALL permettre de créer une passkey (WebAuthn, vérification de l'utilisateur exigée) après avoir choisi « Qui je suis » parmi les personnes du foyer de l'export et saisi un code d'invitation. Le serveur MUST n'enregistrer que l'identifiant et la clé publique de la passkey, la personne, un nom d'appareil et les dates ; jamais de donnée biométrique.

#### Scenario: Création réussie
- **GIVEN** un code d'invitation valide
- **WHEN** Pauline choisit « Pauline » dans « Qui je suis », saisit le code et valide l'empreinte sur son téléphone
- **THEN** la passkey est enregistrée pour Pauline, le code est consommé et l'appareil est connecté en tant que Pauline

#### Scenario: Personne inconnue
- **WHEN** la création indique une personne absente du foyer
- **THEN** le serveur refuse et n'enregistre rien

#### Scenario: Navigateur sans passkey
- **GIVEN** un navigateur qui ne prend pas en charge WebAuthn
- **WHEN** l'écran de création s'affiche
- **THEN** il indique que cet appareil ne permet pas de créer de passkey et ne propose pas le bouton

#### Scenario: Geste annulé
- **WHEN** l'utilisateur annule la demande d'empreinte
- **THEN** rien n'est enregistré, le code reste valide et l'écran permet de réessayer

#### Scenario: Plusieurs passkeys par personne
- **GIVEN** Jérôme a déjà une passkey sur son téléphone
- **WHEN** il en crée une seconde sur sa tablette avec un nouveau code
- **THEN** les deux passkeys sont actives et liées à Jérôme

### Requirement: Connexion par passkey
Le site SHALL permettre de se connecter en présentant une passkey enregistrée et non révoquée. Le serveur MUST vérifier la signature contre la clé publique enregistrée, le défi émis par lui depuis moins de 5 minutes et à usage unique, l'origine et l'identifiant de partie de confiance du site.

#### Scenario: Connexion réussie
- **GIVEN** une passkey active de Grégoire sur ce téléphone
- **WHEN** Grégoire touche « Me connecter » et valide l'empreinte
- **THEN** une session est ouverte en tant que Grégoire

#### Scenario: Passkey révoquée
- **GIVEN** une passkey révoquée
- **WHEN** elle est présentée à la connexion
- **THEN** le serveur refuse et aucune session n'est ouverte

#### Scenario: Défi rejoué ou expiré
- **WHEN** une réponse de connexion porte un défi déjà utilisé ou vieux de plus de 5 minutes
- **THEN** le serveur refuse

#### Scenario: Mauvaise origine
- **WHEN** la réponse WebAuthn indique une origine différente de celle du site
- **THEN** le serveur refuse

### Requirement: Session et identité courante
Une connexion réussie SHALL ouvrir une session portée par un cookie `HttpOnly`, `Secure` (hors `localhost`), `SameSite=Strict`, valable 180 jours et prolongée à l'usage. Le serveur MUST n'en garder que l'empreinte. Le site SHALL exposer l'identité de la session (personne, administrateur ou non) et permettre de se déconnecter.

#### Scenario: Identité affichée
- **GIVEN** une session ouverte en tant que Pauline
- **WHEN** le site s'affiche
- **THEN** « Je suis » montre Pauline, verrouillé, et les actions enregistrées portent Pauline

#### Scenario: Sans session
- **GIVEN** aucun cookie de session valide
- **WHEN** le site s'affiche
- **THEN** la lecture est complète et « Je suis » reste le choix manuel actuel

#### Scenario: Déconnexion
- **WHEN** la personne se déconnecte
- **THEN** la session est supprimée côté serveur et le cookie effacé

#### Scenario: Passkey révoquée pendant une session
- **GIVEN** une session ouverte avec une passkey
- **WHEN** l'administrateur révoque cette passkey
- **THEN** la session est invalide dès la requête suivante

### Requirement: Droit d'administration
Les sessions ouvertes avec une passkey de Jérôme SHALL avoir le droit d'administration. Aucune autre personne ne l'a. Les routes d'administration MUST refuser toute requête sans ce droit ni le jeton `IMPORT_TOKEN`.

#### Scenario: Pauline tente l'admin
- **GIVEN** une session de Pauline
- **WHEN** elle appelle une route d'administration des passkeys
- **THEN** le serveur répond 403

### Requirement: Liste et révocation des passkeys
L'écran d'administration SHALL lister toutes les passkeys (personne, nom d'appareil, date de création, dernier usage, état) et permettre de révoquer une passkey active, après confirmation. Une passkey révoquée MUST rester dans la liste, marquée « révoquée », et ne plus jamais pouvoir ouvrir de session.

#### Scenario: Révocation
- **GIVEN** une passkey active de Grégoire sur un téléphone perdu
- **WHEN** Jérôme la révoque et confirme
- **THEN** elle apparaît « révoquée » avec la date, et les sessions ouvertes avec elle sont fermées

#### Scenario: Révoquer sa propre dernière passkey d'admin
- **GIVEN** Jérôme n'a qu'une passkey active
- **WHEN** il demande à la révoquer
- **THEN** la confirmation l'avertit qu'il perdra l'accès admin et devra repartir d'un code généré avec le jeton `IMPORT_TOKEN`
