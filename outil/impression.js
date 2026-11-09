/* Mise en page des PDF (même format que scripts/generate_pdf.py + common.py).
 *
 * Deux documents par scénario, 2 pages A4 paysage (6 mois par page) :
 *   - « papa_maman » : qui garde les enfants chaque jour + total et signatures ;
 *   - « a_eviter »   : garde de Papa, jours à éviter, journées et soirs libres.
 *
 * La mise en page produit une liste d'opérations (rectangles, textes) dans le
 * repère de matplotlib (0..1, origine en bas à gauche), dessinée ensuite par
 * jsPDF (versJsPDF). Utilisable dans le navigateur et avec node (tests).
 */
(function (global) {
  "use strict";
  const G = global.Garde || (typeof require !== "undefined" ? require("./core.js") : null);

  const BLEU = "#9DC3E6", ORANGE = "#F4B183", VERT = "#A9D18E", VIOLET = "#C9A9DD",
    JAUNE = "#FFE699", ROUGE = "#F19C99", GRIS_ENTETE = "#404040", GRIS_LEGER = "#F2F2F2";
  const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];

  const NOTE_A_EVITER_DEFAUT = [
    "Jours d'échange coloriés (heure et attribution selon les règles du " +
    "planning). Vacances : zone de référence et zones indicatives.",
    "Objectif : maximiser les week-ends libres (vert). Notes " +
    "personnalisables dans le JSON (champ notes_papa_a_eviter).",
  ];

  // ---------- Contenu des cellules (équivalent des fonctions remplir() Python) ----------

  /** Contenu jour par jour : { entetes, legende, notes, titres, jour(i) -> {cellules, libre} }. */
  function contenu(m, type) {
    const d = G.exporter(m), ech = G.echanges(m), zone = m.regles.zone;
    const ref = G.vacances(m), annee = d.annee, variante = d.titre_variante || "";
    const nom = { P: "papa", M: "maman" };
    const colonneZone = (i) => (m.feries.has(i) ? [ROUGE, null] : ref.has(i) ? [JAUNE, null] : [null, null]);

    if (type === "papa_maman") {
      const r = d.regles, c = G.compter(m);
      const titre = `Proposition de planning de garde ${annee}${variante}`;
      return {
        entetes: ["Papa", "Maman", `Zone ${zone}`],
        legende: [[BLEU, "Papa"], [ORANGE, "Maman"], [JAUNE, `Vacances zone ${zone}`], [ROUGE, "Jour férié"]],
        titres: [`${titre} : 1er semestre`, `${titre} : 2e semestre`],
        notes: [
          `Jour d'échange : colorié chez les deux. Période scolaire : ${r.echange_scolaire.jour} ` +
          `${r.echange_scolaire.heure} ; vacances : ${r.echange_vacances.jour} ${r.echange_vacances.heure}. ${r.attribution}`,
          `Total ${annee} : Papa ${c.P} jours, Maman ${c.M} jours (écart ${c.ecart}).     ` +
          "Signature Papa :                    Date :              Signature Maman :                    Date :",
        ],
        jour(i) {
          const o = m.own[i];
          let papa = o === "P" ? [BLEU, null] : [null, null];
          let maman = o === "M" ? [ORANGE, null] : [null, null];
          const e = ech.get(i);
          if (e) {
            const lab = { [nom[e.rend]]: `fin ${e.heure}`, [nom[e.recoit]]: `dès ${e.heure}` };
            papa = [BLEU, lab.papa || null];
            maman = [ORANGE, lab.maman || null];
          }
          return { cellules: [papa, maman, colonneZone(i)], libre: false };
        },
      };
    }

    // « a_eviter »
    const lib = G.libres(m, ech), ind = G.zonesIndicatives(m);
    const notes = d.notes_papa_a_eviter || NOTE_A_EVITER_DEFAUT;
    return {
      entetes: ["Papa", "À éviter", "Ind.", zone],
      legende: [[BLEU, "Papa a les enfants"], [ORANGE, "Jour à éviter"], [VERT, "Journée et soir libres"],
        [VIOLET, `Vacances zones ${ind.join(" / ")} (indicatif)`], [JAUNE, `Vacances zone ${zone}`],
        [ROUGE, `Jour férié (col. ${zone})`]],
      titres: [`Planning ${annee}${variante} : 1er semestre (jours à éviter)`,
        `Planning ${annee}${variante} : 2e semestre (jours à éviter)`],
      notes: [notes[0], notes[1]],
      jour(i) {
        let papa = m.own[i] === "P" ? [BLEU, null] : [null, null];
        const e = ech.get(i);
        if (e && e.rend === "P") papa = [BLEU, `fin ${e.heure}`];
        else if (e && e.recoit === "P") papa = [BLEU, `dès ${e.heure}`];
        const evite = m.eviterJours.has(i) ? [ORANGE, m.eviterLabels.get(i) || null] : [null, null];
        const lettres = ind.filter((z) => m.vac[z].has(i)).join(" ");
        const zi = lettres ? [VIOLET, lettres] : [null, null];
        return { cellules: [papa, evite, zi, colonneZone(i)], libre: lib.has(i) };
      },
    };
  }

  // ---------- Mise en page (équivalent de dessiner_page / _dessiner_mois) ----------

  function dessinerMois(ops, m, mo, x0, largeur, yHaut, h, entetes, jour) {
    const cal = m.cal, ncols = entetes.length;
    const xLabelW = largeur * 0.26, xData = x0 + xLabelW, colW = (largeur - xLabelW) / ncols;
    const rect = (x, y, w, hh, fill, stroke, lw) => ops.push({ t: "rect", x, y, w, h: hh, fill, stroke, lw });
    const texte = (x, y, s, o) => ops.push(Object.assign({ t: "text", x, y, s }, o));

    rect(x0, yHaut - h, largeur, h, GRIS_ENTETE, "#FFFFFF", 0.5);
    texte(x0 + largeur / 2, yHaut - h / 2, G.MOIS[mo], { size: 7, bold: true, color: "#FFFFFF", align: "center" });
    const ySub = yHaut - 2 * h;
    entetes.forEach((nom, c) => {
      const cx = xData + c * colW;
      rect(cx, ySub, colW, h, GRIS_ENTETE, "#FFFFFF", 0.5);
      texte(cx + colW / 2, ySub + h / 2, nom, { size: 3.6, bold: true, color: "#FFFFFF", align: "center" });
    });
    let j = 0;
    for (let i = 0; i < cal.n; i++) {
      if (cal.mois[i] !== mo) continue;
      j++;
      const y = ySub - j * h, we = cal.jour[i] >= 5;
      rect(x0, y, xLabelW, h, we ? GRIS_LEGER : "#FFFFFF", "#BFBFBF", 0.3);
      texte(x0 + 0.004, y + h / 2, `${JOURS_COURTS[cal.jour[i]]} ${cal.quantieme[i]}`, { size: 3.6, bold: we });
      const { cellules, libre } = jour(i);
      let debut = 0;
      if (libre) {
        rect(xData, y, colW * Math.min(2, ncols), h, VERT, "#BFBFBF", 0.3);
        texte(xData + colW, y + h / 2, "LIBRE", { size: 3.4, color: "#375623", align: "center" });
        debut = 2;
      }
      for (let c = debut; c < ncols; c++) {
        const cx = xData + c * colW, [couleur, t] = cellules[c];
        rect(cx, y, colW, h, couleur || "#FFFFFF", "#BFBFBF", 0.3);
        if (t) texte(cx + colW / 2, y + h / 2, t, { size: 2.9, align: "center" });
      }
    }
  }

  function dessinerPage(m, titre, mois, entetes, jour, legende, note) {
    const ops = [];
    ops.push({ t: "text", x: 0.012, y: 0.965, s: titre, size: 13, bold: true });
    let x = 0.012;
    for (const [couleur, label] of legende) {
      ops.push({ t: "rect", x, y: 0.915, w: 0.013, h: 0.018, fill: couleur, stroke: "#808080", lw: 0.4 });
      ops.push({ t: "text", x: x + 0.017, y: 0.924, s: label, size: 6 });
      x += 0.017 + 0.0072 * label.length + 0.01;
    }
    const margeG = 0.012, largeurMois = (1 - 2 * margeG) / 6;
    mois.forEach((mo, k) => dessinerMois(ops, m, mo, margeG + k * largeurMois + 0.003, largeurMois - 0.006,
      0.88, 0.0245, entetes, jour));
    if (note) ops.push({ t: "text", x: 0.012, y: 0.02, s: note, size: 6, italic: true });
    return ops;
  }

  /** Document complet : { fichier, pages: [ops, ops] }. */
  function documentPDF(m, type, nomJson) {
    const c = contenu(m, type), stem = String(nomJson || `planning_${m.cal.annee}`).replace(/\.json$/, "");
    const semestres = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]];
    return {
      fichier: `${type === "papa_maman" ? "papa_maman" : "papa_a_eviter"}_${stem}.pdf`,
      pages: semestres.map((mois, k) => dessinerPage(m, c.titres[k], mois, c.entetes, c.jour, c.legende, c.notes[k])),
    };
  }

  // ---------- Rendu jsPDF ----------

  // Les polices standard du PDF (Helvetica) ne couvrent que le jeu WinAnsi :
  // on remplace les quelques caractères hors de ce jeu.
  const REMPLACEMENTS = { "→": "->", "←": "<-", "≠": "!=", "≤": "<=", "≥": ">=", "✓": "", "⚠": "!", " ": " " };
  const WINANSI = /[ -~ -ÿŒœŠšŸŽžƒˆ˜–—‘-‚“-„†-•…‰‹›€™]/;
  function texteWinAnsi(s) {
    return [...String(s)].map((ch) => (ch in REMPLACEMENTS ? REMPLACEMENTS[ch] : WINANSI.test(ch) ? ch : "?")).join("");
  }

  /** Dessine le document avec jsPDF (constructeur jsPDF fourni par l'appelant). */
  function versJsPDF(JsPDF, docPDF) {
    const pdf = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    docPDF.pages.forEach((ops, k) => {
      if (k) pdf.addPage("a4", "landscape");
      for (const o of ops) {
        if (o.t === "rect") {
          pdf.setFillColor(o.fill); pdf.setDrawColor(o.stroke); pdf.setLineWidth(o.lw);
          pdf.rect(o.x * W, (1 - o.y - o.h) * H, o.w * W, o.h * H, "FD");
        } else {
          pdf.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal");
          pdf.setFontSize(o.size);
          pdf.setTextColor(o.color || "#000000");
          pdf.text(texteWinAnsi(o.s), o.x * W, (1 - o.y) * H, { align: o.align || "left", baseline: "middle" });
        }
      }
    });
    return pdf;
  }

  const api = { contenu, documentPDF, versJsPDF, texteWinAnsi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Impression = api;
})(typeof window !== "undefined" ? window : globalThis);
