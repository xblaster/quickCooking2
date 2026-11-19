// Contrôles informatifs du menu (docs/donnees-entree-batch-cooking.md §4). Fonctions pures.
import { dateLocale, ecartJours, normaliser } from "./outils.js";

const ORDRE = { interdit: 3, attention: 2, info: 1, ok: 0 };
export const pire = (alertes) => alertes.reduce((n, a) => (ORDRE[a.niveau] > ORDRE[n] ? a.niveau : n), "ok");

/** Au-delà, les macros d'une portion sont jugées aberrantes (erreur de calcul en amont). */
export const KCAL_DOUTEUX = 1500;
export const chiffresDouteux = (r) => (r?.macros?.kcal ?? 0) > KCAL_DOUTEUX;

export function indexRecettes(recettes) {
  return new Map(recettes.map((r) => [r.ref, r]));
}

const carne = (r) => r && r.drapeaux?.type && r.drapeaux.type !== "vege";

function contientMotInterdit(r, mots) {
  if (!mots?.length) return null;
  const texte = normaliser([r.nom, ...(r.ingredients || []).map((i) => i.item)].join(" "));
  return mots.find((m) => texte.includes(normaliser(m))) || null;
}

/** Alertes propres à une recette placée sur un repas (sans regarder le reste de la période). */
export function alertesRecette(r, repas, { foyer, preferences }) {
  const out = [];
  if (!r) return out;
  const personnes = new Map(foyer.personnes.map((p) => [p.code, p]));
  for (const [code, lieu] of Object.entries(repas.convives || {})) {
    const p = personnes.get(code);
    const nom = p?.nom ?? code;
    if (lieu === "bf" && !r.drapeaux?.froid) out.push({ niveau: "interdit", texte: `Doit se manger froid (boîte de ${nom})` });
    if (lieu === "c") continue;
    for (const ev of p?.evite || []) if (r.drapeaux?.[ev.drapeau]) out.push({ niveau: ev.niveau, texte: ev.libelle });
  }
  if (r.avis === "banni") out.push({ niveau: "interdit", texte: r.avis_note || "Plat refusé par la famille" });
  const mot = contientMotInterdit(r, preferences?.mots_interdits);
  if (mot) out.push({ niveau: "interdit", texte: `Contient « ${mot} »` });
  if (chiffresDouteux(r))
    out.push({ niveau: "attention", texte: `Chiffres douteux (${Math.round(r.macros.kcal)} kcal par portion) : non comptés` });
  if (typeof r.couverture === "number" && r.couverture < 0.7)
    out.push({ niveau: "info", texte: `Macros incomplètes (${Math.round(r.couverture * 100)} %)` });
  return out;
}

/**
 * Un midi de semaine peut-il reprendre le dîner de la veille (cuisiner plus la veille au soir) ?
 * plats : { [repasId]: { ref } }. Retour : null si sans objet, sinon
 * { possible, raison?, de, veille, ref, recette, mangeurs }.
 */
export function resteVeille(repas, { periode, plats, index, foyer, preferences }) {
  if (repas.moment !== "midi" || repas.impose || repas.reste_veille === false) return null;
  const jour = periode.jours.find((j) => j.id === repas.jour);
  if (!jour?.date) return null;
  const js = dateLocale(jour.date).getDay();
  if (js === 0 || js === 6) return null;
  const mangeurs = Object.values(repas.convives || {}).filter((l) => l !== "c").length;
  if (!mangeurs) return null;
  const veille = periode.jours.find((j) => j.date && ecartJours(j.date, jour.date) === 1);
  const soir = veille && periode.repas.find((r) => r.jour === veille.id && r.moment === "soir");
  if (!soir) return null;
  const ref = soir.impose?.ref ?? plats[soir.id]?.ref ?? null;
  const recette = ref ? index.get(ref) ?? null : null;
  const base = { de: soir.id, veille, ref, recette, mangeurs };
  if (!recette) return { ...base, possible: false, raison: "Choisissez d'abord le dîner de la veille" };
  if ((recette.conservation_jours ?? 3) < 1) return { ...base, possible: false, raison: "Ne se garde pas jusqu'au lendemain" };
  const bloquant = alertesRecette(recette, repas, { foyer, preferences }).find((a) => a.niveau === "interdit");
  if (bloquant) return { ...base, possible: false, raison: bloquant.texte };
  return { ...base, possible: true };
}

/**
 * Évalue une période.
 * plats : { [repasId]: { ref, portion } } — la recette retenue pour chaque repas (ou absente).
 * Retour : { parRepas: {id: alertes[]}, parJour: {jourId: {code: {...}}}, bilan: alertes[] }
 */
export function evaluerPeriode({ foyer, preferences, periode, plats, index }) {
  const jours = new Map(periode.jours.map((j) => [j.id, j]));
  const parRepas = {};
  const recetteDe = (id) => index.get(plats[id]?.ref) || null;

  // Ordre chronologique des repas
  const repas = [...periode.repas].sort((a, b) => {
    const d = periode.jours.findIndex((j) => j.id === a.jour) - periode.jours.findIndex((j) => j.id === b.jour);
    return d || (a.moment === "midi" ? -1 : 1);
  });

  for (const rep of repas) parRepas[rep.id] = alertesRecette(recetteDe(rep.id), rep, { foyer, preferences });

  // Viande/poisson midi et soir le même jour
  const joursDoubleCarne = [];
  for (const j of periode.jours) {
    const midi = repas.find((r) => r.jour === j.id && r.moment === "midi");
    const soir = repas.find((r) => r.jour === j.id && r.moment === "soir");
    if (midi && soir && carne(recetteDe(midi.id)) && carne(recetteDe(soir.id))) {
      const samedi = j.date && dateLocale(j.date).getDay() === 6;
      const a = { niveau: samedi ? "info" : "attention", texte: "Viande ou poisson midi et soir" };
      parRepas[midi.id].push(a);
      parRepas[soir.id].push(a);
      joursDoubleCarne.push(j.label);
    }
  }

  // Restes : même recette reprise plus tard
  const premiereFois = new Map();
  for (const rep of repas) {
    const r = recetteDe(rep.id);
    if (!r) continue;
    const jour = jours.get(rep.jour);
    const avant = premiereFois.get(r.ref);
    if (!avant) {
      premiereFois.set(r.ref, { jour, rep });
      continue;
    }
    if (!avant.jour.date || !jour.date) continue;
    const ecart = ecartJours(avant.jour.date, jour.date);
    const limite = r.conservation_jours ?? 3;
    parRepas[rep.id].push(
      ecart <= limite
        ? { niveau: "ok", texte: `Reste de ${avant.jour.label} ${avant.rep.moment}` }
        : { niveau: "attention", texte: `Préparé ${ecart} j plus tôt : au-delà de ${limite} j au frigo` },
    );
  }

  // Même boîte deux jours de suite
  for (const p of foyer.personnes) {
    let precedent = null;
    for (const rep of repas) {
      if (rep.convives?.[p.code] !== "bc" && rep.convives?.[p.code] !== "bf") continue;
      const ref = plats[rep.id]?.ref;
      const jour = jours.get(rep.jour);
      if (ref && precedent && precedent.ref === ref && jour.date && precedent.date && ecartJours(precedent.date, jour.date) === 1)
        parRepas[rep.id].push({ niveau: "info", texte: `Même boîte que la veille pour ${p.nom}` });
      precedent = { ref, date: jour.date };
    }
  }

  return {
    parRepas,
    parJour: macrosParJour({ foyer, periode, plats, index }),
    bilan: bilanPeriode({ preferences, periode, plats, index, joursDoubleCarne }),
    joursDoubleCarne,
    poisson: poissonParSemaine({ preferences, periode, plats, index }),
  };
}

export const MACROS = ["kcal", "prot", "gluc", "lip", "fibres"];
const vide = () => Object.fromEntries(MACROS.map((k) => [k, 0]));
const ajouter = (t, m, f = 1) => MACROS.forEach((k) => (t[k] += (m?.[k] ?? 0) * f));

/**
 * Macros par personne et par jour : socle (petit-déjeuner + Skyr) + repas.
 * `total` = protéines (compatibilité), `macros` = les cinq valeurs, `repas` = détail par repas.
 */
export function macrosParJour({ foyer, periode, plats, index }) {
  const out = {};
  for (const j of periode.jours) {
    out[j.id] = {};
    const repasJour = periode.repas.filter((r) => r.jour === j.id);
    for (const p of foyer.personnes) {
      const macros = vide();
      ajouter(macros, p.socle ?? { prot: p.socle_proteines ?? 0 });
      let present = false, estime = false, incomplet = false;
      const detail = [];
      for (const rep of repasJour) {
        const lieu = rep.convives?.[p.code];
        if (!lieu) continue;
        present = true;
        if (lieu === "c") {
          ajouter(macros, foyer.cantine_macros ?? { prot: foyer.cantine_estimee ?? 25 });
          estime = true;
          detail.push({ repas: rep.id, cantine: true });
          continue;
        }
        const r = index.get(plats[rep.id]?.ref);
        if (!r || chiffresDouteux(r)) { incomplet = true; detail.push({ repas: rep.id, inconnu: true }); continue; }
        const facteur = (plats[rep.id]?.portion ?? 1) * (rep.moment === "soir" ? p.ratio_soir ?? 1 : 1);
        ajouter(macros, r.macros, facteur);
        detail.push({ repas: rep.id, ref: r.ref, facteur });
      }
      const total = macros.prot;
      const [bas] = p.proteines_cible || [0];
      const etat = !present ? "absent" : total > (p.proteines_plafond ?? Infinity) ? "trop" : !incomplet && total < bas ? "leger" : "ok";
      out[j.id][p.code] = {
        total: Math.round(total), macros, etat, estime, incomplet, detail,
        plafond: p.proteines_plafond, cible: p.proteines_cible, kcal_cible: p.kcal_cible, fibres_min: p.fibres_min,
      };
    }
  }
  return out;
}

export const proteinesParJour = macrosParJour;

/** Mots-clés d'un article retrouvés dans les ingrédients d'une recette ? */
export function utiliseStock(recette, article) {
  const mots = (article.mots || []).map(normaliser).filter(Boolean);
  if (!mots.length || !recette) return false;
  return (recette.ingredients || []).some((i) => {
    const item = normaliser(i.item);
    return mots.some((m) => item.includes(m));
  });
}

/** Pour chaque article : les repas de la période dont la recette l'utilise. */
export function usageStocks(articles, { periode, plats, index }) {
  const usage = {};
  for (const a of articles || []) {
    usage[a.id] = periode.repas.filter((rep) => utiliseStock(index.get(plats[rep.id]?.ref), a)).map((rep) => rep.id);
  }
  return usage;
}

/**
 * Règle du poisson : par semaine, nombre de poissons choisis (plus ceux déjà servis) et cible ;
 * `gras` = au moins un poisson gras sur la période. null si la famille n'a pas d'objectif.
 */
export function poissonParSemaine({ preferences, periode, plats, index }) {
  const objectif = preferences?.poisson_par_semaine;
  if (!objectif) return null;
  const recettes = periode.repas.map((r) => ({ rep: r, r: index.get(plats[r.id]?.ref) })).filter((x) => x.r);
  const jours = new Map(periode.jours.map((j) => [j.id, j]));
  const semaines = new Map();
  for (const j of periode.jours) semaines.set(j.semaine, (semaines.get(j.semaine) || 0) + 1);
  const liste = [];
  for (const [semaine, nbJours] of semaines) {
    const n = recettes.filter((x) => x.r.drapeaux?.type === "poisson" && jours.get(x.rep.jour)?.semaine === semaine).length + (periode.poissons_deja?.[semaine] || 0);
    const cible = nbJours >= 5 ? objectif : Math.max(1, Math.round((objectif * nbJours) / 7));
    liste.push({ semaine, n, cible });
  }
  return { semaines: liste, gras: recettes.some((x) => x.r.drapeaux?.poisson_gras) };
}

function bilanPeriode({ preferences, periode, plats, index, joursDoubleCarne }) {
  const out = [];
  const recettes = periode.repas.map((r) => ({ rep: r, r: index.get(plats[r.id]?.ref) })).filter((x) => x.r);
  const distinctes = (filtre) => new Set(recettes.filter((x) => filtre(x.r)).map((x) => x.r.ref));

  for (const lim of preferences?.limites_periode || []) {
    const n = distinctes((r) => r.drapeaux?.[lim.drapeau]).size;
    out.push({ niveau: n > lim.max ? "attention" : "ok", texte: `${lim.libelle} : ${n} (repère ≤ ${lim.max})` });
  }

  const poisson = poissonParSemaine({ preferences, periode, plats, index });
  if (poisson) {
    for (const s of poisson.semaines) out.push({ niveau: s.n >= s.cible ? "ok" : "info", texte: `Poisson ${s.semaine} : ${s.n} / ${s.cible}` });
    if (recettes.length && !poisson.gras) out.push({ niveau: "info", texte: "Aucun poisson gras sur la période" });
  }
  if (joursDoubleCarne.length) out.push({ niveau: "attention", texte: `Viande ou poisson midi et soir : ${joursDoubleCarne.join(", ")}` });
  const nouvelles = distinctes((r) => !r.historique?.deja_cuisinee).size;
  if (nouvelles) out.push({ niveau: "ok", texte: `${nouvelles} recette${nouvelles > 1 ? "s" : ""} jamais cuisinée${nouvelles > 1 ? "s" : ""}` });
  return out;
}

// ---------- Produits à consommer absolument ----------
export const SEUILS_DEFAUT = { dlc_urgent: 2, dlc_bientot: 5, anciennete_bientot: 7, anciennete_urgent: 12 };

const ajouterJours = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Urgence d'un article : { niveau: "urgent" | "bientot", avant: "AAAA-MM-JJ", raison } ou null.
 * Priorité à `a_consommer` fourni par l'export ; sinon calcul depuis `dlc`, puis depuis `entre_le`
 * pour un produit `perissable`.
 */
export function urgenceArticle(a, aujourdHui, seuils = SEUILS_DEFAUT) {
  const s = { ...SEUILS_DEFAUT, ...seuils };
  if (a.a_consommer?.avant) {
    const reste = ecartJours(aujourdHui, a.a_consommer.avant);
    return { niveau: a.a_consommer.niveau ?? (reste <= s.dlc_urgent ? "urgent" : "bientot"), avant: a.a_consommer.avant, raison: a.a_consommer.raison ?? "à consommer", reste };
  }
  if (a.dlc) {
    const reste = ecartJours(aujourdHui, a.dlc);
    if (reste <= s.dlc_urgent) return { niveau: "urgent", avant: a.dlc, raison: reste < 0 ? "date dépassée" : "date limite", reste };
    if (reste <= s.dlc_bientot) return { niveau: "bientot", avant: a.dlc, raison: "date limite", reste };
  }
  if (a.perissable && a.entre_le) {
    const age = ecartJours(a.entre_le, aujourdHui);
    const avant = ajouterJours(a.entre_le, s.anciennete_urgent);
    const reste = ecartJours(aujourdHui, avant);
    if (age >= s.anciennete_urgent) return { niveau: "urgent", avant: aujourdHui, raison: `là depuis ${age} j`, reste: 0 };
    if (age >= s.anciennete_bientot) return { niveau: "bientot", avant, raison: `là depuis ${age} j`, reste };
  }
  return null;
}

/** Articles à consommer, les plus pressés d'abord, avec leur urgence. */
export function articlesAConsommer(articles, aujourdHui, seuils) {
  return (articles || [])
    .map((a) => ({ a, u: urgenceArticle(a, aujourdHui, seuils) }))
    .filter((x) => x.u)
    .sort((x, y) => (x.u.niveau === y.u.niveau ? x.u.avant.localeCompare(y.u.avant) : x.u.niveau === "urgent" ? -1 : 1));
}

/** Repas de la période, datés au plus tard à l'échéance, qui utilisent l'article. */
export function repasAvantEcheance(article, avant, { periode, plats, index }) {
  const dates = new Map(periode.jours.map((j) => [j.id, j.date]));
  return periode.repas
    .filter((rep) => (!dates.get(rep.jour) || dates.get(rep.jour) <= avant) && utiliseStock(index.get(plats[rep.id]?.ref), article))
    .map((rep) => rep.id);
}

// ---------- Revue finale avant validation ----------
/**
 * Synthèse montrée avant « On a fini de choisir » : stocks employés ou oubliés, règles respectées ou non,
 * effet des choix sur les protéines et la variété. Fonction pure.
 * articles : stocks de l'export ; aConsommer : [{ a, u }] (articlesAConsommer) ; couverts : ids d'articles
 * déjà consommés par un repas (période courante comprise) avant leur échéance.
 */
export function revuePeriode({ foyer, preferences, periode, plats, index, articles, aConsommer, couverts }) {
  const ev = evaluerPeriode({ foyer, preferences, periode, plats, index });
  const usage = usageStocks(articles, { periode, plats, index });
  const choisis = periode.repas.filter((r) => plats[r.id]?.ref || r.impose);

  const urgents = (aConsommer || []).filter(({ a }) => !usage[a.id].length && !(couverts || new Set()).has(a.id));
  const urgentIds = new Set((aConsommer || []).map(({ a }) => a.id));
  const aFinir = (articles || []).filter((a) => a.prioritaire && !urgentIds.has(a.id) && !usage[a.id].length);
  const utilises = (articles || []).filter((a) => usage[a.id].length).map((a) => ({ a, repas: usage[a.id] }));

  const regles = [];
  const nbCarne = ev.joursDoubleCarne.length;
  regles.push({ id: "un-carne", niveau: nbCarne ? "attention" : "ok", libelle: "Un seul repas viande ou poisson par jour",
    detail: nbCarne ? `Midi et soir : ${ev.joursDoubleCarne.join(", ")}` : "Respecté" });
  if (ev.poisson) {
    for (const s of ev.poisson.semaines)
    {
      const debut = periode.jours.find((j) => j.semaine === s.semaine && j.date);
      const quand = debut ? `semaine du ${dateLocale(debut.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : s.semaine;
      regles.push({ id: `poisson-${s.semaine}`, niveau: s.n >= s.cible ? "ok" : "info", libelle: `Poisson, ${quand}`,
        detail: `${s.n} au menu sur ${s.cible}${s.n >= s.cible ? "" : ` : il en manque ${s.cible - s.n}`}` });
    }
    regles.push({ id: "poisson-gras", niveau: ev.poisson.gras ? "ok" : "info", libelle: "Un poisson gras sur la période",
      detail: ev.poisson.gras ? "Au moins un" : "Pas de poisson gras au menu" });
  }
  for (const a of ev.bilan.filter((x) => /\(repère ≤/.test(x.texte)))
    regles.push({ id: a.texte, niveau: a.niveau, libelle: a.texte.split(" : ")[0], detail: a.texte.split(" : ")[1].replace(/\(repère ≤ (\d+)\)/, "(au plus $1)") });
  const enfreintes = [];
  for (const rep of periode.repas) for (const a of ev.parRepas[rep.id] || []) if (a.niveau === "interdit") enfreintes.push({ repas: rep.id, texte: a.texte });
  regles.push({ id: "interdits", niveau: enfreintes.length ? "interdit" : "ok", libelle: "Aucun plat interdit",
    detail: enfreintes.length ? `${enfreintes.length} repas à revoir` : "Respecté", repas: enfreintes });

  // Impact sur les protéines : jours hors repères par personne
  const personnes = foyer.personnes.map((p) => {
    let leger = 0, trop = 0, jours = 0, prot = 0, incomplets = 0;
    for (const j of periode.jours) {
      const d = ev.parJour[j.id]?.[p.code];
      if (!d || d.etat === "absent") continue;
      jours++;
      prot += d.total;
      if (d.incomplet) incomplets++;
      if (d.etat === "leger") leger++;
      else if (d.etat === "trop") trop++;
    }
    return { code: p.code, nom: p.nom, jours, leger, trop, incomplets, moyenne: jours ? Math.round(prot / jours) : 0, cible: p.proteines_cible };
  });
  const refs = new Set(choisis.map((r) => plats[r.id]?.ref ?? r.impose?.ref).filter(Boolean));
  const nouvelles = [...refs].filter((ref) => index.get(ref) && !index.get(ref).historique?.deja_cuisinee).length;
  const restes = periode.repas.filter((r) => ev.parRepas[r.id]?.some((a) => /^Reste de /.test(a.texte))).length;
  return {
    stocks: { urgents, aFinir, utilises },
    regles,
    impact: { personnes, repasChoisis: choisis.length, repasTotal: periode.repas.length, plats: refs.size, nouvelles, restes },
    manque: periode.repas.length - choisis.length,
  };
}
