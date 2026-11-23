/* PDF du planning de garde : 2 pages A4 paysage (6 mois par page).
 *
 * Pour chaque planning (1 ou 2), deux colonnes Papa / Maman ; puis une colonne
 * de vacances par zone de référence. La mise en page produit une liste
 * d'opérations (rectangles, textes) dans un repère 0..1 (origine en bas à
 * gauche), dessinée ensuite par jsPDF (versJsPDF). Testable avec node.
 */
(function (global) {
  "use strict";
  const G = global.Garde || (typeof require !== "undefined" ? require("./core.js") : null);

  const BLEU = "#9DC3E6", ORANGE = "#F4B183", JAUNE = "#FFE699", ROUGE = "#F19C99",
    GRIS_ENTETE = "#404040", GRIS_LEGER = "#F2F2F2";
  const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];

  /** Découpe un texte en lignes d'au plus n caractères. */
  function couper(s, n) {
    const lignes = [];
    let ligne = "";
    for (const mot of s.split(" ")) {
      if (ligne && (ligne + " " + mot).length > n) { lignes.push(ligne); ligne = mot; }
      else ligne = ligne ? `${ligne} ${mot}` : mot;
    }
    if (ligne) lignes.push(ligne);
    return lignes;
  }

  /** Contenu : { entetes, legende, titres, notes: [lignes page 1, lignes page 2], jour(k) -> cellules }. */
  function contenu(plannings, annee) {
    const res = plannings.map((p) => G.calculer(p, annee));
    const deux = plannings.length > 1;
    const zones = [...new Set(plannings.map((p) => G.normaliser(p).zone))];
    const vac = zones.map((z) => G.joursVacances(z, annee));
    const entetes = [];
    plannings.forEach((_, n) => entetes.push(deux ? `${n + 1}·Papa` : "Papa", deux ? `${n + 1}·Maman` : "Maman"));
    zones.forEach((z) => entetes.push(`Zone ${z}`));

    const regles = [], totaux = [];
    plannings.forEach((p, n) => {
      const t = res[n].total, nom = deux ? `${n + 1}. ${p.nom} : ` : "";
      regles.push(...couper(nom + G.texteRegles(p).join(" "), 250));
      totaux.push(`${nom || ""}Total ${annee} : Papa ${t.P} jours, Maman ${t.M} jours (écart ${t.ecart}).`);
    });
    const incomplet = res.some((r) => r.incomplet)
      ? [`Calendrier scolaire officiel connu jusqu'au ${G.CALENDRIER_CONNU_JUSQUA.split("-").reverse().join("/")} : vacances suivantes non prises en compte.`] : [];

    return {
      entetes,
      legende: [[BLEU, "Papa"], [ORANGE, "Maman"], ...zones.map((z) => [JAUNE, `Vacances zone ${z}`]), [ROUGE, "Jour férié"]],
      titres: [`Planning de garde ${annee} : 1er semestre`, `Planning de garde ${annee} : 2e semestre`],
      notes: [
        regles,
        [...totaux, ...incomplet, "Signature Papa :                    Date :              Signature Maman :                    Date :"],
      ],
      jours: res[0].jours,
      jour(k) {
        const cellules = [];
        for (const r of res) {
          const d = r.jours[k], e = d.echange;
          if (e) {
            const lab = { [e.rend]: `fin ${e.heure}`, [e.recoit]: `dès ${e.heure}` };
            cellules.push([BLEU, lab.P], [ORANGE, lab.M]);
          } else cellules.push(d.parent === "P" ? [BLEU, null] : [null, null], d.parent === "M" ? [ORANGE, null] : [null, null]);
        }
        const d = res[0].jours[k];
        vac.forEach((v) => cellules.push(d.ferie ? [ROUGE, null] : v.has(d.iso) ? [JAUNE, null] : [null, null]));
        return cellules;
      },
    };
  }

  function dessinerMois(ops, c, mo, x0, largeur, yHaut, h) {
    const ncols = c.entetes.length;
    const xLabelW = largeur * 0.2, xData = x0 + xLabelW, colW = (largeur - xLabelW) / ncols;
    const rect = (x, y, w, hh, fill, stroke, lw) => ops.push({ t: "rect", x, y, w, h: hh, fill, stroke, lw });
    const texte = (x, y, s, o) => ops.push(Object.assign({ t: "text", x, y, s }, o));

    rect(x0, yHaut - h, largeur, h, GRIS_ENTETE, "#FFFFFF", 0.5);
    texte(x0 + largeur / 2, yHaut - h / 2, G.MOIS[mo], { size: 7, bold: true, color: "#FFFFFF", align: "center" });
    const ySub = yHaut - 2 * h;
    c.entetes.forEach((nom, k) => {
      const cx = xData + k * colW;
      rect(cx, ySub, colW, h, GRIS_ENTETE, "#FFFFFF", 0.5);
      texte(cx + colW / 2, ySub + h / 2, nom, { size: ncols > 3 ? 3 : 3.6, bold: true, color: "#FFFFFF", align: "center" });
    });
    let n = 0;
    c.jours.forEach((d, k) => {
      if (d.mois !== mo) return;
      n++;
      const y = ySub - n * h, we = d.js >= 5;
      rect(x0, y, xLabelW, h, we ? GRIS_LEGER : "#FFFFFF", "#BFBFBF", 0.3);
      texte(x0 + 0.003, y + h / 2, `${JOURS_COURTS[d.js]} ${d.quantieme}`, { size: 3.6, bold: we });
      c.jour(k).forEach(([couleur, t], col) => {
        const cx = xData + col * colW;
        rect(cx, y, colW, h, couleur || "#FFFFFF", "#BFBFBF", 0.3);
        if (t) texte(cx + colW / 2, y + h / 2, t, { size: ncols > 3 ? 2.6 : 2.9, align: "center" });
      });
    });
  }

  function dessinerPage(c, page) {
    const ops = [];
    ops.push({ t: "text", x: 0.012, y: 0.965, s: c.titres[page], size: 13, bold: true });
    let x = 0.012;
    for (const [couleur, label] of c.legende) {
      ops.push({ t: "rect", x, y: 0.915, w: 0.013, h: 0.018, fill: couleur, stroke: "#808080", lw: 0.4 });
      ops.push({ t: "text", x: x + 0.017, y: 0.924, s: label, size: 6 });
      x += 0.017 + 0.0072 * label.length + 0.01;
    }
    const margeG = 0.012, largeurMois = (1 - 2 * margeG) / 6;
    for (let k = 0; k < 6; k++) dessinerMois(ops, c, page * 6 + k, margeG + k * largeurMois + 0.003, largeurMois - 0.006, 0.89, 0.0245);
    const lignes = c.notes[page];
    lignes.forEach((s, k) => ops.push({ t: "text", x: 0.012, y: 0.012 + (lignes.length - 1 - k) * 0.0125, s, size: 5.5, italic: true }));
    return ops;
  }

  /** Document complet : { fichier, pages: [ops, ops] }. */
  function documentPDF(plannings, annee) {
    const c = contenu(plannings, annee);
    return { fichier: `garde_${annee}.pdf`, pages: [dessinerPage(c, 0), dessinerPage(c, 1)] };
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
