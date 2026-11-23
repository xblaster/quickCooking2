# Design

## Context

Voir `proposal.md` (Why). État constaté le 2026-11-23 :

- `server.mjs` (466 lignes) mêle trois accès : jeton `IMPORT_TOKEN` (export, appareils), passkeys + cookie
  `qc_session` (`lib/passkeys.mjs`, 283 lignes, `/api/passkeys*`, `/api/invitations`, `/api/session`), et clé
  d'appareil `X-Appareil` (`lib/appareils.mjs`, mode `libre`).
- Le front (`public/js/app.js`, 1754 lignes) porte environ 70 références à l'identité : en-tête « Je suis » à
  boutons, page `#/moi`, administration des passkeys, panneau « connecte ce téléphone » dans le tiroir d'avis.
- `auth.lo2k.net` (namespace `auth`, déployé) décide pour chaque requête via `auth-url` d'ingress-nginx et
  transmet `X-Auth-Personne`, `X-Auth-Appareil`, `X-Auth-Admin` (nginx remplace toute valeur envoyée par le client).
  Cache nginx de la décision : 30 s. Les codes de personnes sont `J`, `P`, `G` (comme dans l'export `foyer.personnes`).
- Batch cooking dépose l'export (`PUT /api/export…`) et relit `GET /api/choix` et `GET /api/avis` avec `IMPORT_TOKEN`.

## Goals / Non-Goals

**Goals:**
- Une seule identité pour la famille, celle d'`auth`.
- Aucun secret réutilisable ni état d'identité dans Quick Cooking.
- Porte machine conservée pour batch cooking, sans que les en-têtes forgeables n'y comptent.

**Non-Goals:**
- Pas de refonte du registre des appareils ni du mode `autorises`.
- Pas de droits fins par route : tout membre autorisé sur le site `quick-cooking` fait tout ce que la famille fait aujourd'hui.
- Pas de suppression de `passkeys.json` du PVC dans ce change (action séparée, après la période de retour arrière).

## Decisions

### D1 — En-têtes de confiance plutôt que revérification auprès d'auth
Le serveur lit `X-Auth-*` sans rappeler `auth`. Ils ne sont fiables que si le pod n'est joignable que par
ingress-nginx : NetworkPolicy `quick-cooking-restrictive` (entrée `default`/`app.kubernetes.io/name=ingress-nginx`,
port 80). Kata, lui, appelle `auth` directement parce que son pod n'est pas isolé ainsi.
- Alternative écartée : revérifier le cookie auprès d'`auth` (comme kata) — ajoute une dépendance réseau et du
  code, pour un risque que la NetworkPolicy couvre déjà.
- Alternative écartée : signer les en-têtes (HMAC) — demande un secret partagé entre auth et chaque site.

### D2 — Format strict de l'identité
`X-Auth-Personne` doit valoir `^[A-Z][A-Za-z0-9]{0,7}$` (le format qu'`auth` impose à ses codes). Toute autre valeur
= pas d'identité. La personne peut être inconnue du foyer de l'export (ex. une personne ajoutée dans `auth`) :
le site l'accepte et affiche son code faute de nom.

### D3 — Routes machine regroupées sous /api/export
L'Ingress d'exemption ne peut pas filtrer par méthode ; si `/api/choix` ou `/api/avis` étaient exemptés, les
requêtes du site (mêmes chemins) perdraient leurs en-têtes d'identité. Les lectures de batch cooking déménagent
donc sous le préfixe déjà exempté : `GET /api/export/choix[/<id>]` et `GET /api/export/avis[/<id>]`, alias en
lecture seule des routes du site. Une seule règle d'exemption : `/api/export` (Exact) et `/api/export/` (Prefix).
- Alternative écartée : exempter `/api/choix` Exact seulement — résout un cas (`GET /api/choix` sans id) mais pas
  `GET /api/avis` (utilisé par le site lui-même toutes les 30 s).

### D4 — Aucune lecture d'identité sur les chemins exemptés
Sur `/api/export*` les en-têtes ne sont pas posés par nginx (pas d'`auth-url`) et un client peut les forger. Le
code de ces routes ne les lit jamais : le jeton seul compte. Un test vérifie qu'un `X-Auth-Admin: 1` sans jeton
reste en 401.

### D5 — Personne imposée par l'identité
Avis et cases de courses utilisent `identite.personne` ; le champ `par` du corps est ignoré pour les courses
(il restait contrôlé par une liste `J/P/G` côté serveur). Les choix de repas gardent leur `par` libre
(information de présentation validée par `contrat.mjs`) : hors périmètre.

### D6 — Garde d'écriture
Le cookie d'`auth` est `SameSite=Lax` sur `Domain=lo2k.net` : toute page d'un autre sous-domaine du domaine
l'envoie. Le serveur exige donc, pour toute écriture du site, `Content-Type: application/json` et, si `Origin`
est présent, `Origin === SITE_ORIGIN` (défaut `https://quick-cooking.lo2k.net`). Absent (client non navigateur,
tests) : accepté, la NetworkPolicy borne déjà qui peut atteindre le pod.

### D7 — Front : un seul écran d'identité, aucune boucle
La personne vient de `GET /api/session`. L'en-tête « Je suis » n'a plus de boutons de choix : il montre la
personne connectée. `#/moi` : identité, nom de l'appareil, liens `auth.lo2k.net/connexion` et `/admin`. Sur 401 au
démarrage : page « Connexion requise » avec un bouton, **sans redirection automatique** : si l'Ingress perdait
ses annotations, une redirection tournerait en boucle avec `auth` (qui renvoie vers `rd` quand la session est bonne).
L'hôte d'`auth` se déduit de l'hôte courant (`quick-cooking.<domaine>` → `auth.<domaine>`).

### D8 — Registre des appareils conservé
`X-Appareil` reste : il note le nom de l'appareil et alimente `appareil` dans les choix et courses. Mode `libre`
inchangé.

### D9 — Ordre de déploiement
1. `auth` : droits (site `quick-cooking`) et codes pour J, P, G ; au moins deux appareils de Jérôme déjà inscrits.
2. NetworkPolicy + Ingress `quick-cooking-machine` + annotations sur `quick-cooking-ingress` (l'ancienne image
   fonctionne toujours : elle ignore les en-têtes et garde ses passkeys ; double connexion pendant l'intervalle).
3. Nouvelle image (`kubectl set image`) : bascule immédiate, personne n'a rien à refaire si `auth` est inscrit.
4. Mise à jour du script de batch cooking (URL de lecture) avant l'étape 2 : les anciennes URL de lecture
   reçoivent 302 dès l'étape 2, les nouvelles n'existent qu'après l'étape 3. Enchaîner 2 et 3.
Retour arrière : `kubectl rollout undo` (l'ancienne image reprend ses passkeys du PVC, intactes) ; en cas de panne
d'`auth` : `scripts/auth/proteger.py retirer quick-cooking quick-cooking-ingress`.

## Risks / Trade-offs

- [`auth` tombe : Quick Cooking refuse tout] → sonde Hermes sur `auth.lo2k.net/healthz`, script de retrait d'urgence.
- [Batch cooking lit encore `GET /api/choix` ou `/api/avis` avec le jeton après l'étape 2 et reçoit 302] → les
  nouvelles URL n'existent que dans la nouvelle image : enchaîner les étapes 2 et 3 en moins d'une minute, et
  mettre à jour le skill de batch cooking avant la bascule. Batch cooking n'appelle pas en continu : au pire une
  lecture échoue et se rejoue.
- [Personne inconnue de l'export affichée par son code] → acceptable, l'export `foyer` peut être complété.
- [Cache d'auth de 30 s] → un retrait de droit met jusqu'à 30 s à couper l'accès.
- [PWA / favicon : ressources sans cookie] → Quick Cooking n'a pas de manifeste ; si un jour il en a un,
  prévoir une exemption comme `encaisse-pwa`.

## Migration Plan

Voir D9. Les données (`export.json`, `choix/`, `courses/`, `avis/`, `appareils.json`) ne changent pas de format.
`passkeys.json` reste sur le PVC, inutilisé.

## Open Questions

- Mettre à jour le skill `batch-cooking-famille` (URL `/api/export/choix` et `/api/export/avis`) : hors de ce
  dépôt, à faire par Jérôme ou dans une session dédiée ; la date de bascule en dépend.
