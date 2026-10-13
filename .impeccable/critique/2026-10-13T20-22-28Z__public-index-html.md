---
target: app
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\dev\\quick-cooking\\public\\index.html"
target_fingerprint: "sha256:044bd1f1de534a3578db7b8d107af8641981c638604f32cbc26ec8b9c9eb12ef"
target_path: "C:\\dev\\quick-cooking\\public\\index.html"
timestamp: 2026-10-13T20-22-28Z
slug: public-index-html
---
# Critique — app Quick Cooking (public/index.html)

Score 21/40 (Acceptable). H1 2, H2 3, H3 2, H4 2, H5 2, H6 2, H7 2, H8 2, H9 2, H10 3.

## Verdict spécificité
Contenu très spécifique au foyer (J/P/G, restes, agenda, pastilles {N}) ; ossature dashboard générique. Rien de conçu pour "mains prises, tablette à 1 m".
Détecteur : CLI 3 (2 faux positifs contraste tokens sombres style.css:37-39 ; 1 stripes .jauge.incomplete style.css:155). Navigateur : undersized-ui-text 155 sur #/choisir (.badge 10,24 px), .cote-surtitre/.jauge-lib partout ; nested-cards 14 (.jour-repas > .repas style.css:240) ; contrastes clair .moment 4,0:1, .badge.type-poisson 4,2:1, placeholder #757575 sans ::placeholder.

## Problèmes prioritaires
- [P1] Fiche recette inutilisable mains prises (app.js:557 ouvrirFiche, markdown.js) : titre doublé, 6 tuiles avant, tableau macros coupé, [!WARNING] brut, étapes au 2e écran, temps contradictoire, .lien 21 px. Fix : vue cuisine ≥20 px, métadonnées repliées, callouts, Wake Lock. -> shape fiche-cuisine, typeset
- [P1] Période terminée invisible (app.js:186-198 vueAccueil) : menu périmé présenté comme courant, Choisir ouvert après échéance. -> harden
- [P1] Chrome mobile 33 % de l'écran, dock illisible (style.css:115, .jauge :143) : dock sur Semaine/Choisir seulement, replié une ligne, ≈ au lieu des hachures. -> distill, adapt
- [P2] Choisir surchargé : ~60 boutons, jusqu'à 7 choix/repas, 5 ✓ affichés, badges 10,24 px. -> distill choisir
- [P2] Cadre orange main (app.js:869 vs style.css:75/111) ; pilule toast vide (style.css:402). -> polish

## Personas
Pauline en cuisine : 16 px/12 px illisibles à 1 m ; étapes sous la ligne de flottaison ; pas de Wake Lock ; dock change de jour au défilement.
Casey : onglet Recettes coupé 390 px ; cibles 21-32 px ; Détails hors pouce ; retoucher = déchoisir sans annulation.
Sam : main aria-live relit toute la vue toutes les 10/30 s ; nom accessible = carte entière ; jauges couleur+title ; numéros Courses via title.

## Mineures
data-theme=dark incomplet (style.css:57) ; "Fibre" coupé ; tableau macros fiche défile ; date ISO inventaire ; chemin interne fiche affiché ; "recommandé" même aplat que "aujourd'hui".

## Questions
Accueil = juste ce soir en grand ? Trois vues macros = traqueur nutritionnel ? Fiche testée sur la vraie tablette ?
