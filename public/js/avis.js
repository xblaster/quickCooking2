// Avis de la famille sur les plats : listes fermées partagées par le serveur et l'interface.

/** Verdicts, du plus positif au plus négatif. */
export const VERDICTS = [
  ["coup_de_coeur", "Coup de cœur"],
  ["bien", "Bien"],
  ["bof", "Bof"],
  ["plus_jamais", "Plus jamais"],
];

export const ETIQUETTES = [
  ["portion_petite", "Portion trop petite"],
  ["portion_grande", "Portion trop grande"],
  ["trop_sale", "Trop salé ou épicé"],
  ["fade", "Fade"],
  ["texture", "Texture ratée"],
  ["rechauffe_mal", "Réchauffe mal"],
  ["trop_long", "Trop long à préparer"],
  ["recette_modifiee", "Recette modifiée"],
];

export const LONGUEUR_COMMENTAIRE = 500;
export const libelleVerdict = (v) => VERDICTS.find(([id]) => id === v)?.[1] ?? v;
export const libelleEtiquette = (e) => ETIQUETTES.find(([id]) => id === e)?.[1] ?? e;
