/* Logique du planning de garde (sans interface).
 *
 * Même modèle que scripts/common.py : la garde est une liste de plages
 * {du, au, parent} où chaque jour est attribué à un parent. Ce fichier est
 * utilisé par editeur.html (navigateur) et testable avec node.
 */
(function (global) {
  "use strict";

  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
    "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const PARENT = { P: "papa", M: "maman" };
  const CODE = { papa: "P", maman: "M" };
  const autre = (o) => (o === "P" ? "M" : "P");

  // Règles par défaut (fichier principal sans regles.echanges)
  const ECHANGES_DEFAUT = [
    { jour: "mercredi", heure: "18h", jour_attribue_a: "rend" },
    { jour: "samedi", heure: "18h", jour_attribue_a: "rend" },
  ];

  const OPTIONS_DEFAUT = {
    blocMax: 10, blocMaxEte: 14, blocMin: 5,
    poidsEquite: 40, bonusWeekend: 30, poidsAlignementTierce: 0.3,
    garderLibres: true, utiliserVerrous: true,
  };

  // ---------- Dates (index de jour dans l'année, 0 = 1er janvier) ----------

  function calendrier(annee) {
    const n = (Date.UTC(annee + 1, 0, 1) - Date.UTC(annee, 0, 1)) / 86400000;
    const iso = [], jour = [], mois = [], quantieme = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(annee, 0, 1 + i));
      iso.push(d.toISOString().slice(0, 10));
      jour.push((d.getUTCDay() + 6) % 7); // 0 = lundi
      mois.push(d.getUTCMonth());
      quantieme.push(d.getUTCDate());
    }
    const index = new Map(iso.map((s, i) => [s, i]));
    return { annee, n, iso, jour, mois, quantieme, index };
  }

  function idx(cal, s) {
    if (cal.index.has(s)) return cal.index.get(s);
    return s < cal.iso[0] ? -1 : cal.n; // hors année
  }

  function plagesVersJours(cal, plages, valeur) {
    const out = new Map();
    for (const p of plages) {
      const a = Math.max(0, idx(cal, p.du)), b = Math.min(cal.n - 1, idx(cal, p.au));
      for (let i = a; i <= b; i++) out.set(i, valeur ? valeur(p) : true);
    }
    return out;
  }

  // ---------- Règles ----------

  function heureNorm(h) {
    if (!h) return "18h";
    const m = String(h).match(/^(\d{1,2})(?::(\d{2}))?h?(\d{2})?$/);
    if (!m) return String(h);
    const mn = m[2] || m[3];
    return `${parseInt(m[1], 10)}h${mn && mn !== "00" ? mn : ""}`;
  }

  /** regles du JSON -> {scolaire:{jour,heure,attr}, vacances:{...}} */
  function lireRegles(regles) {
    regles = regles || {};
    const ech = regles.echanges || ECHANGES_DEFAUT;
    const parJour = new Map(ech.map((e) => [e.jour, e]));
    function regle(cle, defaut) {
      const r = regles[cle] || {};
      const jour = r.jour || defaut;
      const e = parJour.get(jour) || {};
      return {
        jour: JOURS.indexOf(jour),
        heure: heureNorm(r.heure || e.heure),
        attr: e.jour_attribue_a || "rend",
      };
    }
    return { scolaire: regle("echange_scolaire", "mercredi"), vacances: regle("echange_vacances", "samedi") };
  }

  function texteAttribution(r) {
    const t = (x) => (x.attr === "recoit"
      ? `celui qui les reçoit le ${JOURS[x.jour]} ${x.heure}`
      : `celui qui les rend le ${JOURS[x.jour]} ${x.heure}`);
    return `Le jour d'échange est attribué au parent qui a les enfants l'après-midi : ${t(r.scolaire)} (période scolaire), ${t(r.vacances)} (vacances).`;
  }

  function ecrireRegles(r, ancien) {
    const s = r.scolaire, v = r.vacances;
    const echanges = [{ jour: JOURS[s.jour], heure: s.heure, jour_attribue_a: s.attr }];
    if (v.jour !== s.jour) echanges.push({ jour: JOURS[v.jour], heure: v.heure, jour_attribue_a: v.attr });
    return Object.assign({}, ancien || {}, {
      echange_scolaire: { jour: JOURS[s.jour], heure: s.heure },
      echange_vacances: { jour: JOURS[v.jour], heure: v.heure },
      attribution: texteAttribution(r),
      echanges,
    });
  }

  // ---------- Modèle ----------

  /** Anciens noms (tierce_indisponible) -> tierce_indisponible ; modifie et renvoie l'objet. */
  function migrerTierce(d) {
    if (d && d.tierce_indisponible) {
      if (!d.tierce_indisponible) d.tierce_indisponible = d.tierce_indisponible;
      delete d.tierce_indisponible;
    }
    return d;
  }

  /**
   * Construit le modèle de travail à partir d'un JSON de planning et, en
   * option, du planning tierce chargé à part ({annee, tierce_indisponible}).
   * Sans planning tierce, les nuits libres à deux ne sont ni calculées ni optimisées.
   */
  function charger(data, tierce) {
    data = migrerTierce(Object.assign({}, data));
    if (tierce) tierce = migrerTierce(Object.assign({}, tierce));
    const cal = calendrier(data.annee);
    const avecTierce = !!(tierce || data.tierce_indisponible);
    if (tierce) data = Object.assign({}, data, { tierce_indisponible: tierce.tierce_indisponible || [] });
    const garde = plagesVersJours(cal, data.garde_segments, (p) => CODE[p.parent]);
    const own = new Array(cal.n);
    for (let i = 0; i < cal.n; i++) own[i] = garde.get(i) || null;
    const vacC = new Set(plagesVersJours(cal, (data.vacances || {}).zone_c || []).keys());
    const vacB = new Set(plagesVersJours(cal, (data.vacances || {}).zone_b || []).keys());
    // plus longue période de vacances zone C = été (blocs plus longs autorisés)
    let ete = new Set();
    for (const p of (data.vacances || {}).zone_c || []) {
      const s = new Set(plagesVersJours(cal, [p]).keys());
      if (s.size > ete.size) ete = s;
    }
    const tierceBusy = new Set(plagesVersJours(cal, data.tierce_indisponible || []).keys());
    // Nuits de Tierce (soir de i -> matin de i+1) : la nuit du jour « fin » (rendu le matin) est libre.
    const tierceNuits = new Set(tierceBusy);
    for (const p of data.tierce_indisponible || []) if (p.fin) tierceNuits.delete(idx(cal, p.au));
    const tierceLabels = new Map();
    for (const p of data.tierce_indisponible || []) {
      if (p.des) tierceLabels.set(idx(cal, p.du), `dès ${p.des}`);
      if (p.fin) tierceLabels.set(idx(cal, p.au), `fin ${p.fin}`);
    }
    const feries = new Map((data.feries || []).map((f) => [idx(cal, f.date), f.nom]));
    const verrous = new Set((data.verrous || []).map((s) => idx(cal, s)));
    return {
      cal, own, regles: lireRegles(data.regles), vacC, vacB, ete, tierceBusy, tierceNuits, tierceLabels,
      feries, verrous, data, avecTierce,
    };
  }

  function cloner(m) {
    return Object.assign({}, m, { own: m.own.slice(), verrous: new Set(m.verrous),
      regles: JSON.parse(JSON.stringify(m.regles)) });
  }

  function plages(m) {
    const out = [];
    for (let i = 0; i < m.cal.n; i++) {
      const o = m.own[i];
      const last = out[out.length - 1];
      if (last && last.o === o && last.b === i - 1) last.b = i;
      else out.push({ a: i, b: i, o });
    }
    return out.map((s) => ({ du: m.cal.iso[s.a], au: m.cal.iso[s.b], parent: PARENT[s.o] }));
  }

  /** JSON exportable (mêmes champs que l'original + garde/règles modifiées). */
  function exporter(m, extra) {
    const d = JSON.parse(JSON.stringify(m.data));
    delete d.tierce_indisponible; // le planning tierce vit dans son propre fichier
    d.garde_segments = plages(m);
    d.regles = ecrireRegles(m.regles, d.regles);
    if (m.verrous.size) d.verrous = [...m.verrous].sort((a, b) => a - b).map((i) => m.cal.iso[i]);
    else delete d.verrous;
    return Object.assign(d, extra || {});
  }

  // ---------- Analyses ----------

  function regleDuJour(m, i) {
    return m.vacC.has(i) ? m.regles.vacances : m.regles.scolaire;
  }

  /**
   * Règle d'échange valable le jour x, ou null. Un échange qui tombe un jour
   * férié est reporté au lendemain (ex. samedi 25/12 -> dimanche 26/12).
   */
  function regleEchange(m, x) {
    if (x < 0 || x >= m.cal.n) return null;
    const r = regleDuJour(m, x);
    if (m.cal.jour[x] === r.jour && !m.feries.has(x)) return r;
    if (x > 0 && m.feries.has(x - 1)) {
      const r0 = regleDuJour(m, x - 1);
      if (m.cal.jour[x - 1] === r0.jour) return { ...r0, reporte: true };
    }
    return null;
  }

  /** Échanges : Map(jour -> {rend, recoit, heure, ok, attendu, reporte}). */
  function echanges(m) {
    const out = new Map();
    for (let d = 0; d + 1 < m.cal.n; d++) {
      const a = m.own[d], b = m.own[d + 1];
      if (a === b) continue;
      const rS = regleEchange(m, d + 1), rF = regleEchange(m, d);
      if (rS && rS.attr === "recoit") {
        out.set(d + 1, { rend: a, recoit: b, heure: rS.heure, ok: true, reporte: !!rS.reporte });
      } else if (rF && rF.attr === "rend") {
        out.set(d, { rend: a, recoit: b, heure: rF.heure, ok: true, reporte: !!rF.reporte });
      } else {
        const rF = regleDuJour(m, d);
        const attendu = `${m.vacC.has(d) ? "vacances" : "période scolaire"} : ${JOURS[rF.jour]} ${rF.heure}`;
        out.set(d, { rend: a, recoit: b, heure: rF.heure, ok: false, attendu });
      }
    }
    return out;
  }

  function compter(m) {
    const mois = MOIS.map(() => ({ P: 0, M: 0 }));
    let P = 0, M = 0;
    m.own.forEach((o, i) => { if (o) { mois[m.cal.mois[i]][o]++; if (o === "P") P++; else M++; } });
    return { P, M, ecart: Math.abs(P - M), mois };
  }

  /** Qui a les enfants la nuit du jour i (soir de i -> matin de i+1). */
  function nuitDe(m, ech, i) {
    return ech.has(i) ? ech.get(i).recoit : m.own[i];
  }

  /** Nuits libres à deux : jour i = nuit du soir de i au matin de i+1, sans enfants pour Papa ni le tiers. */
  function libres(m, ech) {
    if (!m.avecTierce) return new Set(); // pas de planning tierce : rien à calculer
    ech = ech || echanges(m);
    const libre = (i) => nuitDe(m, ech, i) === "M" && !m.tierceNuits.has(i);
    const out = new Set();
    for (let i = 0; i < m.cal.n; i++) if (libre(i)) out.add(i);
    return out;
  }

  /** Week-ends libres : nuits du vendredi ET du samedi libres (renvoie les samedis). */
  function weekendsLibres(m, lib) {
    lib = lib || libres(m);
    return [...lib].filter((i) => m.cal.jour[i] === 5 && lib.has(i - 1));
  }

  function blocs(m) {
    const out = [];
    for (let i = 0; i < m.cal.n; i++) {
      const last = out[out.length - 1];
      if (last && last.o === m.own[i]) { last.b = i; last.len++; }
      else out.push({ a: i, b: i, o: m.own[i], len: 1 });
    }
    for (const bl of out) {
      let e = 0;
      for (let i = bl.a; i <= bl.b; i++) if (m.ete.has(i)) e++;
      bl.ete = e * 2 > bl.len;
    }
    return out;
  }

  function nomJour(m, i) {
    const c = m.cal;
    return `${JOURS[c.jour[i]]} ${c.quantieme[i]} ${MOIS[c.mois[i]].toLowerCase()}`;
  }

  /** Alertes : échanges hors règle, blocs trop longs/courts, week-ends perdus. */
  function alertes(m, opts, refLibres) {
    opts = Object.assign({}, OPTIONS_DEFAUT, opts || {});
    const out = [];
    if (m.own.some((o) => !o)) out.push({ niveau: "erreur", jour: m.own.findIndex((o) => !o), msg: "Jour sans parent attribué." });
    const ech = echanges(m);
    for (const [d, e] of ech) {
      if (!e.ok) out.push({ niveau: "erreur", jour: d,
        msg: `Échange le ${nomJour(m, d)} hors règle (attendu ${e.attendu}).` });
    }
    const bl = blocs(m);
    bl.forEach((b, k) => {
      const max = b.ete ? opts.blocMaxEte : opts.blocMax;
      const qui = b.o === "P" ? "Papa" : "Maman";
      if (b.len > max) out.push({ niveau: "alerte", jour: b.a,
        msg: `Bloc ${qui} de ${b.len} jours (${nomJour(m, b.a)} → ${nomJour(m, b.b)}), max ${max}.` });
      if (b.len < opts.blocMin && k > 0 && k < bl.length - 1) out.push({ niveau: "alerte", jour: b.a,
        msg: `Bloc ${qui} de ${b.len} jour(s) seulement (${nomJour(m, b.a)} → ${nomJour(m, b.b)}).` });
    });
    const lib = libres(m, ech);
    if (refLibres) {
      const perdus = [...refLibres].filter((i) => !lib.has(i)).sort((a, b) => a - b);
      for (let k = 0; k < perdus.length; k++) {
        let f = k;
        while (f + 1 < perdus.length && perdus[f + 1] === perdus[f] + 1) f++;
        const a = perdus[k], b = perdus[f];
        out.push({ niveau: "alerte", jour: a, msg: a === b
          ? `Nuit libre à deux perdue : ${nomJour(m, a)} soir.`
          : `Nuits libres à deux perdues : ${nomJour(m, a)} → ${nomJour(m, b)} soir.` });
        k = f;
      }
    }
    const c = compter(m);
    if (c.ecart > 1) out.push({ niveau: "info", jour: null,
      msg: `Écart de ${c.ecart} jours (Papa ${c.P} / Maman ${c.M}).` });
    return out;
  }

  // ---------- Édition ----------

  /** Bascule le jour d puis la suite du bloc jusqu'au prochain échange. */
  function basculerDepuis(m, d) {
    const o = m.own[d], n = autre(o);
    for (let i = d; i < m.cal.n && m.own[i] === o; i++) m.own[i] = n;
  }

  function basculerJour(m, d) { m.own[d] = autre(m.own[d]); }

  /** Remplace la garde par une liste de plages ; renvoie les erreurs. */
  function appliquerPlages(m, liste) {
    const cal = m.cal, own = new Array(cal.n).fill(null), err = [];
    liste.forEach((p, k) => {
      const a = idx(cal, p.du), b = idx(cal, p.au);
      if (a < 0 || b >= cal.n || a > b) { err.push(`Plage ${k + 1} : dates invalides.`); return; }
      for (let i = a; i <= b; i++) {
        if (own[i]) err.push(`Plage ${k + 1} : chevauchement le ${nomJour(m, i)}.`);
        own[i] = CODE[p.parent];
      }
    });
    const trou = own.findIndex((o) => !o);
    if (trou >= 0) err.push(`Jour non couvert : ${nomJour(m, trou)}.`);
    if (!err.length) m.own = own;
    return err.slice(0, 5);
  }

  // ---------- Suggestion automatique (programmation dynamique) ----------

  /** Atomes = intervalles entre deux échanges possibles selon les règles. */
  function atomes(m) {
    const cal = m.cal, bornes = [];
    for (let x = 1; x < cal.n; x++) {
      const r = regleEchange(m, x);
      if (r) bornes.push({ jour: x, attr: r.attr });
    }
    const at = [];
    for (let k = 0; k <= bornes.length; k++) {
      const deb = k ? bornes[k - 1] : null, fin = bornes[k] || null;
      const a = deb ? deb.jour : 0, b = fin ? fin.jour : cal.n - 1;
      const jours = [], interieur = [];
      for (let i = a; i <= b; i++) {
        const surDeb = deb && i === a, surFin = fin && i === b;
        if (!surDeb && !surFin) { jours.push(i); interieur.push(i); }
        else if (surDeb && deb.attr === "recoit") jours.push(i);
        else if (surFin && fin.attr === "rend") jours.push(i);
      }
      at.push({ a, b, deb: deb && deb.jour, jours, interieur: new Set(interieur) });
    }
    return at;
  }

  function coutBloc(n, ete, o) {
    const hi = ete ? o.blocMaxEte : o.blocMax;
    return Math.pow(Math.max(0, n - hi), 2) * 3 + Math.pow(Math.max(0, o.blocMin - n), 2) * 4;
  }

  /**
   * Propose une garde complète selon les règles du modèle.
   * Contraintes dures : jours verrouillés (gardent leur parent actuel) et,
   * si demandé, week-ends libres à deux de référence (enfants chez Maman).
   * Coût : longueur des blocs + équité + bonus week-ends libres à deux.
   */
  function suggerer(m, opts, refLibres) {
    if (refLibres) {
      const we = new Set();
      // Nuit d chez Maman <=> jour d+1 chez Maman (et jour d aussi si d+1 est un
      // jour d'échange attribué à celui qui reçoit). Nuits ven. + sam.
      const nuitM = (d) => {
        if (d + 1 < m.cal.n) we.add(d + 1);
        const r = regleDuJour(m, d + 1);
        if (r.attr === "recoit" && m.cal.jour[d + 1] === r.jour) we.add(d);
      };
      for (const i of weekendsLibres(m, refLibres)) { nuitM(i - 1); nuitM(i); }
      refLibres = we;
    }
    const o = Object.assign({}, OPTIONS_DEFAUT, opts || {});
    // Sans planning tierce, on optimise seulement blocs + équité.
    if (!m.avecTierce) Object.assign(o, { bonusWeekend: 0, poidsAlignementTierce: 0, garderLibres: false });
    const at = atomes(m), N = at.length, cal = m.cal;
    const fix = new Array(N).fill(null);
    at.forEach((t, i) => {
      if (o.utiliserVerrous) for (const d of t.jours) if (m.verrous.has(d)) fix[i] = m.own[d];
      if (o.garderLibres && refLibres) for (let d = t.a; d <= t.b; d++) if (refLibres.has(d)) fix[i] = "M";
    });
    const ete = at.map((t) => t.jours.length > 0 && t.jours.every((d) => m.ete.has(d)));
    const tierceLibre = (d) => !m.tierceBusy.has(d);
    // bonus week-end : dimanche dans [debut de l'atome, fin exclue)
    function bonus(i, prev, cur) {
      if (cur !== "M") return 0;
      const t = at[i];
      let b = 0;
      for (let s = t.a; s < t.b || (i === N - 1 && s <= t.b); s++) {
        if (cal.jour[s] !== 6 || s === 0) continue;
        const sam = s - 1;
        if (!tierceLibre(s) || !tierceLibre(sam)) continue;
        const okJour = (d) => {
          if (t.interieur.has(d)) return true;
          if (d === t.deb) return prev === "M";
          return prev === "M" && d < t.a; // samedi dans l'atome précédent
        };
        if (okJour(s) && okJour(sam)) b += o.bonusWeekend;
      }
      for (const d of t.interieur) if (cal.jour[d] === 5 && m.tierceBusy.has(d)) b -= o.poidsAlignementTierce;
      return b;
    }
    // états : clé "o|run|ete|diff"
    let couche = new Map([["-|0|0|0", { c: 0, prev: null, o: null }]]);
    const hist = [];
    for (let i = 0; i < N; i++) {
      const suiv = new Map(), n = at[i].jours.length;
      for (const [k, st] of couche) {
        const [po, prs, pes, pds] = k.split("|");
        const pr = +prs, pe = pes === "1", pd = +pds;
        for (const cur of ["P", "M"]) {
          if (fix[i] && fix[i] !== cur) continue;
          const dd = cur === "P" ? n : -n;
          let c = st.c - bonus(i, po, cur), run, e;
          if (cur === po) { run = Math.min(pr + n, 40); e = pe || ete[i]; }
          else { if (po !== "-") c += coutBloc(pr, pe, o); run = n; e = ete[i]; }
          const key = `${cur}|${run}|${e ? 1 : 0}|${pd + dd}`;
          const ex = suiv.get(key);
          if (!ex || c < ex.c) suiv.set(key, { c, prev: k, o: cur });
        }
      }
      hist.push(suiv);
      couche = suiv;
    }
    let best = null, bestKey = null;
    for (const [k, st] of couche) {
      const [, rs, es, ds] = k.split("|");
      const c = st.c + coutBloc(+rs, es === "1", o) + o.poidsEquite * Math.abs(+ds);
      if (!best || c < best) { best = c; bestKey = k; }
    }
    if (bestKey === null) return null; // contraintes impossibles
    const choix = new Array(N);
    for (let i = N - 1, k = bestKey; i >= 0; i--) { const st = hist[i].get(k); choix[i] = st.o; k = st.prev; }
    const res = cloner(m);
    at.forEach((t, i) => { for (const d of t.jours) res.own[d] = choix[i]; });
    return res;
  }

  // ---------- Planning vide (point de départ, sans données personnelles) ----------

  // Calendrier scolaire officiel (données publiques) par année civile.
  const VACANCES = {
    2027: {
      zone_c: [
        { nom: "Noël (fin)", du: "2027-01-01", au: "2027-01-03" },
        { nom: "Hiver", du: "2027-02-06", au: "2027-02-21" },
        { nom: "Printemps", du: "2027-04-03", au: "2027-04-18" },
        { nom: "Été", du: "2027-07-03", au: "2027-09-01" },
        { nom: "Toussaint", du: "2027-10-23", au: "2027-11-07" },
        { nom: "Noël", du: "2027-12-18", au: "2027-12-31" },
      ],
      zone_b: [
        { nom: "Noël (fin)", du: "2027-01-01", au: "2027-01-03" },
        { nom: "Hiver", du: "2027-02-20", au: "2027-03-07" },
        { nom: "Printemps", du: "2027-04-17", au: "2027-05-02" },
        { nom: "Été", du: "2027-07-03", au: "2027-09-01" },
        { nom: "Toussaint", du: "2027-10-23", au: "2027-11-07" },
        { nom: "Noël", du: "2027-12-18", au: "2027-12-31" },
      ],
    },
  };

  /** Jours fériés français (Pâques par l'algorithme de Meeus). */
  function feriesFrance(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = Date.UTC(annee, mois - 1, jour);
    const rel = (n) => new Date(paques + n * 86400000).toISOString().slice(0, 10);
    const fixe = (mm, jj) => `${annee}-${mm}-${jj}`;
    return [
      { date: fixe("01", "01"), nom: "Jour de l'an" }, { date: rel(1), nom: "Lundi de Pâques" },
      { date: fixe("05", "01"), nom: "Fête du Travail" }, { date: fixe("05", "08"), nom: "Victoire 1945" },
      { date: rel(39), nom: "Ascension" }, { date: rel(50), nom: "Lundi de Pentecôte" },
      { date: fixe("07", "14"), nom: "Fête nationale" }, { date: fixe("08", "15"), nom: "Assomption" },
      { date: fixe("11", "01"), nom: "Toussaint" }, { date: fixe("11", "11"), nom: "Armistice" },
      { date: fixe("12", "25"), nom: "Noël" },
    ].sort((x, y) => (x.date < y.date ? -1 : 1));
  }

  /** JSON d'un planning neuf : toute l'année chez Papa, à découper ensuite. */
  function planningVide(annee) {
    annee = annee || 2027;
    return {
      annee,
      meta: { description: `Nouveau planning de garde ${annee}, créé avec l'éditeur.`,
        parents: { papa: "Papa", maman: "Maman" } },
      regles: ecrireRegles(lireRegles({})),
      garde_segments: [{ du: `${annee}-01-01`, au: `${annee}-12-31`, parent: "papa" }],
      vacances: JSON.parse(JSON.stringify(VACANCES[annee] || { zone_c: [], zone_b: [] })),
      feries: feriesFrance(annee),
    };
  }

  // ---------- Édition du planning tierce ----------
  // Une période {du, au, des?, fin?} = Tierce a ses enfants du jour « du » (dès
  // l'heure « des ») au jour « au » (rendus le matin si « fin » : la nuit de
  // « au » est alors libre).

  function tierceJours(cal, periodes) {
    const jours = new Array(cal.n).fill(false);
    for (const i of plagesVersJours(cal, periodes).keys()) jours[i] = true;
    return jours;
  }

  /**
   * Jours -> périodes. Les heures « des » / « fin » sont reprises des
   * anciennes périodes dont le début / la fin tombe dans la nouvelle ; une
   * nouvelle fin vaut « matin » (sauf au 31 décembre : nuit comptée).
   */
  function tierceDepuisJours(cal, jours, anciennes) {
    const out = [];
    for (let a = 0; a < cal.n; a++) {
      if (!jours[a]) continue;
      let b = a;
      while (b + 1 < cal.n && jours[b + 1]) b++;
      const dans = (s) => { const i = idx(cal, s); return i >= a && i <= b; };
      const deb = anciennes.filter((p) => p.des && dans(p.du))[0];
      const fins = anciennes.filter((p) => dans(p.au));
      const p = { du: cal.iso[a], au: cal.iso[b] };
      if (deb) p.des = deb.des;
      if (fins.length) { if (fins[fins.length - 1].fin) p.fin = fins[fins.length - 1].fin; }
      else if (b < cal.n - 1) p.fin = "matin";
      out.push(p);
      a = b;
    }
    return out;
  }

  /** Met les jours a..b à `valeur` (Tierce a / n'a pas ses enfants). */
  function tierceBasculer(annee, periodes, a, b, valeur) {
    const cal = calendrier(annee), jours = tierceJours(cal, periodes);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) jours[i] = valeur;
    return tierceDepuisJours(cal, jours, periodes);
  }

  /** Remet une liste de périodes (éditée à la main) en ordre : tri, fusion, année. */
  function tierceNormaliser(annee, periodes) {
    const cal = calendrier(annee);
    return tierceDepuisJours(cal, tierceJours(cal, periodes), periodes);
  }

  const api = {
    planningVide, feriesFrance, migrerTierce, tierceBasculer, tierceNormaliser,
    JOURS, MOIS, PARENT, OPTIONS_DEFAUT, calendrier, charger, cloner, plages, exporter,
    lireRegles, ecrireRegles, heureNorm, echanges, compter, nuitDe, libres, weekendsLibres, blocs, alertes,
    basculerDepuis, basculerJour, appliquerPlages, atomes, suggerer, nomJour, regleDuJour,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Garde = api;
})(typeof window !== "undefined" ? window : globalThis);
