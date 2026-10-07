// Rendu Markdown minimal et sûr (titres, listes, tableaux, citations, gras/italique).
// Le texte est échappé avant toute mise en forme : aucun HTML de la fiche n'est interprété.
import { esc } from "./outils.js";

function enLigne(s) {
  return esc(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

const cellules = (ligne) => ligne.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function rendreMarkdown(md) {
  const lignes = String(md || "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim() || /^(-{3,}|\*{3,})$/.test(l.trim())) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
      const n = Math.min(m[1].length + 2, 6);
      out.push(`<h${n}>${enLigne(m[2])}</h${n}>`);
      i++;
    } else if (l.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1] || "")) {
      const tete = cellules(l);
      i += 2;
      const corps = [];
      while (i < lignes.length && lignes[i].trim().startsWith("|")) corps.push(cellules(lignes[i++]));
      out.push(`<div class="table-defile"><table><thead><tr>${tete.map((c) => `<th>${enLigne(c)}</th>`).join("")}</tr></thead><tbody>${corps
        .map((r) => `<tr>${r.map((c) => `<td>${enLigne(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^\s*>/.test(l)) {
      const bloc = [];
      while (i < lignes.length && /^\s*>/.test(lignes[i])) bloc.push(lignes[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${rendreMarkdown(bloc.join("\n"))}</blockquote>`);
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordonnee = /^\s*\d/.test(l);
      const items = [];
      while (i < lignes.length && /^\s*([-*+]|\d+[.)])\s+/.test(lignes[i]))
        items.push(lignes[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s*/, ""));
      const tag = ordonnee ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${enLigne(t)}</li>`).join("")}</${tag}>`);
    } else {
      const para = [];
      while (i < lignes.length && lignes[i].trim() && !/^(#|\||>|\s*([-*+]|\d+[.)])\s)/.test(lignes[i])) para.push(lignes[i++]);
      if (!para.length) para.push(lignes[i++]);
      out.push(`<p>${para.map(enLigne).join("<br>")}</p>`);
    }
  }
  return out.join("\n");
}
