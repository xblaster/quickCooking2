import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { rendreMarkdown } from "../public/js/markdown.js";
import { chercher } from "../public/js/recherche.js";
import { alertesRecette, evaluerPeriode, indexRecettes, resteVeille } from "../public/js/regles.js";
import { normaliser } from "../public/js/outils.js";

const exemple = JSON.parse(readFileSync(new URL("../exemple/export.json", import.meta.url), "utf8"));

const foyer = {
  personnes: [
    { code: "J", nom: "Jérôme", socle_proteines: 43, proteines_cible: [90, 110], proteines_plafond: 120, ratio_soir: 1, evite: [] },
    { code: "G", nom: "Grégoire", socle_proteines: 32, proteines_cible: [75, 88], proteines_plafond: 95, ratio_soir: 1.3,
      evite: [{ drapeau: "lentilles", niveau: "interdit", libelle: "Pas de lentilles" }] },
  ],
  cantine_estimee: 25,
};
const preferences = { mots_interdits: ["veau"], limites_periode: [{ drapeau: "pdt", max: 1, libelle: "Pommes de terre" }], poisson_par_semaine: 2 };
const R = (ref, d = {}, extra = {}) => ({
  ref, nom: ref, macros: { prot: 30, kcal: 500 }, conservation_jours: 3, couverture: 1,
  drapeaux: { type: "vege", ...d }, ingredients: [], historique: { deja_cuisinee: true }, ...extra,
});

test("normaliser retire accents et ligatures", () => {
  assert.equal(normaliser("Bœuf Épicé_Crème"), "boeuf epice creme");
});

test("boîte froide exige une recette froide", () => {
  const a = alertesRecette(R("chaud"), { convives: { J: "bf" } }, { foyer, preferences });
  assert.equal(a[0].niveau, "interdit");
  assert.equal(alertesRecette(R("salade", { froid: true }), { convives: { J: "bf" } }, { foyer, preferences }).length, 0);
});

test("évitements ignorés à la cantine, appliqués à la maison", () => {
  const r = R("dahl", { lentilles: true });
  assert.equal(alertesRecette(r, { convives: { G: "c" } }, { foyer, preferences }).length, 0);
  assert.equal(alertesRecette(r, { convives: { G: "m" } }, { foyer, preferences })[0].niveau, "interdit");
});

test("mots interdits et plats refusés", () => {
  const veau = R("blanquette", {}, { ingredients: [{ item: "épaule de veau" }] });
  assert.match(alertesRecette(veau, { convives: {} }, { foyer, preferences })[0].texte, /veau/);
  assert.equal(alertesRecette(R("x", {}, { avis: "banni" }), { convives: {} }, { foyer, preferences })[0].niveau, "interdit");
});

const periode = {
  id: "p", poissons_deja: {},
  jours: [
    { id: "lun", date: "2026-10-12", label: "Lun", semaine: "S42" },
    { id: "mar", date: "2026-10-13", label: "Mar", semaine: "S42" },
    { id: "sam", date: "2026-10-17", label: "Sam", semaine: "S42" },
  ],
  repas: [
    { id: "lun-m", jour: "lun", moment: "midi", convives: { J: "m", G: "c" } },
    { id: "lun-s", jour: "lun", moment: "soir", convives: { J: "m", G: "m" } },
    { id: "mar-m", jour: "mar", moment: "midi", convives: { J: "m" } },
    { id: "sam-s", jour: "sam", moment: "soir", convives: { J: "m" } },
  ],
};
const index = indexRecettes([R("poulet", { type: "viande", pdt: true }), R("saumon", { type: "poisson", poisson_gras: true, pdt: true }), R("soupe")]);

test("viande midi et soir, restes, limites et protéines", () => {
  const plats = { "lun-m": { ref: "poulet" }, "lun-s": { ref: "saumon", portion: 1 }, "mar-m": { ref: "poulet" }, "sam-s": { ref: "poulet" } };
  const e = evaluerPeriode({ foyer, preferences, periode, plats, index });
  assert.ok(e.parRepas["lun-s"].some((a) => a.texte.includes("midi et soir")));
  assert.ok(e.parRepas["mar-m"].some((a) => a.niveau === "ok" && a.texte.startsWith("Reste")));
  assert.ok(e.parRepas["sam-s"].some((a) => a.niveau === "attention" && a.texte.includes("5 j")));
  assert.ok(e.bilan.some((a) => a.niveau === "attention" && a.texte.startsWith("Pommes de terre : 2")));
  // G : socle 32 + cantine 25 + 30 × 1,3 = 96 > plafond 95
  assert.equal(e.parJour.lun.G.total, 96);
  assert.equal(e.parJour.lun.G.etat, "trop");
  assert.equal(e.parJour.lun.G.estime, true);
  assert.equal(e.parJour.mar.G.etat, "absent");
});

test("recherche : texte sans accents, filtres et compatibilité du repas", () => {
  const recettes = exemple.recettes;
  const tofu = chercher(recettes, { texte: "TOFU" });
  assert.ok(tofu.length >= 6, `${tofu.length} recettes au tofu`);
  const froides = chercher(recettes, { texte: "tofu", froid: true, protMin: 15 });
  assert.ok(froides.length < tofu.length);
  const pourBoite = chercher(recettes, {}, { foyer: exemple.foyer, preferences: exemple.preferences, repas: { convives: { P: "bf" } } });
  assert.ok(pourBoite.length > 0 && pourBoite.every(({ r }) => r.drapeaux.froid));
  assert.ok(chercher(recettes, {}).every(({ r }) => r.avis !== "banni"));
});

test("markdown : échappe le HTML et rend les tableaux", () => {
  const html = rendreMarkdown("# Titre\n<script>x</script>\n\n| a | b |\n|---|---|\n| **1** | 2 |\n\n- un\n- deux");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<table>/);
  assert.match(html, /<strong>1<\/strong>/);
  assert.match(html, /<li>deux<\/li>/);
});

test("macros du jour : socle complet, cantine, ratio du soir", async () => {
  const { macrosParJour } = await import("../public/js/regles.js");
  const f = {
    personnes: [{ code: "G", nom: "G", socle: { kcal: 400, prot: 30, gluc: 50, lip: 10, fibres: 5 }, proteines_cible: [75, 88], proteines_plafond: 95, ratio_soir: 1.5, fibres_min: 30 }],
    cantine_macros: { kcal: 700, prot: 25, gluc: 90, lip: 25, fibres: 6 },
  };
  const per = { jours: [{ id: "j" }], repas: [
    { id: "m", jour: "j", moment: "midi", convives: { G: "c" } },
    { id: "s", jour: "j", moment: "soir", convives: { G: "m" } },
  ] };
  const idx = indexRecettes([{ ref: "x", macros: { kcal: 400, prot: 20, gluc: 40, lip: 10, fibres: 4 } }]);
  const d = macrosParJour({ foyer: f, periode: per, plats: { s: { ref: "x", portion: 1 } }, index: idx }).j.G;
  assert.deepEqual(d.macros, { kcal: 1700, prot: 85, gluc: 200, lip: 50, fibres: 17 });
  assert.equal(d.estime, true);
  assert.equal(d.etat, "ok");
});

test("stocks : rapprochement par mot-clé et usage dans la période", async () => {
  const { usageStocks, utiliseStock } = await import("../public/js/regles.js");
  const carottes = { id: "c", nom: "Carottes", mots: ["carotte"], prioritaire: true };
  const r = { ref: "v", ingredients: [{ item: "carottes_rapees" }] };
  assert.equal(utiliseStock(r, carottes), true);
  assert.equal(utiliseStock({ ingredients: [{ item: "poireau" }] }, carottes), false);
  const per = { repas: [{ id: "a", jour: "j" }, { id: "b", jour: "j" }] };
  const u = usageStocks([carottes], { periode: per, plats: { b: { ref: "v" } }, index: indexRecettes([r]) });
  assert.deepEqual(u, { c: ["b"] });
  const res = chercher(exemple.recettes, { ecoule: true }, { stocks: exemple.stocks.articles });
  assert.ok(res.length > 0 && res.every((x) => x.ecoules.length > 0));
  // L'inventaire réel change : on prend l'article le plus utilisé par les recettes.
  const parStock = Math.max(...exemple.stocks.articles.filter((a) => a.mots?.length).map((a) =>
    chercher(exemple.recettes, { stockId: a.id }, { stocks: exemple.stocks.articles }).length));
  assert.ok(parStock > 5);
});

test("chiffres aberrants : signalés et exclus des totaux", async () => {
  const { macrosParJour } = await import("../public/js/regles.js");
  const r = R("bizarre", {}, { macros: { kcal: 2400, prot: 50 } });
  assert.ok(alertesRecette(r, { convives: {} }, { foyer, preferences }).some((a) => a.texte.startsWith("Chiffres douteux")));
  const per = { jours: [{ id: "j" }], repas: [{ id: "s", jour: "j", moment: "soir", convives: { J: "m" } }] };
  const d = macrosParJour({ foyer, periode: per, plats: { s: { ref: "bizarre" } }, index: indexRecettes([r]) }).j.J;
  assert.equal(d.total, 43);
  assert.equal(d.incomplet, true);
});

test("à consommer : date limite, ancienneté, échéance imposée, repas avant échéance", async () => {
  const { urgenceArticle, articlesAConsommer, repasAvantEcheance } = await import("../public/js/regles.js");
  const auj = "2026-10-07";
  assert.equal(urgenceArticle({ dlc: "2026-10-08" }, auj).niveau, "urgent");
  assert.equal(urgenceArticle({ dlc: "2026-10-11" }, auj).niveau, "bientot");
  assert.equal(urgenceArticle({ dlc: "2026-10-30" }, auj), null);
  assert.equal(urgenceArticle({ dlc: "2026-10-05" }, auj).raison, "date dépassée");
  assert.equal(urgenceArticle({ perissable: true, entre_le: "2026-09-29" }, auj).niveau, "bientot");
  assert.equal(urgenceArticle({ perissable: true, entre_le: "2026-09-20" }, auj).niveau, "urgent");
  assert.equal(urgenceArticle({ perissable: false, entre_le: "2026-09-20" }, auj), null);
  assert.equal(urgenceArticle({ a_consommer: { avant: "2026-10-09", raison: "ouvert" } }, auj).raison, "ouvert");
  const liste = articlesAConsommer([{ id: "b", dlc: "2026-10-11" }, { id: "a", dlc: "2026-10-08" }], auj);
  assert.deepEqual(liste.map((x) => x.a.id), ["a", "b"]);

  const epinards = { id: "e", mots: ["epinard"] };
  const per = {
    jours: [{ id: "j1", date: "2026-10-08" }, { id: "j2", date: "2026-10-10" }],
    repas: [{ id: "r1", jour: "j1" }, { id: "r2", jour: "j2" }],
  };
  const idx = indexRecettes([{ ref: "x", ingredients: [{ item: "pousses d'epinards" }] }]);
  const plats = { r1: { ref: "x" }, r2: { ref: "x" } };
  assert.deepEqual(repasAvantEcheance(epinards, "2026-10-09", { periode: per, plats, index: idx }), ["r1"]);
  assert.deepEqual(repasAvantEcheance(epinards, "2026-10-07", { periode: per, plats, index: idx }), []);
  const res = chercher([{ ref: "x", nom: "X", ingredients: [{ item: "epinards" }], drapeaux: {} }, { ref: "y", nom: "Y", ingredients: [], drapeaux: {} }], { urgent: true }, { aConsommer: [epinards] });
  assert.deepEqual(res.map((r) => r.r.ref), ["x"]);
});

test("reste de la veille : midi de semaine seulement, recette compatible et qui se garde", () => {
  const periode = {
    jours: [
      { id: "lun", date: "2026-10-12", label: "Lundi 12" },
      { id: "mar", date: "2026-10-13", label: "Mardi 13" },
      { id: "sam", date: "2026-10-17", label: "Samedi 17" },
    ],
    repas: [
      { id: "lun-s", jour: "lun", moment: "soir", convives: { J: "m", G: "m" } },
      { id: "mar-m", jour: "mar", moment: "midi", convives: { J: "bc", G: "m" } },
      { id: "mar-mbf", jour: "mar", moment: "midi", convives: { J: "bf", G: "c" } },
      { id: "sam-m", jour: "sam", moment: "midi", convives: { J: "m", G: "m" } },
    ],
  };
  const index = indexRecettes([R("chaud"), R("lentilles", { lentilles: true }), R("frais", {}, { conservation_jours: 0 })]);
  const ctx = (ref) => ({ periode, plats: ref ? { "lun-s": { ref } } : {}, index, foyer, preferences });
  const midi = (id) => periode.repas.find((r) => r.id === id);

  const ok = resteVeille(midi("mar-m"), ctx("chaud"));
  assert.deepEqual([ok.possible, ok.ref, ok.de, ok.mangeurs], [true, "chaud", "lun-s", 2]);
  assert.match(resteVeille(midi("mar-m"), ctx(null)).raison, /Choisissez/);
  assert.equal(resteVeille(midi("mar-m"), ctx("lentilles")).possible, false, "G évite les lentilles");
  assert.equal(resteVeille(midi("mar-m"), ctx("frais")).possible, false, "ne se garde pas");
  assert.equal(resteVeille(midi("mar-mbf"), ctx("chaud")).possible, false, "boîte froide : plat froid exigé");
  assert.equal(resteVeille(midi("sam-m"), ctx("chaud")), null, "week-end");
  assert.equal(resteVeille({ ...midi("mar-m"), reste_veille: false }, ctx("chaud")), null, "interdit par l'export");
});
