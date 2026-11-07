// Passkeys (WebAuthn) liées à une personne du foyer, codes d'invitation et sessions.
// Vérification avec node:crypto seul : le navigateur fournit la clé publique en SPKI
// (response.getPublicKey()) et les données d'authentificateur, donc pas de CBOR à décoder.
// Le serveur ne garde que les clés publiques et les empreintes des codes et des jetons de session.
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { FICHIER_PASSKEYS, lireJson, modifierFichier } from "./stockage.mjs";

export const RP_ID = process.env.RP_ID || "quick-cooking.lo2k.net";
export const RP_ORIGIN = (process.env.RP_ORIGIN || `https://${RP_ID}`).replace(/\/+$/, "");
export const ADMINS = (process.env.ADMINS ?? "J").split(",").map((s) => s.trim()).filter(Boolean);
export const ALGORITHMES = [-7, -8, -257]; // ES256, Ed25519, RS256
export const SESSION_MS = 180 * 24 * 3600 * 1000;
const DEFI_MS = 5 * 60 * 1000;
const INVITATION_MS = 24 * 3600 * 1000;
const PURGE_MS = 30 * 24 * 3600 * 1000;
const RAFRAICHIR_MS = 10 * 60 * 1000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // base32 de Crockford

const sha = (x) => createHash("sha256").update(x).digest();
const empreinte = (x) => sha(x).toString("hex");
const b64 = (buf) => Buffer.from(buf).toString("base64url");
const erreur = (message, statut = 400) => Object.assign(new Error(message), { statut });
const estB64 = (s) => typeof s === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(s);
const deB64 = (s, champ) => {
  if (!estB64(s)) throw erreur(`${champ} : base64url attendu.`);
  return Buffer.from(s, "base64url");
};

// ---------- Registre ----------
const vide = () => ({ format: "quick-cooking/passkeys", version: 1, passkeys: {}, invitations: {}, sessions: {} });
let cache = null;

async function lire() {
  if (!cache) {
    const brut = await lireJson(FICHIER_PASSKEYS);
    cache = brut && typeof brut.passkeys === "object" ? { ...vide(), ...brut } : vide();
  }
  return cache;
}

function modifier(fn) {
  return modifierFichier(FICHIER_PASSKEYS, lire, async (registre) => {
    const ecrire = await fn(registre);
    cache = registre;
    return ecrire === false ? false : registre;
  });
}

// ---------- Défis (en mémoire : une seule réplique ; à déplacer dans le fichier s'il y en a deux) ----------
const defis = new Map();

export function emettreDefi(type, donnees = {}) {
  const maintenant = Date.now();
  for (const [c, d] of defis) if (d.expire < maintenant) defis.delete(c);
  const challenge = b64(randomBytes(32));
  defis.set(challenge, { type, donnees, expire: maintenant + DEFI_MS });
  return challenge;
}

/** Consomme le défi (usage unique) ; null s'il est inconnu, expiré ou d'un autre type. */
export function consommerDefi(challenge, type) {
  const d = defis.get(challenge);
  defis.delete(challenge);
  if (!d || d.type !== type || d.expire < Date.now()) return null;
  return d.donnees;
}

// ---------- Codes d'invitation ----------
export function normaliserCode(code) {
  if (typeof code !== "string") return "";
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

const invitationValide = (inv, maintenant = Date.now()) => inv && !inv.utilise_le && new Date(inv.expire).getTime() > maintenant;

export async function creerInvitation(par) {
  const octets = randomBytes(8);
  const brut = [...octets].map((o) => ALPHABET[o & 31]).join("");
  const expire = new Date(Date.now() + INVITATION_MS).toISOString();
  await modifier((r) => {
    const limite = Date.now() - PURGE_MS;
    for (const [h, inv] of Object.entries(r.invitations))
      if (new Date(inv.utilise_le || inv.expire).getTime() < limite) delete r.invitations[h];
    r.invitations[empreinte(brut)] = { cree_le: new Date().toISOString(), expire, utilise_le: null, par };
  });
  return { code: `${brut.slice(0, 4)}-${brut.slice(4)}`, expire };
}

export async function invitationUtilisable(code) {
  const n = normaliserCode(code);
  if (n.length !== 8) return false;
  return Boolean(invitationValide((await lire()).invitations[empreinte(n)]));
}

// Limite des essais de code : 10 par minute et par adresse.
const essais = new Map();
export function essaiAutorise(ip) {
  const maintenant = Date.now();
  const recents = (essais.get(ip) || []).filter((t) => maintenant - t < 60_000);
  if (recents.length >= 10) {
    essais.set(ip, recents);
    return false;
  }
  recents.push(maintenant);
  essais.set(ip, recents);
  return true;
}

// ---------- Vérification WebAuthn ----------
/** Vérifie clientDataJSON ; retourne { challenge }. */
export function verifierClientData(clientDataB64, type, origine = RP_ORIGIN) {
  let cd;
  try {
    cd = JSON.parse(deB64(clientDataB64, "clientDataJSON").toString("utf8"));
  } catch (e) {
    throw e.statut ? e : erreur("clientDataJSON illisible.");
  }
  if (cd?.type !== type) throw erreur("Type de réponse WebAuthn inattendu.");
  if (cd.origin !== origine) throw erreur("Origine refusée.");
  if (cd.crossOrigin === true) throw erreur("Origine croisée refusée.");
  if (!estB64(cd.challenge)) throw erreur("Défi absent.");
  return { challenge: cd.challenge };
}

/** Lit les 37 premiers octets d'authenticatorData et vérifie partie de confiance, présence et vérification. */
export function lireAuthData(authData, rpId = RP_ID) {
  if (authData.length < 37) throw erreur("authenticatorData trop court.");
  if (!authData.subarray(0, 32).equals(sha(rpId))) throw erreur("Partie de confiance refusée.");
  const drapeaux = authData[32];
  if (!(drapeaux & 0x01)) throw erreur("Présence de l'utilisateur non confirmée.");
  if (!(drapeaux & 0x04)) throw erreur("Vérification de l'utilisateur (empreinte, visage ou code) exigée.");
  return { drapeaux, compteur: authData.readUInt32BE(33) };
}

function cleDeSpki(spki, alg) {
  let cle;
  try {
    cle = createPublicKey({ key: spki, format: "der", type: "spki" });
  } catch {
    throw erreur("Clé publique illisible.");
  }
  const attendu = { [-7]: "ec", [-8]: "ed25519", [-257]: "rsa" }[alg];
  if (!attendu || cle.asymmetricKeyType !== attendu) throw erreur("Algorithme de clé non pris en charge.");
  return cle;
}

/**
 * Réponse de création : { id, clientDataJSON, authenticatorData, publicKey, publicKeyAlgorithm } (base64url).
 * Retourne { id, cle, alg, compteur } ou lève une erreur 400.
 */
export function verifierCreation(rep, challengeAttendu, { rpId = RP_ID, origine = RP_ORIGIN } = {}) {
  if (!rep || typeof rep !== "object") throw erreur("Réponse WebAuthn attendue.");
  const { challenge } = verifierClientData(rep.clientDataJSON, "webauthn.create", origine);
  if (challenge !== challengeAttendu) throw erreur("Défi inattendu.");
  const authData = deB64(rep.authenticatorData, "authenticatorData");
  const { drapeaux, compteur } = lireAuthData(authData, rpId);
  if (!(drapeaux & 0x40)) throw erreur("Données de passkey absentes.");
  const id = deB64(rep.id, "id");
  // Données attestées : aaguid (16) | longueur de l'identifiant (2) | identifiant
  if (authData.length < 55) throw erreur("authenticatorData incomplet.");
  const long = authData.readUInt16BE(53);
  if (!authData.subarray(55, 55 + long).equals(id)) throw erreur("Identifiant de passkey incohérent.");
  const alg = rep.publicKeyAlgorithm;
  if (!ALGORITHMES.includes(alg)) throw erreur("Algorithme de clé non pris en charge.");
  const spki = deB64(rep.publicKey, "publicKey");
  cleDeSpki(spki, alg);
  return { id: b64(id), cle: b64(spki), alg, compteur };
}

/** Vérifie une assertion de connexion contre la clé enregistrée ; retourne le nouveau compteur. */
export function verifierAssertion(rep, passkey, challengeAttendu, { rpId = RP_ID, origine = RP_ORIGIN } = {}) {
  if (!rep || typeof rep !== "object") throw erreur("Réponse WebAuthn attendue.");
  const { challenge } = verifierClientData(rep.clientDataJSON, "webauthn.get", origine);
  if (challenge !== challengeAttendu) throw erreur("Défi inattendu.");
  const authData = deB64(rep.authenticatorData, "authenticatorData");
  const { compteur } = lireAuthData(authData, rpId);
  const signe = Buffer.concat([authData, sha(deB64(rep.clientDataJSON, "clientDataJSON"))]);
  const signature = deB64(rep.signature, "signature");
  const cle = cleDeSpki(Buffer.from(passkey.cle, "base64url"), passkey.alg);
  const ok = passkey.alg === -8 ? verify(null, signe, cle, signature)
    : passkey.alg === -7 ? verify("sha256", signe, { key: cle, dsaEncoding: "der" }, signature)
    : verify("sha256", signe, cle, signature);
  if (!ok) throw erreur("Signature invalide.");
  // Passkeys synchronisées : compteur toujours 0. Sinon il doit croître.
  if ((compteur || passkey.compteur) && compteur <= passkey.compteur) throw erreur("Compteur de signature incohérent.");
  return compteur;
}

// ---------- Passkeys et sessions ----------
function nouvelleSession(r, passkeyId, personne) {
  const jeton = b64(randomBytes(32));
  const maintenant = new Date().toISOString();
  r.sessions[empreinte(jeton)] = { passkey: passkeyId, personne, cree_le: maintenant, vu_le: maintenant };
  return jeton;
}

/** Enregistre la passkey vérifiée, consomme le code et ouvre une session. Retourne le jeton de session. */
export async function enregistrerPasskey({ code, personne, nom, verif }) {
  let jeton = null;
  let refus = null;
  await modifier((r) => {
    const h = empreinte(normaliserCode(code));
    if (!invitationValide(r.invitations[h])) return (refus = "Code d'invitation invalide ou expiré"), false;
    if (r.passkeys[verif.id]) return (refus = "Cette passkey est déjà enregistrée."), false;
    const maintenant = new Date().toISOString();
    r.invitations[h].utilise_le = maintenant;
    r.passkeys[verif.id] = { personne, nom, cle: verif.cle, alg: verif.alg, compteur: verif.compteur, cree_le: maintenant, vu_le: maintenant, revoquee_le: null };
    jeton = nouvelleSession(r, verif.id, personne);
  });
  if (refus) throw erreur(refus);
  return jeton;
}

export async function passkey(id) {
  return typeof id === "string" ? (await lire()).passkeys[id] ?? null : null;
}

/** Après une assertion vérifiée : note l'usage et ouvre une session. */
export async function connecter(id, compteur) {
  let jeton = null;
  await modifier((r) => {
    const p = r.passkeys[id];
    if (!p || p.revoquee_le) return false;
    p.compteur = compteur;
    p.vu_le = new Date().toISOString();
    jeton = nouvelleSession(r, id, p.personne);
  });
  if (!jeton) throw erreur("Passkey révoquée ou inconnue.", 401);
  return jeton;
}

/** Session portée par le jeton du cookie, ou null. */
export async function session(jeton) {
  if (typeof jeton !== "string" || !jeton) return null;
  const h = empreinte(jeton);
  const r = await lire();
  const s = r.sessions[h];
  if (!s) return null;
  const p = r.passkeys[s.passkey];
  const maintenant = Date.now();
  if (!p || p.revoquee_le || maintenant - new Date(s.vu_le).getTime() > SESSION_MS) {
    await modifier((reg) => void delete reg.sessions[h]);
    return null;
  }
  if (maintenant - new Date(s.vu_le).getTime() > RAFRAICHIR_MS)
    await modifier((reg) => {
      if (!reg.sessions[h]) return false;
      reg.sessions[h].vu_le = new Date(maintenant).toISOString();
      reg.passkeys[s.passkey].vu_le = reg.sessions[h].vu_le;
    });
  return { personne: s.personne, passkey: s.passkey, nom: p.nom, admin: ADMINS.includes(s.personne) };
}

export async function fermerSession(jeton) {
  if (typeof jeton !== "string" || !jeton) return;
  const h = empreinte(jeton);
  await modifier((r) => (r.sessions[h] ? void delete r.sessions[h] : false));
}

/** Liste pour l'administration, sans les clés publiques. */
export async function listerPasskeys() {
  const r = await lire();
  return Object.entries(r.passkeys)
    .map(([id, p]) => ({ id, personne: p.personne, nom: p.nom, cree_le: p.cree_le, vu_le: p.vu_le, revoquee_le: p.revoquee_le }))
    .sort((a, b) => a.cree_le.localeCompare(b.cree_le));
}

export async function revoquer(id) {
  let trouve = null;
  await modifier((r) => {
    const p = r.passkeys[id];
    if (!p) return false;
    if (!p.revoquee_le) p.revoquee_le = new Date().toISOString();
    for (const [h, s] of Object.entries(r.sessions)) if (s.passkey === id) delete r.sessions[h];
    trouve = { id, ...p };
    delete trouve.cle;
  });
  return trouve;
}

export async function nombrePasskeys() {
  return Object.keys((await lire()).passkeys).length;
}
