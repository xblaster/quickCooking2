---
name: Quick Cooking
description: Le tableau des départs du foyer — chaque repas s'affiche comme un départ, lisible à l'autre bout de la cuisine.
colors:
  quai: "#0A1F44"
  quai-2: "#1E3F7A"
  quai-texte: "#F4F6FA"
  quai-discret: "#B9C6DE"
  signal: "#FFC72C"
  signal-texte: "#0A1F44"
  fond: "#EEF2F8"
  surface: "#FFFFFF"
  surface-2: "#E1E8F3"
  texte: "#0A1F44"
  discret: "#3D5480"
  filet: "#C9D3E6"
  filet-fort: "#0A1F44"
  lien: "#1E3F7A"
  ok: "#1F6E43"
  ok-fond: "#DDF0E5"
  attention: "#7A4F00"
  attention-fond: "#FCEBC2"
  interdit: "#A3221B"
  interdit-fond: "#FADCD9"
  info: "#1E3F7A"
  info-fond: "#DCE6F6"
  viande: "#8E4A1F"
  poisson: "#11657C"
  vege: "#3D6B1E"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.85rem, 6.2vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 5vw, 2.6rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  headline-page:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 4vw, 2.2rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  depart:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-cuisine:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.22rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.4
  pastille:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  etiquette: "4px"
  alerte: "8px"
  controle: "10px"
  panneau: "12px"
  pilule: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  gouttiere: "16px"
  lg: "20px"
  section: "28px"
  jour: "32px"
components:
  tableau:
    backgroundColor: "{colors.quai}"
    textColor: "{colors.quai-texte}"
    rounded: "{rounded.panneau}"
    padding: "20px 20px 22px"
  bouton:
    backgroundColor: "{colors.quai}"
    textColor: "{colors.quai-texte}"
    typography: "{typography.label}"
    rounded: "{rounded.controle}"
    padding: "0.6rem 1.1rem"
    height: "48px"
  bouton-secondaire:
    backgroundColor: "transparent"
    textColor: "{colors.texte}"
    rounded: "{rounded.controle}"
    padding: "0.6rem 1.1rem"
    height: "48px"
  bouton-secondaire-hover:
    backgroundColor: "{colors.surface-2}"
  bouton-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-texte}"
    rounded: "{rounded.controle}"
    padding: "0.7rem 1.4rem"
    height: "56px"
  bouton-sur-quai:
    backgroundColor: "transparent"
    textColor: "{colors.quai-texte}"
    rounded: "{rounded.controle}"
    height: "48px"
  pastille:
    textColor: "{colors.texte}"
    typography: "{typography.pastille}"
    rounded: "{rounded.pilule}"
    size: "40px"
  pastille-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-texte}"
    rounded: "{rounded.pilule}"
    size: "56px"
  champ:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.texte}"
    rounded: "{rounded.controle}"
    padding: "0.6rem 0.75rem"
    height: "48px"
  filtre:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.texte}"
    rounded: "{rounded.pilule}"
    padding: "0.3rem 0.85rem"
    height: "44px"
  filtre-actif:
    backgroundColor: "{colors.surface-2}"
  onglet-actif:
    backgroundColor: "{colors.quai}"
    textColor: "{colors.quai-texte}"
    rounded: "{rounded.pilule}"
    height: "44px"
  option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.texte}"
    rounded: "{rounded.controle}"
    padding: "10px 12px"
  option-choisie:
    backgroundColor: "{colors.surface-2}"
  barre-onglets:
    backgroundColor: "{colors.quai}"
    textColor: "{colors.quai-discret}"
    height: "58px"
---

# Design System: Quick Cooking

## Overview

**Creative North Star: "Le tableau des départs"**

Chaque repas est un départ affiché : moment, numéro, plat, qui, où. L'interface se lit comme le panneau d'une gare ou d'un aéroport, à un mètre, d'un coup d'œil, mains prises. Un panneau bleu nuit porte le prochain repas en très grand ; le reste de la période défile dessous comme la suite des départs, en lignes séparées par des filets. Le jaune signal ne désigne qu'une chose à la fois : ce qui arrive maintenant.

La densité est celle d'un horaire, pas d'un tableau de bord : pas de cartes, pas de barre latérale, pas de jauges permanentes. Les macros et les stocks restent accessibles mais au second plan, dans une ligne des repères qu'on touche pour l'ouvrir. Les repas passés sont « poinçonnés » : atténués, en graisse normale, avec la mention « passé ». Le monde est engagé et monochrome bleu : tous les neutres sont teintés de bleu nuit, aucun gris d'appoint.

Le geste signature est le panneau du prochain repas, dont les lignes basculent comme des volets à l'affichage (désactivé si l'utilisateur réduit les animations).

**Key Characteristics:**
- Un seul panneau bleu nuit plein, celui du prochain repas ; tout le reste est fond bleu très pâle et filets.
- Jaune signal réservé au prochain repas et au jour en cours.
- Une seule famille, Atkinson Hyperlegible Next, chiffres tabulaires partout, 800 pour l'affichage.
- Plats numérotés en pastilles `{N}` rondes et cerclées, comme sur les fiches imprimées.
- Cibles tactiles de 44 px minimum, 48–56 px pour les actions principales.
- Clair et sombre, tous deux bleu nuit ; sombre suivi par `prefers-color-scheme` et forçable par `data-theme`.

## Colors

Un bleu nuit engagé, un blanc de caractères, un jaune signal rare ; les couleurs d'état et de type de plat ne servent qu'à l'information.

### Primary
- **Bleu nuit de quai** (`quai`) : fond du panneau du prochain repas, de l'en-tête, de la barre d'onglets, de l'en-tête de la fiche recette et du bouton principal. Il est aussi la couleur du texte (`texte`) et des filets forts (`filet-fort`) en thème clair : un seul bleu fait tout le dessin.
- **Bleu de voie** (`quai-2`) : filets et éléments secondaires posés sur le panneau (séparateur de la rangée J · P · G, contour des boutons J/P/G, onglet actif de la navigation bureau). Sert aussi de couleur de lien (`lien`).

### Secondary
- **Jaune signal** (`signal`, texte `signal-texte`) : moment du prochain repas (« Ce soir »), pastille du prochain repas, bouton « Ouvrir la recette », pastille de la ligne `prochain` dans la semaine, marque « aujourd'hui » du jour en cours. Rien d'autre.

### Tertiary (information seulement)
- **Vert ok / ambre attention / rouge interdit / bleu info** (`ok`, `attention`, `interdit`, `info` et leurs `-fond`) : alertes de choix, encadrés de fiche, stocks à finir ou à consommer, états des barres de protéines, cellules des macros hors cible. Toujours en couple texte + fond pâle de la même teinte.
- **Brun viande / bleu-vert poisson / vert végé** (`viande`, `poisson`, `vege`) : uniquement le contour et le texte des badges de type de plat.

### Neutral
- **Blanc de caractères** (`quai-texte`) : texte sur le panneau et l'en-tête.
- **Bleu brume** (`quai-discret`) : texte secondaire sur le panneau (jour, note, lieu, onglets inactifs).
- **Fond de hall** (`fond`) : fond de page, bleu très pâle.
- **Surface** (`surface`) et **surface appuyée** (`surface-2`) : champs, options de choix, badges, ligne des repères ; `surface-2` pour l'état choisi ou survolé et les rails des barres.
- **Bleu discret** (`discret`) : texte secondaire sur fond clair, repas passés.
- **Filet** (`filet`) : séparateurs de lignes, contours de champs et d'options au repos.

En thème sombre, le quai descend à `#030B1E`, le fond à `#07152F`, la surface à `#0C1D3F` / `#132A55`, le texte passe à `#EAF0FA`, les filets à `#22396A`, le filet fort et le discret à `#A9B8D6`, le lien à `#9DC0FF` ; le jaune signal ne change pas. Valeurs complètes dans `.impeccable/design.json` (`extensions.themes.sombre`).

### Named Rules
**La règle du signal unique.** Le jaune signal marque le prochain repas et le jour en cours, et seulement eux. Si deux éléments jaunes non liés au même repas sont visibles, l'un des deux est de trop.

**La règle du bleu sans gris.** Tout neutre est un bleu nuit éclairci ou assombri. Aucun gris pur, aucune couleur d'appoint décorative.

## Typography

**Display Font:** Atkinson Hyperlegible Next (avec Atkinson Hyperlegible, ui-sans-serif, system-ui)
**Body Font:** la même
**Label/Mono Font:** la même, en 600 ; `code` dans les fiches reste dans la famille, en 600

**Character:** Une seule famille conçue pour la lisibilité basse vision, portée en trois graisses (400, 600, 800). L'affichage s'écrit en 800 resserré, comme les caractères d'un panneau ; les chiffres sont tabulaires partout (`font-variant-numeric: tabular-nums` sur `body`).

### Hierarchy
- **Display** (800, `clamp(1.85rem, 6.2vw, 3.4rem)`, 1.08, −0.02em) : le nom du plat du prochain repas, 24ch maximum, `text-wrap: balance`.
- **Headline** (800, `clamp(1.7rem, 5vw, 2.6rem)`) : le moment du prochain repas, en jaune signal. Le titre de page (h1) suit la même voix un cran plus bas (`clamp(1.6rem, 4vw, 2.2rem)`).
- **Title** (800, 1.25rem ; 1.4rem pour les jours de la semaine) : titres de section et de jour. Les h3 en 800, 1.05rem.
- **Départ** (600, 1.15rem, 1.3) : nom du plat dans une ligne de départ ; passe en 400 quand le repas est passé.
- **Body** (400, 17px, 1.5) : texte courant. En mode cuisine, la fiche monte à 1.22rem / 1.55 et ses intertitres à 1.35rem 800.
- **Label** (600, 0.9–0.95rem) : qui · où, compteurs, liens d'action, badges (0.8rem).

### Named Rules
**La règle des trois graisses.** 400 pour lire, 600 pour repérer, 800 pour afficher. Pas d'autres graisses, pas d'autre famille, pas de capitales forcées.

**La règle des chiffres alignés.** Les chiffres (heures, quantités, numéros, macros) sont toujours tabulaires.

## Layout

Une colonne sur téléphone, gouttière de 16 px (`main` : `20px 16px`, plus la hauteur de la barre d'onglets et de la ligne des repères en bas). Au-delà de 1000 px : contenu limité à 1440 px, marges de 24 px, navigation dans l'en-tête, barre d'onglets du bas masquée, ligne des repères collée en bas de l'écran et panneau des repères ouvert à droite (440 px).

- **Accueil :** panneau du prochain repas pleine largeur, puis « Ensuite » (les départs suivants) ; sur bureau, une grille `1.5fr / 1fr` place les départs à gauche et les états « À choisir » et « Courses » à droite, sous un filet fort.
- **Ligne de départ :** grille à trois colonnes `4.6rem | 48px | 1fr` (quand, pastille, plat + qui · où), 14 px de rembourrage vertical, filet en dessous. Sous 560 px : `3.6rem | 44px | 1fr`.
- **Semaine et À choisir :** une section par jour, 32 px entre les jours ; sur bureau, les repas d'un jour passent en deux colonnes, chaque ligne coiffée d'un filet fort.
- **Rythme :** pas de 4 px ; valeurs reprises 8, 14, 16, 20, 28, 32 px.

### Named Rules
**La règle du filet unique.** La structure se dessine par filets : filet fort de 2 px (`filet-fort`) en tête de liste ou de section, filet fin de 1 px (`filet`) entre les lignes. Pas de cadres pour grouper, pas de carte dans une carte.

## Elevation & Depth

Le système est plat. La profondeur vient du contraste de surface (panneau bleu nuit plein contre fond pâle) et des filets, pas des ombres. Les ombres n'existent que pour ce qui flotte réellement au-dessus de la page : la fiche recette et le tiroir (fenêtres modales), le panneau des repères ouvert, le message d'état.

### Shadow Vocabulary
- **Fenêtre** (`box-shadow: 0 24px 64px rgb(3 11 30 / 40%)`, voile `rgb(3 11 30 / 60%)`) : fiche recette et tiroir.
- **Panneau des repères** (`box-shadow: 0 -12px 32px rgb(10 31 68 / 18%)`) : panneau macros + stocks qui monte au-dessus de la ligne des repères.
- **Message** (`box-shadow: 0 8px 24px rgb(3 11 30 / 25%)`) : toast.

### Named Rules
**La règle du plat par défaut.** Rien de ce qui est posé dans la page n'a d'ombre. Seul ce qui recouvre la page en porte une.

## Shapes

Coins francs mais adoucis : 12 px pour le panneau et les fenêtres, 10 px pour les boutons, champs, options et encadrés, 8 px pour les alertes et les onglets de la navigation bureau, 4 px pour la marque « coché par ». Les pastilles `{N}`, les boutons J/P/G, les filtres, les badges et les onglets de stocks sont des pilules ou des cercles parfaits ; les étapes numérotées des fiches reprennent le cercle cerclé de la pastille. Contours de 1.5 px au repos, 2–2.5 px pour l'état choisi et les pastilles.

## Components

### Tableau (panneau du prochain repas)
*Le départ imminent, en très grand.* Fond `quai`, texte `quai-texte`, coins 12 px, rembourrage 20 px (28–32 px sur bureau). Dans l'ordre : repère de période optionnel, tête (moment en jaune signal + pastille signal 56 px + jour en `quai-discret`), nom du plat en Display, note, rangée « qui mange où » en grille (initiale 1.5rem 800 sur le lieu) sous un filet `quai-2`, puis l'action « Ouvrir la recette » en bouton signal. Chaque ligne est un « volet » : à l'affichage, elle bascule de `rotateX(-78deg)` à plat en 0.62 s, décalée de 70 ms par ligne, courbe `cubic-bezier(.16, 1, .3, 1)`. État vide : même panneau, message en 800.

### Ligne de départ
*Un repas, une ligne d'horaire.* Quand (800) / pastille / plat (600) + qui · où (initiales en gras, lieu en discret). Le prochain repas allume sa pastille en jaune signal. Un repas passé est poinçonné : texte `discret`, plat en 400, pastille au contour `filet`, mention « passé ».

### Pastilles {N}
- **Style :** cercle 40 px, contour 2.5 px `texte`, numéro 800 1.05rem. Variante petite (30 px, contour 2 px) dans le texte ; variante signal (56 px, pleine jaune) pour le prochain repas.

### Buttons
- **Shape :** coins 10 px, hauteur minimale 48 px, 800.
- **Primary :** fond `quai`, texte `quai-texte` (en sombre : fond `quai-texte`, texte bleu nuit).
- **Signal :** fond `signal`, texte `signal-texte`, 1.1rem, 56 px de haut ; l'action du prochain repas.
- **Secondary :** transparent, contour `filet-fort`, survol `surface-2`.
- **Sur quai :** transparent, contour `quai-discret`, pour une action posée sur le panneau.
- **Hover / Focus / Active :** transition 0.2 s ; enfoncement de 1 px à l'appui ; focus visible par un contour 3 px `texte` décalé de 2 px avec halo `surface` (contour `quai-texte` sans halo sur le bleu nuit).
- **Lien d'action :** texte souligné `lien`, 600, 44 px de cible.

### Chips (filtres, onglets, portions, J/P/G)
- **Style :** pilule, contour 1.5 px `filet`, fond `surface`, 44 px de haut.
- **State :** filtre actif = contour `filet-fort` + fond `surface-2` + 600 ; onglet, portion et J/P/G choisis = plein bleu nuit (`quai` / `quai-texte`, ou l'inverse sur l'en-tête).

### Options de choix
*La liste de propositions d'un repas à venir.* Bouton pleine largeur, fond `surface`, contour 1.5 px `filet`, coins 10 px, rond de sélection 20 px. Choisie : contour 2.5 px `filet-fort`, fond `surface-2`, rond plein. Les restes proposés ont un contour en pointillés.

### Inputs / Fields
- **Style :** contour 1.5 px `filet`, fond `surface`, coins 10 px, 48 px de haut, étiquette au-dessus en 600 `discret`.
- **Focus :** contour `filet-fort` en plus de l'anneau de focus global.

### Navigation
- **Téléphone :** barre d'onglets du bas, bleu nuit, 58 px, cinq onglets texte en 600 `quai-discret` ; l'onglet actif passe en `quai-texte` avec un trait de 3 px en haut. Compteur « À choisir » en pilule blanche.
- **Bureau :** onglets dans l'en-tête bleu nuit ; actif sur fond `quai-2`.
- **En-tête :** collant, bleu nuit, marque ronde « QC » blanche, boutons J/P/G ronds à droite (noms complets sur bureau).

### Ligne des repères et panneau des repères
*Les macros au second plan.* Une ligne de 52 px sur `surface`, au-dessus de la barre d'onglets : jour, protéines par personne, alerte éventuelle, flèches de jour. Au toucher, le panneau des repères monte (filet fort en tête, ombre de panneau) avec le tableau des macros et les stocks. Les valeurs hors cible prennent le couple `interdit` ou `attention`.

### Fiche recette (mode cuisine)
Fenêtre modale 820 px (plein écran sous 640 px), en-tête collant bleu nuit avec la pastille et le titre, bouton fermer rond 48 px. Corps en 1.22rem ; étapes numérotées dans des cercles cerclés de 2.2rem, séparées par des filets. Le détail secondaire (infos, macros) est replié sous un filet fort.

## Do's and Don'ts

### Do:
- **Do** réserver `signal` (#FFC72C) au prochain repas et au jour en cours.
- **Do** structurer par filets : 2 px `filet-fort` en tête, 1 px `filet` entre les lignes.
- **Do** numéroter chaque plat avec sa pastille `{N}` ronde et cerclée, comme sur les fiches imprimées.
- **Do** garder 44 px de cible minimum, 48 px pour un bouton, 56 px pour l'action signal.
- **Do** atténuer les repas passés (texte `discret`, graisse 400, mention « passé ») plutôt que de les masquer.
- **Do** garder les macros et les stocks dans la ligne des repères, ouverte au toucher.
- **Do** couper le basculement des volets et toutes les transitions sous `prefers-reduced-motion: reduce`.

### Don't:
- **Don't** composer en tableau de bord : pas de grille de cartes, pas de barre latérale, pas de jauges permanentes.
- **Don't** mettre une carte dans une carte ni encadrer un groupe que des filets suffisent à séparer.
- **Don't** introduire un gris neutre ou une couleur décorative hors de la palette bleu nuit.
- **Don't** ajouter d'ombre à un élément posé dans la page.
- **Don't** employer une autre famille que Atkinson Hyperlegible Next ni une graisse hors 400 / 600 / 800.
