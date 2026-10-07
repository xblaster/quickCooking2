// Lecture/écriture des fichiers JSON de DATA_DIR (petit volume) ; écritures atomiques et sérialisées.
//
//   DATA_DIR/
//   ├── export.json             export déposé par « batch cooking »
//   ├── choix/<periode>.json    choix de la famille pour la période à venir
//   ├── courses/<periode>.json  cases cochées de la liste de courses (partagées)
//   └── appareils.json          registre des appareils (clés hachées, statut)
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ID_RE, normaliserChoix } from "./contrat.mjs";

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(RACINE, "data"));
const EXEMPLE = path.join(RACINE, "exemple", "export.json");
const FICHIER_EXPORT = path.join(DATA_DIR, "export.json");

let cacheExport = null; // { donnees, texte, origine }

export async function lireJson(fichier) {
  try {
    return JSON.parse(await readFile(fichier, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function ecrireAtomique(fichier, objet) {
  await mkdir(path.dirname(fichier), { recursive: true });
  const tmp = `${fichier}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(objet, null, 1), "utf8");
  await rename(tmp, fichier);
}

// File d'attente par fichier : deux écritures simultanées ne s'écrasent pas.
const files = new Map();
/** Lit le fichier, applique `modifier` (qui peut renvoyer un nouvel objet), réécrit. */
export function modifierFichier(fichier, lire, modifier) {
  const precedent = files.get(fichier) || Promise.resolve();
  const suivant = precedent.catch(() => {}).then(async () => {
    const objet = await lire();
    const resultat = (await modifier(objet)) ?? objet;
    if (resultat !== false) await ecrireAtomique(fichier, resultat === true ? objet : resultat);
    return resultat === false || resultat === true ? objet : resultat;
  });
  files.set(fichier, suivant);
  return suivant;
}

/** Export courant : DATA_DIR/export.json, sinon l'exemple livré avec l'image. */
export async function lireExport() {
  if (cacheExport) return cacheExport;
  let donnees = await lireJson(FICHIER_EXPORT);
  let origine = "depose";
  if (!donnees) {
    donnees = await lireJson(EXEMPLE);
    origine = "exemple";
  }
  if (!donnees) throw new Error("Aucun export : ni DATA_DIR/export.json ni exemple/export.json.");
  cacheExport = { donnees, texte: JSON.stringify(donnees), origine };
  return cacheExport;
}

export async function ecrireExport(donnees) {
  await ecrireAtomique(FICHIER_EXPORT, donnees);
  cacheExport = { donnees, texte: JSON.stringify(donnees), origine: "depose" };
}

/**
 * Remplace une partie de l'export courant. `modifier(copie)` peut lever une erreur (avec `statut`)
 * pour refuser : rien n'est alors écrit.
 */
export async function modifierExport(modifier) {
  const resultat = await modifierFichier(FICHIER_EXPORT, async () => structuredClone((await lireExport()).donnees), modifier);
  cacheExport = { donnees: resultat, texte: JSON.stringify(resultat), origine: "depose" };
  return resultat;
}

const fichierPeriode = (dossier, id) => {
  if (!ID_RE.test(id)) throw new Error("id de période invalide");
  return path.join(DATA_DIR, dossier, `${id}.json`);
};

// ---------- Choix de la période à venir ----------
export async function lireChoix(periode, genereLe) {
  return normaliserChoix(periode, await lireJson(fichierPeriode("choix", periode.id)), genereLe);
}

export function modifierChoix(periode, genereLe, modifier) {
  return modifierFichier(fichierPeriode("choix", periode.id), () => lireChoix(periode, genereLe), (choix) => {
    modifier(choix);
    choix.mis_a_jour = new Date().toISOString();
    return choix;
  });
}

// ---------- Cases cochées des courses (période courante) ----------
const coursesVides = (id) => ({ format: "quick-cooking/courses", version: 1, periode: id, coches: {}, mis_a_jour: null });

export async function lireCourses(id) {
  const brut = await lireJson(fichierPeriode("courses", id));
  return brut && typeof brut.coches === "object" ? { ...coursesVides(id), ...brut } : coursesVides(id);
}

export function modifierCourses(id, modifier) {
  return modifierFichier(fichierPeriode("courses", id), () => lireCourses(id), (c) => {
    modifier(c);
    c.mis_a_jour = new Date().toISOString();
    return c;
  });
}

export const FICHIER_APPAREILS = path.join(DATA_DIR, "appareils.json");
