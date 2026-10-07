#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit exemple/export.json au format « quick-cooking/export » v1 (voir docs/donnees-entree-batch-cooking.md)
à partir du dépôt « batch cooking ».

Rôle : donnée d'exemple pour développer le site, et implémentation de référence pour le projet
« batch cooking », qui produira le vrai export. Les options de la période à venir sont choisies
par une heuristique simple : ce ne sont PAS des propositions délibérées par le collège.

Usage :
    python outils/construire_exemple.py
    BATCH_ROOT="C:/.../batch cooking" python outils/construire_exemple.py
"""

import glob
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

BATCH_ROOT = os.environ.get(
    "BATCH_ROOT", r"C:\Users\nospa\OneDrive\Commun\IA\batch cooking"
)
SORTIE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "exemple", "export.json")

sys.path.insert(0, os.path.join(BATCH_ROOT, "outils"))
os.chdir(BATCH_ROOT)
from rechercher_recettes import classify_recipe  # noqa: E402
from verifier_fiches import parse_yaml_frontmatter  # noqa: E402
from evaluer_nutrition import NutritionEvaluator  # noqa: E402

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

FICHES = os.path.join(BATCH_ROOT, "01_Fiches_Recettes")
EXCLUS = ("Catalogue", "Index", "Template", "Preferences")

POISSON = ["saumon", "thon", "truite", "cabillaud", "colin", "crevette", "haddock", "eglefin", "lotte",
           "calamar", "sardine", "anchois", "saint-jacques", "saint jacques", "st jacques", "lingue", "merlan", "dorade", "cabillaud", "moule", "gambas", "surimi", "seiche", "poulpe", "tarama", "limande", "sole ", "poisson", "maquereau", "hareng", "merlu", "lieu "]
POISSON_GRAS = ["saumon", "truite", "sardine", "maquereau", "hareng"]
VIANDE = ["poulet", "dinde", "boeuf", "steak", "porc", "jambon", "lardon", "bacon", "saucisse", "chorizo",
          "merguez", "canard", "veau", "knacki", "chipolata", "pulled", "echine", "agneau", "volaille"]
PDT = ["pomme de terre", "pommes de terre", "gnocchi", "grenaille", "puree", "frites"]
FROID = ["salade", "wrap", "sandwich", "bowl", "poke", "taboule", "cake", "tortilla", "quiche", "flan",
         "rouleau", "gaspacho", "coleslaw", "crostini", "tartine", "club"]
SOUPE = ["soupe", "veloute", "potage", "creme de", "golden soup", "minestrone", "chorba", "ramen", "gaspacho"]
CURRY = ["curry", "cari", "dahl", "tandoori", "masala", "garam"]


def sans_accents(s):
    import unicodedata
    s = str(s).lower().replace("œ", "oe").replace("_", " ")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def contient(texte, mots):
    return any(m in texte for m in mots)


def lister(v):
    if v is None:
        return []
    if isinstance(v, str):
        return [x.strip() for x in re.split(r"[,&/]| et ", v) if x.strip()]
    return [str(x).strip() for x in v if str(x).strip()]


def historique():
    """Recettes déjà servies : noms cités dans les fiches semaine (repère approximatif)."""
    textes = []
    for f in sorted(glob.glob(os.path.join(BATCH_ROOT, "00_Roadmap_Hebdo", "*Fiche_Semaine.md"))):
        m = re.search(r"(\d{4})-S(\d+)", os.path.basename(f))
        if m:
            with open(f, encoding="utf-8") as fh:
                textes.append((f"{m.group(1)}-S{int(m.group(2)):02d}", sans_accents(fh.read())))
    return textes


def lire_preferences():
    """Coups de cœur / bannis : noms en gras des tableaux de Preferences_Famille.md."""
    with open(os.path.join(FICHES, "Preferences_Famille.md"), encoding="utf-8") as fh:
        texte = fh.read()
    sections = re.split(r"\n## ", texte)
    coeur, bannis = [], []
    for s in sections:
        noms = re.findall(r"^\| \*\*(.+?)\*\*", s, re.M)
        if s.startswith("1."):
            coeur += noms
        elif s.startswith("2."):
            bannis += noms
    return coeur, bannis


def construire_recettes():
    evaluateur = NutritionEvaluator()
    hist = historique()
    coeur, bannis = lire_preferences()
    coeur_n, bannis_n = [sans_accents(x) for x in coeur], [sans_accents(x) for x in bannis]
    recettes = []
    illisibles = 0
    for fp in sorted(glob.glob(os.path.join(FICHES, "**", "*.md"), recursive=True)):
        if os.path.basename(fp).startswith(EXCLUS):
            continue
        with open(fp, encoding="utf-8") as fh:
            contenu = fh.read()
        data, _err = parse_yaml_frontmatter(contenu)
        if not data:
            illisibles += 1
            continue
        rel = os.path.relpath(fp, FICHES).replace("\\", "/")
        ref = rel[:-3]
        c = classify_recipe(data, contenu, rel)
        corps = re.sub(r"^---.*?---\s*", "", contenu, count=1, flags=re.S)
        ev = evaluateur.evaluer_recette(data)
        ing = [i for i in data.get("ingredients", []) if isinstance(i, dict)]
        poids = sum(x["poids_g"] for x in ev["ingredients"] if x["matched"] != "condiment_neutre")
        reconnus = sum(x["poids_g"] for x in ev["ingredients"] if x["matched"] not in (None, "condiment_neutre"))
        nb_ing = len([x for x in ev["ingredients"] if x["matched"] != "condiment_neutre"]) or 1
        nb_ok = len([x for x in ev["ingredients"] if x["matched"] not in (None, "condiment_neutre")])
        couverture = round(nb_ok / nb_ing, 2) if not poids else round(reconnus / poids, 2) if poids else 0

        nom = c["nom"]
        n_nom = sans_accents(nom)
        n_ing = [sans_accents(i.get("item", "")) for i in ing if not sans_accents(i.get("item", "")).startswith("bouillon")]
        tout_ing = " ".join(n_ing)
        type_ = "poisson" if contient(tout_ing, POISSON) else "viande" if contient(tout_ing, VIANDE) else "vege"

        url = data.get("source") if str(data.get("source", "")).startswith("http") else None
        if not url:
            m = re.search(r"https?://[^\s)>\]]+", corps)
            url = m.group(0) if m else None
        livre = data.get("livre")
        page = data.get("page")
        libelle = f"{livre} p. {page}" if livre and page else livre or (re.sub(r"^https?://(www\.)?([^/]+).*", r"\2", url) if url else "Fiche du projet")

        semaines = [s for s, t in hist if n_nom in t]
        avis = None
        if any(n_nom in b or b in n_nom for b in bannis_n):
            avis = "banni"
        elif any(n_nom in k or k in n_nom for k in coeur_n):
            avis = "coup_de_coeur"

        recettes.append({
            "ref": ref,
            "nom": nom,
            "source": {"libelle": libelle, "livre": livre, "page": page, "url": url},
            "categorie": rel.split("/")[0],
            "type_plat": data.get("type"),
            "portions": c["portions"] if isinstance(c["portions"], (int, float)) and c["portions"] > 0 else 4,
            "conservation_jours": c["conservation"],
            "congelable": bool(c["congelable"]),
            "temps": {"actif": c["prep_min"], "autonome": c["cuis_min"], "total": c["total_min"]},
            "materiel": [m.lower() for m in lister(data.get("materiel"))],
            "appareils": c["appareils"],
            "format": c["format_repas"],
            "saisons": c["saisons"],
            "proteines": c["proteines"],
            "tags": [t.lower() for t in lister(data.get("tags"))],
            "ingredients": [{k: i.get(k) for k in ("item", "qte", "unite", "usage") if i.get(k) is not None} for i in ing],
            "ingredients_cles": c["key_ingredients"],
            "macros": {k: ev["par_portion"][k] for k in ("kcal", "prot", "gluc", "lip", "fibres")},
            "couverture": min(couverture, 1),
            "drapeaux": {
                "type": type_,
                "poisson_gras": contient(tout_ing, POISSON_GRAS),
                "boeuf": contient(tout_ing, ["boeuf", "steak hache", "veau"]),
                "lentilles": "lentille" in tout_ing,
                "curry": contient(tout_ing + " " + n_nom, CURRY),
                "pdt": contient(tout_ing, PDT) and "patate douce" not in tout_ing,
                "froid": contient(n_nom, FROID),
                "soupe": contient(n_nom, SOUPE),
            },
            "historique": {"deja_cuisinee": bool(semaines), "semaines": semaines},
            "avis": avis,
            "contenu_md": corps.strip(),
        })
    return recettes, illisibles


def ecart_ok(r, convives, moment):
    d = r["drapeaux"]
    if r["avis"] == "banni":
        return False
    if "bf" in convives.values() and not d["froid"]:
        return False
    if convives.get("G") in ("m", "bf") and (d["lentilles"] or d["curry"]):
        return False
    if moment == "soir" and r["macros"]["prot"] > 40:
        return False
    # Pas de dessert, d'en-cas ni de base comme repas principal.
    if r["macros"]["prot"] < 8 or r["categorie"].startswith("02_") or (r["type_plat"] or "").startswith("Snack"):
        return False
    if any(t in r["tags"] for t in ("dessert", "gouter", "sucre", "petit-dejeuner")):
        return False
    return any(s in r["saisons"] for s in ("Automne", "Toutes saisons"))


def choisir_options(recettes, repas, deja):
    """Trois options déterministes et variées (une viande/poisson, une végé, une libre)."""
    candidats = [r for r in recettes if ecart_ok(r, repas["convives"], repas["moment"]) and r["ref"] not in deja]
    if repas["moment"] == "soir" and repas["jour"].startswith("dim"):
        candidats = [r for r in candidats if r["drapeaux"]["soupe"]] or candidats
    cle = lambda r: hashlib.md5((repas["id"] + r["ref"]).encode()).hexdigest()  # noqa: E731
    candidats.sort(key=cle)
    choix = []
    for filtre, pourquoi in (
        (lambda r: r["drapeaux"]["type"] != "vege", "Recommandation : plat complet de saison"),
        (lambda r: r["drapeaux"]["type"] == "vege", "Variante végétarienne"),
        (lambda r: not r["historique"]["deja_cuisinee"], "Jamais cuisinée : pour changer"),
    ):
        r = next((r for r in candidats if filtre(r) and r not in choix), None)
        if r:
            choix.append(r)
            deja.add(r["ref"])
            yield {"ref": r["ref"], "pourquoi": pourquoi}


def jours_periode(debut, n):
    noms = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
    longs = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
    out = []
    for i in range(n):
        d = debut + timedelta(days=i)
        out.append({
            "id": f"{noms[d.weekday()]}{d.day}",
            "date": d.isoformat(),
            "label": f"{longs[d.weekday()]} {d.day} {mois[d.month - 1]}",
            "semaine": f"S{d.isocalendar()[1]:02d}",
        })
    return out


def periode_courante():
    jours = jours_periode(date(2026, 9, 30), 7)
    agenda = {
        "mer30": ["Jérôme dehors le midi (boîte)", "Tennis + dentiste : retour 18 h 15"],
        "jeu1": ["Danse à 19 h"],
        "ven2": ["Pauline en atelier 9 h–15 h (boîte froide)"],
        "sam3": ["Piano 10 h 30, dédicace 14 h–18 h, concert 20 h"],
        "dim4": ["Pauline au salon du livre de Rettel"],
        "lun5": ["Grégoire à la cantine"],
        "mar6": ["Grégoire à la cantine"],
    }
    for j in jours:
        j["agenda"] = agenda.get(j["id"], [])
    T = {"J": "m", "P": "m", "G": "m"}

    def r(jour, moment, num, nom, ref=None, convives=None, note=None, portion=None):
        plat = {"ref": ref, "nom": nom}
        if note:
            plat["note"] = note
        if portion:
            plat["portion"] = portion
        return {"id": f"{jour}-{moment[0]}", "jour": jour, "moment": moment, "numero": num,
                "convives": convives or T, "plat": plat}

    repas = [
        r("mer30", "midi", 31, "Risotto de coquillettes au jambon", "10_Cookeo_OnePot/Risotto_Coquillettes_au_Jambon",
          {"J": "bc", "P": "m", "G": "m"}, "St Môret à la place de la crème"),
        r("mer30", "soir", 32, "Velouté de carottes · œufs cocotte épinards-lardons"),
        r("jeu1", "midi", 34, "Cake salé carottes, lardons & fromage + endives-betteraves",
          "05_Cakes_et_Flans/Cake_Sale_Carottes_Lardons_Fromage", {"J": "bc", "P": "m"}, "Mimolette comme fromage", 0.75),
        r("jeu1", "soir", 1, "Poulet rôti du rôtisseur, pommes de terre rôties & carottes râpées", portion=0.75),
        r("ven2", "midi", 34, "Reste de cake", "05_Cakes_et_Flans/Cake_Sale_Carottes_Lardons_Fromage", {"J": "bc", "P": "bf"}),
        r("ven2", "soir", 3, "Restes de poulet & de cake, salade d'endives, toasts"),
        r("sam3", "midi", 35, "Pizza maison jambon-champignons & carottes râpées", "11_On_Mange_Quoi_Ce_Soir/Pizza_Maison"),
        r("sam3", "soir", 36, "Wraps au saumon fumé"),
        r("dim4", "midi", 37, "Nuggets & frites", convives={"J": "m", "G": "m", "P": "bf"}),
        r("dim4", "soir", 38, "Velouté de courgettes & tartines de mimolette", "04_OnePot_et_Soupes/Veloute_Courgettes_Poireau_SoupMaker"),
        r("lun5", "midi", 39, "Cari de butternut au poulet & riz complet", convives={"J": "bc", "P": "bc", "G": "c"}),
        r("lun5", "soir", 40, "Blanquette de poisson à la coriandre", "06_Cookeo_Plats_du_Soir/Blanquette_de_Poisson_a_la_Coriandre"),
        r("mar6", "midi", 39, "Cari de butternut au poulet & riz complet", convives={"J": "bc", "P": "bc", "G": "c"}),
        r("mar6", "soir", 41, "Spaghettis à la bolognaise au tofu", "07_Simplissime_Veggie/Spaghettis_Bolognaise_Tofu"),
    ]

    def art(i, libelle, quantite, pour, note=None):
        a = {"id": i, "libelle": libelle, "quantite": quantite, "pour": pour}
        if note:
            a["note"] = note
        return a

    courses = {
        "note": "Deux passages : mercredi 30 (ce qui se garde) et samedi 3 au matin (le frais). Poulet du jeudi : rôtisseur.",
        "a_verifier": [
            {"id": "v-coquillettes", "libelle": "400 g de coquillettes", "pour": [31], "sinon": "Une autre pâte courte en stock."},
            {"id": "v-oignons", "libelle": "4 oignons jaunes, 2 rouges, 1 gousse d'ail", "pour": [31, 32, 38, 39, 41], "sinon": "1 filet d'oignons + 2 rouges + 1 tête d'ail mercredi."},
            {"id": "v-lait", "libelle": "10 cl de lait · 1 sachet de levure chimique", "pour": [34], "sinon": "Petite brique de lait + levure mercredi."},
            {"id": "v-pdt", "libelle": "1 kg de pommes de terre au cellier", "pour": [1, 40], "sinon": "1 filet de 2,5 kg mercredi."},
            {"id": "v-congelo", "libelle": "Congélateur : ½ paquet de nuggets, 2 portions de frites, 600 g de courgettes, 200 g de poireau", "pour": [37, 38], "sinon": "Le signaler : on ne vide pas une ligne."},
            {"id": "v-carottes", "libelle": "1,75 kg de carottes au frigo", "pour": [32, 34, 35, 40], "sinon": "Endives à la place des carottes râpées samedi midi."},
        ],
        "passages": [
            {"id": "mer30", "libelle": "Mercredi 30", "date": "2026-09-30", "sections": [
                {"titre": "Pour ce soir", "articles": [
                    art("lardons", "Lardons fumés", "200 g", [33, 34]),
                    art("epinards", "Pousses d'épinards", "300 g", [33]),
                    art("creme-epaisse", "Crème fraîche épaisse", "1 pot de 20 cl", [33, 38]),
                    art("creme-liquide", "Crème liquide", "50 cl", [32, 39, 40]),
                ]},
                {"titre": "Pour plus tard (se garde)", "articles": [
                    art("poisson", "Filets de colin ou de cabillaud surgelés", "600 g", [40], "Congélateur en rentrant"),
                    art("butternut", "Courge butternut", "1 (≈ 1 kg)", [39]),
                    art("tofu", "Tofu nature", "250 g", [41]),
                    art("pate-pizza", "Pâte à pizza", "1 rouleau", [35], "Vérifier la date"),
                    art("mozzarella", "Mozzarella", "150 g", [35]),
                ]},
            ]},
            {"id": "sam3", "libelle": "Samedi 3 au matin", "date": "2026-10-03", "sections": [
                {"titre": "Frais", "articles": [
                    art("poulet", "Filets de poulet", "500 g", [39]),
                    art("champignons", "Champignons de Paris", "350 g", [35, 40]),
                    art("saumon-fume", "Saumon fumé", "≈ 450 g (14 tranches)", [36]),
                    art("concombre", "Concombre", "1", [36, 37]),
                    art("courgette", "Courgette", "1", [40]),
                    art("epinards-2", "Pousses d'épinards", "125 g", [41]),
                    art("herbes", "Coriandre · ciboulette", "1 bouquet · 1 botte", [36, 40]),
                ]},
            ]},
        ],
        "deja_maison": [
            {"produit": "Carottes (~1,75 kg)", "ou": "Frigo", "pour": [32, 34, 1, 35, 40]},
            {"produit": "Endives (2 sachets) · betteraves cuites (500 g)", "ou": "Frigo", "pour": [34, 3]},
            {"produit": "Jambon (300 g)", "ou": "Frigo", "pour": [31, 35]},
            {"produit": "Comté · mimolette · St Môret", "ou": "Frigo", "pour": [31, 34, 38, 36]},
            {"produit": "Coquillettes · riz complet · spaghettis · farine · pulpe de tomate · lait de coco", "ou": "Cellier", "pour": [31, 39, 41, 34, 35]},
        ],
    }
    return {
        "id": "2026-09-30",
        "titre": "Du mercredi 30 septembre au mardi 6 octobre 2026",
        "debut": "2026-09-30",
        "fin": "2026-10-06",
        "statut": "validee",
        "note": "Objectif : écouler carottes, endives, betteraves, jambon et fromages ; entamer les courgettes congelées.",
        "jours": jours,
        "repas": repas,
        "courses": courses,
    }


def periode_a_venir(recettes):
    jours = jours_periode(date(2026, 10, 7), 7)
    agenda = {
        "mer7": ["Tennis + dentiste : retour 18 h 15"],
        "jeu8": ["Danse à 19 h"],
        "sam10": ["Jour d'écart"],
        "dim11": ["Soir : soupe (préférence de Pauline)"],
    }
    for j in jours:
        j["agenda"] = agenda.get(j["id"], [])
    repas = []
    deja = set()
    for j in jours:
        semaine = date.fromisoformat(j["date"]).weekday() < 5 and not j["id"].startswith("mer")
        for moment in ("midi", "soir"):
            convives = {"J": "bc", "P": "m", "G": "c"} if (moment == "midi" and semaine) else {"J": "m", "P": "m", "G": "m"}
            if j["id"] == "ven9" and moment == "midi":
                convives = {"J": "bc", "P": "bf", "G": "c"}
            rep = {"id": f"{j['id']}-{moment[0]}", "jour": j["id"], "moment": moment, "convives": convives}
            if j["id"] == "jeu8" and moment == "soir":
                rep["impose"] = {"nom": "Poulet rôti du rôtisseur", "raison": "Jeudi soir : danse de Grégoire à 19 h"}
            elif j["id"] == "ven9" and moment == "soir":
                rep["impose"] = {"nom": "Restes de poulet en salade", "raison": "Vendredi soir : on finit le poulet"}
            else:
                rep["besoin"] = {
                    "bc": "Boîte de Jérôme : réchauffable 2 min, mangeable à la fourchette",
                }.get(convives.get("J"), "")
                if convives.get("P") == "bf":
                    rep["besoin"] = "Boîte froide pour Pauline (atelier)"
                rep["options"] = list(choisir_options(recettes, rep, deja))
            repas.append(rep)
    return {
        "id": "2026-10-07",
        "titre": "Du mercredi 7 au mardi 13 octobre 2026",
        "debut": "2026-10-07",
        "fin": "2026-10-13",
        "statut": "en_choix",
        "date_limite_choix": "2026-10-06T20:00:00+02:00",
        "note": "EXEMPLE : options choisies par un script, pas par le collège. Choisissez une option ou cherchez une autre recette.",
        "jours": jours,
        "repas": repas,
        "poissons_deja": {},
    }


def foyer():
    with open(os.path.join(BATCH_ROOT, "outils", "data", "profils_famille.json"), encoding="utf-8") as fh:
        profils = json.load(fh)
    codes = {"jerome": "J", "pauline": "P", "gregoire": "G"}
    evite = {"G": [
        {"drapeau": "lentilles", "niveau": "interdit", "libelle": "Grégoire n'aime pas les lentilles"},
        {"drapeau": "curry", "niveau": "attention", "libelle": "Grégoire n'aime pas le curry"},
    ]}
    cles = {"kcal": "calories", "prot": "proteines", "gluc": "glucides", "lip": "lipides", "fibres": "fibres"}
    personnes = []
    for cle, p in profils.items():
        code = codes.get(cle)
        if not code:
            continue
        matin, skyr, n = p.get("routine_matin", {}), p.get("skyr_unite", {}), p.get("skyr_defaut_nb", 0)
        socle = {k: round(matin.get(v, 0) + n * skyr.get(v, 0), 1) for k, v in cles.items()}
        personnes.append({
            "code": code,
            "nom": p["nom"],
            "role": p.get("role"),
            "socle": socle,
            "socle_libelle": f"{matin.get('nom', 'Petit-déjeuner')} + {n:g} Skyr",
            "socle_proteines": socle["prot"],
            "proteines_cible": p.get("proteines_cible_g"),
            "proteines_plafond": p.get("proteines_max_g"),
            "kcal_cible": p.get("calories_cible_kcal"),
            "fibres_min": p.get("fibres_min_g"),
            "ratio_soir": p.get("ratio_portions_soir", 1.3 if code == "G" else 1),
            "evite": evite.get(code, []),
        })
    return {
        "personnes": personnes,
        "lieux": {"m": "à la maison", "bc": "boîte micro-ondes", "bf": "boîte froide", "c": "cantine"},
        "cantine_estimee": 25,
        "cantine_macros": {"kcal": 750, "prot": 25, "gluc": 90, "lip": 28, "fibres": 6},
    }


# Mots vides retirés pour obtenir le mot-clé principal d'un article d'inventaire.
VIDES = {"de", "du", "des", "la", "le", "les", "en", "a", "au", "aux", "et", "frais", "fraiche", "bio", "sans",
         "nature", "entier", "jeune", "bloc", "tranches", "tranche", "portions", "surgeles", "surgele", "cuit", "cuites",
         "petit", "petits", "gros", "boite", "boites", "format", "familial", "x10", "mdd"}


def mot_cle(nom):
    n = sans_accents(re.sub(r"\(.*?\)", "", nom))
    mots = [m for m in re.findall(r"[a-z]+", n) if m not in VIDES and len(m) > 2]
    if not mots:
        return []
    m = mots[0]
    if m in ("pommes", "pomme") and len(mots) > 2 and mots[1] == "terre":
        return ["pomme de terre"]
    m = {"parmigiano": "parmesan", "moret": "st moret", "vache": "vache qui rit"}.get(m, m)
    if m.endswith("eaux"):
        m = m[:-1]
    return [m[:-1] if m.endswith("s") and len(m) > 4 else m]


def stocks():
    """Articles des trois inventaires (tableaux Markdown avec colonnes Article et Quantité)."""
    fichiers = {"frigo": "Inventaire_Frigo.md", "congelateur": "Inventaire_Congelateur.md", "cellier": "Inventaire_Cellier.md"}
    articles, dates = [], {}
    for lieu, nom_fichier in fichiers.items():
        with open(os.path.join(BATCH_ROOT, "02_Inventaire", nom_fichier), encoding="utf-8") as fh:
            texte = fh.read()
        m = re.search(r"mis_a_jour_le:\s*(\S+)", texte)
        dates[lieu] = m.group(1) if m else None
        section, entetes = None, None
        for ligne in texte.splitlines():
            if ligne.startswith("## "):
                section = re.sub(r"^[^\wÀ-ÿ]+", "", ligne[3:]).strip()
                entetes = None
                continue
            if not ligne.startswith("|"):
                entetes = None if not ligne.strip() else entetes
                continue
            cellules = [c.strip() for c in ligne.strip().strip("|").split("|")]
            if entetes is None:
                entetes = [sans_accents(c) for c in cellules]
                continue
            if all(set(c) <= set("-: ") for c in cellules):
                continue
            ia = next((i for i, h in enumerate(entetes) if "article" in h), None)
            iq = next((i for i, h in enumerate(entetes) if "quantit" in h), None)
            if ia is None or iq is None or ia >= len(cellules) or iq >= len(cellules):
                continue
            nom = re.sub(r"\*\*", "", cellules[ia]).strip()
            quantite = re.sub(r"\*\*", "", cellules[iq]).strip()
            note = re.sub(r"\*\*", "", " · ".join(c for i, c in enumerate(cellules) if i not in (ia, iq) and c and any(k in entetes[i] for k in ("statut", "mouvement", "notes", "aptitude", "priorit"))))
            if not nom or not quantite or re.fullmatch(r"0|0 .*|—|-", quantite):
                continue
            categorie = cellules[0] if lieu == "congelateur" and ia == 1 else section
            n_note = sans_accents(note + " " + quantite)
            n_cat = sans_accents(categorie or "")
            entre_le = (dates[lieu] or "")[:10] or None
            # Produits frais du frigo : leur ancienneté compte (légumes, charcuterie, restes).
            perissable = lieu == "frigo" and any(k in n_cat for k in ("legume", "charcuterie", "plats cuisines", "restes", "crudite"))
            a_consommer = None
            m_sous = re.search(r"consommer sous (\d+)", n_note)
            if m_sous and entre_le:
                jours = max(1, round(int(m_sous.group(1)) / 24)) if "h" in n_note[m_sous.end():m_sous.end() + 8] else int(m_sous.group(1))
                a_consommer = {"avant": (date.fromisoformat(entre_le) + timedelta(days=jours)).isoformat(), "raison": (re.search(r"[àa] consommer[^)·]*", note) or [note])[0].strip(), "niveau": "urgent"}
            articles.append({
                "id": f"{lieu}-{len(articles)}",
                "nom": nom,
                "lieu": lieu,
                "categorie": categorie,
                "quantite": quantite,
                "note": note or None,
                "prioritaire": any(k in n_note for k in ("entame", "a ecouler", "priorit", "dlc", "⚠")),
                "mots": mot_cle(nom),
                "entre_le": entre_le,
                "perissable": perissable,
                "dlc": None,  # l'inventaire ne note pas les dates limites : à fournir par « batch cooking »
                "a_consommer": a_consommer,
            })
    return {"mis_a_jour_le": dates, "articles": articles}


def main():
    recettes, illisibles = construire_recettes()
    export = {
        "format": "quick-cooking/export",
        "version": 1,
        "genere_le": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "quick-cooking/outils/construire_exemple.py (exemple)",
        "foyer": foyer(),
        "preferences": {
            "saison": "Automne",
            "regles": [
                {"id": "un-carne", "libelle": "Un seul repas viande ou poisson par jour", "niveau": "attention"},
                {"id": "poisson", "libelle": "Poisson 2 fois par semaine, dont 1 gras", "niveau": "info"},
                {"id": "pdt", "libelle": "Pommes de terre au plus 2 fois par période", "niveau": "info"},
                {"id": "veau", "libelle": "Jamais de veau", "niveau": "interdit"},
                {"id": "steak-soir", "libelle": "Pas de steak servi en pièce le soir", "niveau": "attention"},
                {"id": "bf", "libelle": "Boîte froide de Pauline : 100 % froid, hermétique", "niveau": "interdit"},
            ],
            "limites_periode": [
                {"drapeau": "pdt", "max": 2, "libelle": "Pommes de terre"},
                {"drapeau": "boeuf", "max": 1, "libelle": "Bœuf"},
                {"drapeau": "soupe", "max": 2, "libelle": "Soupes différentes"},
            ],
            "poisson_par_semaine": 2,
            "seuils_stocks": {"dlc_urgent": 2, "dlc_bientot": 5, "anciennete_bientot": 7, "anciennete_urgent": 12},
            "mots_interdits": ["veau"],
        },
        "stocks": stocks(),
        "periode_courante": periode_courante(),
        "periode_a_venir": periode_a_venir(recettes),
        "recettes": recettes,
        "meta": {"fiches_illisibles": illisibles},
    }
    refs = {r["ref"] for r in recettes}
    for p in ("periode_courante", "periode_a_venir"):
        for rep in export[p]["repas"]:
            for ref in [(rep.get("plat") or {}).get("ref")] + [o["ref"] for o in rep.get("options", [])]:
                if ref and ref not in refs:
                    print(f"ATTENTION ref introuvable : {ref}")
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8") as fh:
        json.dump(export, fh, ensure_ascii=False, indent=1)
    print(f"{len(recettes)} recettes, {illisibles} illisibles -> {SORTIE} ({os.path.getsize(SORTIE) // 1024} Ko)")


if __name__ == "__main__":
    main()
