// Petits utilitaires partagés (navigateur et tests Node).

export function normaliser(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/_/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const ECHAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ECHAP[c]);

export const arrondi = (n) => (n == null || Number.isNaN(n) ? "–" : String(Math.round(n)));

/** "2026-10-07" → Date locale à midi (évite les décalages de fuseau). */
export const dateLocale = (iso) => new Date(`${iso}T12:00:00`);

export function isoDuJour(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function ecartJours(isoA, isoB) {
  return Math.round((dateLocale(isoB) - dateLocale(isoA)) / 86400000);
}

export const LIBELLE_TYPE = { viande: "Viande", poisson: "Poisson", vege: "Végétarien" };
export const LIBELLE_MOMENT = { midi: "Midi", soir: "Soir" };

// Pastilles {N} : 26 teintes vives réparties par angle d'or, de sorte que deux numéros voisins ne se ressemblent pas.
// Chiffre bleu nuit (contraste ≥ 5,5:1 sur chaque teinte). Les fiches imprimées gardent leur palette sobre.
export const PALETTE_PASTILLES = ["#FB684B", "#23FB86", "#D769FC", "#F1FB23", "#23B3FB", "#FC5F9A", "#35FB23", "#A087FD", "#FB8F23", "#23FBCE", "#FB4BEC", "#A9FB23", "#699AFC", "#FC696F", "#23FB59", "#C27DFC", "#FBD723", "#23DFFB", "#FC55B6", "#61FB23", "#9191FD", "#FB6A2D", "#23FBA1", "#E95FFC", "#D6FB23", "#2D9CFB"];
export const couleurPastille = (n) => PALETTE_PASTILLES[(((Number(n) - 1) % 26) + 26) % 26];
// Second canal, pour ne pas reposer sur la couleur seule : l'anneau change de motif d'un numéro au suivant.
export const MOTIFS_PASTILLES = ["plein", "double", "points", "tirets"];
export const motifPastille = (n) => MOTIFS_PASTILLES[(((Number(n) - 1) % 4) + 4) % 4];
