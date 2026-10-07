---
titre: Données d'entrée de Quick Cooking — guide pour l'IA du projet « batch cooking »
version: 1 (format d'export « quick-cooking/export » v1)
date: 2026-10-07
destinataire: l'agent IA (Claude, Antigravity…) qui travaille dans le dépôt « batch cooking »
schema: https://quick-cooking.lo2k.net/schema/export-v1.json (copie : public/schema/export-v1.json)
---

# Envoyer les menus au site familial Quick Cooking

Ce document te dit **quoi produire, comment le calculer et comment l'envoyer** au site
`https://quick-cooking.lo2k.net`. Il se suffit à lui-même. Les règles de composition des menus restent
celles de ton dépôt (skill `batch-cooking-famille`, `Preferences_Famille.md`) : le site ne compose
rien, il **affiche**, **contrôle** et **recueille les choix** de la famille.

## 0. Ce qu'il faut retenir

1. Tu envoies **un seul document JSON** (l'« export ») avec six sections : `foyer`, `preferences`,
   `stocks`, `periode_courante`, `periode_a_venir`, `recettes`. Tu peux aussi n'envoyer qu'une section.
2. **Période courante** = le menu décidé en cours (lecture seule pour la famille) + les courses.
   **Période à venir** = 1 à 3 propositions par repas ; la famille choisit ou remplace.
3. Tu relis les **choix** de la famille (`GET /api/choix`) avant d'arrêter le menu de la période à venir
   (Temps 2 de ton skill).
4. Les **stocks** portent les produits **à consommer absolument** (date limite proche, produit frais
   présent depuis longtemps) : c'est ce qui permet au site d'alerter quand aucun repas ne les utilise
   à temps.
5. **Rien n'est inventé** : une donnée que tu ne connais pas s'omet (ou vaut `null`) ; ne fabrique
   jamais une date limite, une quantité ou une recette.
6. Avant d'envoyer, **vérifie à blanc** (`POST /api/export/verifier`) et lis les avertissements.

---

## 1. Quand envoyer quoi

| Moment (cycle de ton skill) | Ce que tu envoies | Route |
|---|---|---|
| Fin du Temps 1 : propositions prêtes pour la période suivante | `periode_a_venir` (statut `en_choix`, avec `date_limite_choix`) | `PUT /api/export/periode_a_venir` |
| Échéance passée : tu arrêtes le menu | `periode_a_venir` en statut `close` (la famille ne peut plus modifier) | `PUT /api/export/periode_a_venir` |
| Temps 2 terminé : nouvelle semaine validée | `periode_courante` (menu numéroté `{N}` + courses), puis la nouvelle `periode_a_venir` ou `null` | `PUT /api/export/periode_courante` puis `…/periode_a_venir` |
| Après chaque inventaire (frigo, congélateur, cellier) ou retour de courses | `stocks` | `PUT /api/export/stocks` |
| Nouvelle fiche recette, fiche corrigée, nouveau RETEX | `recettes` (la base **entière**) | `PUT /api/export/recettes` |
| Changement de profils, de goûts, de règles | `foyer` et/ou `preferences` | `PUT /api/export/foyer`, `…/preferences` |
| Premier envoi, ou doute sur la cohérence | tout | `PUT /api/export` |

Une section envoyée **remplace entièrement** la section en place ; les autres sont conservées.
L'ensemble est revalidé à chaque envoi : une section incohérente avec le reste (une option qui cite une
recette absente, par exemple) est refusée sans rien écrire.

---

## 2. L'API

Base : `https://quick-cooking.lo2k.net` (en local : `http://localhost:3000`).
Authentification : en-tête `Authorization: Bearer <IMPORT_TOKEN>` sur toutes les routes ci-dessous.
Le jeton est un secret : lis-le dans une variable d'environnement (`QUICK_COOKING_IMPORT_TOKEN`),
ne l'écris jamais dans un fichier du dépôt.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| PUT | `/api/export` | export complet | `200 { ok, genere_le, recettes, avertissements, refs_introuvables }` ; `400 { erreur, details[] }` |
| PUT | `/api/export/<section>` | la section seule (`foyer`, `preferences`, `stocks`, `periode_courante`, `periode_a_venir`, `recettes`) | `200 { ok, avertissements }` ; `400 { erreur }` |
| POST | `/api/export/verifier` | export complet — ou une section avec `?section=<nom>` | `200 { valide, erreurs[], avertissements[] }` — **n'écrit rien** |
| GET | `/api/export/etat` | — | ce qui est en place : dates, nombre de recettes et d'articles, ids des périodes, avancement des choix, avertissements |
| GET | `/api/choix` | — | choix de la famille pour la période à venir en place (§5) |
| GET | `/api/choix/<id période>` | — | idem pour une période donnée |
| GET | `/schema/export-v1.json` | — | schéma JSON (draft 2020-12) de l'export, sans authentification |
| GET | `/api/appareils` · PUT `/api/appareils/<id>` | `{ "statut": "autorise" }` | administration des appareils de la famille (pas ton rôle sauf demande) |

Exemples (bash) :

```bash
export QC=https://quick-cooking.lo2k.net
H_AUTH="Authorization: Bearer $QUICK_COOKING_IMPORT_TOKEN"

# 1. Vérifier à blanc la section stocks
curl -s -X POST "$QC/api/export/verifier?section=stocks" -H "$H_AUTH" \
  -H "Content-Type: application/json" --data-binary @stocks.json

# 2. L'envoyer
curl -s -X PUT "$QC/api/export/stocks" -H "$H_AUTH" \
  -H "Content-Type: application/json" --data-binary @stocks.json

# 3. Relire les choix de la famille
curl -s "$QC/api/choix" -H "$H_AUTH" -o choix.json
```

Exemple (Python, bibliothèque standard) :

```python
import json, os, urllib.request

QC = "https://quick-cooking.lo2k.net"
JETON = os.environ["QUICK_COOKING_IMPORT_TOKEN"]

def appel(methode, route, corps=None):
    req = urllib.request.Request(QC + route, method=methode,
        data=None if corps is None else json.dumps(corps, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {JETON}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{e.code} : {e.read().decode('utf-8')}")

verif = appel("POST", "/api/export/verifier?section=stocks", stocks)
if not verif["valide"]:
    raise SystemExit(verif["erreurs"])
print(verif["avertissements"])
appel("PUT", "/api/export/stocks", stocks)
choix = appel("GET", "/api/choix")
```

Implémentation de référence de l'export complet (lit tes fiches, tes inventaires, tes profils) :
`outils/construire_exemple.py` du dépôt Quick Cooking. Reprends-la dans ton dépôt
(ex. `outils/exporter_site.py`) en remplaçant les parties marquées « exemple » par tes vraies données.

---

## 3. Le document, section par section

En-tête obligatoire :

```json
{ "format": "quick-cooking/export", "version": 1, "genere_le": "2026-10-06T21:00:00+02:00",
  "source": "batch cooking — outils/exporter_site.py" }
```

Conventions : dates `AAAA-MM-JJ` ; horodatages ISO 8601 avec fuseau ; identifiants
`[A-Za-z0-9_.-]` ; codes des personnes `J` (Jérôme), `P` (Pauline), `G` (Grégoire) ; textes en
français, tels qu'ils seront lus par la famille.

### 3.1 `foyer` — qui mange, et les repères nutritionnels

```json
{
  "personnes": [
    { "code": "G", "nom": "Grégoire", "role": "adolescent",
      "socle": { "kcal": 480, "prot": 32, "gluc": 60, "lip": 12, "fibres": 7 },
      "socle_libelle": "Bowl du matin + 1,5 Skyr",
      "proteines_cible": [75, 88], "proteines_plafond": 95,
      "kcal_cible": 2400, "fibres_min": 30, "ratio_soir": 1.3,
      "evite": [ { "drapeau": "lentilles", "niveau": "interdit", "libelle": "Grégoire n'aime pas les lentilles" },
                 { "drapeau": "curry", "niveau": "attention", "libelle": "Grégoire n'aime pas le curry" } ] }
  ],
  "lieux": { "m": "à la maison", "bc": "boîte micro-ondes", "bf": "boîte froide", "c": "cantine" },
  "cantine_estimee": 25,
  "cantine_macros": { "kcal": 750, "prot": 25, "gluc": 90, "lip": 28, "fibres": 6 }
}
```

| Champ | Source dans ton dépôt | Usage sur le site |
|---|---|---|
| `socle` | `outils/data/profils_famille.json` : `routine_matin` + `skyr_defaut_nb × skyr_unite` | ajouté à chaque journée (jauges du bas) |
| `proteines_cible`, `proteines_plafond` | `proteines_cible_g`, `proteines_max_g` | zone verte et trait rouge de la jauge protéines |
| `kcal_cible`, `fibres_min` | `calories_cible_kcal`, `fibres_min_g` | jauges kcal (alerte au-delà de +15 %) et fibres |
| `ratio_soir` | `ratio_portions_soir` (Grégoire 1,3) | multiplie la portion du soir |
| `evite` | goûts de `Preferences_Famille.md` | un plat portant le `drapeau` est signalé (ou retiré de la recherche si `interdit`) quand la personne mange à la maison |
| `cantine_macros` | estimation | compte un repas de cantine (affiché avec `*`) |

### 3.2 `preferences` — les règles de la période

```json
{
  "saison": "Automne",
  "regles": [ { "id": "un-carne", "libelle": "Un seul repas viande ou poisson par jour", "niveau": "attention" } ],
  "limites_periode": [ { "drapeau": "pdt", "max": 2, "libelle": "Pommes de terre" },
                       { "drapeau": "boeuf", "max": 1, "libelle": "Bœuf" } ],
  "poisson_par_semaine": 2,
  "mots_interdits": ["veau"],
  "seuils_stocks": { "dlc_urgent": 2, "dlc_bientot": 5, "anciennete_bientot": 7, "anciennete_urgent": 12 }
}
```

`regles` est affiché tel quel. Le site **calcule** à partir de `limites_periode` (recettes distinctes
portant le drapeau), `poisson_par_semaine` (par semaine ISO, + `poissons_deja` de la période),
`mots_interdits` (cherchés dans le nom et les ingrédients) et `seuils_stocks` (§3.3).

### 3.3 `stocks` — inventaires et produits à consommer absolument

```json
{
  "mis_a_jour_le": { "frigo": "2026-10-06", "congelateur": "2026-09-16", "cellier": "2026-09-29" },
  "articles": [
    { "id": "frigo-epinards", "nom": "Pousses d'épinards", "lieu": "frigo", "categorie": "Légumes frais",
      "quantite": "1 sachet (300 g)", "note": "ouvert lundi", "prioritaire": true,
      "mots": ["epinard"],
      "dlc": "2026-10-09", "entre_le": "2026-10-04", "perissable": true, "a_consommer": null },
    { "id": "frigo-reste", "nom": "Reste de blanquette", "lieu": "frigo", "quantite": "2 parts",
      "mots": ["blanquette"], "perissable": true, "entre_le": "2026-10-06",
      "a_consommer": { "avant": "2026-10-08", "raison": "reste cuisiné : 48 h", "niveau": "urgent" } }
  ]
}
```

| Champ | Obligatoire | Règle |
|---|---|---|
| `id` | oui | stable d'un envoi à l'autre pour le même produit (ex. `frigo-epinards`) |
| `nom`, `lieu` | oui | `lieu` ∈ `frigo`, `congelateur`, `cellier` |
| `quantite`, `categorie`, `note` | non | texte libre, affiché |
| `prioritaire` | non | produit à écouler en priorité (entamé, gros stock) : mis en avant |
| `mots` | **fortement conseillé** | mots cherchés (sans accents, en minuscules) dans `recettes[].ingredients[].item` ; c'est **le seul lien** entre un produit et les recettes. « epinard » trouve `pousses_d_epinards`. Choisir précis : « pomme de terre », pas « pomme ». Sans `mots`, le produit n'est relié à aucun plat. |
| `dlc` | si connue | date limite (DLC ou DDM) lue sur l'emballage. **Ne jamais l'estimer.** |
| `entre_le` | conseillé | date d'entrée dans le stock (courses, Drive, inventaire) |
| `perissable` | conseillé | `true` pour le frais dont l'ancienneté compte : légumes, fruits, charcuterie, viande, poisson, restes, pain |
| `a_consommer` | si tu sais mieux que le calcul | échéance imposée : `{ avant, raison, niveau }` (`urgent` ou `bientot`) — reste cuisiné, produit ouvert, légume qui s'abîme… |

**Comment le site décide qu'un produit est « à consommer absolument »** (aujourd'hui = date du jour) :

1. `a_consommer` présent → on le prend tel quel.
2. sinon `dlc` : ≤ `dlc_urgent` jours (2) → **urgent** ; ≤ `dlc_bientot` (5) → **bientôt** ; dépassée → urgent, « date dépassée ».
3. sinon `perissable` + `entre_le` : présent depuis ≥ `anciennete_urgent` (12 j) → **urgent** ;
   ≥ `anciennete_bientot` (7 j) → **bientôt**, à consommer avant `entre_le + 12 j`.

Le site cherche ensuite, dans la période courante et dans la période à venir, un **repas daté au plus
tard à l'échéance** dont la recette contient un des `mots`. S'il n'en trouve pas, il affiche une alerte
en permanence (barre du bas, panneau, bilan de la période à choisir) et propose les recettes qui
utilisent le produit. **Conséquence pour toi** : un plat sans `ref` (texte libre) ne peut écouler aucun
produit ; préfère un plat relié à une fiche, ou une échéance `a_consommer` cohérente avec ton menu.

### 3.4 Une période (`periode_courante`, `periode_a_venir`)

```json
{
  "id": "2026-10-07", "titre": "Du mercredi 7 au mardi 13 octobre 2026",
  "debut": "2026-10-07", "fin": "2026-10-13",
  "statut": "en_choix", "date_limite_choix": "2026-10-06T20:00:00+02:00",
  "note": "Courses chez Grand Frais samedi matin.",
  "poissons_deja": { "S41": 0 },
  "jours": [ { "id": "mer7", "date": "2026-10-07", "label": "Mercredi 7 oct.", "semaine": "S41",
               "agenda": ["Tennis + dentiste : retour 18 h 15"] } ],
  "repas": [ ... ],
  "courses": { ... }
}
```

- `id` : date du premier jour par convention. Change d'`id` à chaque nouvelle période : les choix sont
  rangés par `id`.
- `statut` : courante → `validee` ; à venir → `en_choix` (la famille choisit) puis `close` (figé).
- `jours[].date` est **indispensable** (calcul des restes, des échéances, du jour affiché).
- `agenda` : contraintes du jour lues dans l'agenda familial, affichées telles quelles.

**Repas de la période courante** — le menu décidé :

```json
{ "id": "mer30-m", "jour": "mer30", "moment": "midi", "numero": 31,
  "convives": { "J": "bc", "P": "m", "G": "m" },
  "plat": { "ref": "10_Cookeo_OnePot/Risotto_Coquillettes_au_Jambon", "nom": "Risotto de coquillettes au jambon",
            "portion": 1, "note": "St Môret à la place de la crème" } }
```

`numero` = la pastille `{N}` de ta fiche semaine (même numérotation que les courses). `plat.ref` = la
fiche (`null` pour un plat sans fiche, ex. poulet du rôtisseur : il n'aura alors ni macros ni lien
avec les stocks). `convives` : une clé par personne présente, valeur = lieu (`m`, `bc`, `bf`, `c`).

**Repas de la période à venir** — les propositions :

```json
{ "id": "mer7-s", "jour": "mer7", "moment": "soir", "convives": { "J": "m", "P": "m", "G": "m" },
  "besoin": "Retour 18 h 15 · Soup Maker",
  "options": [
    { "ref": "04_OnePot_et_Soupes/Veloute_Potiron_Parfume_Cumin", "pourquoi": "Écoule le potimarron, 15 min" },
    { "ref": "07_Simplissime_Veggie/Minestrone_Aux_Legumes", "pourquoi": "Variante végétarienne" },
    { "ref": "06_Cookeo_Plats_du_Soir/Golden_Soup", "pourquoi": "Jamais cuisinée" } ],
  "defaut": null }
```

- 1 à 3 `options`, la première est la recommandation. Chaque `ref` doit exister dans `recettes`.
- `pourquoi` : une ligne, pour la famille (pas de jargon du collège).
- Repas non négociable (jeudi soir poulet, etc.) : `"impose": { "nom": "Poulet rôti du rôtisseur", "raison": "Danse de Grégoire à 19 h" }` à la place de `options`.
- `defaut` : `ref` présélectionnée (facultatif).

**Courses (période courante seulement)** :

```json
{
  "note": "Deux passages : mercredi et samedi matin.",
  "a_verifier": [ { "id": "v-oignons", "libelle": "4 oignons jaunes", "pour": [31, 32], "sinon": "1 filet mercredi" } ],
  "passages": [ { "id": "mer30", "libelle": "Mercredi 30", "date": "2026-09-30",
    "sections": [ { "titre": "Pour ce soir",
      "articles": [ { "id": "lardons", "libelle": "Lardons fumés", "quantite": "200 g", "pour": [33, 34], "note": "…" } ] } ] } ],
  "deja_maison": [ { "produit": "Carottes (~1,75 kg)", "ou": "Frigo", "pour": [32, 34] } ]
}
```

Reprends ta liste `03_Courses/AAAA-SNN_Liste_Courses.md` à l'identique. Les `id` des lignes doivent
être **stables** : les cases cochées par la famille (partagées entre téléphones) y sont rattachées.

### 3.5 `recettes` — toute la base, pour chercher des alternatives

Envoie **toutes** les fiches de `01_Fiches_Recettes/` (hors `Catalogue`, `Index`, `Template`,
`Preferences`), pas seulement celles du menu : la famille y cherche ses remplacements.

```json
{
  "ref": "10_Cookeo_OnePot/Risotto_Coquillettes_au_Jambon",
  "nom": "Risotto de coquillettes au jambon",
  "source": { "libelle": "One pot … au Cookeo p. 68", "livre": "One pot …", "page": 68, "url": null },
  "categorie": "10_Cookeo_OnePot", "type_plat": "One-Pot / Cookeo",
  "portions": 4, "conservation_jours": 3, "congelable": false,
  "temps": { "actif": 3, "autonome": 7, "total": 10 },
  "materiel": ["cookeo"], "appareils": ["Cookeo"], "format": "Repas Famille Semaine",
  "saisons": ["Automne", "Hiver"], "proteines": ["Porc"], "tags": ["pates", "jambon"],
  "ingredients": [ { "item": "coquillettes", "qte": 400, "unite": "g", "usage": "incorpore" } ],
  "ingredients_cles": ["Champignon"],
  "macros": { "kcal": 670, "prot": 34, "gluc": 80, "lip": 25, "fibres": 4 },
  "couverture": 0.92,
  "drapeaux": { "type": "viande", "poisson_gras": false, "boeuf": false, "lentilles": false,
                "curry": false, "pdt": false, "froid": false, "soupe": false },
  "historique": { "deja_cuisinee": true, "semaines": ["2026-S40"] },
  "avis": "coup_de_coeur", "avis_note": "Miam ! (Pauline, 30/08)",
  "contenu_md": "# … corps Markdown de la fiche …"
}
```

| Champ | Comment le calculer |
|---|---|
| `ref` | chemin sous `01_Fiches_Recettes/`, sans `.md`, séparateur `/` |
| `ingredients` | le frontmatter tel quel (`item` sert au lien avec les stocks) |
| `macros` | **par portion**, avec `outils/evaluer_nutrition.py` (`evaluer_recette()["par_portion"]`). Le site refuse de compter une portion à plus de 1 500 kcal (« chiffres douteux ») : corrige la fiche ou la table plutôt que d'envoyer un chiffre aberrant. |
| `couverture` | part (en masse) des ingrédients reconnus par la table de macros ; < 0,7 → « macros incomplètes » |
| `drapeaux.type` | `poisson` si un ingrédient est un poisson ou un fruit de mer, sinon `viande` si un ingrédient est une viande ou une charcuterie, sinon `vege` (ignorer les bouillons) |
| autres `drapeaux` | `poisson_gras` (saumon, truite, sardine, maquereau, hareng) ; `boeuf` (bœuf, steak haché, veau) ; `lentilles` ; `curry` (curry, cari, dahl, tandoori, masala) ; `pdt` (pomme de terre, gnocchi, frites — pas la patate douce) ; `froid` (se mange froid : salade, wrap, cake, quiche…) ; `soupe` |
| `saisons`, `appareils`, `format`, `proteines` | classification de `outils/rechercher_recettes.py` (`classify_recipe`) |
| `historique` | semaines (`AAAA-SNN`) où le plat figure dans une fiche semaine ; `deja_cuisinee` = au moins une |
| `avis` | `Preferences_Famille.md` : section ⭐ → `coup_de_coeur`, section ❌ → `banni` (retiré des recherches), section ⚠️ → `ajuster` |
| `contenu_md` | corps de la fiche après le frontmatter (affiché dans la fenêtre « Voir la recette ») |

---

## 4. Ce que le site en fait (pour comprendre les alertes)

- **Barre du bas, toujours visible** : jauges protéines / kcal / fibres de J, P, G pour le jour affiché
  (socle compris), produits à consommer sans plat prévu, produits des stocks utilisés ce jour-là.
- **Panneau latéral** : à consommer absolument (échéance, raison, repas qui l'écoule), repas du jour,
  tableau des macros, stocks par lieu avec les repas qui les utilisent.
- **Contrôles** (informatifs, ne bloquent rien) : boîte froide non froide, `evite`, plat banni, mot
  interdit, viande ou poisson midi et soir, reste au-delà de `conservation_jours`, même boîte deux
  jours de suite, `limites_periode`, poissons par semaine, poisson gras, protéines au-delà du plafond.

---

## 5. Relire les choix de la famille

`GET /api/choix` renvoie :

```json
{
  "format": "quick-cooking/choix", "version": 1, "periode": "2026-10-07",
  "export_genere_le": "2026-10-06T21:00:00+02:00",
  "statut": "termine",
  "repas": {
    "mer7-m": { "ref": "07_Simplissime_Veggie/Potimarrons_Farcis_Tofu_Fume", "origine": "recherche",
                "portion": 1, "commentaire": "sans fromage pour G", "par": "P",
                "appareil": "2fe08784952d3704", "le": "2026-10-05T19:42:06Z" },
    "mer7-s": { "ref": null, "origine": null, "portion": 1, "commentaire": "", "par": null, "le": null },
    "jeu8-s": { "ref": null, "origine": "impose", "portion": 1, "commentaire": "", "par": null, "le": null }
  },
  "commentaire_general": "Samedi soir on est invités.",
  "mis_a_jour": "2026-10-05T19:42:06Z"
}
```

- **Toutes** les clés de `periode_a_venir.repas` sont présentes.
- `origine` : `option` (une de tes propositions), `recherche` (remplacement choisi dans la base),
  `impose`, `null` (pas choisi : à toi de trancher, en commençant par ta recommandation).
- `portion` : 0,75 légère, 1 normale, 1,25 copieuse. `commentaire` : à appliquer ou à discuter.
- `statut` : `termine` quand la famille a cliqué « On a fini de choisir » ; `brouillon` sinon.
- Un remplacement (`recherche`) n'a pas été délibéré par ton collège : repasse-le dans ta checklist
  et signale tout veto à la famille au lieu de le corriger en silence.

Ensuite : Temps 2 de ton skill (fiche semaine, courses), puis envoi de la nouvelle
`periode_courante` et passage de l'ancienne `periode_a_venir` en `close` ou à `null`.

---

## 6. Liste de contrôle avant chaque envoi

- [ ] `format` = `quick-cooking/export`, `version` = 1, `genere_le` à l'heure de l'envoi.
- [ ] Chaque `ref` (plats, options, imposés, défaut) existe dans `recettes`.
- [ ] Chaque jour a une `date` ; chaque repas un `jour` existant, un `moment`, des `convives`.
- [ ] Période à venir : 1 à 3 `options` par repas non imposé, la recommandation en premier.
- [ ] Les articles de stock ont des `mots` ; les produits frais ont `entre_le` et `perissable` ; les
      `dlc` sont celles lues sur les emballages, jamais estimées.
- [ ] Les produits à consommer absolument sont couverts par un repas prévu avant leur échéance,
      ou l'absence est assumée et dite dans `note`.
- [ ] Aucune portion au-delà de 1 500 kcal ; `couverture` ≥ 0,7 pour les plats proposés.
- [ ] `POST /api/export/verifier` → `valide: true` ; avertissements lus et traités.
- [ ] Les identifiants stables (`id` des articles de stock, des lignes de courses, des périodes) n'ont
      pas changé sans raison.

## 7. Erreurs fréquentes

| Réponse | Cause | Correction |
|---|---|---|
| `401 Jeton invalide.` | en-tête `Authorization` absent ou faux | `Bearer <IMPORT_TOKEN>` |
| `403 Envoi désactivé` | le serveur n'a pas de `IMPORT_TOKEN` | demander à Jérôme de créer le secret |
| `400 Section invalide : …` | la section rend l'export incohérent (ref introuvable, date mal formée, lieu inconnu…) | lire le détail, corriger, revérifier à blanc |
| `413` | corps > 20 Mo | alléger `contenu_md` ou envoyer par sections |
| avertissement « article(s) sans mots » | produits non reliables aux recettes | ajouter `mots` |
| avertissement « sans dlc, entre_le ni a_consommer » | urgence incalculable | ajouter au moins `entre_le` + `perissable` |
