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
