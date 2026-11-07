// Passkeys : vérification WebAuthn, défis, codes d'invitation (sans serveur HTTP).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fauxAuthentificateur } from "./webauthn-faux.mjs";

const dossier = mkdtempSync(path.join(tmpdir(), "qc-pk-"));
process.env.DATA_DIR = dossier;
process.env.RP_ID = "localhost";
process.env.RP_ORIGIN = "http://localhost:3000";
const pk = await import("../lib/passkeys.mjs");
const { validerAvis } = await import("../lib/contrat.mjs");
after(() => rmSync(dossier, { recursive: true, force: true }));

const refuse = (fn, motif) => assert.throws(fn, (e) => e.statut === 400 && motif.test(e.message));

test("défi : usage unique, type vérifié", () => {
  const c = pk.emettreDefi("connexion");
  assert.deepEqual(pk.consommerDefi(c, "connexion"), {});
  assert.equal(pk.consommerDefi(c, "connexion"), null, "rejoué");
  const c2 = pk.emettreDefi("creation", { personne: "J" });
  assert.equal(pk.consommerDefi(c2, "connexion"), null, "mauvais type");
  assert.equal(pk.consommerDefi("inconnu", "creation"), null);
});

test("création vérifiée pour ES256, Ed25519 et RS256", () => {
  for (const alg of [-7, -8, -257]) {
    const a = fauxAuthentificateur({ alg });
    const c = pk.emettreDefi("creation");
    const v = pk.verifierCreation(a.creer(c), c);
    assert.equal(v.id, a.id);
    assert.equal(v.alg, alg);
    const c2 = pk.emettreDefi("connexion");
    assert.equal(pk.verifierAssertion(a.signer(c2), { cle: v.cle, alg, compteur: 0 }, c2), 0);
  }
});

test("création refusée : origine, partie de confiance, vérification, défi, type", () => {
  const a = fauxAuthentificateur();
  const c = "defi-attendu";
  refuse(() => pk.verifierCreation(a.creer(c, { origine: "https://pirate.example" }), c), /Origine/);
  refuse(() => pk.verifierCreation(a.creer(c, { rp: "pirate.example" }), c), /Partie de confiance/);
  refuse(() => pk.verifierCreation(a.creer(c, { drapeaux: 0x01 }), c), /Vérification/);
  refuse(() => pk.verifierCreation(a.creer(c, { drapeaux: 0x04 }), c), /Présence/);
  refuse(() => pk.verifierCreation(a.creer("autre"), c), /Défi/);
  refuse(() => pk.verifierCreation(a.creer(c, { type: "webauthn.get" }), c), /Type/);
  refuse(() => pk.verifierCreation({ ...a.creer(c), publicKeyAlgorithm: -999 }, c), /Algorithme/);
  refuse(() => pk.verifierCreation({ ...a.creer(c), id: fauxAuthentificateur().id }, c), /incohérent/);
});

test("connexion refusée : signature altérée, autre clé, compteur qui recule", () => {
  const a = fauxAuthentificateur();
  const c = pk.emettreDefi("creation");
  const v = pk.verifierCreation(a.creer(c), c);
  const enr = { cle: v.cle, alg: v.alg, compteur: 0 };
  refuse(() => pk.verifierAssertion(a.signer("x", { altere: true }), enr, "x"), /Signature/);
  refuse(() => pk.verifierAssertion(fauxAuthentificateur().signer("x"), enr, "x"), /Signature/);
  assert.equal(pk.verifierAssertion(a.signer("x", { compteur: 7 }), enr, "x"), 7);
  refuse(() => pk.verifierAssertion(a.signer("x", { compteur: 7 }), { ...enr, compteur: 7 }, "x"), /Compteur/);
});

test("codes d'invitation : valides 24 h, usage unique, saisie souple", async () => {
  const { code, expire } = await pk.creerInvitation("jeton");
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  const h = (new Date(expire) - Date.now()) / 3600e3;
  assert.ok(h > 23.9 && h <= 24);
  assert.equal(await pk.invitationUtilisable(code.toLowerCase().replace("-", " ")), true);
  assert.equal(await pk.invitationUtilisable("ABCD-EFGH"), false);

  const a = fauxAuthentificateur();
  const c = pk.emettreDefi("creation");
  const jeton = await pk.enregistrerPasskey({ code, personne: "P", nom: "Téléphone", verif: pk.verifierCreation(a.creer(c), c) });
  assert.equal((await pk.session(jeton)).personne, "P");
  assert.equal(await pk.invitationUtilisable(code), false, "consommé");
  const b = fauxAuthentificateur();
  const c2 = pk.emettreDefi("creation");
  await assert.rejects(pk.enregistrerPasskey({ code, personne: "G", nom: "x", verif: pk.verifierCreation(b.creer(c2), c2) }), /invalide ou expiré/);
});

test("révocation : la session tombe, la passkey reste listée", async () => {
  const { code } = await pk.creerInvitation("J");
  const a = fauxAuthentificateur();
  const c = pk.emettreDefi("creation");
  const jeton = await pk.enregistrerPasskey({ code, personne: "J", nom: "Tablette", verif: pk.verifierCreation(a.creer(c), c) });
  const s = await pk.session(jeton);
  assert.equal(s.admin, true, "J est administrateur par défaut");
  await pk.revoquer(a.id);
  assert.equal(await pk.session(jeton), null);
  const liste = await pk.listerPasskeys();
  const r = liste.find((x) => x.id === a.id);
  assert.ok(r.revoquee_le);
  assert.ok(!("cle" in r), "pas de clé publique dans la liste");
  await assert.rejects(pk.connecter(a.id, 0), /révoquée/);
});

test("validerAvis : verdict obligatoire, étiquettes fermées, 500 caractères", () => {
  assert.deepEqual(validerAvis({ verdict: "bien", etiquettes: ["fade", "portion_petite"], commentaire: "  ok " }).valeur,
    { verdict: "bien", etiquettes: ["portion_petite", "fade"], commentaire: "ok" });
  assert.ok(validerAvis({}).erreur);
  assert.ok(validerAvis({ verdict: "super" }).erreur);
  assert.ok(validerAvis({ verdict: "bof", etiquettes: ["inconnue"] }).erreur);
  assert.ok(validerAvis({ verdict: "bof", etiquettes: ["fade", "fade"] }).erreur);
  assert.ok(validerAvis({ verdict: "bof", commentaire: "x".repeat(501) }).erreur);
  assert.ok(validerAvis({ verdict: "bof", commentaire: "x".repeat(500) }).valeur);
});
