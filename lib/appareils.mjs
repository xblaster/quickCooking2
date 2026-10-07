// Registre des appareils. Chaque navigateur tire une clé aléatoire (gardée chez lui) et l'envoie dans
// l'en-tête X-Appareil. Le serveur ne garde que son empreinte. Pas d'authentification pour l'instant :
// en mode « libre » tout appareil peut lire et écrire, il est seulement enregistré. Le mode
// « autorises » (APPAREILS_MODE) réserve l'API aux appareils qu'un administrateur a autorisés.
import { createHash } from "node:crypto";
import { FICHIER_APPAREILS, lireJson, modifierFichier } from "./stockage.mjs";

export const MODE = process.env.APPAREILS_MODE === "autorises" ? "autorises" : "libre";
export const STATUTS = ["en_attente", "autorise", "refuse"];
const CLE_RE = /^[A-Za-z0-9_-]{32,128}$/;
const RAFRAICHIR_MS = 10 * 60 * 1000; // dernière visite notée au plus toutes les 10 min

const vide = () => ({ format: "quick-cooking/appareils", version: 1, appareils: {} });
let cache = null;

async function lire() {
  if (!cache) {
    const brut = await lireJson(FICHIER_APPAREILS);
    cache = brut && typeof brut.appareils === "object" ? brut : vide();
  }
  return cache;
}

function modifier(fn) {
  return modifierFichier(FICHIER_APPAREILS, lire, async (registre) => {
    const ecrire = fn(registre);
    cache = registre;
    return ecrire === false ? false : registre;
  });
}

export const idDeCle = (cle) => createHash("sha256").update(cle).digest("hex").slice(0, 16);

function resumeAgent(ua = "") {
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [nav, os].filter(Boolean).join(" · ") || "inconnu";
}

/**
 * Identifie l'appareil de la requête et l'enregistre s'il est nouveau.
 * Retourne null si la requête ne porte pas de clé valide.
 */
export async function identifier(req) {
  const cle = req.headers["x-appareil"];
  if (typeof cle !== "string" || !CLE_RE.test(cle)) return null;
  const id = idDeCle(cle);
  const registre = await lire();
  const connu = registre.appareils[id];
  const maintenant = new Date();
  if (connu && maintenant - new Date(connu.derniere_visite) < RAFRAICHIR_MS) return { id, ...connu };
  await modifier((r) => {
    r.appareils[id] = {
      nom: connu?.nom ?? null,
      agent: resumeAgent(req.headers["user-agent"]),
      statut: connu?.statut ?? "en_attente",
      premiere_visite: connu?.premiere_visite ?? maintenant.toISOString(),
      derniere_visite: maintenant.toISOString(),
    };
  });
  return { id, ...registre.appareils[id] };
}

export const peutUtiliser = (appareil) => MODE === "libre" || appareil?.statut === "autorise";

export async function renommer(id, nom) {
  await modifier((r) => {
    if (!r.appareils[id]) return false;
    r.appareils[id].nom = nom;
  });
  return (await lire()).appareils[id];
}

export async function changerStatut(id, statut) {
  let trouve = false;
  await modifier((r) => {
    if (!r.appareils[id]) return false;
    r.appareils[id].statut = statut;
    trouve = true;
  });
  return trouve ? (await lire()).appareils[id] : null;
}

export async function lister() {
  return (await lire()).appareils;
}
