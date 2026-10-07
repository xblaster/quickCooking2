# Quick Cooking — les menus de la famille

Site familial (`https://quick-cooking.lo2k.net`) pour :

- **consulter la période en cours** : menu jour par jour (plats numérotés `{N}`, qui mange où, repères
  de protéines), fiche de chaque recette ;
- **faire les courses** : à vérifier à la maison, achats par passage en magasin, déjà à la maison
  (cases à cocher mémorisées sur l'appareil) ;
- **choisir la période à venir** : pour chaque repas, 1 à 3 propositions du projet « batch cooking »,
  ou un remplacement cherché dans toute la base de recettes (filtres type, temps, appareil,
  protéines, saison, froid, jamais cuisinée, coups de cœur), portion et remarque ; contrôles
  d'équilibre en direct ; bouton « On a fini de choisir ».

Toujours affiché (colonne de droite sur ordinateur, barre en bas sur téléphone) : les **macros de la
journée** par personne (petit-déjeuner et Skyr compris, suit le jour à l'écran, flèches ‹ ›) et les
**stocks** frigo / congélateur / cellier, avec les repas qui les utilisent et les produits à finir
sans plat prévu. Toucher un produit ouvre les recettes qui l'utilisent.

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
| `public/` | page unique : `js/app.js` (vues), `js/regles.js` (contrôles), `js/recherche.js`, `js/markdown.js` |
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
