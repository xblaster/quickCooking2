// Recherche multicritère dans la base de recettes. Fonctions pures.
import { normaliser } from "./outils.js";
import { alertesRecette, utiliseStock } from "./regles.js";

const corpus = new WeakMap();
function texteDe(r) {
  let t = corpus.get(r);
  if (!t) {
    t = normaliser([
      r.nom, r.source?.libelle, r.categorie, r.type_plat, r.format,
      ...(r.tags || []), ...(r.materiel || []), ...(r.appareils || []), ...(r.proteines || []),
      ...(r.ingredients || []).map((i) => i.item), ...(r.ingredients_cles || []),
    ].join(" "));
    corpus.set(r, t);
  }
  return t;
}

export const CRITERES_VIDES = {
  texte: "", type: "", tempsMax: 0, appareil: "", saison: false, froid: false,
  protMin: 0, jamais: false, coeur: false, congelable: false, montrerBannis: false,
  ecoule: false, stockId: "", urgent: false,
};

/**
 * criteres : voir CRITERES_VIDES. contexte : { foyer, preferences, stocks?, repas? } — si `repas` est
 * fourni, les recettes incompatibles (niveau interdit) sont écartées. `stocks` = articles d'inventaire,
 * `aConsommer` = articles à consommer absolument (voir regles.articlesAConsommer), remontés en tête.
 */
export function chercher(recettes, criteres, contexte = {}) {
  const c = { ...CRITERES_VIDES, ...criteres };
  const mots = normaliser(c.texte).split(/\s+/).filter(Boolean);
  const saison = contexte.preferences?.saison;
  const appareil = normaliser(c.appareil);
  const articles = contexte.stocks || [];
  const prioritaires = articles.filter((a) => a.prioritaire);
  const stockCible = c.stockId ? articles.find((a) => a.id === c.stockId) : null;
  const aConsommer = contexte.aConsommer || [];
  const resultats = [];

  for (const r of recettes) {
    const t = texteDe(r);
    if (mots.some((m) => !t.includes(m))) continue;
    if (c.type && r.drapeaux?.type !== c.type) continue;
    if (c.tempsMax && !(r.temps?.total > 0 && r.temps.total <= c.tempsMax)) continue;
    if (appareil && !normaliser([...(r.appareils || []), ...(r.materiel || [])].join(" ")).includes(appareil)) continue;
    if (c.saison && saison && !(r.saisons || []).some((s) => s === saison || s === "Toutes saisons")) continue;
    if (c.froid && !r.drapeaux?.froid) continue;
    if (c.protMin && !((r.macros?.prot ?? 0) >= c.protMin)) continue;
    if (c.jamais && r.historique?.deja_cuisinee) continue;
    if (c.coeur && r.avis !== "coup_de_coeur") continue;
    if (c.congelable && !r.congelable) continue;
    if (!c.montrerBannis && r.avis === "banni") continue;
    if (stockCible && !utiliseStock(r, stockCible)) continue;
    const ecoules = prioritaires.filter((a) => utiliseStock(r, a));
    if (c.ecoule && !ecoules.length) continue;
    const urgents = aConsommer.filter((a) => utiliseStock(r, a));
    if (c.urgent && !urgents.length) continue;

    let alertes = [];
    if (contexte.repas) {
      alertes = alertesRecette(r, contexte.repas, contexte);
      if (alertes.some((a) => a.niveau === "interdit")) continue;
    }
    let score = 0;
    for (const m of mots) score += normaliser(r.nom).includes(m) ? 3 : 1;
    if (r.avis === "coup_de_coeur") score += 2;
    if (saison && (r.saisons || []).includes(saison)) score += 1;
    score += Math.min(ecoules.length, 3) + Math.min(urgents.length, 2) * 3;
    resultats.push({ r, score, alertes, ecoules, urgents });
  }
  resultats.sort((a, b) => b.score - a.score || a.r.nom.localeCompare(b.r.nom, "fr"));
  return resultats;
}

/** Valeurs proposées dans le filtre « appareil ». */
export function appareilsConnus(recettes) {
  const n = new Map();
  for (const r of recettes) for (const a of r.appareils || []) n.set(a, (n.get(a) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
}
