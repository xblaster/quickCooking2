# Quick Cooking — les menus de la famille

Site familial (`https://quick-cooking.lo2k.net`) pour :

- **consulter la période en cours** : menu jour par jour (plats numérotés `{N}`, qui mange où, repères
  de protéines), fiche de chaque recette ;
- **faire les courses** : à vérifier à la maison, achats par passage en magasin, déjà à la maison
  (cases à cocher mémorisées sur l'appareil) ;
- **choisir la période à venir** : pour chaque repas, 1 à 5 propositions du projet « batch cooking »,
  ou un remplacement cherché dans toute la base de recettes (filtres type, temps, appareil,
  protéines, saison, froid, jamais cuisinée, coups de cœur), portion et remarque ; contrôles
  d'équilibre en direct ; bouton « On a fini de choisir », qui ouvre une **revue avant validation**
  (produits du frigo sans plat, règles de la famille dont le poisson, effet des choix sur les protéines
  et la variété) : purement informative, on valide ensuite ou on retourne modifier.

L'accueil affiche le **prochain repas** en grand (moment, numéro, plat, qui mange où, bouton vers la
recette), puis les repas suivants ; il signale un menu terminé. La fiche recette s'ouvre en **mode
cuisine** : ingrédients et étapes d'abord, en grand, option « Garder l'écran allumé » ; le reste de la
fiche est replié.

Au second plan, sur Semaine et À choisir : une ligne en bas de l'écran donne les **protéines du jour**
par personne (flèches pour changer de jour) ; la toucher ouvre le détail des **macros** (petit-déjeuner
et Skyr compris) et les **stocks** frigo / congélateur / cellier, avec les repas qui les utilisent et les
produits à finir sans plat prévu. Toucher un produit ouvre les recettes qui l'utilisent.

Le site **ne compose pas** les menus. « batch cooking » les décide et lui envoie un export JSON ;
le site lui rend les choix de la famille. Contrat complet : [`docs/donnees-entree-batch-cooking.md`](docs/donnees-entree-batch-cooking.md) (guide destiné à l'IA de « batch cooking », API d'envoi comprise).

## Lancer en local

Node 22 ou plus, aucune dépendance à installer.

```bash
npm run dev          # http://localhost:3000, avec les données d'exemple
npm test             # règles, recherche, Markdown, API
```

Variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `80` (`--port` en argument l'emporte) | port HTTP |
| `DATA_DIR` | `./data` | export déposé (`export.json`) et choix (`choix/<periode>.json`) |
| `IMPORT_TOKEN` | vide = administration désactivée | jeton d'administration : dépôt de l'export, autorisation des appareils |
| `APPAREILS_MODE` | `libre` | `libre` : tout appareil utilise le site (il est seulement enregistré) ; `autorises` : seuls les appareils autorisés |
| `SITE_ORIGIN` | `https://quick-cooking.lo2k.net` | origine du site : une écriture portant un autre `Origin` est refusée (403) |

L'identité des personnes ne se configure pas ici : elle vient d'`auth.lo2k.net` (voir « Identité et avis sur les plats »).

Sans export déposé, le site sert [`exemple/export.json`](exemple/export.json), régénérable depuis le
dépôt « batch cooking » :

```bash
python outils/construire_exemple.py
```

## Organisation

| Chemin | Rôle |
|---|---|
| `server.mjs` | serveur HTTP (statique + API), sans dépendance |
| `lib/contrat.mjs` | validation de l'export, normalisation et validation des choix |
| `lib/stockage.mjs` | fichiers de `DATA_DIR`, écritures atomiques, file d'attente par période |
| `public/` | page unique : `js/app.js` (vues), `js/regles.js` (contrôles), `js/recherche.js`, `js/markdown.js`, `js/avis.js` (verdicts et étiquettes) |
| `exemple/export.json` | données d'exemple : 196 fiches réelles, période S40-S41, période à venir fictive |
| `outils/construire_exemple.py` | implémentation de référence de l'export, à reprendre côté « batch cooking » |

## Données (JSON sur un petit volume)

Tout est stocké en JSON dans `DATA_DIR`, monté sur le PVC `quick-cooking-data` (1 Gi) en production :

| Fichier | Contenu |
|---|---|
| `export.json` | dernier export déposé par « batch cooking » |
| `choix/<periode>.json` | choix de la famille pour la période à venir |
| `courses/<periode>.json` | cases cochées de la liste de courses, partagées entre appareils |
| `appareils.json` | appareils connus : empreinte de la clé, nom, navigateur, statut, dates |
| `passkeys.json` | **plus utilisé** (ancien registre des passkeys locales, remplacé par `auth.lo2k.net`) ; à supprimer après la période de retour arrière |
| `avis/<periode>.json` | avis de la famille sur les plats de la période courante |

Écritures atomiques et en file d'attente par fichier ; un seul pod (`replicas: 1`, `Recreate`).

## Appareils

Pas d'authentification pour l'instant. Chaque navigateur tire une clé aléatoire au premier passage
(gardée chez lui, envoyée dans l'en-tête `X-Appareil`) ; le serveur n'en garde que l'empreinte. Chaque
choix et chaque case cochée note l'appareil. On peut nommer l'appareil en bas de la page d'accueil.

Pour fermer le site plus tard aux seuls appareils de la famille :

```bash
# 1. Lister les appareils connus
curl -H "Authorization: Bearer $IMPORT_TOKEN" https://quick-cooking.lo2k.net/api/appareils
# 2. Autoriser chacun (statut : autorise | refuse | en_attente)
curl -X PUT -H "Authorization: Bearer $IMPORT_TOKEN" -H "Content-Type: application/json"   -d '{"statut":"autorise"}' https://quick-cooking.lo2k.net/api/appareils/<id>
# 3. Passer APPAREILS_MODE à "autorises" dans deploy/k8s/deployment.yaml et redéployer
```

Un appareil non autorisé voit alors un écran « Appareil en attente » où il peut se nommer.

## Identité et avis sur les plats

Le site est protégé par **`auth.lo2k.net`** (service commun des sites `*.lo2k.net`, voir le dépôt
`lo2k_infrastructure`, change `auth-lo2k-passkeys`) : une passkey par appareil, des droits par site, une page
d'administration. ingress-nginx demande à `auth` si la personne a le droit d'ouvrir `quick-cooking`, puis
transmet son identité au serveur dans trois en-têtes :

| En-tête | Contenu |
|---|---|
| `X-Auth-Personne` | code de la personne (`J`, `P`, `G`…) |
| `X-Auth-Appareil` | identifiant de l'appareil (passkey) |
| `X-Auth-Admin` | `1` pour un administrateur |

Le serveur ne garde ni passkey, ni code d'invitation, ni session, et n'émet aucun cookie :

- **Sans en-tête valide, toute l'API du site répond 401.** Les pages statiques et `/healthz` restent
  servis (c'est l'Ingress qui protège les pages).
- Les avis (`PUT`/`DELETE /api/avis/…`) et les cases de courses portent **la personne de l'identité**, jamais
  celle du corps de la requête. « Je suis » (en-tête du site) affiche cette personne.
- La page « Mon identité » (`#/moi`) montre la personne, le nom de l'appareil, et renvoie vers
  `auth.lo2k.net` (appareils, déconnexion, et administration pour un administrateur).
- Toute écriture exige un corps JSON et, si `Origin` est présent, l'origine du site (`SITE_ORIGIN`).
- **Les en-têtes ne sont fiables que parce que la NetworkPolicy du namespace n'admet que ingress-nginx**
  ([`deploy/k8s/networkpolicy.yaml`](deploy/k8s/networkpolicy.yaml)). Ne jamais exposer le Service autrement.

### Routes machine (batch cooking)

L'Ingress `quick-cooking-machine` exempte `/api/export` (exact) et `/api/export/` de la décision d'`auth` :
ces routes n'acceptent que `Authorization: Bearer $IMPORT_TOKEN` et **ne lisent jamais les en-têtes
d'identité** (un client pourrait les forger). Les lectures de batch cooking y vivent aussi :
`GET /api/export/choix[/<période>]` et `GET /api/export/avis[/<période>]` (anciens `GET /api/choix` et
`GET /api/avis`, désormais réservés au site). L'écriture d'un repas y est aussi : `PUT /api/export/choix/<période>/repas/<repasId>`
(jeton seul, même validation que le site, `{ "ref": null }` vide la case ; l'entrée porte `via: "batch-cooking"`). Voir
[`docs/donnees-entree-batch-cooking.md`](docs/donnees-entree-batch-cooking.md).

### Tester en local

Les en-têtes sont posés par l'Ingress : en local, les envoyer à la main
(`curl -H "X-Auth-Personne: J" -H "X-Auth-Admin: 1" http://localhost:3000/api/session`) ou placer devant le
serveur un petit proxy qui les ajoute. Sans en-tête, le site affiche « Connexion requise ».
