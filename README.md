# Quick Cooking — les menus de la famille

Site familial (`https://quick-cooking.lo2k.net`) pour :

- **consulter la période en cours** : menu jour par jour (plats numérotés `{N}`, qui mange où, repères
  de protéines), fiche de chaque recette ;
- **faire les courses** : à vérifier à la maison, achats par passage en magasin, déjà à la maison
  (cases à cocher mémorisées sur l'appareil) ;
- **choisir la période à venir** : pour chaque repas, 1 à 5 propositions du projet « batch cooking »,
  ou un remplacement cherché dans toute la base de recettes (filtres type, temps, appareil,
  protéines, saison, froid, jamais cuisinée, coups de cœur), portion et remarque ; contrôles
  d'équilibre en direct ; bouton « On a fini de choisir ».

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
| `RP_ID` | `quick-cooking.lo2k.net` | domaine des passkeys (`localhost` en local) |
| `RP_ORIGIN` | `https://<RP_ID>` | origine exacte vue par le navigateur (`http://localhost:3000` en local) ; en `http://localhost` le cookie de session n'est pas `Secure` |
| `ADMINS` | `J` | codes des personnes dont les passkeys administrent (liste séparée par des virgules) |

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
| `lib/passkeys.mjs` | passkeys (vérification WebAuthn avec `node:crypto`), codes d'invitation, sessions |
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
| `passkeys.json` | passkeys (clé publique, personne, nom d'appareil, dates, révocation), empreintes des codes d'invitation et des sessions |
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

## Passkeys et avis sur les plats

Le site se lit sans compte. Pour **donner un avis** sur un plat de la semaine (verdict, étiquettes,
commentaire), il faut être connecté par **passkey** : empreinte, visage ou code du téléphone. Chaque
passkey est liée à une personne du foyer (« Qui je suis ») ; le serveur ne garde que sa clé publique.
Une fois connecté, « Je suis » prend cette identité pour les avis, les cases de courses et les choix.

Créer une passkey demande un **code d'invitation** (8 caractères, usage unique, 24 h). Les passkeys de
Jérôme (`ADMINS`) ouvrent la section « Administration » de la page « Mon identité » (`#/moi`) : créer
un code, lister les passkeys, en révoquer une (ses sessions tombent aussitôt ; elle reste listée).

Amorçage (première passkey) ou secours si plus aucune passkey d'administration n'est active :

```bash
curl -X POST -H "Authorization: Bearer $IMPORT_TOKEN" -H "Content-Type: application/json" -d '{}' \
  https://quick-cooking.lo2k.net/api/invitations
# → { "code": "K7QM-2XPA", "expire": "…" } : à saisir dans « Mon identité » sur le téléphone de Jérôme
```

À savoir :

- Une passkey **synchronisée** (trousseau iCloud, gestionnaire Google) est la même sur tous les appareils
  du compte : la révoquer la coupe partout.
- Une passkey créée sur `localhost` ne marche pas en production (autre `RP_ID`), et inversement.
- « batch cooking » relit les avis avec `GET /api/avis` (voir
  [`docs/donnees-entree-batch-cooking.md`](docs/donnees-entree-batch-cooking.md) §5 bis).
- Test en local : `RP_ID=localhost RP_ORIGIN=http://localhost:3000 IMPORT_TOKEN=x npm run dev`, puis
  dans Chrome, DevTools ▸ WebAuthn ▸ authentificateur virtuel si l'ordinateur n'a pas de capteur.

## Points ouverts avant la mise en ligne

1. **Déploiement.** Les manifests sont prêts (`deploy/k8s/pvc.yaml`, `deployment.yaml` à 1 réplica)
   mais rien n'est appliqué. Le PVC est en reclaim `Delete` : le prévenir pour les sauvegardes
   (`backup-all.ps1` du dépôt d'infrastructure). Créer le secret `IMPORT_TOKEN` et décommenter
   `envFrom`.
2. **Envoi de l'export.** « batch cooking » doit produire l'export (reprendre
   `outils/construire_exemple.py`) et le déposer avec `IMPORT_TOKEN`. Les options de la période à
   venir de l'exemple sont tirées par un script, pas délibérées par le collège.
3. **Qualité des macros.** Les chiffres viennent de `evaluer_nutrition.py` de « batch cooking ».
   Quelques fiches sont aberrantes (Saint-Jacques aux légumes : 2 472 kcal par portion ; sandwich
   sardine-courgette : 1 856 kcal) : le site les marque « chiffres douteux » et ne les compte pas.
   Le risotto au jambon sort à 23 g de protéines contre ≈ 34 g attendus (`SPEC_App_Menus.md` §7.5).
