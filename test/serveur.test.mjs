// Test de bout en bout du serveur sur un port libre et un DATA_DIR temporaire.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAuthentificateur } from "./webauthn-faux.mjs";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dossier = mkdtempSync(path.join(tmpdir(), "qc-"));
const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
const exemple = JSON.parse(readFileSync(path.join(racine, "exemple", "export.json"), "utf8"));
let serveur;

before(async () => {
  serveur = spawn(process.execPath, ["server.mjs"], {
    cwd: racine,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dossier, IMPORT_TOKEN: "jeton-test", RP_ID: "localhost", RP_ORIGIN: "http://localhost:3000" },
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
const fetch2 = (chemin, options = {}, b = base) => fetch(b + chemin, { ...options, headers: { "X-Appareil": CLE, ...(options.headers || {}) } });
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
  assert.equal((await put(`/api/courses/${p.id}/${id}`, { coche: true, par: "G" })).status, 200);
  const c = await (await fetch2(`/api/courses/${p.id}`)).json();
  assert.equal(c.coches[id].par, "G");
  assert.ok(c.coches[id].appareil, "appareil noté");
  assert.equal((await put(`/api/courses/${p.id}/inconnu`, { coche: true })).status, 404);
  assert.equal((await put(`/api/courses/${p.id}/${id}`, { coche: "oui" })).status, 400);
  const vide = await (await fetch2(`/api/courses/${p.id}`, { method: "DELETE" })).json();
  assert.deepEqual(vide.coches, {});
});

test("appareils : enregistrés, nommés, listés par l'administrateur", async () => {
  assert.equal((await fetch(`${base}/api/appareil`)).status, 400, "sans clé");
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
    assert.equal((await fetch2("/api/passkeys/connexion/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, b2)).status, 200);
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
  const c = await (await fetch(`${base}/api/choix`, { headers: admin })).json();
  assert.equal(c.periode, exemple.periode_a_venir.id);
});

// ---------- Passkeys, session, avis ----------
const ADMIN = { Authorization: "Bearer jeton-test" };
const post = (chemin, corps, entetes = {}) =>
  fetch2(chemin, { method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps ?? {}) });
const avecCookie = (cookie) => ({ Cookie: cookie });
const cookieDe = (rep) => rep.headers.get("set-cookie")?.split(";")[0];
const supprimer = (chemin, cookie) => fetch2(chemin, { method: "DELETE", headers: { "Content-Type": "application/json", ...avecCookie(cookie) } });

async function creerPasskey(personne, droits = ADMIN) {
  const inv = await post("/api/invitations", {}, droits);
  assert.equal(inv.status, 200);
  const { code } = await inv.json();
  const a = fauxAuthentificateur();
  const opt = await (await post("/api/passkeys/creation/options", { code, personne, nom: `Téléphone ${personne}` })).json();
  assert.equal(opt.rp.id, "localhost");
  assert.equal(opt.authenticatorSelection.userVerification, "required");
  const rep = await post("/api/passkeys/creation", a.creer(opt.challenge));
  assert.equal(rep.status, 200, await rep.clone().text());
  return { a, code, cookie: cookieDe(rep), entete: rep.headers.get("set-cookie"), session: await rep.json() };
}

test("passkeys : invitation, création, session, droits d'administration", async () => {
  assert.equal((await post("/api/invitations")).status, 401, "sans droit");
  assert.deepEqual(await (await fetch2("/api/session")).json(), { personne: null, admin: false });

  const j = await creerPasskey("J");
  assert.match(j.entete, /HttpOnly/);
  assert.match(j.entete, /SameSite=Strict/);
  assert.doesNotMatch(j.entete, /Secure/, "localhost en http");
  assert.deepEqual([j.session.personne, j.session.admin], ["J", true]);
  assert.equal((await (await fetch2("/api/session", { headers: avecCookie(j.cookie) })).json()).personne, "J");

  // Code consommé, personne inconnue
  const deja = await post("/api/passkeys/creation/options", { code: j.code, personne: "P" });
  assert.equal(deja.status, 400);
  assert.match((await deja.json()).erreur, /Code d'invitation invalide ou expiré/);
  const { code } = await (await post("/api/invitations", {}, avecCookie(j.cookie))).json();
  assert.equal((await post("/api/passkeys/creation/options", { code, personne: "X" })).status, 400);

  // Pauline : pas administratrice
  const p = await creerPasskey("P", avecCookie(j.cookie));
  assert.equal(p.session.admin, false);
  assert.equal((await post("/api/invitations", {}, avecCookie(p.cookie))).status, 403);
  assert.equal((await fetch2("/api/passkeys", { headers: avecCookie(p.cookie) })).status, 403);
  const liste = await (await fetch2("/api/passkeys", { headers: avecCookie(j.cookie) })).json();
  assert.deepEqual(liste.passkeys.map((x) => x.personne), ["J", "P"]);
  assert.ok(!JSON.stringify(liste).includes(p.cookie.split("=")[1]), "jeton de session jamais exposé");

  // Connexion de Pauline sur un autre onglet
  const opt = await (await post("/api/passkeys/connexion/options")).json();
  const cx = await post("/api/passkeys/connexion", p.a.signer(opt.challenge));
  assert.equal(cx.status, 200);
  const cookie2 = cookieDe(cx);
  assert.equal((await cx.json()).personne, "P");
  assert.equal((await post("/api/passkeys/connexion", p.a.signer(opt.challenge))).status, 400, "défi rejoué");
  const opt2 = await (await post("/api/passkeys/connexion/options")).json();
  assert.equal((await post("/api/passkeys/connexion", p.a.signer(opt2.challenge, { origine: "https://pirate.example" }))).status, 400);

  // Révocation par Jérôme : toutes les sessions de la passkey tombent, connexion refusée
  assert.equal((await supprimer(`/api/passkeys/${p.a.id}`, j.cookie)).status, 200);
  for (const c of [p.cookie, cookie2]) assert.equal((await (await fetch2("/api/session", { headers: avecCookie(c) })).json()).personne, null);
  const opt3 = await (await post("/api/passkeys/connexion/options")).json();
  assert.equal((await post("/api/passkeys/connexion", p.a.signer(opt3.challenge))).status, 401);

  // Déconnexion
  const out = await supprimer("/api/session", j.cookie);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await (await fetch2("/api/session", { headers: avecCookie(j.cookie) })).json()).personne, null);
});

test("avis : session obligatoire, un avis par personne, période figée ensuite", async () => {
  const p = exemple.periode_courante;
  const repas = p.repas.find((r) => r.plat?.ref);
  const url = `/api/avis/${p.id}/${repas.id}`;
  const putAvis = (corps, cookie) => put(url, corps, cookie ? avecCookie(cookie) : {});
  const g = await creerPasskey("G");
  const j = await creerPasskey("J");

  assert.equal((await putAvis({ verdict: "bien" })).status, 401);
  assert.equal((await putAvis({ verdict: "super" }, g.cookie)).status, 400);
  assert.equal((await putAvis({ verdict: "bof", commentaire: "x".repeat(501) }, g.cookie)).status, 400);
  assert.equal((await put(`/api/avis/${p.id}/inconnu`, { verdict: "bof" }, avecCookie(g.cookie))).status, 404);
  assert.equal((await put(`/api/avis/autre/${repas.id}`, { verdict: "bof" }, avecCookie(g.cookie))).status, 409);
  const sansJson = await fetch2(url, { method: "PUT", headers: { "Content-Type": "text/plain", ...avecCookie(g.cookie) }, body: "{}" });
  assert.equal(sansJson.status, 415);

  assert.equal((await putAvis({ verdict: "bof", etiquettes: ["fade"], par: "J" }, g.cookie)).status, 200);
  const premier = await (await putAvis({ verdict: "coup_de_coeur", commentaire: "Moins de crème", etiquettes: ["recette_modifiee"] }, j.cookie)).json();
  assert.equal(premier.repas[repas.id].avis.G.verdict, "bof", "la personne vient de la session, pas du corps");
  const creeLe = premier.repas[repas.id].avis.J.cree_le;
  const modif = await (await putAvis({ verdict: "bien" }, j.cookie)).json();
  assert.equal(modif.repas[repas.id].avis.J.verdict, "bien");
  assert.equal(modif.repas[repas.id].avis.J.cree_le, creeLe);

  // Grégoire retire le sien : celui de Jérôme reste
  const retrait = await (await supprimer(url, g.cookie)).json();
  assert.deepEqual(Object.keys(retrait.repas[repas.id].avis), ["J"]);

  // Lecture par « batch cooking »
  const lu = await (await fetch(`${base}/api/avis`, { headers: ADMIN })).json();
  assert.equal(lu.format, "quick-cooking/avis");
  assert.equal(lu.periode, p.id);
  assert.deepEqual(lu.repas[repas.id].plat, { ref: repas.plat.ref, nom: repas.plat.nom });
  assert.equal(lu.repas[repas.id].numero, repas.numero);
  assert.equal(lu.verdicts.coup_de_coeur, "Coup de cœur");
  assert.equal(lu.verdicts.pas_realise, "Pas réalisé");
  assert.equal(lu.etiquettes.recette_modifiee, "Recette modifiée");
  assert.deepEqual((await (await fetch(`${base}/api/avis/2000-01-01`, { headers: ADMIN })).json()).repas, {});

  // Nouvelle période courante : l'ancienne reste lisible, plus modifiable
  assert.equal((await put("/api/export/periode_courante", { ...p, id: "2099-01-01" }, ADMIN)).status, 200);
  assert.equal((await putAvis({ verdict: "bof" }, j.cookie)).status, 409);
  const ancienne = await (await fetch(`${base}/api/avis/${p.id}`, { headers: ADMIN })).json();
  assert.equal(ancienne.repas[repas.id].avis.J.verdict, "bien");
  assert.equal((await put("/api/export/periode_courante", p, ADMIN)).status, 200);
});

test("codes d'invitation : 10 essais par minute au plus", async () => {
  let statut = 0;
  for (let i = 0; i < 12 && statut !== 429; i++) statut = (await post("/api/passkeys/creation/options", { code: "AAAA-AAAA", personne: "J" })).status;
  assert.equal(statut, 429);
});
