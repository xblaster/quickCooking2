// Validation de l'export et normalisation des choix (voir docs/donnees-entree-batch-cooking.md).

export const ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SECTIONS = ["foyer", "preferences", "stocks", "periode_courante", "periode_a_venir", "recettes"];
export const PORTIONS = [0.75, 1, 1.25];
export const ORIGINES = ["option", "recherche", "impose", null];
export const CODES = ["J", "P", "G"];

const estObjet = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Retourne la liste des erreurs bloquantes (vide si l'export est acceptable). */
export function validerExport(e) {
  const err = [];
  if (!estObjet(e)) return ["L'export doit être un objet JSON."];
  if (e.format !== "quick-cooking/export") err.push('format doit valoir "quick-cooking/export".');
  if (e.version !== 1) err.push("version 1 attendue.");
  if (!Array.isArray(e.recettes)) err.push("recettes doit être une liste.");
  if (!estObjet(e.foyer) || !Array.isArray(e.foyer.personnes)) err.push("foyer.personnes manquant.");
  if (!estObjet(e.periode_courante)) err.push("periode_courante manquante.");

  const refs = new Set();
  for (const [i, r] of (e.recettes || []).entries()) {
    if (!estObjet(r) || typeof r.ref !== "string" || typeof r.nom !== "string") {
      err.push(`recettes[${i}] : ref et nom obligatoires.`);
      continue;
    }
    if (refs.has(r.ref)) err.push(`recettes[${i}] : ref en double « ${r.ref} ».`);
    refs.add(r.ref);
  }
  if (e.stocks != null) {
    if (!estObjet(e.stocks) || !Array.isArray(e.stocks.articles)) err.push("stocks.articles doit être une liste.");
    else {
      const ids = new Set();
      for (const [i, a] of e.stocks.articles.entries()) {
        if (!estObjet(a) || typeof a.id !== "string" || typeof a.nom !== "string") {
          err.push(`stocks.articles[${i}] : id et nom obligatoires.`);
          continue;
        }
        if (ids.has(a.id)) err.push(`stocks.articles[${i}] : id en double « ${a.id} ».`);
        ids.add(a.id);
        if (!["frigo", "congelateur", "cellier"].includes(a.lieu)) err.push(`stocks.articles[${i}] : lieu = frigo, congelateur ou cellier.`);
        for (const champ of ["dlc", "entre_le"])
          if (a[champ] != null && !DATE_RE.test(a[champ])) err.push(`stocks.articles[${i}].${champ} : date AAAA-MM-JJ attendue.`);
        if (a.a_consommer != null && (!estObjet(a.a_consommer) || !DATE_RE.test(a.a_consommer.avant ?? "")))
          err.push(`stocks.articles[${i}].a_consommer.avant : date AAAA-MM-JJ attendue.`);
        if (a.mots != null && !Array.isArray(a.mots)) err.push(`stocks.articles[${i}].mots : liste de mots attendue.`);
      }
    }
  }
  for (const cle of ["periode_courante", "periode_a_venir"]) {
    const p = e[cle];
    if (p == null) continue;
    if (!estObjet(p)) { err.push(`${cle} doit être un objet.`); continue; }
    if (!ID_RE.test(String(p.id))) err.push(`${cle}.id invalide.`);
    if (!Array.isArray(p.jours) || !Array.isArray(p.repas)) { err.push(`${cle} : jours et repas obligatoires.`); continue; }
    const jours = new Set(p.jours.map((j) => j.id));
    const ids = new Set();
    for (const r of p.repas) {
      if (!ID_RE.test(String(r.id))) err.push(`${cle} : id de repas invalide « ${r.id} ».`);
      if (ids.has(r.id)) err.push(`${cle} : repas en double « ${r.id} ».`);
      ids.add(r.id);
      if (!jours.has(r.jour)) err.push(`${cle}.${r.id} : jour inconnu « ${r.jour} ».`);
      if (r.moment !== "midi" && r.moment !== "soir") err.push(`${cle}.${r.id} : moment = midi ou soir.`);
    }
  }
  return err;
}

/** Avertissements non bloquants : refs introuvables, articles sans mots-clés, dates manquantes. */
export function avertissementsExport(e) {
  const av = refsIntrouvables(e).map((r) => `Recette introuvable : ${r}`);
  const articles = e.stocks?.articles || [];
  const sansMots = articles.filter((a) => !a.mots?.length).length;
  if (sansMots) av.push(`${sansMots} article(s) de stock sans « mots » : impossible de les relier aux recettes.`);
  const frais = articles.filter((a) => a.lieu === "frigo" && !a.dlc && !a.entre_le && !a.a_consommer).length;
  if (frais) av.push(`${frais} article(s) du frigo sans dlc, entre_le ni a_consommer : leur urgence ne peut pas être calculée.`);
  for (const cle of ["periode_courante", "periode_a_venir"])
    for (const j of e[cle]?.jours || []) if (!DATE_RE.test(j.date ?? "")) av.push(`${cle}.jours.${j.id} : date manquante.`);
  for (const r of e.periode_a_venir?.repas || [])
    if ((r.options?.length ?? 0) > 5) av.push(`periode_a_venir.repas.${r.id} : ${r.options.length} options, 5 au plus sont attendues.`);
  return av;
}

/** Refs citées par les périodes mais absentes de la base (avertissement, non bloquant). */
export function refsIntrouvables(e) {
  const refs = new Set((e.recettes || []).map((r) => r.ref));
  const manquantes = new Set();
  for (const p of [e.periode_courante, e.periode_a_venir]) {
    for (const r of p?.repas || []) {
      const cites = [r.plat?.ref, r.impose?.ref, r.defaut, ...(r.options || []).map((o) => o.ref)];
      for (const ref of cites) if (ref && !refs.has(ref)) manquantes.add(ref);
    }
  }
  return [...manquantes];
}

function repasVide(r) {
  if (r.impose) return { ref: r.impose.ref ?? null, origine: "impose", portion: 1, commentaire: "", par: null, le: null };
  return { ref: r.defaut ?? null, origine: r.defaut ? "option" : null, portion: 1, commentaire: "", par: null, le: null };
}

/** Choix complets pour la période : une entrée par repas, quoi qu'il y ait dans le fichier. */
export function normaliserChoix(periode, brut, genereLe) {
  const anciens = estObjet(brut?.repas) ? brut.repas : {};
  const repas = {};
  for (const r of periode.repas) {
    const a = anciens[r.id];
    repas[r.id] = r.impose ? repasVide(r) : estObjet(a) ? { ...repasVide(r), ...a } : repasVide(r);
  }
  return {
    format: "quick-cooking/choix",
    version: 1,
    periode: periode.id,
    export_genere_le: brut?.export_genere_le ?? genereLe ?? null,
    statut: brut?.statut === "termine" ? "termine" : "brouillon",
    repas,
    commentaire_general: typeof brut?.commentaire_general === "string" ? brut.commentaire_general : "",
    mis_a_jour: brut?.mis_a_jour ?? null,
  };
}

/** Valide la mise à jour d'un repas. Retourne { valeur } ou { erreur }. */
export function validerMajRepas(corps, repasDef, refsConnues) {
  if (!estObjet(corps)) return { erreur: "Corps JSON attendu." };
  if (repasDef.impose) return { erreur: "Ce repas est imposé : pas de choix possible." };
  const ref = corps.ref ?? null;
  if (ref !== null && (typeof ref !== "string" || !refsConnues.has(ref))) return { erreur: "Recette inconnue." };
  const origine = ref === null ? null : corps.origine ?? "recherche";
  if (!ORIGINES.includes(origine) || origine === "impose") return { erreur: "Origine invalide." };
  const portion = corps.portion ?? 1;
  if (!PORTIONS.includes(portion)) return { erreur: "Portion : 0.75, 1 ou 1.25." };
  const commentaire = corps.commentaire ?? "";
  if (typeof commentaire !== "string" || commentaire.length > 500) return { erreur: "Commentaire : 500 caractères au plus." };
  const par = corps.par ?? null;
  if (par !== null && !CODES.includes(par)) return { erreur: "par : J, P ou G." };
  return { valeur: { ref, origine, portion, commentaire: commentaire.trim(), par } };
}

export function validerMajPeriode(corps) {
  if (!estObjet(corps)) return { erreur: "Corps JSON attendu." };
  const v = {};
  if (corps.statut !== undefined) {
    if (!["brouillon", "termine"].includes(corps.statut)) return { erreur: "statut : brouillon ou termine." };
    v.statut = corps.statut;
  }
  if (corps.commentaire_general !== undefined) {
    if (typeof corps.commentaire_general !== "string" || corps.commentaire_general.length > 2000)
      return { erreur: "Commentaire : 2000 caractères au plus." };
    v.commentaire_general = corps.commentaire_general.trim();
  }
  return { valeur: v };
}
