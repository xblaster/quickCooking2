// Interface de Quick Cooking : routes par ancre (#/semaine, #/courses, #/choisir, #/recettes).
import { rendreMarkdown } from "./markdown.js";
import { appareilsConnus, chercher, CRITERES_VIDES } from "./recherche.js";
import { alertesRecette, articlesAConsommer, evaluerPeriode, indexRecettes, macrosParJour, pire, repasAvantEcheance, resteVeille, usageStocks } from "./regles.js";
import { arrondi, couleurPastille, dateLocale, esc, isoDuJour, LIBELLE_MOMENT, LIBELLE_TYPE, motifPastille, normaliser } from "./outils.js";

const $ = (sel, racine = document) => racine.querySelector(sel);
const vue = $("#vue");

const etat = {
  donnees: null,
  index: new Map(),
  choix: null,
  moi: lireLocal("qc-moi", null),
  criteres: { ...CRITERES_VIDES, saison: true },
  cible: null, // repas à remplacer depuis le tiroir de recherche
  route: "",
  jourSuivi: null, // { periode, jour } : journée affichée dans le panneau latéral
  coteOuvert: false, // panneau déplié (téléphone)
  lieuStock: lireLocal("qc-lieu-stock", "frigo"),
  courses: null, // cases cochées (partagées, sur le serveur)
  appareil: null, // { id, nom, statut, mode, autorise }
};

// ---------- Stockage local (préférences de l'appareil, jamais indispensable) ----------
function lireLocal(cle, defaut) {
  try {
    const v = localStorage.getItem(cle);
    return v == null ? defaut : JSON.parse(v);
  } catch {
    return defaut;
  }
}
function ecrireLocal(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* navigation privée : tant pis */
  }
}

// ---------- Clé de cet appareil ----------
// Tirée au premier passage et gardée dans le navigateur. Le serveur n'en garde que l'empreinte ;
// elle permettra d'autoriser les appareils de la famille plus tard (APPAREILS_MODE=autorises).
function cleAppareil() {
  let cle = lireLocal("qc-appareil", null);
  if (typeof cle !== "string" || cle.length < 32) {
    const octets = crypto.getRandomValues(new Uint8Array(24));
    cle = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
    ecrireLocal("qc-appareil", cle);
  }
  return cle;
}
const CLE_APPAREIL = cleAppareil();

// ---------- Accès API ----------
async function api(chemin, options = {}) {
  const rep = await fetch(chemin, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Appareil": CLE_APPAREIL, ...(options.headers || {}) },
  });
  const corps = await rep.json().catch(() => ({}));
  if (!rep.ok) throw new Error(corps.erreur || `Erreur ${rep.status}`);
  return corps;
}

const periodeAVenir = () => etat.donnees?.periode_a_venir || null;
const periodeCourante = () => etat.donnees?.periode_courante || null;
const choixOuverts = () => periodeAVenir() && periodeAVenir().statut !== "close";

async function chargerChoix() {
  const p = periodeAVenir();
  etat.choix = p ? await api(`/api/choix/${encodeURIComponent(p.id)}`) : null;
}

// ---------- Petits composants ----------
const personnes = () => etat.donnees.foyer.personnes;
const nomDe = (code) => personnes().find((p) => p.code === code)?.nom ?? code;
const lieu = (code) => etat.donnees.foyer.lieux?.[code] ?? code;
const jourDe = (periode, id) => periode.jours.find((j) => j.id === id);
const parMoment = (a, b) => (a.moment === b.moment ? 0 : a.moment === "midi" ? -1 : 1);

// Niveau d'une alerte : icône dessinée + mot caché pour les lecteurs d'écran (la couleur ne suffit pas).
const NIVEAU_MOT = { interdit: "Interdit", attention: "Attention", info: "Info", ok: "Bon" };
const symbole = (niveau) =>
  `<span class="symbole">${icone(niveau === "ok" ? "ok" : niveau === "info" ? "info" : "alerte")}</span><span class="visuellement-cache">${NIVEAU_MOT[niveau]} : </span>`;

/** Qui mange où, regroupé par lieu : « J P G à la maison · P boîte froide ». */
function convivesTexte(convives) {
  const parLieu = new Map();
  for (const [c, l] of Object.entries(convives || {})) parLieu.set(l, [...(parLieu.get(l) || []), c]);
  return [...parLieu]
    .map(([l, codes]) => `<span class="convive">${codes.map((c) => `<b aria-label="${esc(nomDe(c))}">${esc(c)}</b>`).join(" ")} ${esc(lieu(l))}</span>`)
    .join("");
}

// Icônes dessinées (un seul trait, 2 px), jamais de caractères en guise d'icône.
const ICONES = {
  gauche: '<path d="M15 5l-7 7 7 7"/>',
  droite: '<path d="M9 5l7 7-7 7"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  alerte: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const icone = (nom) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;

// ---------- Horaire des repas : passés, prochain, suivants ----------
// Un repas est « passé » une fois son créneau fini ; le panneau affiche le premier qui ne l'est pas.
const FIN_CRENEAU = { midi: 14, soir: 22 };
const heureCourante = () => new Date().getHours();

function estPasse(date, moment) {
  const aujourdHui = isoDuJour();
  return date < aujourdHui || (date === aujourdHui && heureCourante() >= FIN_CRENEAU[moment]);
}

/** Repas datés des deux périodes, dans l'ordre : plat retenu (ou choisi, ou imposé). */
function repasDates() {
  const out = [];
  const c = periodeCourante();
  for (const r of c?.repas || []) {
    const j = jourDe(c, r.jour);
    if (j) out.push({ r, j, periode: c, nom: r.plat?.nom ?? null, ref: r.plat?.ref ?? null, numero: r.numero, note: r.plat?.note, reste: !!r.plat?.reste_de });
  }
  const a = periodeAVenir();
  const dejaVus = new Set(out.map((x) => x.j.date));
  for (const r of a?.repas || []) {
    const j = jourDe(a, r.jour);
    if (!j || dejaVus.has(j.date)) continue;
    const choix = etat.choix?.repas[r.id];
    const rec = etat.index.get(choix?.ref);
    out.push({ r, j, periode: a, nom: r.impose?.nom ?? rec?.nom ?? null, ref: r.impose?.ref ?? rec?.ref ?? null, numero: null, note: r.impose?.raison, reste: choix?.origine === "reste", aVenir: true });
  }
  return out.sort((x, y) => (x.j.date === y.j.date ? parMoment(x.r, y.r) : x.j.date < y.j.date ? -1 : 1));
}

const sansJour = (label) => label.split(" ").slice(1).join(" ");

function quand(x, { court = false } = {}) {
  const auj = isoDuJour();
  const demain = isoDuJour(new Date(Date.now() + 864e5));
  const m = x.r.moment;
  if (x.j.date === auj) return m === "midi" ? "Ce midi" : "Ce soir";
  if (x.j.date === demain) return m === "midi" ? "Demain midi" : "Demain soir";
  const jour = x.j.label.split(" ")[0];
  return court ? jour.slice(0, 3) + "." : `${jour} ${m}`;
}

/** Qui mange où : une ligne par personne du foyer, « pas là » quand elle n'est pas prévue. */
function quiOu(convives, { tous = true } = {}) {
  return personnes()
    .filter((p) => tous || convives?.[p.code])
    .map((p) => {
      const l = convives?.[p.code];
      return `<li class="${l ? "" : "absent"}"><b>${esc(p.code)}</b><span class="visuellement-cache">${esc(p.nom)} : </span>${l ? esc(lieu(l)) : "pas là"}</li>`;
    })
    .join("");
}

function badges(r) {
  if (!r) return "";
  const b = [];
  const t = r.drapeaux?.type;
  if (t) b.push(`<span class="badge type-${t}">${LIBELLE_TYPE[t]}</span>`);
  if (r.avis === "coup_de_coeur") b.push(`<span class="badge coeur">coup de cœur</span>`);
  if (r.avis === "banni") b.push(`<span class="badge banni">refusé</span>`);
  if (!r.historique?.deja_cuisinee) b.push(`<span class="badge nouveau">jamais faite</span>`);
  if (r.drapeaux?.froid) b.push(`<span class="badge">se mange froid</span>`);
  if (r.drapeaux?.soupe) b.push(`<span class="badge">soupe</span>`);
  return `<span class="badges">${b.join("")}</span>`;
}

function chiffres(r, portion = 1) {
  if (!r?.macros) return "";
  const m = r.macros;
  const incomplet = typeof r.couverture === "number" && r.couverture < 0.7;
  return `<span class="chiffres${incomplet ? " incomplet" : ""}" title="Par portion${incomplet ? " — macros incomplètes" : ""}">
    <span><b>${arrondi(m.prot * portion)}</b> g de protéines</span><span>${arrondi(m.kcal * portion)} kcal</span>${
      r.temps?.total ? `<span>${r.temps.total} min</span>` : ""}</span>`;
}

function alertesHtml(alertes) {
  const visibles = alertes.filter((a) => a.texte);
  if (!visibles.length) return "";
  return `<ul class="alertes">${visibles
    .map((a) => `<li class="niv-${a.niveau}">${symbole(a.niveau)}${esc(a.texte)}</li>`)
    .join("")}</ul>`;
}

function barresProteines(parPersonne) {
  if (!parPersonne) return "";
  const items = personnes().map((p) => {
    const d = parPersonne[p.code];
    if (!d || d.etat === "absent") return `<span class="prot absent" title="${esc(p.nom)} absent">${esc(p.code)} –</span>`;
    const libelle = { trop: "au-dessus du plafond", leger: "sous la cible", ok: "dans la cible" }[d.etat];
    const pct = Math.min(100, Math.round((d.total / (d.plafond || 120)) * 100));
    return `<span class="prot etat-${d.etat}" title="${esc(p.nom)} : ${d.total} g de protéines (${libelle}${d.estime ? ", cantine estimée" : ""}${d.incomplet ? ", un plat sans chiffres" : ""})">
      <b>${esc(p.code)}</b> ${d.total}${d.estime || d.incomplet ? "*" : ""} g<span class="prot-barre"><span style="width:${pct}%"></span></span></span>`;
  });
  return `<div class="proteines" aria-label="Protéines de la journée">${items.join("")}</div>`;
}

/** Couleur et motif d'anneau propres au numéro : on retrouve un plat d'un coup d'œil, même sans voir les couleurs. */
const teinte = (n) => `style="--c:${couleurPastille(n)}" data-motif="${motifPastille(n)}"`;

function pastille(n, classe = "") {
  return n == null ? "" : `<span class="pastille${classe ? ` ${classe}` : ""}" ${teinte(n)} role="img" aria-label="plat numéro ${n}">${n}</span>`;
}

const boutonFiche = (ref, libelle = "Recette", numero = null) =>
  ref && etat.index.has(ref)
    ? `<button type="button" class="lien" data-action="fiche" data-ref="${esc(ref)}"${numero != null ? ` data-numero="${numero}"` : ""}>${libelle}</button>`
    : "";

function toast(texte, niveau = "ok") {
  const t = $("#toast");
  t.textContent = texte;
  t.className = `toast visible niv-${niveau}`;
  clearTimeout(toast.minuterie);
  toast.minuterie = setTimeout(() => (t.className = "toast"), niveau === "ok" ? 2200 : 5000);
}

const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const dateLongue = (iso) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

// ---------- En-tête : qui suis-je ----------
function rendreMoi() {
  $("#moi").innerHTML =
    `<span class="moi-libelle">Je suis</span>` +
    personnes()
      .map((p) => `<button type="button" data-action="moi" data-code="${esc(p.code)}" aria-pressed="${etat.moi === p.code}" aria-label="${esc(p.nom)}"><span class="nom-court" aria-hidden="true">${esc(p.code)}</span><span class="nom-long" aria-hidden="true">${esc(p.nom)}</span></button>`)
      .join("");
}

function rendreCompteur() {
  const p = periodeAVenir();
  const n = p && etat.choix ? p.repas.filter((r) => !r.impose && !etat.choix.repas[r.id]?.ref).length : 0;
  const texte = n && choixOuverts() ? String(n) : "";
  for (const id of ["#nav-compteur", "#nav-compteur-bas"]) {
    const el = $(id);
    el.textContent = texte;
    if (texte) el.setAttribute("aria-label", `${texte} repas à choisir`);
    else el.removeAttribute("aria-label");
  }
}

/** Date limite des choix passée : on le dit, sans fermer (seul « batch cooking » clôt une période). */
const choixEnRetard = () => {
  const p = periodeAVenir();
  return !!(p?.date_limite_choix && choixOuverts() && Date.now() > new Date(p.date_limite_choix).getTime());
};

// ---------- Plats retenus par période ----------
function platsCourante() {
  const plats = {};
  for (const r of periodeCourante()?.repas || []) if (r.plat) plats[r.id] = { ref: r.plat.ref, portion: r.plat.portion ?? 1 };
  return plats;
}
function platsAVenir() {
  const plats = {};
  for (const [id, c] of Object.entries(etat.choix?.repas || {})) if (c.ref) plats[id] = { ref: c.ref, portion: c.portion ?? 1 };
  return plats;
}
const evaluer = (periode, plats) =>
  evaluerPeriode({ foyer: etat.donnees.foyer, preferences: etat.donnees.preferences, periode, plats, index: etat.index });

// ---------- Vue : accueil ----------
/** Le panneau : le prochain repas, en très grand, et qui mange où. */
function tableauProchain(x) {
  const c = periodeCourante();
  if (!x) {
    const a = periodeAVenir();
    return `<section class="tableau bascule" aria-labelledby="tableau-titre">
      <h2 class="tableau-moment volet" id="tableau-titre">Plus de repas prévu</h2>
      <p class="tableau-vide volet">${c ? `Le menu ${esc(c.titre.charAt(0).toLowerCase() + c.titre.slice(1))} est terminé.` : "Aucun menu reçu pour l'instant."}</p>
      <p class="volet">En attente du prochain envoi de « batch cooking ».</p>
      ${a && choixOuverts() ? `<div class="tableau-actions volet"><a class="bouton sur-quai" href="#/choisir">Choisir les repas à venir</a></div>` : ""}
    </section>`;
  }
  const notes = [
    x.reste ? "Reste du dîner de la veille" : "",
    x.note ?? "",
    x.aVenir && !x.nom ? "Repas pas encore choisi" : "",
  ].filter(Boolean);
  const agendaJour = x.j.agenda?.length ? x.j.agenda : [];
  // Le menu reçu est fini : on le dit en tête du panneau, pour ne pas laisser croire qu'il court encore.
  const fini = x.aVenir && c && c.jours.every((j) => j.date < isoDuJour());
  return `<section class="tableau bascule" aria-labelledby="tableau-titre">
    ${fini ? `<p class="tableau-repere volet">Menu du <s>${esc(sansJour(c.jours[0].label))} au ${esc(sansJour(c.jours.at(-1).label))}</s> terminé</p>` : ""}
    <div class="tableau-tete volet"><h2 class="tableau-moment" id="tableau-titre">${esc(quand(x))}</h2>${pastille(x.numero, "signal")}<span class="tableau-jour">${esc(x.j.label)}</span></div>
    <p class="tableau-plat volet">${esc(x.nom ?? "À choisir")}</p>
    ${notes.length || agendaJour.length ? `<p class="tableau-note volet">${[...notes, ...agendaJour].map(esc).join(" · ")}</p>` : ""}
    ${typeDuPlat(x)}
    <ul class="tableau-qui volet" aria-label="Qui mange où">${quiOu(x.r.convives)}</ul>
    <div class="tableau-actions volet">
      ${x.ref && etat.index.has(x.ref) ? `<button type="button" class="bouton signal" data-action="fiche" data-ref="${esc(x.ref)}"${x.numero != null ? ` data-numero="${x.numero}"` : ""}>Ouvrir la recette</button>` : ""}
    </div>
  </section>`;
}

/** Type du plat (viande, poisson, végétarien) : texte + teinte, jamais la couleur seule. */
function typeDuPlat(x) {
  const t = x.ref ? etat.index.get(x.ref)?.drapeaux?.type : null;
  return t && LIBELLE_TYPE[t] ? `<span class="badge type-${t}">${LIBELLE_TYPE[t]}</span>` : "";
}

/** Une ligne de départ : moment, numéro, plat, qui mange où. */
function ligneDepart(x, { prochain = false, jourVisible = true, details = "" } = {}) {
  const passe = estPasse(x.j.date, x.r.moment);
  return `<li class="depart${passe ? " passe" : ""}${prochain ? " prochain" : ""}">
    <span class="depart-quand">${esc(jourVisible ? quand(x, { court: true }) : LIBELLE_MOMENT[x.r.moment])}${
      jourVisible && !/^(Ce|Demain)/.test(quand(x)) ? `<small>${esc(LIBELLE_MOMENT[x.r.moment].toLowerCase())}</small>` : ""}${
      passe ? `<small class="poincon">passé</small>` : ""}</span>
    ${x.numero != null ? pastille(x.numero) : "<span></span>"}
    <div class="depart-plat">
      <p class="plat-nom">${esc(x.nom ?? "À choisir")}</p>
      <p class="depart-qui">${convivesTexte(x.r.convives)}</p>
      ${typeDuPlat(x)}
      ${details}
    </div>
  </li>`;
}

function vueAccueil() {
  const c = periodeCourante();
  const a = periodeAVenir();
  const avenir = repasDates().filter((x) => !estPasse(x.j.date, x.r.moment));
  const [prochain, ...suite] = avenir;
  const departs = suite.slice(0, 4);
  let choix = "";
  if (a) {
    const aChoisir = a.repas.filter((r) => !r.impose);
    const faits = aChoisir.filter((r) => etat.choix?.repas[r.id]?.ref).length;
    const pct = aChoisir.length ? Math.round((faits / aChoisir.length) * 100) : 100;
    choix = `<section class="etat-ligne" aria-labelledby="t-choix">
      <h2 id="t-choix">À choisir</h2>
      <p>${esc(a.titre)}</p>
      ${choixEnRetard() ? `<p class="bandeau niv-attention">Date limite passée (${esc(dateLongue(a.date_limite_choix))}) : les choix restent ouverts.</p>`
        : a.date_limite_choix && choixOuverts() ? `<p class="discret">Avant ${esc(dateLongue(a.date_limite_choix))}</p>` : ""}
      ${faits ? `<div class="progression" role="progressbar" aria-label="Repas choisis" aria-valuenow="${faits}" aria-valuemin="0" aria-valuemax="${aChoisir.length}"><span style="width:${pct}%"></span></div>` : ""}
      <p><b>${faits}</b> repas choisis sur ${aChoisir.length}${etat.choix?.statut === "termine" ? " · <b>la famille a fini</b>" : ""}</p>
      <a class="bouton" href="#/choisir">${a.statut === "close" ? "Voir les choix" : "Choisir les repas"}</a>
    </section>`;
  }
  const courses = c?.courses ? `<section class="etat-ligne" aria-labelledby="t-courses"><h2 id="t-courses">Courses</h2>${resumeCourses(c)}<a class="bouton secondaire" href="#/courses">Ouvrir la liste</a></section>` : "";
  return `<h1 class="visuellement-cache">Quick Cooking : prochain repas</h1><div class="accueil">
      ${tableauProchain(prochain)}
      ${departs.length ? `<section aria-labelledby="t-ensuite"><div class="section-tete"><h2 id="t-ensuite">Ensuite</h2><a class="lien" href="#/semaine">Toute la semaine</a></div>
        <ol class="departs">${departs.map((x) => ligneDepart(x)).join("")}</ol></section>` : ""}
      <div class="accueil-suite">${choix}${courses}</div>
    </div>${origineDonnees()}`;
}

function origineDonnees() {
  const d = etat.donnees;
  const a = etat.appareil;
  return `<p class="pied discret">Menus mis à jour le ${esc(dateLongue(d.genere_le))} · ${d.recettes.length} recettes dans la base${
    d.source?.includes("exemple") ? " · <b>données d'exemple</b>" : ""}</p>
    ${a ? `<details class="pied appareil"><summary class="discret">Cet appareil${a.nom ? ` : ${esc(a.nom)}` : ""}</summary>${formulaireAppareil(a)}</details>` : ""}`;
}

function formulaireAppareil(a) {
  return `<form class="form-appareil" data-action="nommer-appareil">
    <label class="champ"><span>Nom de cet appareil (ex. « Téléphone de Pauline »)</span>
      <input type="text" name="nom" maxlength="60" value="${esc(a.nom ?? "")}" placeholder="Téléphone, tablette de la cuisine…"></label>
    <button type="submit" class="bouton secondaire">Enregistrer le nom</button>
    <p class="discret petit">Identifiant : <code>${esc(a.id)}</code>${a.mode === "autorises" ? ` · ${a.autorise ? "autorisé" : "en attente d'autorisation"}` : ""}</p>
  </form>`;
}

/** Écran affiché quand le site n'accepte que les appareils autorisés. */
function vueAttente(a) {
  return `<section class="carte attente"><h1>Appareil en attente</h1>
    <p>Ce site n'est ouvert qu'aux appareils de la famille. Donnez un nom à celui-ci, puis demandez à Jérôme de l'autoriser.</p>
    ${formulaireAppareil(a)}</section>`;
}

/** Numéros du jour dans la bande de date : on repère d'un coup d'œil quels plats tombent ce jour-là. */
function platsDuJour(repas) {
  const nums = [...new Set(repas.map((r) => r.numero).filter((n) => n != null))];
  return nums.length ? `<span class="jour-plats">${nums.map((n) => pastille(n, "petite")).join("")}</span>` : "";
}

// ---------- Vue : semaine en cours ----------
function vueSemaine() {
  const p = periodeCourante();
  if (!p) return `<p class="vide">Pas encore de menu pour la période en cours.</p>`;
  const evalu = evaluer(p, platsCourante());
  const aujourdHui = isoDuJour();
  const prochainId = repasDates().find((x) => !estPasse(x.j.date, x.r.moment))?.r.id;
  const termine = p.jours.every((j) => j.date < aujourdHui);
  return `<header class="tete-page"><h1>${esc(p.titre)}</h1>
      ${termine ? `<p class="bandeau niv-attention">Ce menu est terminé. En attente du prochain envoi de « batch cooking ».</p>` : ""}
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}</header>
    <div class="jours">${p.jours.map((j) => {
      const repas = p.repas.filter((r) => r.jour === j.id).sort(parMoment);
      return `<section class="jour${j.date === aujourdHui ? " aujourdhui" : ""}" id="jour-${esc(j.id)}" aria-labelledby="t-${esc(j.id)}">
        <div class="jour-tete${j.date === aujourdHui ? " aujourdhui" : ""}"><h2 id="t-${esc(j.id)}">${esc(j.label)}</h2>${j.date === aujourdHui ? '<span class="marque-jour">aujourd\'hui</span>' : ""}${platsDuJour(repas)}</div>
        ${agenda(j)}
        <ol class="departs">${repas.map((r) => {
          const rec = etat.index.get(r.plat?.ref);
          const notes = [
            r.plat?.reste_de ? `<p class="plat-note reste">Reste du dîner de la veille</p>` : "",
            p.repas.some((m) => m.plat?.reste_de === r.id) ? `<p class="plat-note reste">Cuisiner aussi pour le midi du lendemain</p>` : "",
            r.plat?.note ? `<p class="plat-note">${esc(r.plat.note)}</p>` : "",
            r.plat?.portion && r.plat.portion !== 1 ? `<p class="plat-note">Portion ${r.plat.portion < 1 ? "légère" : "copieuse"}</p>` : "",
            rec ? `<p class="plat-meta">${boutonFiche(rec.ref, "Ouvrir la recette", r.numero)}${chiffres(rec, r.plat?.portion ?? 1)}</p>` : "",
            alertesHtml((evalu.parRepas[r.id] || []).filter((a) => a.niveau !== "info")),
          ].join("");
          const x = { r, j, nom: r.plat?.nom ?? "—", numero: r.numero };
          return ligneDepart(x, { prochain: r.id === prochainId, jourVisible: false, details: notes });
        }).join("")}</ol>
        ${evalu.parJour[j.id] ? `<details class="reperes-jour"><summary>Protéines du jour</summary>${barresProteines(evalu.parJour[j.id])}
          <p class="discret petit">* Estimation : repas à la cantine ou plat sans fiche. Des repères, pas des consignes.</p></details>` : ""}
      </section>`;
    }).join("")}</div>`;
}

const agenda = (j) => (j.agenda?.length ? `<ul class="agenda">${j.agenda.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "");

// ---------- Vue : courses ----------
// Cases partagées : enregistrées sur le serveur, visibles par toute la famille.
const cochees = () => new Set(Object.keys(etat.courses?.coches || {}));

async function chargerCourses() {
  const p = periodeCourante();
  etat.courses = p?.courses ? await api(`/api/courses/${encodeURIComponent(p.id)}`) : null;
}

async function cocher(id, coche) {
  const p = periodeCourante();
  const avant = structuredClone(etat.courses);
  if (coche) etat.courses.coches[id] = { par: etat.moi, le: new Date().toISOString() };
  else delete etat.courses.coches[id];
  try {
    etat.courses = await api(`/api/courses/${encodeURIComponent(p.id)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ coche, par: etat.moi }) });
  } catch (e) {
    etat.courses = avant;
    toast(`Case non enregistrée : ${e.message}`, "interdit");
    rafraichir();
  }
}

function resumeCourses(p, { brut = false } = {}) {
  const ids = [...(p.courses.a_verifier || []).map((a) => a.id), ...(p.courses.passages || []).flatMap((x) => x.sections.flatMap((s) => s.articles.map((a) => a.id)))];
  const faits = ids.filter((id) => cochees().has(id)).length;
  const texte = `<b>${faits}</b> / ${ids.length} lignes cochées`;
  return brut ? texte : `<p>${texte}</p>`;
}

function nomsPlats(numeros) {
  const p = periodeCourante();
  const html = (numeros || [])
    .map((n) => {
      const r = p.repas.find((x) => x.numero === n);
      return `<span class="pastille petite" ${teinte(n)} role="img" title="${esc(r?.plat?.nom ?? "")}" aria-label="plat ${n}${r?.plat?.nom ? ` : ${esc(r.plat.nom)}` : ""}">${n}</span>`;
    })
    .join("");
  return html ? `<span class="pour">${html}</span>` : "";
}

function vueCourses() {
  const p = periodeCourante();
  if (!p?.courses) return `<p class="vide">Pas de liste de courses pour la période en cours.</p>`;
  const c = p.courses;
  const faits = cochees();
  const qui = (id) => {
    const c = etat.courses?.coches?.[id];
    return c?.par ? ` <span class="coche-par" title="Coché par ${esc(nomDe(c.par))}">${esc(c.par)}</span>` : "";
  };
  const caseA = (id, contenu) => `<label class="case"><input type="checkbox" data-action="cocher" data-id="${esc(id)}" ${faits.has(id) ? "checked" : ""}><span>${contenu}${qui(id)}</span></label>`;
  return `<header class="tete-page"><h1>Courses</h1><p class="discret">${esc(p.titre)} · ${resumeCourses(p, { brut: true })}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
      <p class="discret">Les cases cochées sont partagées avec toute la famille. Les numéros renvoient aux plats de la semaine.</p></header>
    ${c.a_verifier?.length ? `<section class="courses-bloc"><h2>À vérifier à la maison</h2><ul class="liste-cases">${c.a_verifier.map((a) =>
      `<li>${caseA(a.id, `<b>${esc(a.libelle)}</b>${nomsPlats(a.pour)}${a.sinon ? `<br><span class="discret">Sinon : ${esc(a.sinon)}</span>` : ""}`)}</li>`).join("")}</ul></section>` : ""}
    ${(c.passages || []).map((x) => `<section class="courses-bloc"><h2>${esc(x.libelle)}</h2>${x.sections.map((s) => `<h3>${esc(s.titre)}</h3>
      <ul class="liste-cases">${s.articles.map((a) => `<li>${caseA(a.id, `${a.quantite ? `<span class="qte">${esc(a.quantite)}</span> ` : ""}<b>${esc(a.libelle)}</b>${nomsPlats(a.pour)}${
        a.note ? `<br><span class="discret">${esc(a.note)}</span>` : ""}`)}</li>`).join("")}</ul>`).join("")}</section>`).join("")}
    ${c.deja_maison?.length ? `<section class="courses-bloc"><h2>Déjà à la maison : ne pas racheter</h2><div class="table-defile"><table>
      <thead><tr><th>Produit</th><th>Où</th><th>Pour</th></tr></thead><tbody>${c.deja_maison.map((d) =>
        `<tr><td>${esc(d.produit)}</td><td>${esc(d.ou)}</td><td>${nomsPlats(d.pour)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    ${faits.size ? `<p><button type="button" class="bouton secondaire" data-action="decocher-tout">Tout décocher</button></p>` : ""}`;
}

// ---------- Vue : choisir la période à venir ----------
function vueChoisir() {
  const p = periodeAVenir();
  if (!p) return `<p class="vide">Pas de période à venir pour l'instant : le prochain menu n'a pas encore été proposé.</p>`;
  const ouvert = choixOuverts();
  const evalu = evaluer(p, platsAVenir());
  const aChoisir = p.repas.filter((r) => !r.impose);
  const faits = aChoisir.filter((r) => etat.choix.repas[r.id]?.ref).length;
  const introuvables = new Set();
  for (const r of p.repas) for (const o of r.options || []) if (!etat.index.has(o.ref)) introuvables.add(o.ref);

  const bilan = [...alertesAConsommer(), ...evalu.bilan];
  const respectes = bilan.filter((a) => a.niveau === "ok" && a.texte);
  const aSurveiller = bilan.filter((a) => a.niveau !== "ok");
  return `<header class="tete-page"><h1>${esc(p.titre)}</h1>
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}
      ${choixEnRetard() ? `<p class="bandeau niv-attention">Date limite passée (${esc(dateLongue(p.date_limite_choix))}). Les choix restent modifiables tant que « batch cooking » n'a pas clos la période.</p>` : ""}
      <p class="discret">${ouvert ? (p.date_limite_choix && !choixEnRetard() ? `À choisir avant ${esc(dateLongue(p.date_limite_choix))}.` : "") : "Les choix sont clos : le menu est en préparation."}
      ${etat.moi || !ouvert ? "" : ` <b>Touchez votre initiale en haut</b> pour signer vos choix.`}</p>
      ${faits ? `<div class="progression" role="progressbar" aria-label="Repas choisis" aria-valuenow="${faits}" aria-valuemin="0" aria-valuemax="${aChoisir.length}"><span style="width:${Math.round((faits / aChoisir.length) * 100)}%"></span></div>` : ""}
      <p><b>${faits}</b> repas choisis sur ${aChoisir.length}</p>
    </header>
    ${introuvables.size ? `<p class="bandeau niv-attention">Recettes proposées introuvables dans la base : ${[...introuvables].map(esc).join(", ")}</p>` : ""}
    <section class="bilan" aria-labelledby="t-bilan"><h2 id="t-bilan">Équilibre de la période</h2>
      ${faits ? `${alertesHtml(aSurveiller)}${respectes.length ? `<p class="respectes">${respectes.length} repère${respectes.length > 1 ? "s" : ""} respecté${respectes.length > 1 ? "s" : ""}</p>` : ""}`
        : `${alertesHtml(aSurveiller)}<p class="discret">Choisissez des repas pour voir l'équilibre.</p>`}
      ${respectes.length && faits ? `<details><summary>Voir les repères respectés</summary>${alertesHtml(respectes)}</details>` : ""}
      ${etat.donnees.preferences?.regles?.length ? `<details><summary>Règles de la famille</summary>${alertesHtml(etat.donnees.preferences.regles.map((r) => ({ niveau: r.niveau === "interdit" ? "interdit" : r.niveau === "attention" ? "attention" : "info", texte: r.libelle })))}</details>` : ""}
    </section>
    <div class="choisir-jours">${p.jours.map((j) => {
      const repas = p.repas.filter((r) => r.jour === j.id).sort(parMoment);
      return `<section class="jour choisir-jour" id="jour-${esc(j.id)}" aria-labelledby="t-${esc(j.id)}">
        <div class="jour-tete"><h2 id="t-${esc(j.id)}">${esc(j.label)}</h2></div>${agenda(j)}
        <div class="jour-repas">${repas.map((r) => carteChoixRepas(p, r, evalu, ouvert)).join("")}</div>
        ${evalu.parJour[j.id] ? `<details class="reperes-jour"><summary>Protéines du jour</summary>${barresProteines(evalu.parJour[j.id])}</details>` : ""}</section>`;
    }).join("")}</div>
    <section class="fin-choix">
      <h2>Un mot pour la préparation ?</h2>
      <label class="champ"><span>Commentaire pour toute la période</span>
        <textarea data-action="commentaire-general" rows="3" maxlength="2000" ${ouvert ? "" : "disabled"} placeholder="Ex. : samedi soir on est invités, pas de poisson cette fois…">${esc(etat.choix.commentaire_general)}</textarea></label>
      ${ouvert ? `<button type="button" class="bouton" data-action="statut" data-statut="${etat.choix.statut === "termine" ? "brouillon" : "termine"}">
        ${etat.choix.statut === "termine" ? "Rouvrir nos choix" : "On a fini de choisir"}</button>` : ""}
      <p class="discret">${etat.choix.statut === "termine" ? "Choix marqués comme terminés. " : ""}${etat.choix.mis_a_jour ? `Dernier enregistrement ${esc(dateLongue(etat.choix.mis_a_jour))}.` : "Rien d'enregistré pour l'instant."}</p>
    </section>`;
}

function carteChoixRepas(p, r, evalu, ouvert) {
  const tete = `<div class="repas-tete"><span class="moment">${LIBELLE_MOMENT[r.moment]}</span><span class="convives">${convivesTexte(r.convives)}</span></div>
    ${r.besoin ? `<p class="besoin">${esc(r.besoin)}</p>` : ""}`;
  if (r.impose) {
    return `<article class="repas-choix impose">${tete}<p class="plat-nom"><span class="badge">déjà décidé</span> ${esc(r.impose.nom)}</p><p class="plat-note">${esc(r.impose.raison ?? "")}</p>${boutonFiche(r.impose.ref)}</article>`;
  }
  const c = etat.choix.repas[r.id] || {};
  const contexte = { foyer: etat.donnees.foyer, preferences: etat.donnees.preferences };
  const refsOptions = (r.options || []).map((o) => o.ref);
  const estReste = c.origine === "reste";
  const remplacement = c.ref && !estReste && !refsOptions.includes(c.ref) ? etat.index.get(c.ref) : null;
  const rv = resteVeille(r, { ...contexte, periode: p, plats: platsAVenir(), index: etat.index });
  const veilleCourt = rv ? rv.veille.label.split(" ")[0].toLowerCase() : "";
  const optionReste = !rv ? "" : rv.possible
    ? `<li class="option option-reste${estReste ? " choisie" : ""}">
      <button type="button" class="option-bouton" data-action="choisir" data-repas="${esc(r.id)}" data-ref="${esc(rv.ref)}" data-origine="reste" aria-pressed="${estReste}" ${ouvert ? "" : "disabled"}>
        <span class="rond" aria-hidden="true"></span>
        <span class="option-texte"><span class="plat-nom"><span class="badge">reste</span> ${esc(rv.recette.nom)}</span>
          <span class="option-meta"><span class="pourquoi">Reste du dîner de ${esc(veilleCourt)} : en cuisiner ${rv.mangeurs} part${rv.mangeurs > 1 ? "s" : ""} de plus, rien à préparer ce midi</span>${chiffres(rv.recette)}</span>
        </span>
      </button>
    </li>`
    : `<li class="option option-reste indisponible">Reste du dîner de ${esc(veilleCourt)} : ${esc(rv.raison)}</li>`;

  // Trois propositions visibles ; les autres à un toucher (toujours visibles si l'une d'elles est choisie).
  const VISIBLES = 3;
  const valides = (r.options || []).filter((o) => etat.index.has(o.ref));
  const rangChoisi = valides.findIndex((o) => o.ref === c.ref && !estReste);
  const montrerTout = rangChoisi >= VISIBLES;
  const options = valides.map((o, i) => {
    const rec = etat.index.get(o.ref);
    const choisi = c.ref === o.ref && !estReste;
    const al = alertesRecette(rec, r, contexte).filter((a) => a.niveau !== "info");
    return `<li class="option${choisi ? " choisie" : ""}">
      <button type="button" class="option-bouton" data-action="choisir" data-repas="${esc(r.id)}" data-ref="${esc(o.ref)}" data-origine="option" aria-pressed="${choisi}" ${ouvert ? "" : "disabled"}>
        <span class="rond" aria-hidden="true"></span>
        <span class="option-texte"><span class="plat-nom">${esc(rec.nom)}${i === 0 ? ' <span class="badge reco">recommandé</span>' : ""}</span>
          <span class="option-meta">${o.pourquoi ? `<span class="pourquoi">${esc(o.pourquoi)}</span>` : ""}${badges(rec)}${chiffres(rec)}</span>
          ${al.length ? `<span class="option-alerte niv-${pire(al)}">${symbole(pire(al))} ${esc(al[0].texte)}</span>` : ""}
        </span>
      </button>
      ${boutonFiche(o.ref, "Recette")}
    </li>`;
  });
  const autres = options.length - VISIBLES;
  const listeOptions = autres > 0 && !montrerTout
    ? `${options.slice(0, VISIBLES).join("")}<li><details class="options-plus"><summary>Voir ${autres} autre${autres > 1 ? "s" : ""} proposition${autres > 1 ? "s" : ""}</summary>
        <ul class="options">${options.slice(VISIBLES).join("")}</ul></details></li>`
    : options.join("");

  const choisiRec = etat.index.get(c.ref);
  const details = choisiRec ? `<div class="choix-details">
      ${remplacement ? `<p class="remplacement"><span class="badge">remplacement</span> <b>${esc(remplacement.nom)}</b> ${badges(remplacement)} ${chiffres(remplacement, c.portion)} ${boutonFiche(remplacement.ref, "Recette")}</p>` : ""}
      ${alertesHtml(evalu.parRepas[r.id] || [])}
      <div class="portion" role="group" aria-label="Taille de portion">
        ${[[0.75, "Légère"], [1, "Normale"], [1.25, "Copieuse"]].map(([v, l]) =>
          `<button type="button" data-action="portion" data-repas="${esc(r.id)}" data-portion="${v}" aria-pressed="${(c.portion ?? 1) === v}" ${ouvert ? "" : "disabled"}>${l}</button>`).join("")}
      </div>
      <label class="champ"><span>Remarque</span><input type="text" maxlength="500" data-action="commentaire" data-repas="${esc(r.id)}" value="${esc(c.commentaire ?? "")}" placeholder="Ex. : sans champignons" ${ouvert ? "" : "disabled"}></label>
      ${c.par ? `<p class="choisi-par">Choisi par ${esc(nomDe(c.par))} ${c.le ? `à ${heure(c.le)}` : ""}</p>` : ""}
    </div>` : "";

  return `<article class="repas-choix${c.ref ? " fait" : ""}" id="repas-${esc(r.id)}">${tete}
    ${lendemainReste(p, r)}
    <ul class="options" aria-label="Propositions pour ce repas">${optionReste}${listeOptions}</ul>
    ${details}
    ${ouvert ? `<div class="repas-actions">
      <button type="button" class="bouton secondaire" data-action="remplacer" data-repas="${esc(r.id)}">Chercher une autre recette</button>
      ${c.ref ? `<button type="button" class="lien" data-action="vider" data-repas="${esc(r.id)}">Annuler le choix</button>` : ""}
    </div>` : ""}
  </article>`;
}

/** Sur un dîner : rappel quand le midi du lendemain en reprend les restes. */
function lendemainReste(p, r) {
  if (r.moment !== "soir") return "";
  const midis = p.repas.filter((m) => etat.choix.repas[m.id]?.origine === "reste" && etat.choix.repas[m.id]?.de === r.id);
  if (!midis.length) return "";
  const parts = midis.reduce((n, m) => n + Object.values(m.convives).filter((l) => l !== "c").length, 0);
  return `<p class="besoin reste">Cuisiner ${parts} part${parts > 1 ? "s" : ""} de plus pour le midi du lendemain</p>`;
}

async function enregistrerRepas(repasId, modif) {
  const p = periodeAVenir();
  const actuel = etat.choix.repas[repasId] || {};
  const corps = {
    ref: actuel.ref ?? null,
    origine: actuel.origine ?? null,
    portion: actuel.portion ?? 1,
    commentaire: actuel.commentaire ?? "",
    ...modif,
    par: etat.moi,
  };
  if (corps.ref === null) corps.origine = null;
  const avant = structuredClone(etat.choix);
  etat.choix.repas[repasId] = { ...actuel, ...corps, le: new Date().toISOString() };
  rafraichir();
  try {
    etat.choix = await api(`/api/choix/${encodeURIComponent(p.id)}/repas/${encodeURIComponent(repasId)}`, { method: "PUT", body: JSON.stringify(corps) });
  } catch (e) {
    etat.choix = avant;
    toast(`Non enregistré : ${e.message}`, "interdit");
  }
  rafraichir();
}

async function enregistrerPeriode(modif) {
  const p = periodeAVenir();
  try {
    etat.choix = await api(`/api/choix/${encodeURIComponent(p.id)}`, { method: "PUT", body: JSON.stringify({ ...modif, par: etat.moi }) });
  } catch (e) {
    toast(`Non enregistré : ${e.message}`, "interdit");
  }
  rafraichir();
}

// ---------- Recherche (page Recettes et tiroir de remplacement) ----------
function formulaireRecherche() {
  const c = etat.criteres;
  const sel = (nom, options) => `<select data-critere="${nom}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(c[nom]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const coche = (nom, l) => `<label class="filtre"><input type="checkbox" data-critere="${nom}" ${c[nom] ? "checked" : ""}> ${esc(l)}</label>`;
  const saison = etat.donnees.preferences?.saison;
  return `<form class="recherche" role="search" onsubmit="return false">
    <label class="champ"><span>Chercher un plat, un ingrédient, un livre</span>
      <input type="search" data-critere="texte" value="${esc(c.texte)}" placeholder="Ex. : poulet coco, potimarron, Cookeo…" autocomplete="off"></label>
    <div class="filtres">
      ${sel("type", [["", "Tous types"], ["viande", "Viande"], ["poisson", "Poisson"], ["vege", "Végétarien"]])}
      ${sel("tempsMax", [[0, "Tous temps"], [20, "≤ 20 min"], [30, "≤ 30 min"], [45, "≤ 45 min"]])}
      ${sel("appareil", [["", "Tous appareils"], ...appareilsConnus(etat.donnees.recettes).map((a) => [a, a])])}
      ${sel("protMin", [[0, "Protéines : toutes"], [15, "≥ 15 g"], [25, "≥ 25 g"]])}
      ${saison ? coche("saison", `De saison (${saison.toLowerCase()})`) : ""}
      ${coche("froid", "Se mange froid")}
      ${coche("jamais", "Jamais cuisinée")}
      ${coche("coeur", "Coups de cœur")}
      ${coche("congelable", "Congelable")}
      ${aConsommer().length ? coche("urgent", "Utilise un produit à consommer") : ""}
      ${articles().length ? coche("ecoule", "Écoule les stocks à finir") : ""}
      ${stockChoisi() ? `<button type="button" class="filtre actif" data-action="stock-retirer" title="Retirer ce filtre">Utilise : ${esc(stockChoisi().nom)} ${icone("fermer")}</button>` : ""}
    </div>
  </form>
  <p class="discret" id="nb-resultats"></p>
  <ul class="resultats" id="resultats"></ul>`;
}

function rendreResultats(racine) {
  const repas = etat.cible ? periodeAVenir()?.repas.find((r) => r.id === etat.cible) : null;
  const res = chercher(etat.donnees.recettes, etat.criteres, { foyer: etat.donnees.foyer, preferences: etat.donnees.preferences, stocks: articles(), aConsommer: aConsommer().map((x) => x.a), repas });
  const max = 60;
  $("#nb-resultats", racine).textContent = `${res.length} recette${res.length > 1 ? "s" : ""}${res.length > max ? ` — les ${max} premières` : ""}${repas ? " compatibles avec ce repas" : ""}`;
  $("#resultats", racine).innerHTML = res.slice(0, max).map(({ r, alertes, ecoules, urgents }) => `<li class="resultat">
      <div><p class="plat-nom">${esc(r.nom)}</p><p class="source">${esc(r.source?.libelle ?? "")}</p>
      <p class="option-meta">${badges(r)}${chiffres(r)}</p>
      ${urgents?.length ? `<p class="urgent-ligne">À consommer : ${urgents.map((a) => esc(a.nom)).join(", ")}</p>` : ""}
      ${ecoules?.length ? `<p class="ecoule">Écoule : ${ecoules.map((a) => esc(a.nom)).join(", ")}</p>` : ""}
      ${alertes.filter((a) => a.niveau === "attention").map((a) => `<p class="option-alerte niv-attention">${symbole("attention")}${esc(a.texte)}</p>`).join("")}</div>
      <div class="resultat-actions">
        ${repas ? `<button type="button" class="bouton" data-action="choisir" data-repas="${esc(repas.id)}" data-ref="${esc(r.ref)}" data-origine="recherche">Choisir</button>` : ""}
        <button type="button" class="bouton secondaire" data-action="fiche" data-ref="${esc(r.ref)}">Recette</button>
      </div></li>`).join("") || `<li class="vide">Aucune recette ne correspond. Retirez un filtre.</li>`;
}

function brancherRecherche(racine) {
  racine.querySelectorAll("[data-critere]").forEach((el) => {
    el.addEventListener(el.type === "search" ? "input" : "change", () => {
      const nom = el.dataset.critere;
      etat.criteres[nom] = el.type === "checkbox" ? el.checked : ["tempsMax", "protMin"].includes(nom) ? Number(el.value) : el.value;
      rendreResultats(racine);
    });
  });
  rendreResultats(racine);
}

function vueRecettes() {
  return `<header class="tete-page"><h1>Toutes les recettes</h1><p class="discret">${etat.donnees.recettes.length} fiches. La recherche ignore les accents ; tous les mots doivent apparaître.</p></header>${formulaireRecherche()}`;
}

function ouvrirTiroir(repasId) {
  const p = periodeAVenir();
  const r = p.repas.find((x) => x.id === repasId);
  const j = jourDe(p, r.jour);
  etat.cible = repasId;
  const corps = $("#tiroir-corps");
  corps.innerHTML = `<div class="fenetre-tete"><h2 id="tiroir-titre">Remplacer : ${esc(j.label)} ${LIBELLE_MOMENT[r.moment].toLowerCase()}</h2>
      <button type="button" class="fermer" data-action="fermer" aria-label="Fermer">×</button></div>
    <p class="convives">${convivesTexte(r.convives)}</p>${r.besoin ? `<p class="besoin">${esc(r.besoin)}</p>` : ""}
    <p class="discret">Les recettes interdites pour ce repas (boîte froide, goûts de chacun, plats refusés) sont déjà retirées.</p>
    ${formulaireRecherche()}`;
  brancherRecherche(corps);
  if (!$("#tiroir").open) $("#tiroir").showModal();
  $("input[type=search]", corps).focus();
}

// ---------- Fiche recette ----------
// La fiche en mode cuisine : ingrédients et étapes d'abord, en grand ; le reste replié.
const CUISINE = /ingr[ée]dient|instruction|[ée]tape|pr[ée]paration|recette|montage|cuisson/i;

function decouperFiche(md) {
  const lignes = String(md || "").replace(/\r/g, "").split("\n")
    .filter((l, i) => !(i < 3 && /^#\s/.test(l)))
    .filter((l) => !/^\*\*Source image/i.test(l.trim()));
  if (!lignes.some((l) => /^#{2,6}\s/.test(l))) return { cuisine: lignes.join("\n"), autres: "" };
  // Les fiches titrent leurs parties en ## ou en ### : on découpe au niveau le plus haut présent.
  const niveaux = lignes.map((l) => l.match(/^(#{2,6})\s/)?.[1].length).filter(Boolean);
  const niveau = niveaux.length ? Math.min(...niveaux) : 2;
  const titre = new RegExp(`^#{${niveau}}\\s+(.*)`);
  const intro = [];
  const sections = [];
  for (const l of lignes) {
    const m = l.match(titre);
    if (m) sections.push({ titre: m[1].trim(), lignes: [l] });
    else (sections.length ? sections[sections.length - 1].lignes : intro).push(l);
  }
  const md2 = (s) => s.lignes.join("\n");
  const cuisine = sections.filter((s) => CUISINE.test(s.titre));
  const autres = sections.filter((s) => !CUISINE.test(s.titre));
  if (!cuisine.length) return { cuisine: lignes.join("\n"), autres: "" };
  // De l'introduction, seuls les encadrés (astuce, attention) restent en tête ; le reste est replié.
  const encadres = [];
  const reste = [];
  let dansEncadre = false;
  for (const l of intro) {
    if (/^\s*>\s*\[!/.test(l)) dansEncadre = true;
    else if (!/^\s*>/.test(l)) dansEncadre = false;
    (dansEncadre ? encadres : reste).push(l);
  }
  return {
    cuisine: [encadres.join("\n"), ...cuisine.map(md2)].join("\n\n"),
    autres: [reste.join("\n"), ...autres.map(md2)].join("\n\n").trim(),
  };
}

// Garder l'écran allumé pendant qu'on cuisine (Screen Wake Lock, si le navigateur le permet).
let verrouEcran = null;
async function basculerEveil(bouton) {
  try {
    if (verrouEcran) {
      await verrouEcran.release();
      verrouEcran = null;
    } else {
      verrouEcran = await navigator.wakeLock.request("screen");
      verrouEcran.addEventListener("release", () => {
        verrouEcran = null;
        document.querySelectorAll(".eveil").forEach((b) => b.setAttribute("aria-pressed", "false"));
      });
    }
    bouton.setAttribute("aria-pressed", String(!!verrouEcran));
  } catch {
    toast("L'écran ne peut pas rester allumé sur cet appareil.", "attention");
  }
}

function ouvrirFiche(ref, numero = null) {
  const r = etat.index.get(ref);
  if (!r) return;
  const m = r.macros || {};
  const src = r.source || {};
  const { cuisine, autres } = r.contenu_md ? decouperFiche(r.contenu_md) : { cuisine: "", autres: "" };
  const ingredients = !r.contenu_md && r.ingredients?.length
    ? `<h3>Ingrédients</h3><ul>${r.ingredients.map((i) => `<li>${esc([i.qte, i.unite, i.item].filter((x) => x != null && x !== "").join(" "))}</li>`).join("")}</ul>`
    : "";
  $("#fiche-corps").innerHTML = `<div class="fenetre-tete"><div class="fiche-titre">${numero != null && numero !== "" ? pastille(numero, "grande") : ""}<h2 id="fiche-titre">${esc(r.nom)}</h2></div>
      <button type="button" class="fermer" data-action="fermer" aria-label="Fermer la recette">${icone("fermer")}</button></div>
    <div class="fiche-barre">
      ${"wakeLock" in navigator ? `<button type="button" class="bouton secondaire eveil" data-action="eveil" aria-pressed="${!!verrouEcran}">Garder l'écran allumé</button>` : ""}
      <span>${esc(r.portions ? `${r.portions} portion${Number(r.portions) > 1 ? "s" : ""}` : "")}</span>
      ${chiffres(r)}
    </div>
    ${r.avis_note ? `<p class="note">${esc(r.avis_note)}</p>` : ""}
    <div class="cuisine markdown">${cuisine ? rendreMarkdown(cuisine) : ingredients || `<p class="discret">Pas d'ingrédients ni d'étapes dans cette fiche.</p>`}</div>
    <details class="fiche-plus"><summary>Infos, macros et reste de la fiche</summary>
    <p class="source">${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.libelle || src.url)}</a>` : esc(src.libelle ?? "")}</p>
    <p>${badges(r)}</p>
    <dl class="fiche-infos">
      <div><dt>Portions</dt><dd>${esc(r.portions)}</dd></div>
      <div><dt>Temps</dt><dd>${r.temps?.total ? `${r.temps.total} min (${r.temps.actif ?? "?"} actives)` : "–"}</dd></div>
      <div><dt>Se garde</dt><dd>${r.conservation_jours != null ? `${r.conservation_jours} j au frigo` : "–"}${r.congelable ? " · congelable" : ""}</dd></div>
      <div><dt>Appareils</dt><dd>${esc((r.appareils || []).join(", ") || "–")}</dd></div>
      <div><dt>Saisons</dt><dd>${esc((r.saisons || []).join(", ") || "–")}</dd></div>
      <div><dt>Déjà faite</dt><dd>${r.historique?.deja_cuisinee ? esc((r.historique.semaines || []).join(", ") || "oui") : "jamais"}</dd></div>
    </dl>
    <div class="table-defile"><table class="macros"><caption>Par portion${typeof r.couverture === "number" && r.couverture < 0.7 ? ` — macros incomplètes (${Math.round(r.couverture * 100)} %)` : ""}</caption>
      <tr><th>Protéines</th><th>kcal</th><th>Glucides</th><th>Lipides</th><th>Fibres</th></tr>
      <tr><td>${arrondi(m.prot)} g</td><td>${arrondi(m.kcal)}</td><td>${arrondi(m.gluc)} g</td><td>${arrondi(m.lip)} g</td><td>${arrondi(m.fibres)} g</td></tr></table></div>
    ${autres ? `<div class="markdown">${rendreMarkdown(autres)}</div>` : ""}
    <p class="discret petit chemin-fiche">Fiche d'origine : ${esc(r.ref)}</p>
    </details>`;
  const d = $("#fiche");
  if (!d.open) d.showModal();
  d.querySelector(".fenetre-corps").scrollTop = 0;
  $(".fermer", d).focus();
}

// ---------- Panneau latéral : journée et stocks (toujours affiché) ----------
const articles = () => etat.donnees?.stocks?.articles || [];
const stockChoisi = () => articles().find((a) => a.id === etat.criteres.stockId) || null;

// ---------- Produits à consommer absolument (date limite proche, produit frais présent depuis longtemps) ----------
const aConsommer = () => articlesAConsommer(articles(), isoDuJour(), etat.donnees?.preferences?.seuils_stocks);
const dateCourte = (iso) => dateLocale(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const echeance = (u) => (u.reste < 0 ? `dépassé depuis le ${dateCourte(u.avant)}` : u.reste === 0 ? "aujourd'hui" : u.reste === 1 ? "demain" : `avant ${dateCourte(u.avant)}`);

/** Repas (de la période courante et de la période à venir) qui consomment l'article avant l'échéance. */
function couverture(article, avant) {
  const out = [];
  const sources = [[periodeCourante(), platsCourante()], [periodeAVenir(), etat.choix ? platsAVenir() : {}]];
  for (const [periode, plats] of sources) {
    if (!periode) continue;
    for (const id of repasAvantEcheance(article, avant, { periode, plats, index: etat.index })) {
      const rep = periode.repas.find((r) => r.id === id);
      out.push(`${jourDe(periode, rep.jour).label.split(" ").slice(0, 2).join(" ")} ${rep.moment}`);
    }
  }
  return out;
}

function aConsommerHtml() {
  const liste = aConsommer();
  if (!liste.length) return "";
  return `<section class="a-consommer" aria-label="À consommer absolument">
    <h3>À consommer absolument</h3>
    <ul>${liste.map(({ a, u }) => {
      const prevu = couverture(a, u.avant);
      return `<li class="urg-${u.niveau}${prevu.length ? " couvert" : ""}">
        <button type="button" class="stock-nom" data-action="stock" data-id="${esc(a.id)}">${esc(a.nom)}</button>
        <span class="urg-quand">${esc(echeance(u))} · ${esc(u.raison)}</span>
        <span class="urg-prevu">${prevu.length ? `Prévu : ${esc(prevu.join(", "))}` : "Aucun plat prévu d'ici là"}</span>
      </li>`;
    }).join("")}</ul>
  </section>`;
}

/** Alertes du bilan : produits à consommer sans plat prévu avant l'échéance. */
function alertesAConsommer() {
  return aConsommer()
    .filter(({ a, u }) => !couverture(a, u.avant).length)
    .map(({ a, u }) => ({ niveau: u.niveau === "urgent" ? "interdit" : "attention", texte: `${a.nom} : ${echeance(u)} (${u.raison}), aucun plat prévu` }));
}
const LIEUX_STOCK = [["frigo", "Frigo"], ["congelateur", "Congélateur"], ["cellier", "Cellier"]];

/** Période montrée dans le panneau : à venir sur la page « À choisir », courante ailleurs. */
function contexteCote() {
  if (etat.route === "choisir" && periodeAVenir() && etat.choix) return { periode: periodeAVenir(), plats: platsAVenir() };
  const c = periodeCourante();
  return c ? { periode: c, plats: platsCourante() } : null;
}

function jourSuivi(periode) {
  if (etat.jourSuivi?.periode === periode.id && jourDe(periode, etat.jourSuivi.jour)) return etat.jourSuivi.jour;
  const aujourdHui = periode.jours.find((j) => j.date === isoDuJour());
  return (aujourdHui || periode.jours[0])?.id;
}

function libelleRepas(plats, rep) {
  if (rep.plat) return rep.plat.nom;
  if (rep.impose) return rep.impose.nom;
  const r = etat.index.get(plats[rep.id]?.ref);
  return r ? r.nom : null;
}

function celluleMacro(valeur, { min, max } = {}) {
  let etatCase = "";
  if (max != null && valeur > max) etatCase = "trop";
  else if (min != null && valeur < min) etatCase = "leger";
  const titre = [min != null ? `cible ≥ ${min}` : "", max != null ? `plafond ${max}` : ""].filter(Boolean).join(" · ");
  const signe = etatCase === "trop" ? " ▲" : etatCase === "leger" ? " ▼" : "";
  return `<td class="${etatCase ? `etat-${etatCase}` : ""}"${titre ? ` title="${esc(titre)}"` : ""}>${arrondi(valeur)}${signe}</td>`;
}

function macrosJourHtml(parPersonne) {
  const lignes = personnes().map((p) => {
    const d = parPersonne?.[p.code];
    if (!d || d.etat === "absent") return `<tr><th scope="row">${esc(p.nom)}</th><td colspan="5" class="discret">absent</td></tr>`;
    const m = d.macros;
    return `<tr><th scope="row">${esc(p.nom)}${d.estime || d.incomplet ? "*" : ""}</th>
      ${celluleMacro(m.prot, { min: d.incomplet ? null : d.cible?.[0], max: d.plafond })}
      ${celluleMacro(m.kcal, { max: d.kcal_cible ? Math.round(d.kcal_cible * 1.15) : null })}
      ${celluleMacro(m.gluc)}${celluleMacro(m.lip)}
      ${celluleMacro(m.fibres, { min: d.incomplet ? null : d.fibres_min })}</tr>`;
  });
  return `<div class="table-defile"><table class="macros-jour"><thead><tr><th></th><th>Prot. g</th><th>kcal</th><th>Gluc.</th><th>Lip.</th><th>Fibres</th></tr></thead>
    <tbody>${lignes.join("")}</tbody></table></div>
    <p class="discret petit">Petit-déjeuner et Skyr compris. ▲ au-dessus du plafond, ▼ sous la cible. * cantine estimée ou plat sans chiffres.</p>`;
}

function stocksHtml(periode, plats) {
  const liste = articles();
  if (!liste.length) return "";
  const usage = usageStocks(liste, { periode, plats, index: etat.index });
  const lieu = etat.lieuStock;
  const compte = (l) => liste.filter((a) => a.lieu === l).length;
  const aFinir = liste.filter((a) => a.prioritaire && !usage[a.id].length);
  const ici = liste
    .filter((a) => a.lieu === lieu)
    .sort((a, b) => b.prioritaire - a.prioritaire || !!usage[b.id].length - !!usage[a.id].length || a.nom.localeCompare(b.nom, "fr"));
  const date = etat.donnees.stocks.mis_a_jour_le?.[lieu];
  const quand = (repasId) => {
    const rep = periode.repas.find((r) => r.id === repasId);
    return `${jourDe(periode, rep.jour).label.split(" ").slice(0, 2).join(" ")} ${rep.moment}`;
  };
  return `<section class="cote-stocks" aria-label="Stocks">
    <h3>Stocks</h3>
    ${aFinir.length ? `<p class="niv-attention cote-alerte">${aFinir.length} produit${aFinir.length > 1 ? "s" : ""} à finir sans plat prévu : ${aFinir.map((a) => esc(a.nom)).join(", ")}</p>` : ""}
    <div class="onglets" role="group" aria-label="Lieu">${LIEUX_STOCK.map(([v, l]) =>
      `<button type="button" data-action="lieu-stock" data-lieu="${v}" aria-pressed="${lieu === v}">${l} <span class="discret">${compte(v)}</span></button>`).join("")}</div>
    ${date ? `<p class="discret petit">Inventaire du ${esc(date)} · touchez un produit pour voir les recettes qui l'utilisent</p>` : ""}
    <ul class="liste-stocks">${ici.map((a) => {
      const u = usage[a.id];
      return `<li class="${a.prioritaire ? "prio" : ""}${u.length ? " utilise" : ""}">
        <button type="button" class="stock-nom" data-action="stock" data-id="${esc(a.id)}">${esc(a.nom)}</button>
        ${a.prioritaire && !u.length ? `<span class="badge a-finir">à finir</span>` : ""}
        <span class="stock-qte">${esc(a.quantite)}</span>
        ${u.length ? `<span class="stock-usage">→ ${u.map((id) => esc(quand(id))).join(", ")}</span>` : ""}
      </li>`;
    }).join("") || `<li class="discret">Rien de noté.</li>`}</ul>
  </section>`;
}

/** Protéines du jour par personne, en une ligne : la seule mesure gardée hors du panneau. */
function protLigne(p, d) {
  if (!d || d.etat === "absent") return `<span class="dock-prot"><b>${esc(p.code)}</b>–</span>`;
  const [bas] = d.cible || [];
  let e = "";
  if (d.plafond != null && d.macros.prot > d.plafond) e = "trop";
  else if (!d.incomplet && bas != null && d.macros.prot < bas) e = "leger";
  const mot = { trop: ", au-dessus du plafond", leger: ", sous la cible", "": "" }[e];
  return `<span class="dock-prot${e ? ` etat-${e}` : ""}"><b aria-label="${esc(p.nom)}">${esc(p.code)}</b>${d.incomplet || d.estime ? "≈" : ""}${arrondi(d.macros.prot)} g<span class="visuellement-cache"> de protéines${mot}</span></span>`;
}

/** Routes où les repères (macros, stocks) ont un sens. */
const ROUTES_REPERES = new Set(["semaine", "choisir"]);

function rendreCote() {
  const cote = $("#cote");
  const dock = $("#dock");
  const ctx = etat.donnees && ROUTES_REPERES.has(etat.route) && contexteCote();
  if (!ctx) {
    cote.hidden = dock.hidden = true;
    document.body.classList.remove("avec-dock", "avec-cote");
    return;
  }
  cote.hidden = dock.hidden = false;
  document.body.classList.add("avec-dock", "avec-cote");
  const { periode, plats } = ctx;
  const jourId = jourSuivi(periode);
  const i = periode.jours.findIndex((j) => j.id === jourId);
  const parJour = macrosParJour({ foyer: etat.donnees.foyer, periode, plats, index: etat.index })[jourId];
  const repasJour = periode.repas.filter((r) => r.jour === jourId).sort(parMoment);
  const pressants = aConsommer().filter(({ a, u }) => !couverture(a, u.avant).length);
  const label = periode.jours[i].label;

  dock.innerHTML = `<div class="dock-interieur">
    <button type="button" class="cote-nav" data-action="jour" data-pas="-1" ${i <= 0 ? "disabled" : ""} aria-label="Jour précédent">${icone("gauche")}</button>
    <button type="button" class="dock-ligne" data-action="cote-bascule" aria-expanded="${etat.coteOuvert}" aria-controls="cote">
      <span class="dock-jour">${esc(`${label.slice(0, 3)}. ${label.split(" ")[1] ?? ""}`)}</span>
      ${personnes().map((p) => protLigne(p, parJour?.[p.code])).join("")}
      ${pressants.length ? `<span class="dock-alerte">${pressants.length} à consommer</span>` : ""}
      <span class="dock-plus">${etat.coteOuvert ? "Fermer" : "Repères"}</span>
    </button>
    <button type="button" class="cote-nav" data-action="jour" data-pas="1" ${i >= periode.jours.length - 1 ? "disabled" : ""} aria-label="Jour suivant">${icone("droite")}</button>
  </div>`;

  cote.classList.toggle("ouvert", etat.coteOuvert);
  cote.innerHTML = `<div class="cote-detail" id="cote-detail">
      ${aConsommerHtml()}
      <div class="section-tete"><h2 class="cote-titre">${esc(label)}</h2>
        <span class="cote-fleches"><button type="button" class="cote-nav" data-action="jour" data-pas="-1" ${i <= 0 ? "disabled" : ""} aria-label="Jour précédent">${icone("gauche")}</button><button type="button" class="cote-nav" data-action="jour" data-pas="1" ${i >= periode.jours.length - 1 ? "disabled" : ""} aria-label="Jour suivant">${icone("droite")}</button></span></div>
      <ul class="cote-repas">${repasJour.map((r) => {
        const nom = libelleRepas(plats, r);
        return `<li><span class="moment">${LIBELLE_MOMENT[r.moment]}</span> ${nom ? esc(nom) : '<span class="discret">à choisir</span>'}</li>`;
      }).join("")}</ul>
      ${macrosJourHtml(parJour)}
      ${stocksHtml(periode, plats)}
    </div>`;
}

let verrouJour = 0;
let attenteDefilement = false;
/** Le panneau suit le jour dont la carte croise la ligne située au tiers de l'écran. */
function jourVisible() {
  attenteDefilement = false;
  if (Date.now() < verrouJour) return; // navigation par les flèches en cours
  const ctx = contexteCote();
  if (!ctx) return;
  const ligne = innerHeight / 3;
  const section = [...vue.querySelectorAll(".jour[id^='jour-']")].find((el) => {
    const r = el.getBoundingClientRect();
    return r.top <= ligne && r.bottom >= ligne;
  });
  const visible = section?.id.slice(5);
  if (!visible || !jourDe(ctx.periode, visible) || etat.jourSuivi?.jour === visible) return;
  etat.jourSuivi = { periode: ctx.periode.id, jour: visible };
  rendreCote();
}
addEventListener("scroll", () => {
  if (!attenteDefilement) {
    attenteDefilement = true;
    setTimeout(jourVisible, 60);
  }
}, { passive: true });
const suivreJours = () => setTimeout(jourVisible, 0);

function changerJour(pas) {
  const ctx = contexteCote();
  if (!ctx) return;
  const jours = ctx.periode.jours;
  const i = jours.findIndex((j) => j.id === jourSuivi(ctx.periode)) + pas;
  if (i < 0 || i >= jours.length) return;
  etat.jourSuivi = { periode: ctx.periode.id, jour: jours[i].id };
  verrouJour = Date.now() + 800;
  rendreCote();
  document.getElementById(`jour-${jours[i].id}`)?.scrollIntoView({ block: "start" });
}

/** Redessine le tiroir de remplacement ouvert (après un changement de filtre venu du panneau). */
function rafraichirTiroir() {
  if (etat.cible) ouvrirTiroir(etat.cible);
}

// ---------- Routeur ----------
const VUES = { "": vueAccueil, semaine: vueSemaine, courses: vueCourses, choisir: vueChoisir, recettes: vueRecettes };

function rafraichir({ defiler = false } = {}) {
  const route = (location.hash.replace(/^#\/?/, "").split("/")[0] || "");
  const nouvelle = route !== etat.route;
  etat.route = route;
  const fn = VUES[route] || vueAccueil;
  // Garde la position de lecture lors d'un simple rafraîchissement.
  const y = window.scrollY;
  vue.innerHTML = fn();
  if (route === "recettes") brancherRecherche(vue);
  document.querySelectorAll(".nav a, .onglets-bas a").forEach((a) => (a.dataset.route === route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  rendreMoi();
  rendreCompteur();
  if (nouvelle || defiler) {
    const aujourdHui = route === "semaine" && $(".jour.aujourdhui");
    if (aujourdHui) aujourdHui.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
    vue.focus({ preventScroll: true });
  } else window.scrollTo(0, y);
  if ($("#tiroir").open) rendreResultats($("#tiroir-corps"));
  rendreCote();
  suivreJours();
}

// ---------- Événements ----------
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) {
    if (ev.target.tagName === "DIALOG") ev.target.close(); // clic hors du panneau
    return;
  }
  const { action, repas, ref } = el.dataset;
  if (action === "fiche") ouvrirFiche(ref, el.dataset.numero ?? null);
  else if (action === "eveil") basculerEveil(el);
  else if (action === "recharger") location.reload();
  else if (action === "fermer") el.closest("dialog").close();
  else if (action === "jour") changerJour(Number(el.dataset.pas));
  else if (action === "cote-bascule") {
    etat.coteOuvert = !etat.coteOuvert;
    rendreCote();
  } else if (action === "lieu-stock") {
    etat.lieuStock = el.dataset.lieu;
    ecrireLocal("qc-lieu-stock", etat.lieuStock);
    rendreCote();
  } else if (action === "stock") {
    // Recettes qui utilisent ce produit : dans le tiroir si on remplace un repas, sinon page Recettes.
    etat.criteres = { ...CRITERES_VIDES, stockId: el.dataset.id };
    etat.coteOuvert = false;
    if ($("#tiroir").open) rafraichirTiroir();
    else if (location.hash === "#/recettes") rafraichir();
    else location.hash = "#/recettes";
  } else if (action === "stock-retirer") {
    etat.criteres.stockId = "";
    if (el.closest("#tiroir-corps")) rafraichirTiroir();
    else rafraichir();
  }
  else if (action === "moi") {
    etat.moi = etat.moi === el.dataset.code ? null : el.dataset.code;
    ecrireLocal("qc-moi", etat.moi);
    rafraichir();
  } else if (action === "choisir") {
    // Retoucher l'option déjà choisie ne la retire pas : « Annuler le choix » est là pour ça.
    const actuel = etat.choix.repas[repas];
    const deja = actuel?.ref === ref && (actuel.origine === "reste") === (el.dataset.origine === "reste");
    if ($("#tiroir").open) $("#tiroir").close();
    if (!deja) enregistrerRepas(repas, { ref, origine: el.dataset.origine });
  } else if (action === "vider") enregistrerRepas(repas, { ref: null, commentaire: "", portion: 1 });
  else if (action === "portion") enregistrerRepas(repas, { portion: Number(el.dataset.portion) });
  else if (action === "remplacer") ouvrirTiroir(repas);
  else if (action === "statut") enregistrerPeriode({ statut: el.dataset.statut });
  else if (action === "decocher-tout") {
    if (!confirm("Décocher toute la liste, pour toute la famille ?")) return;
    api(`/api/courses/${encodeURIComponent(periodeCourante().id)}`, { method: "DELETE" })
      .then((c) => { etat.courses = c; rafraichir(); })
      .catch((e) => toast(`Non enregistré : ${e.message}`, "interdit"));
  }
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.action === "cocher") cocher(el.dataset.id, el.checked); else if (el.dataset.action === "commentaire") enregistrerRepas(el.dataset.repas, { commentaire: el.value });
  else if (el.dataset.action === "commentaire-general") enregistrerPeriode({ commentaire_general: el.value });
});

document.addEventListener("submit", async (ev) => {
  if (ev.target.dataset.action !== "nommer-appareil") return;
  ev.preventDefault();
  try {
    etat.appareil = await api("/api/appareil", { method: "PUT", body: JSON.stringify({ nom: ev.target.nom.value }) });
    toast("Nom enregistré");
    if (etat.donnees) rafraichir();
  } catch (e) {
    toast(`Non enregistré : ${e.message}`, "interdit");
  }
});

$("#tiroir").addEventListener("close", () => (etat.cible = null));
$("#fiche").addEventListener("close", () => verrouEcran?.release().catch(() => {}));
// Le verrou d'écran tombe quand l'onglet passe en arrière-plan : on le reprend au retour.
document.addEventListener("visibilitychange", () => {
  const b = $("#fiche").open && $("#fiche .eveil[aria-pressed='true']");
  if (document.visibilityState === "visible" && b && !verrouEcran) basculerEveil(b);
});
window.addEventListener("hashchange", () => rafraichir());

// Les cases cochées par les autres apparaissent sans recharger (utile à deux dans le magasin).
setInterval(async () => {
  if (etat.route !== "courses" || document.hidden || !etat.courses) return;
  try {
    const neuf = await api(`/api/courses/${encodeURIComponent(periodeCourante().id)}`);
    if (neuf.mis_a_jour !== etat.courses.mis_a_jour) {
      etat.courses = neuf;
      rafraichir();
    }
  } catch {
    /* réseau coupé : on réessaiera */
  }
}, 10000);

// Les choix des autres membres de la famille apparaissent sans recharger.
setInterval(async () => {
  if (etat.route !== "choisir" || document.hidden || !periodeAVenir()) return;
  if (document.activeElement?.matches("input, textarea") || $("#tiroir").open) return;
  try {
    const neuf = await api(`/api/choix/${encodeURIComponent(periodeAVenir().id)}`);
    if (neuf.mis_a_jour !== etat.choix?.mis_a_jour) {
      etat.choix = neuf;
      rafraichir();
    }
  } catch {
    /* réseau coupé : on réessaiera */
  }
}, 30000);

// Hauteur de l'en-tête collant : le panneau latéral se cale juste dessous.
new ResizeObserver(([e]) => document.documentElement.style.setProperty("--entete-h", `${Math.ceil(e.target.getBoundingClientRect().height)}px`))
  .observe($(".entete"));
new ResizeObserver(([e]) => document.documentElement.style.setProperty("--dock-h", `${Math.ceil(e.target.getBoundingClientRect().height)}px`))
  .observe($("#dock"));

// ---------- Démarrage ----------
(async function demarrer() {
  try {
    etat.appareil = await api("/api/appareil");
    if (!etat.appareil.autorise) {
      vue.innerHTML = vueAttente(etat.appareil);
      return;
    }
    etat.donnees = await api("/api/donnees");
    etat.index = indexRecettes(etat.donnees.recettes);
    await Promise.all([chargerChoix(), chargerCourses()]);
    rafraichir({ defiler: true });
  } catch (e) {
    vue.innerHTML = `<section class="tableau"><h2 class="tableau-moment">Menus indisponibles</h2>
      <p class="tableau-vide">Le site n'a pas pu charger les menus (${esc(e.message)}).</p>
      <p>Vérifiez la connexion, puis réessayez.</p>
      <div class="tableau-actions"><button type="button" class="bouton signal" data-action="recharger">Réessayer</button></div></section>`;
  }
})();

