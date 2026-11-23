// Test de bout en bout du serveur sur un port libre et un DATA_DIR temporaire.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dossier = mkdtempSync(path.join(tmpdir(), "qc-"));
const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
const exemple = JSON.parse(readFileSync(path.join(racine, "exemple", "export.json"), "utf8"));
let serveur;

before(async () => {
  serveur = spawn(process.execPath, ["server.mjs"], {
    cwd: racine,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dossier, IMPORT_TOKEN: "jeton-test", SITE_ORIGIN: "https://quick-cooking.lo2k.net" },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("serveur non démarré");
});
after(() => {
  serveur?.kill();
  rmSync(dossier, { recursive: true, force: true });
});

const CLE = "a".repeat(48);
// En-têtes posés par ingress-nginx après auth.lo2k.net : par défaut Jérôme, administrateur.
const qui = (personne, admin = false) => ({ "X-Auth-Personne": personne, "X-Auth-Admin": admin ? "1" : "0" });
const JEROME = qui("J", true);
const fetch2 = (chemin, options = {}, b = base) => fetch(b + chemin, { ...options, headers: { "X-Appareil": CLE, ...JEROME, ...(options.headers || {}) } });
const put = (chemin, corps, entetes = {}, b = base) =>
  fetch2(chemin, { method: "PUT", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps) }, b);

test("page d'accueil et données", async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  const d = await (await fetch2(`/api/donnees`)).json();
  assert.equal(d.format, "quick-cooking/export");
  assert.equal((await fetch(`${base}/../server.mjs`)).status, 404);
});

test("choix : toutes les clés, mise à jour d'un repas, refus des valeurs invalides", async () => {
  const p = exemple.periode_a_venir;
  const c = await (await fetch2(`/api/choix/${p.id}`)).json();
  assert.deepEqual(Object.keys(c.repas).sort(), p.repas.map((r) => r.id).sort());

  const libre = p.repas.find((r) => !r.impose);
  const ref = libre.options[1].ref;
  const rep = await put(`/api/choix/${p.id}/repas/${libre.id}`, { ref, origine: "option", portion: 1.25, commentaire: " test ", par: "P" });
  assert.equal(rep.status, 200);
  const apres = await rep.json();
  assert.equal(apres.repas[libre.id].ref, ref);
  assert.equal(apres.repas[libre.id].commentaire, "test");
  assert.ok(apres.mis_a_jour);

  assert.equal((await put(`/api/choix/${p.id}/repas/${libre.id}`, { ref: "inconnue" })).status, 400);
  assert.equal((await put(`/api/choix/${p.id}/repas/${libre.id}`, { ref, portion: 3 })).status, 400);
  const impose = p.repas.find((r) => r.impose);
  assert.equal((await put(`/api/choix/${p.id}/repas/${impose.id}`, { ref })).status, 400);
  assert.equal((await put(`/api/choix/autre/repas/x`, { ref })).status, 404);

  assert.equal((await put(`/api/choix/${p.id}`, { statut: "termine", commentaire_general: "Merci" })).status, 200);
  const fin = await (await fetch2(`/api/choix/${p.id}`)).json();
  assert.equal(fin.statut, "termine");
  assert.equal(fin.repas[libre.id].ref, ref, "le choix précédent est conservé");
});

test("écritures concurrentes sur deux repas : aucune perdue", async () => {
  const p = exemple.periode_a_venir;
  const libres = p.repas.filter((r) => !r.impose).slice(0, 6);
  await Promise.all(libres.map((r) => put(`/api/choix/${p.id}/repas/${r.id}`, { ref: r.options[0].ref, origine: "option" })));
  const c = await (await fetch2(`/api/choix/${p.id}`)).json();
  for (const r of libres) assert.equal(c.repas[r.id].ref, r.options[0].ref);
});

test("reste du dîner de la veille : midi de semaine, suit le dîner, annulé s'il disparaît", async () => {
  const p = exemple.periode_a_venir;
  const url = (id) => `/api/choix/${p.id}/repas/${id}`;
  const soir = p.repas.find((r) => r.id === "dim11-s");
  // Un dîner dont le reste convient au midi du lundi (boîte chaude de J, P à la maison).
  let ref = null;
  for (const o of soir.options) {
    assert.equal((await put(url(soir.id), { ref: o.ref, origine: "option" })).status, 200);
    if ((await put(url("lun12-m"), { origine: "reste", ref: "ignoree" })).status === 200) {
      ref = o.ref;
      break;
    }
  }
  assert.ok(ref, "au moins une option du dimanche soir peut servir le lundi midi");
  let c = await (await fetch2(`/api/choix/${p.id}`)).json();
  assert.deepEqual([c.repas["lun12-m"].ref, c.repas["lun12-m"].origine, c.repas["lun12-m"].de], [ref, "reste", "dim11-s"]);

  // Le dîner change : le midi suit (ou est annulé si le nouveau plat ne convient pas).
  const autre = soir.options.find((o) => o.ref !== ref).ref;
  c = await (await put(url(soir.id), { ref: autre, origine: "option" })).json();
  assert.ok(c.repas["lun12-m"].ref === autre || c.repas["lun12-m"].ref === null);

  // Plus de dîner : plus de reste.
  c = await (await put(url(soir.id), { ref: null })).json();
  assert.equal(c.repas["lun12-m"].ref, null);
  assert.equal(c.repas["lun12-m"].origine, null);
  const refus = await put(url("lun12-m"), { origine: "reste", ref });
  assert.equal(refus.status, 400);
  assert.match((await refus.json()).erreur, /dîner de la veille/);

  // Week-end : jamais proposé.
  assert.equal((await put(url("sam10-m"), { origine: "reste", ref })).status, 400);
});

test("dépôt d'export : jeton obligatoire, validation", async () => {
  assert.equal((await put("/api/export", exemple)).status, 401);
  assert.equal((await put("/api/export", { format: "x" }, { Authorization: "Bearer jeton-test" })).status, 400);
  const neuf = { ...exemple, genere_le: "2026-10-10T10:00:00+02:00" };
  const rep = await put("/api/export", neuf, { Authorization: "Bearer jeton-test" });
  assert.equal(rep.status, 200);
  const d = await (await fetch2(`/api/donnees`)).json();
  assert.equal(d.genere_le, neuf.genere_le);
});

test("courses : cases partagées, validation, remise à zéro", async () => {
  const p = exemple.periode_courante;
  const id = p.courses.a_verifier[0].id;
  // La personne vient de l'identité (ici Pauline), jamais du corps : « par: G » est ignoré.
  assert.equal((await put(`/api/courses/${p.id}/${id}`, { coche: true, par: "G" }, qui("P"))).status, 200);
  const c = await (await fetch2(`/api/courses/${p.id}`)).json();
  assert.equal(c.coches[id].par, "P");
  assert.ok(c.coches[id].appareil, "appareil noté");
  assert.equal((await put(`/api/courses/${p.id}/inconnu`, { coche: true })).status, 404);
  assert.equal((await put(`/api/courses/${p.id}/${id}`, { coche: "oui" })).status, 400);
  const vide = await (await fetch2(`/api/courses/${p.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } })).json();
  assert.deepEqual(vide.coches, {});
});

test("appareils : enregistrés, nommés, listés par l'administrateur", async () => {
  assert.equal((await fetch(`${base}/api/appareil`, { headers: JEROME })).status, 400, "sans clé d'appareil");
  const a = await (await put("/api/appareil", { nom: "Tablette cuisine" })).json();
  assert.equal(a.nom, "Tablette cuisine");
  assert.equal(a.mode, "libre");
  assert.equal(a.autorise, true);
  assert.equal((await fetch(`${base}/api/appareils`)).status, 401);
  const liste = await (await fetch(`${base}/api/appareils`, { headers: { Authorization: "Bearer jeton-test" } })).json();
  assert.equal(liste.appareils[a.id].nom, "Tablette cuisine");
  assert.ok(!JSON.stringify(liste).includes(CLE), "la clé brute n'est jamais stockée");
});

test("mode « autorises » : appareil bloqué jusqu'à autorisation", async () => {
  const dossier2 = mkdtempSync(path.join(tmpdir(), "qc-"));
  const port2 = PORT + 100;
  const b2 = `http://127.0.0.1:${port2}`;
  const s2 = spawn(process.execPath, ["server.mjs"], {
    cwd: racine, env: { ...process.env, PORT: String(port2), DATA_DIR: dossier2, IMPORT_TOKEN: "jeton-test", APPAREILS_MODE: "autorises" }, stdio: "pipe",
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${b2}/healthz`)).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const moi = await (await fetch2("/api/appareil", {}, b2)).json();
    assert.equal(moi.autorise, false);
    assert.equal((await fetch2("/api/donnees", {}, b2)).status, 403);
    assert.equal((await fetch2("/api/session", {}, b2)).status, 200, "identité accessible avant autorisation");
    const ok = await put(`/api/appareils/${moi.id}`, { statut: "autorise" }, { Authorization: "Bearer jeton-test" }, b2);
    assert.equal(ok.status, 200);
    assert.equal((await fetch2("/api/donnees", {}, b2)).status, 200);
  } finally {
    s2.kill();
    rmSync(dossier2, { recursive: true, force: true });
  }
});

test("API d'envoi : section seule, vérification à blanc, état, choix sans id", async () => {
  const admin = { Authorization: "Bearer jeton-test" };
  const stocks = { mis_a_jour_le: { frigo: "2026-10-07" }, articles: [
    { id: "f1", nom: "Épinards", lieu: "frigo", mots: ["epinard"], dlc: "2026-10-09", quantite: "300 g" },
  ] };
  // Vérification à blanc : rien n'est écrit
  const v = await (await fetch(`${base}/api/export/verifier?section=stocks`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify(stocks) })).json();
  assert.equal(v.valide, true);
  const mauvais = { articles: [{ id: "x", nom: "X", lieu: "garage", dlc: "9/10" }] };
  const v2 = await (await fetch(`${base}/api/export/verifier?section=stocks`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify(mauvais) })).json();
  assert.equal(v2.valide, false);
  assert.ok(v2.erreurs.some((e) => e.includes("lieu")) && v2.erreurs.some((e) => e.includes("dlc")));
  // Envoi d'une seule section
  assert.equal((await put("/api/export/stocks", mauvais, admin)).status, 400);
  assert.equal((await put("/api/export/stocks", stocks)).status, 401);
  const r = await put("/api/export/stocks", stocks, admin);
  assert.equal(r.status, 200);
  const d = await (await fetch2("/api/donnees")).json();
  assert.equal(d.stocks.articles[0].nom, "Épinards");
  assert.equal(d.recettes.length, exemple.recettes.length, "le reste de l'export est conservé");
  const etat = await (await fetch(`${base}/api/export/etat`, { headers: admin })).json();
  assert.ok(etat.sections_mises_a_jour.stocks);
  assert.equal(etat.articles_stock, 1);
  // « batch cooking » lit les choix avec son jeton, sans connaître l'id de la période
  const c = await (await fetch(`${base}/api/export/choix`, { headers: admin })).json();
  assert.equal(c.periode, exemple.periode_a_venir.id);
  const cId = await (await fetch(`${base}/api/export/choix/${exemple.periode_a_venir.id}`, { headers: admin })).json();
  assert.equal(cId.periode, exemple.periode_a_venir.id);
});

// ---------- Identité d'auth.lo2k.net, avis, routes machine ----------
const ADMIN = { Authorization: "Bearer jeton-test" };
const post = (chemin, corps, entetes = {}) =>
  fetch2(chemin, { method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps ?? {}) });
const supprimer = (chemin, entetes = {}) => fetch2(chemin, { method: "DELETE", headers: { "Content-Type": "application/json", ...entetes } });
const sansIdentite = (chemin, options = {}) => fetch(base + chemin, { ...options, headers: { "X-Appareil": CLE, ...(options.headers || {}) } });

test("identité : 401 sans en-tête valide, statiques et /healthz ouverts", async () => {
  assert.equal((await sansIdentite("/api/donnees")).status, 401, "sans identité");
  const refus = await (await sansIdentite("/api/donnees")).json();
  assert.match(refus.erreur, /auth\.lo2k\.net/);
  for (const mauvais of ["p; drop", "j", "ABCDEFGHI", "", "J-1", "J K"])
    assert.equal((await sansIdentite("/api/donnees", { headers: { "X-Auth-Personne": mauvais } })).status, 401, `valeur « ${mauvais} »`);
  for (const chemin of ["/api/choix/x", "/api/courses/x", "/api/avis", "/api/appareil", "/api/session"])
    assert.equal((await sansIdentite(chemin)).status, 401, chemin);
  assert.equal((await sansIdentite("/api/donnees", { headers: qui("P") })).status, 200);
  assert.equal((await sansIdentite("/healthz")).status, 200);
  assert.equal((await sansIdentite("/")).status, 200, "la page est protégée par l'Ingress, pas par le serveur");
});

test("session : lue dans les en-têtes, aucun cookie, anciennes routes retirées", async () => {
  const j = await fetch2("/api/session");
  assert.deepEqual(await j.json(), { personne: "J", admin: true });
  assert.equal(j.headers.get("set-cookie"), null);
  const p = await fetch2("/api/session", { headers: qui("P") });
  assert.deepEqual(await p.json(), { personne: "P", admin: false });
  assert.equal((await post("/api/passkeys/connexion", {})).status, 404);
  assert.equal((await post("/api/invitations", {})).status, 404);
  assert.equal((await supprimer("/api/session")).status, 404);
  assert.equal((await fetch2("/api/passkeys")).status, 404);
  // Un cookie, même valide ailleurs, ne vaut pas identité
  assert.equal((await sansIdentite("/api/session", { headers: { Cookie: "lo2k_auth=quelquechose; qc_session=x" } })).status, 401);
});

test("garde d'écriture : JSON exigé, origine du site seulement", async () => {
  const p = exemple.periode_courante;
  const id = p.courses.a_verifier[0].id;
  const url = `/api/courses/${p.id}/${id}`;
  const corps = JSON.stringify({ coche: true });
  const essai = (entetes) => fetch2(url, { method: "PUT", headers: entetes, body: corps });
  assert.equal((await essai({ "Content-Type": "text/plain" })).status, 415);
  assert.equal((await essai({ "Content-Type": "application/x-www-form-urlencoded" })).status, 415);
  assert.equal((await essai({ "Content-Type": "application/json", Origin: "https://noel.lo2k.net" })).status, 403);
  assert.equal((await essai({ "Content-Type": "application/json", Origin: "https://quick-cooking.lo2k.net.evil.example" })).status, 403);
  assert.equal((await essai({ "Content-Type": "application/json", Origin: "https://quick-cooking.lo2k.net" })).status, 200);
  assert.equal((await essai({ "Content-Type": "application/json" })).status, 200, "client sans Origin (hors navigateur)");
});

test("avis : identité obligatoire, un avis par personne, période figée ensuite", async () => {
  const p = exemple.periode_courante;
  const repas = p.repas.find((r) => r.plat?.ref);
  const url = `/api/avis/${p.id}/${repas.id}`;
  const G = qui("G");
  const J = qui("J", true);
  const putAvis = (corps, entetes) => put(url, corps, entetes);

  assert.equal((await sansIdentite(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict: "bien" }) })).status, 401);
  assert.equal((await putAvis({ verdict: "super" }, G)).status, 400);
  assert.equal((await putAvis({ verdict: "bof", commentaire: "x".repeat(501) }, G)).status, 400);
  assert.equal((await put(`/api/avis/${p.id}/inconnu`, { verdict: "bof" }, G)).status, 404);
  assert.equal((await put(`/api/avis/autre/${repas.id}`, { verdict: "bof" }, G)).status, 409);
  const sansJson = await fetch2(url, { method: "PUT", headers: { "Content-Type": "text/plain", ...G }, body: "{}" });
  assert.equal(sansJson.status, 415);

  assert.equal((await putAvis({ verdict: "bof", etiquettes: ["fade"], par: "J" }, G)).status, 200);
  const premier = await (await putAvis({ verdict: "coup_de_coeur", commentaire: "Moins de crème", etiquettes: ["recette_modifiee"] }, J)).json();
  assert.equal(premier.repas[repas.id].avis.G.verdict, "bof", "la personne vient de l'identité, pas du corps");
  assert.equal(premier.repas[repas.id].avis.J.verdict, "coup_de_coeur");
  const creeLe = premier.repas[repas.id].avis.J.cree_le;
  const modif = await (await putAvis({ verdict: "bien" }, J)).json();
  assert.equal(modif.repas[repas.id].avis.J.verdict, "bien");
  assert.equal(modif.repas[repas.id].avis.J.cree_le, creeLe);

  // Grégoire retire le sien : celui de Jérôme reste
  const retrait = await (await supprimer(url, G)).json();
  assert.deepEqual(Object.keys(retrait.repas[repas.id].avis), ["J"]);

  // Lecture par « batch cooking » : sous /api/export, jeton seul
  const lu = await (await fetch(`${base}/api/export/avis`, { headers: ADMIN })).json();
  assert.equal(lu.format, "quick-cooking/avis");
  assert.equal(lu.periode, p.id);
  assert.deepEqual(lu.repas[repas.id].plat, { ref: repas.plat.ref, nom: repas.plat.nom });
  assert.equal(lu.repas[repas.id].numero, repas.numero);
  assert.equal(lu.verdicts.coup_de_coeur, "Coup de cœur");
  assert.equal(lu.verdicts.pas_realise, "Pas réalisé");
  assert.equal(lu.etiquettes.recette_modifiee, "Recette modifiée");
  assert.deepEqual((await (await fetch(`${base}/api/export/avis/2000-01-01`, { headers: ADMIN })).json()).repas, {});

  // Nouvelle période courante : l'ancienne reste lisible, plus modifiable
  assert.equal((await put("/api/export/periode_courante", { ...p, id: "2099-01-01" }, ADMIN)).status, 200);
  assert.equal((await putAvis({ verdict: "bof" }, J)).status, 409);
  const ancienne = await (await fetch(`${base}/api/export/avis/${p.id}`, { headers: ADMIN })).json();
  assert.equal(ancienne.repas[repas.id].avis.J.verdict, "bien");
  assert.equal((await put("/api/export/periode_courante", p, ADMIN)).status, 200);
});

test("routes machine : le jeton seul compte, jamais les en-têtes d'identité", async () => {
  const forge = { "X-Auth-Personne": "J", "X-Auth-Admin": "1" };
  const sansJeton = (chemin, options = {}) => fetch(base + chemin, { ...options, headers: { "Content-Type": "application/json", ...forge, ...(options.headers || {}) } });
  assert.equal((await sansJeton("/api/export/etat")).status, 401, "identité forgée sans jeton");
  assert.equal((await sansJeton("/api/export/stocks", { method: "PUT", body: "{}" })).status, 401);
  assert.equal((await sansJeton("/api/export/choix")).status, 401);
  assert.equal((await sansJeton("/api/export/avis")).status, 401);
  assert.equal((await sansJeton("/api/export/choix", { headers: { Authorization: "Bearer faux" } })).status, 401);
  // Alias en lecture seule
  assert.equal((await fetch(`${base}/api/export/choix`, { method: "PUT", headers: { ...ADMIN, "Content-Type": "application/json" }, body: "{}" })).status, 404);
  assert.equal((await fetch(`${base}/api/export/avis`, { method: "DELETE", headers: { ...ADMIN, "Content-Type": "application/json" } })).status, 404);
  assert.equal((await fetch(`${base}/api/export/choix`, { headers: ADMIN })).status, 200);
  // Les routes du site, elles, ne reconnaissent pas le jeton seul
  assert.equal((await fetch(`${base}/api/choix`, { headers: ADMIN })).status, 401);
  assert.equal((await fetch(`${base}/api/avis`, { headers: ADMIN })).status, 401);
});

test("écriture machine d'un repas : PUT /api/export/choix/<période>/repas/<id> (jeton seul)", async () => {
  const p = exemple.periode_a_venir;
  const libre = p.repas.find((r) => !r.impose);
  const impose = p.repas.find((r) => r.impose);
  const ref = libre.options[2].ref;
  const url = (id = libre.id, periode = p.id) => `${base}/api/export/choix/${periode}/repas/${id}`;
  const machine = (u, corps, entetes = ADMIN, methode = "PUT") =>
    fetch(u, { method: methode, headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps) });

  // Corriger un choix : validé comme sur le site, marqué « via », sans appareil, `par` reporté
  const ok = await machine(url(), { ref, origine: "option", portion: 1.25, par: "G" });
  assert.equal(ok.status, 200);
  const r = (await ok.json()).repas[libre.id];
  assert.deepEqual([r.ref, r.origine, r.portion, r.par, r.via, r.appareil], [ref, "option", 1.25, "G", "batch-cooking", null]);
  assert.equal((await (await fetch(`${base}/api/export/choix`, { headers: ADMIN })).json()).repas[libre.id].via, "batch-cooking");

  // Vider une case : remise à zéro
  const vide = (await (await machine(url(), { ref: null })).json()).repas[libre.id];
  assert.deepEqual([vide.ref, vide.origine, vide.par], [null, null, null]);

  // Le jeton seul compte : en-têtes d'identité forgés sans jeton, ou faux jeton
  const forge = { "X-Auth-Personne": "J", "X-Auth-Admin": "1" };
  assert.equal((await machine(url(), { ref }, forge)).status, 401);
  assert.equal((await machine(url(), { ref }, { Authorization: "Bearer faux", ...forge })).status, 401);

  // Même validation que le site
  assert.equal((await machine(url(), { ref: "inconnue" })).status, 400);
  assert.equal((await machine(url(), { ref, portion: 3 })).status, 400);
  assert.equal((await machine(url(impose.id), { ref })).status, 400, "repas imposé");
  assert.equal((await machine(url("inexistant"), { ref })).status, 404);
  assert.equal((await machine(url(libre.id, "autre"), { ref })).status, 404);

  // Les autres écritures sous l'alias restent fermées
  assert.equal((await machine(`${base}/api/export/choix/${p.id}`, { statut: "termine" })).status, 404);
  assert.equal((await machine(`${base}/api/export/avis/${p.id}/repas/x`, { verdict: "bien" })).status, 404);
  assert.equal((await machine(url(), {}, ADMIN, "DELETE")).status, 404);
  assert.equal((await machine(url(), {}, ADMIN, "POST")).status, 404);

  // Période close : 409
  assert.equal((await put("/api/export/periode_a_venir", { ...p, statut: "close" }, ADMIN)).status, 200);
  try {
    assert.equal((await machine(url(), { ref })).status, 409);
  } finally {
    assert.equal((await put("/api/export/periode_a_venir", p, ADMIN)).status, 200);
  }

  // Une écriture du site reprend la main : plus de « via »
  await machine(url(), { ref, origine: "option", par: "G" });
  assert.equal((await put(`/api/choix/${p.id}/repas/${libre.id}`, { ref, origine: "option", par: "P" })).status, 200);
  const site = (await (await fetch2(`/api/choix/${p.id}`)).json()).repas[libre.id];
  assert.equal(site.via, undefined);
  assert.equal(site.par, "P");
});
