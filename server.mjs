// Serveur HTTP de Quick Cooking : fichiers statiques de public/ + API JSON. Aucune dépendance.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { avertissementsExport, ETIQUETTES, ID_RE, refsIntrouvables, SECTIONS, validerAvis, validerExport, validerMajPeriode, validerMajRepas, VERDICTS } from "./lib/contrat.mjs";
import { indexRecettes, resteVeille } from "./public/js/regles.js";
import { changerStatut, identifier, lister, MODE, peutUtiliser, renommer, STATUTS } from "./lib/appareils.mjs";
import {
  ALGORITHMES, connecter, consommerDefi, creerInvitation, emettreDefi, enregistrerPasskey, essaiAutorise, fermerSession, invitationUtilisable,
  listerPasskeys, passkey, revoquer, RP_ID, RP_ORIGIN, session, SESSION_MS, verifierAssertion, verifierClientData, verifierCreation,
} from "./lib/passkeys.mjs";
import { DATA_DIR, ecrireExport, lireAvis, lireChoix, lireCourses, lireExport, modifierAvis, modifierChoix, modifierCourses, modifierExport } from "./lib/stockage.mjs";

const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort > 0 ? process.argv[argPort + 1] : process.env.PORT || 80);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
// Jeton d'administration : dépôt de l'export et autorisation des appareils.
const IMPORT_TOKEN = process.env.IMPORT_TOKEN || "";
const LIMITE_EXPORT = 20 * 1024 * 1024;
const LIMITE_CHOIX = 16 * 1024;
const LIMITE_PASSKEY = 32 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const egal = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function envoyer(res, statut, corps, entetes = {}) {
  res.writeHead(statut, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...entetes,
  });
  res.end(corps);
}

const json = (res, statut, objet, entetes = {}) =>
  envoyer(res, statut, JSON.stringify(objet), { "Content-Type": TYPES[".json"], "Cache-Control": "no-store", ...entetes });

// ---------- Session (cookie de la passkey) ----------
const COOKIE = "qc_session";
const SECURE = !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(RP_ORIGIN);
const attributsCookie = `HttpOnly; SameSite=Strict; Path=/${SECURE ? "; Secure" : ""}`;
const cookieSession = (jeton) => ({ "Set-Cookie": `${COOKIE}=${jeton}; Max-Age=${SESSION_MS / 1000}; ${attributsCookie}` });
const COOKIE_EFFACE = { "Set-Cookie": `${COOKIE}=; Max-Age=0; ${attributsCookie}` };

function jetonSession(req) {
  for (const morceau of (req.headers.cookie || "").split(";")) {
    const i = morceau.indexOf("=");
    if (i > 0 && morceau.slice(0, i).trim() === COOKIE) return morceau.slice(i + 1).trim();
  }
  return null;
}

const adresse = (req) => req.headers["cf-connecting-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
// Écritures authentifiées par cookie : JSON exigé (avec SameSite=Strict, ferme la porte aux formulaires d'autres sites).
const corpsJson = (req) => req.method === "GET" || /^application\/json\b/i.test(req.headers["content-type"] || "");
const reponseAvis = (a) => ({ ...a, verdicts: Object.fromEntries(VERDICTS), etiquettes: Object.fromEntries(ETIQUETTES) });

function lireCorps(req, limite) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on("data", (m) => {
      taille += m.length;
      if (taille > limite) {
        reject(Object.assign(new Error("Corps trop volumineux"), { statut: 413 }));
        req.destroy();
      } else morceaux.push(m);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(morceaux).toString("utf8") || "null"));
      } catch {
        reject(Object.assign(new Error("JSON invalide"), { statut: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function estAdmin(req) {
  const [type, jeton] = (req.headers.authorization || "").split(" ");
  return Boolean(IMPORT_TOKEN) && type === "Bearer" && Boolean(jeton) && egal(jeton, IMPORT_TOKEN);
}

/** Les midis « reste de la veille » suivent le dîner de la veille ; s'il n'est plus possible, le choix est annulé. */
function suivreRestes(c, ctx) {
  for (const r of ctx.periode.repas) {
    const actuel = c.repas[r.id];
    if (actuel?.origine !== "reste") continue;
    const rv = resteVeille(r, ctx);
    if (rv?.possible) Object.assign(actuel, { ref: rv.ref, de: rv.de });
    else {
      Object.assign(actuel, { ref: null, origine: null });
      delete actuel.de;
    }
  }
}

/** Identifiants des cases de la liste de courses de la période courante. */
function idsCourses(periode) {
  const c = periode?.courses;
  if (!c) return new Set();
  return new Set([...(c.a_verifier || []).map((a) => a.id), ...(c.passages || []).flatMap((x) => x.sections.flatMap((s) => s.articles.map((a) => a.id)))]);
}

let gzipCache = { texte: null, gz: null, etag: null };
async function servirDonnees(req, res) {
  const exp = await lireExport();
  if (gzipCache.texte !== exp.texte) {
    gzipCache = {
      texte: exp.texte,
      gz: gzipSync(exp.texte),
      etag: `"${createHash("sha1").update(exp.texte).digest("hex").slice(0, 16)}"`,
    };
  }
  const entetes = { "Content-Type": TYPES[".json"], "Cache-Control": "no-cache", ETag: gzipCache.etag, Vary: "Accept-Encoding" };
  if (req.headers["if-none-match"] === gzipCache.etag) return envoyer(res, 304, "", entetes);
  if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return envoyer(res, 200, gzipCache.gz, { ...entetes, "Content-Encoding": "gzip" });
  return envoyer(res, 200, exp.texte, entetes);
}

async function periodeAVenir(id) {
  const exp = await lireExport();
  const p = exp.donnees.periode_a_venir;
  return p && p.id === id ? { p, exp } : null;
}

async function api(req, res, url) {
  const m = url.pathname.match(/^\/api\/(.+)$/)[1].split("/").map(decodeURIComponent);

  // ---------- Envoi des données par « batch cooking » (jeton IMPORT_TOKEN) ----------
  if (m[0] === "export") {
    if (!IMPORT_TOKEN) return json(res, 403, { erreur: "Envoi désactivé : IMPORT_TOKEN non configuré." });
    if (!estAdmin(req)) return json(res, 401, { erreur: "Jeton invalide." });
    const reponse = (e) => ({ ok: true, genere_le: e.genere_le, recettes: e.recettes.length, avertissements: avertissementsExport(e) });

    // Export complet
    if (m.length === 1 && req.method === "PUT") {
      const donnees = await lireCorps(req, LIMITE_EXPORT);
      const erreurs = validerExport(donnees);
      if (erreurs.length) return json(res, 400, { erreur: "Export invalide.", details: erreurs.slice(0, 50) });
      await ecrireExport(donnees);
      console.log(`export déposé : ${donnees.recettes.length} recettes, à venir = ${donnees.periode_a_venir?.id ?? "aucune"}`);
      return json(res, 200, { ...reponse(donnees), refs_introuvables: refsIntrouvables(donnees) });
    }

    // État de ce qui est en place
    if (m.length === 2 && m[1] === "etat" && req.method === "GET") {
      const exp = await lireExport();
      const e = exp.donnees;
      const a = e.periode_a_venir;
      const choix = a ? await lireChoix(a, e.genere_le) : null;
      return json(res, 200, {
        origine: exp.origine, genere_le: e.genere_le, sections_mises_a_jour: e.sections_mises_a_jour ?? {},
        recettes: e.recettes.length, articles_stock: e.stocks?.articles?.length ?? 0,
        periode_courante: e.periode_courante?.id ?? null, periode_a_venir: a?.id ?? null,
        choix: choix && { statut: choix.statut, choisis: Object.values(choix.repas).filter((r) => r.ref && r.origine !== "impose").length,
          a_choisir: a.repas.filter((r) => !r.impose).length, mis_a_jour: choix.mis_a_jour },
        avertissements: avertissementsExport(e),
      });
    }

    // Vérification à blanc : rien n'est écrit. ?section=stocks pour ne vérifier qu'une section.
    if (m.length === 2 && m[1] === "verifier" && req.method === "POST") {
      const section = url.searchParams.get("section");
      if (section && !SECTIONS.includes(section)) return json(res, 400, { erreur: `section : ${SECTIONS.join(", ")}.` });
      const corps = await lireCorps(req, LIMITE_EXPORT);
      const candidat = section ? { ...(await lireExport()).donnees, [section]: corps } : corps;
      const erreurs = validerExport(candidat);
      return json(res, 200, { valide: !erreurs.length, erreurs, avertissements: erreurs.length ? [] : avertissementsExport(candidat) });
    }

    // Une seule section (ex. les stocks après un inventaire, ou la période à venir)
    if (m.length === 2 && SECTIONS.includes(m[1]) && req.method === "PUT") {
      const corps = await lireCorps(req, LIMITE_EXPORT);
      const e = await modifierExport((copie) => {
        copie[m[1]] = corps;
        const erreurs = validerExport(copie);
        if (erreurs.length) throw Object.assign(new Error(`Section invalide : ${erreurs.slice(0, 10).join(" ")}`), { statut: 400 });
        copie.sections_mises_a_jour = { ...(copie.sections_mises_a_jour || {}), [m[1]]: new Date().toISOString() };
        return copie;
      });
      console.log(`section « ${m[1]} » mise à jour`);
      return json(res, 200, reponse(e));
    }
    return json(res, 404, { erreur: `Route inconnue. Sections : ${SECTIONS.join(", ")}.` });
  }

  // ---------- Administration des appareils (jeton IMPORT_TOKEN) ----------
  if (m[0] === "appareils") {
    if (!estAdmin(req)) return json(res, 401, { erreur: "Jeton d'administration requis." });
    if (m.length === 1 && req.method === "GET") return json(res, 200, { mode: MODE, appareils: await lister() });
    if (m.length === 2 && req.method === "PUT") {
      const corps = await lireCorps(req, LIMITE_CHOIX);
      if (!STATUTS.includes(corps?.statut)) return json(res, 400, { erreur: `statut : ${STATUTS.join(", ")}.` });
      const a = await changerStatut(m[1], corps.statut);
      return a ? json(res, 200, { id: m[1], ...a }) : json(res, 404, { erreur: "Appareil inconnu." });
    }
  }

  // ---------- Identité : passkeys, session, invitations (ouvertes même en mode « autorises ») ----------
  if (["session", "passkeys", "invitations"].includes(m[0])) {
    if (!corpsJson(req)) return json(res, 415, { erreur: "Content-Type: application/json attendu." });
    const jeton = jetonSession(req);
    const s = await session(jeton);
    const refusAdmin = () => json(res, s ? 403 : 401, { erreur: "Droit d'administration requis." });

    if (m[0] === "session" && m.length === 1) {
      if (req.method === "GET") return s ? json(res, 200, s, cookieSession(jeton)) : json(res, 200, { personne: null, admin: false });
      if (req.method === "DELETE") {
        await fermerSession(jeton);
        return json(res, 200, { personne: null, admin: false }, COOKIE_EFFACE);
      }
    }

    if (m[0] === "invitations" && m.length === 1 && req.method === "POST") {
      if (!s?.admin && !estAdmin(req)) return refusAdmin();
      return json(res, 200, await creerInvitation(s?.admin ? s.personne : "jeton"));
    }

    if (m[0] === "passkeys") {
      if (m[1] === "creation" && m[2] === "options" && m.length === 3 && req.method === "POST") {
        if (!essaiAutorise(adresse(req))) return json(res, 429, { erreur: "Trop d'essais : réessayez dans une minute." });
        const corps = await lireCorps(req, LIMITE_CHOIX);
        const p = ((await lireExport()).donnees.foyer?.personnes || []).find((x) => x.code === corps?.personne);
        if (!p) return json(res, 400, { erreur: "Personne inconnue du foyer." });
        if (!(await invitationUtilisable(corps.code))) return json(res, 400, { erreur: "Code d'invitation invalide ou expiré" });
        const nom = (typeof corps.nom === "string" ? corps.nom.trim().slice(0, 60) : "") || "Appareil sans nom";
        const challenge = emettreDefi("creation", { code: corps.code, personne: p.code, nom });
        return json(res, 200, {
          challenge, rp: { id: RP_ID, name: "Quick Cooking" },
          user: { id: randomBytes(16).toString("base64url"), name: `${p.nom} · Quick Cooking`, displayName: p.nom },
          pubKeyCredParams: ALGORITHMES.map((alg) => ({ type: "public-key", alg })),
          authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
          attestation: "none", timeout: 300000,
        });
      }
      if (m[1] === "creation" && m.length === 2 && req.method === "POST") {
        const rep = await lireCorps(req, LIMITE_PASSKEY);
        const { challenge } = verifierClientData(rep?.clientDataJSON, "webauthn.create");
        const d = consommerDefi(challenge, "creation");
        if (!d) return json(res, 400, { erreur: "Demande expirée : recommencez." });
        const nouveau = await enregistrerPasskey({ ...d, verif: verifierCreation(rep, challenge) });
        console.log(`passkey créée pour ${d.personne} (${d.nom})`);
        return json(res, 200, await session(nouveau), cookieSession(nouveau));
      }
      if (m[1] === "connexion" && m[2] === "options" && m.length === 3 && req.method === "POST")
        return json(res, 200, { challenge: emettreDefi("connexion"), rpId: RP_ID, userVerification: "required", timeout: 300000, allowCredentials: [] });
      if (m[1] === "connexion" && m.length === 2 && req.method === "POST") {
        const rep = await lireCorps(req, LIMITE_PASSKEY);
        const { challenge } = verifierClientData(rep?.clientDataJSON, "webauthn.get");
        if (!consommerDefi(challenge, "connexion")) return json(res, 400, { erreur: "Demande expirée : recommencez." });
        const pk = await passkey(rep.id);
        if (!pk || pk.revoquee_le) return json(res, 401, { erreur: "Passkey inconnue ou révoquée." });
        const nouveau = await connecter(rep.id, verifierAssertion(rep, pk, challenge));
        return json(res, 200, await session(nouveau), cookieSession(nouveau));
      }
      // Administration
      if (m.length === 1 && req.method === "GET") {
        if (!s?.admin && !estAdmin(req)) return refusAdmin();
        return json(res, 200, { passkeys: await listerPasskeys() });
      }
      if (m.length === 2 && req.method === "DELETE") {
        if (!s?.admin && !estAdmin(req)) return refusAdmin();
        const r = await revoquer(m[1]);
        if (!r) return json(res, 404, { erreur: "Passkey inconnue." });
        console.log(`passkey révoquée : ${r.personne} (${r.nom})`);
        return json(res, 200, r);
      }
    }
    return json(res, 404, { erreur: "Route inconnue." });
  }

  const appareil = await identifier(req);

  // ---------- Cet appareil : toujours accessible, pour savoir s'il est autorisé ----------
  if (m[0] === "appareil" && m.length === 1) {
    if (!appareil) return json(res, 400, { erreur: "En-tête X-Appareil manquant ou invalide." });
    if (req.method === "PUT") {
      const nom = (await lireCorps(req, LIMITE_CHOIX))?.nom;
      if (typeof nom !== "string" || nom.trim().length > 60) return json(res, 400, { erreur: "Nom : 60 caractères au plus." });
      Object.assign(appareil, await renommer(appareil.id, nom.trim() || null));
    }
    return json(res, 200, { id: appareil.id, nom: appareil.nom, statut: appareil.statut, mode: MODE, autorise: peutUtiliser(appareil) });
  }

  // « batch cooking » lit les choix avec son jeton d'administration, sans clé d'appareil.
  if (!peutUtiliser(appareil) && !estAdmin(req))
    return json(res, 403, { erreur: "Cet appareil attend d'être autorisé.", appareil: appareil?.id ?? null });

  if (m[0] === "donnees" && m.length === 1 && req.method === "GET") return servirDonnees(req, res);

  // ---------- Cases cochées des courses (période courante, partagées) ----------
  if (m[0] === "courses" && m[1]) {
    const periode = (await lireExport()).donnees.periode_courante;
    if (!periode || periode.id !== m[1]) return json(res, 404, { erreur: "Période courante inconnue." });
    if (m.length === 2 && req.method === "GET") return json(res, 200, await lireCourses(periode.id));
    if (m.length === 2 && req.method === "DELETE") return json(res, 200, await modifierCourses(periode.id, (c) => (c.coches = {})));
    if (m.length === 3 && req.method === "PUT") {
      if (!idsCourses(periode).has(m[2])) return json(res, 404, { erreur: "Ligne de courses inconnue." });
      const corps = await lireCorps(req, LIMITE_CHOIX);
      if (typeof corps?.coche !== "boolean") return json(res, 400, { erreur: "coche : true ou false." });
      const par = ["J", "P", "G"].includes(corps.par) ? corps.par : null;
      return json(res, 200, await modifierCourses(periode.id, (c) => {
        if (corps.coche) c.coches[m[2]] = { par, appareil: appareil?.id ?? null, le: new Date().toISOString() };
        else delete c.coches[m[2]];
      }));
    }
  }

  // ---------- Avis sur les plats de la période courante ----------
  if (m[0] === "avis") {
    const courante = (await lireExport()).donnees.periode_courante;
    if (req.method === "GET" && m.length <= 2) {
      const id = m[1] ?? courante?.id;
      if (!id || !ID_RE.test(id)) return json(res, 404, { erreur: "Période inconnue." });
      return json(res, 200, reponseAvis(await lireAvis(id)));
    }
    if (m.length === 3 && (req.method === "PUT" || req.method === "DELETE")) {
      if (!corpsJson(req)) return json(res, 415, { erreur: "Content-Type: application/json attendu." });
      const s = await session(jetonSession(req));
      if (!s) return json(res, 401, { erreur: "Connectez-vous avec votre passkey pour donner un avis." });
      if (!courante || m[1] !== courante.id) return json(res, 409, { erreur: "Cette période n'est plus en cours : ses avis sont figés." });
      const r = courante.repas.find((x) => x.id === m[2]);
      if (!r || !(r.plat?.ref || r.plat?.nom)) return json(res, 404, { erreur: "Repas inconnu ou sans plat." });
      if (req.method === "DELETE")
        return json(res, 200, reponseAvis(await modifierAvis(courante.id, (a) => {
          if (!a.repas[r.id]?.avis?.[s.personne]) return false;
          delete a.repas[r.id].avis[s.personne];
          if (!Object.keys(a.repas[r.id].avis).length) delete a.repas[r.id];
        })));
      const v = validerAvis(await lireCorps(req, LIMITE_CHOIX));
      if (v.erreur) return json(res, 400, { erreur: v.erreur });
      return json(res, 200, reponseAvis(await modifierAvis(courante.id, (a) => {
        const entree = (a.repas[r.id] ??= { avis: {} });
        // Copiés à l'écriture : l'avis reste lisible quand la période a quitté l'export.
        Object.assign(entree, { numero: r.numero ?? null, plat: { ref: r.plat.ref ?? null, nom: r.plat.nom ?? null } });
        const maintenant = new Date().toISOString();
        entree.avis[s.personne] = { ...v.valeur, cree_le: entree.avis[s.personne]?.cree_le ?? maintenant, mis_a_jour: maintenant };
      })));
    }
  }

  // ---------- Choix de la période à venir, sans connaître son id ----------
  if (m[0] === "choix" && m.length === 1 && req.method === "GET") {
    const e = (await lireExport()).donnees;
    if (!e.periode_a_venir) return json(res, 404, { erreur: "Pas de période à venir." });
    return json(res, 200, await lireChoix(e.periode_a_venir, e.genere_le));
  }


  if (m[0] === "choix" && m[1]) {
    const trouve = await periodeAVenir(m[1]);
    if (!trouve) return json(res, 404, { erreur: "Période à venir inconnue." });
    const { p, exp } = trouve;
    const genereLe = exp.donnees.genere_le;

    if (m.length === 2 && req.method === "GET") return json(res, 200, await lireChoix(p, genereLe));

    if (m.length === 2 && req.method === "PUT") {
      const { valeur, erreur } = validerMajPeriode(await lireCorps(req, LIMITE_CHOIX));
      if (erreur) return json(res, 400, { erreur });
      if (p.statut === "close") return json(res, 409, { erreur: "Les choix sont clos pour cette période." });
      return json(res, 200, await modifierChoix(p, genereLe, (c) => Object.assign(c, valeur)));
    }

    if (m.length === 4 && m[2] === "repas" && req.method === "PUT") {
      const def = p.repas.find((r) => r.id === m[3]);
      if (!def) return json(res, 404, { erreur: "Repas inconnu." });
      if (p.statut === "close") return json(res, 409, { erreur: "Les choix sont clos pour cette période." });
      const index = indexRecettes(exp.donnees.recettes);
      const corps = await lireCorps(req, LIMITE_CHOIX);
      let erreur = null;
      const choix = await modifierChoix(p, genereLe, (c) => {
        const ctx = { periode: p, plats: c.repas, index, foyer: exp.donnees.foyer, preferences: exp.donnees.preferences };
        // Reste du dîner de la veille : la recette est celle de la veille, calculée ici.
        if (corps?.origine === "reste" && corps.ref !== null) {
          const rv = resteVeille(def, ctx);
          if (!rv?.possible) return (erreur = rv?.raison ?? "Ce midi ne peut pas reprendre le dîner de la veille."), false;
          Object.assign(corps, { ref: rv.ref, de: rv.de });
        }
        const v = validerMajRepas(corps, def, new Set(index.keys()));
        if (v.erreur) return (erreur = v.erreur), false;
        c.repas[def.id] = { ...v.valeur, appareil: appareil?.id ?? null, le: new Date().toISOString() };
        c.export_genere_le = genereLe;
        suivreRestes(c, ctx);
      });
      return erreur ? json(res, 400, { erreur }) : json(res, 200, choix);
    }
  }
  return json(res, 404, { erreur: "Route inconnue." });
}

// Version des fichiers statiques : JS et CSS sont servis sous /v/<version>/…, cachés longtemps.
// Cloudflare impose un cache navigateur de 2 h aux .js : une nouvelle version change donc d'URL.
let versionStatique = null;
async function version() {
  if (versionStatique) return versionStatique;
  const h = createHash("sha256");
  const fichiers = (await readdir(PUBLIC, { recursive: true, withFileTypes: true })).filter((f) => f.isFile());
  for (const f of fichiers.map((f) => path.join(f.parentPath ?? f.path, f.name)).sort()) h.update(f).update(await readFile(f));
  return (versionStatique = h.digest("hex").slice(0, 10));
}

async function statique(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return envoyer(res, 405, "Méthode non autorisée");
  const v = await version();
  let chemin = url.pathname;
  let cache = "no-cache";
  const versionne = chemin.match(/^\/v\/([0-9a-f]{1,40})(\/.*)$/);
  if (versionne) {
    chemin = versionne[2];
    // Une ancienne version demandée reçoit le contenu actuel, sans cache.
    cache = versionne[1] === v ? "public, max-age=31536000, immutable" : "no-store";
  }
  if (chemin === "/" || chemin === "/index.html") {
    const html = (await readFile(path.join(PUBLIC, "index.html"), "utf8"))
      .replace('href="style.css"', `href="/v/${v}/style.css"`)
      .replace('src="js/app.js"', `src="/v/${v}/js/app.js"`);
    return envoyer(res, 200, req.method === "HEAD" ? "" : html, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache" });
  }
  const rel = decodeURIComponent(chemin).replace(/^\/+/, "");
  const fichier = path.resolve(PUBLIC, rel);
  if (!fichier.startsWith(PUBLIC + path.sep)) return envoyer(res, 404, "Introuvable");
  try {
    const contenu = await readFile(fichier);
    const type = TYPES[path.extname(fichier)] || "application/octet-stream";
    return envoyer(res, 200, req.method === "HEAD" ? "" : contenu, { "Content-Type": type, "Cache-Control": cache });
  } catch {
    return envoyer(res, 404, "Introuvable");
  }
}

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  try {
    if (url.pathname === "/healthz") return envoyer(res, 200, "ok", { "Content-Type": "text/plain" });
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await statique(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.statut || 500, { erreur: e.statut ? e.message : "Erreur interne." });
  }
});

serveur.listen(PORT, "0.0.0.0", async () => {
  const exp = await lireExport().catch((e) => ({ origine: `ERREUR ${e.message}` }));
  console.log(`Quick Cooking sur :${PORT} — données ${DATA_DIR} — export : ${exp.origine}` +
    ` — appareils : ${MODE} — passkeys : ${RP_ORIGIN}${IMPORT_TOKEN ? " — administration active" : ""}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => serveur.close(() => process.exit(0)));
