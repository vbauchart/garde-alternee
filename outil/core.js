/* Calcul du planning de garde par règles strictes (sans interface).
 *
 * Un planning est entièrement décrit par sa configuration (voir
 * PLANNING_DEFAUT) : zone de vacances, échange hors vacances et en vacances
 * (jour, heure, à qui compte le jour d'échange), parité des semaines de Papa,
 * semaine de Papa aux petites vacances et quinzaines de Papa l'été (années
 * paires ; inversé les années impaires). Aucun calcul automatique : le
 * planning est la conséquence directe des règles (voir CONTRAINTES.md).
 *
 * Utilisé par editeur.html (navigateur) et testable avec node.
 */
(function (global) {
  "use strict";

  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
    "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const ZONES = ["A", "B", "C"];
  const NOM = { P: "Papa", M: "Maman" };
  const JOUR_MS = 86400000;
  const COURT_MIN = 3; // une période chez un parent de moins de 3 jours est signalée

  const PLANNING_DEFAUT = {
    nom: "Planning 1",
    zone: "C",
    hors: { jour: "mercredi", heure: "18h", compte: "rend" },     // échange hors vacances
    vacances: { jour: "samedi", heure: "18h", compte: "rend" },   // échange en vacances
    semainesPapa: "paires",       // semaines ISO (de l'échange qui ouvre la semaine) de Papa
    petitesVacancesPapa: 1,       // semaine de Papa aux petites vacances, années paires
    etePapa: "1-3",               // quinzaines de Papa l'été, années paires ("1-3" ou "2-4")
  };

  // ---------- Dates : un jour = nombre de jours depuis le 1970-01-01 (UTC) ----------

  const versJour = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / JOUR_MS);
  const versIso = (j) => new Date(j * JOUR_MS).toISOString().slice(0, 10);
  const jourSemaine = (j) => (((j + 3) % 7) + 7) % 7; // 0 = lundi (le 1970-01-01 est un jeudi)

  /** Numéro de semaine ISO 8601 du jour j. */
  function semaineIso(j) {
    const jeudi = j - jourSemaine(j) + 3;
    const annee = new Date(jeudi * JOUR_MS).getUTCFullYear();
    return Math.floor((jeudi - versJour(`${annee}-01-01`)) / 7) + 1;
  }

  /** "18h", "18h30", "9:15" -> minutes depuis minuit. */
  function minutes(h) {
    const m = String(h || "").trim().match(/^(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?$/i);
    if (!m) return 18 * 60;
    return Math.min(23, +m[1]) * 60 + Math.min(59, +(m[2] || 0));
  }
  function heureNorm(h) {
    const t = minutes(h), mn = t % 60;
    return `${Math.floor(t / 60)}h${mn ? String(mn).padStart(2, "0") : ""}`;
  }

  // ---------- Calendrier scolaire officiel (données publiques) ----------
  // « du » = premier jour des vacances (après la classe), « au » = veille de la reprise.

  const NOEL_2026 = { nom: "Noël", du: "2026-12-19", au: "2027-01-03" };
  const ETE_2027 = { nom: "Été", du: "2027-07-03", au: "2027-09-01" };
  const TOUSSAINT_2027 = { nom: "Toussaint", du: "2027-10-23", au: "2027-11-07" };
  const NOEL_2027 = { nom: "Noël", du: "2027-12-18", au: "2028-01-02" };
  // Calendrier 2028-2029 pas encore publié : la fin de l'été 2028 est arrêtée au
  // 31 août, Toussaint et Noël 2028 manquent.
  const ETE_2028 = { nom: "Été", du: "2028-07-04", au: "2028-08-31" };
  const CALENDRIER_CONNU_JUSQUA = "2028-08-31";

  const zone = (h27, p27, h28, p28) => [
    NOEL_2026,
    { nom: "Hiver", du: h27[0], au: h27[1] }, { nom: "Printemps", du: p27[0], au: p27[1] },
    ETE_2027, TOUSSAINT_2027, NOEL_2027,
    { nom: "Hiver", du: h28[0], au: h28[1] }, { nom: "Printemps", du: p28[0], au: p28[1] },
    ETE_2028,
  ];
  const VACANCES = {
    A: zone(["2027-02-13", "2027-02-28"], ["2027-04-10", "2027-04-25"], ["2028-02-19", "2028-03-05"], ["2028-04-22", "2028-05-08"]),
    B: zone(["2027-02-20", "2027-03-07"], ["2027-04-17", "2027-05-02"], ["2028-02-05", "2028-02-20"], ["2028-04-08", "2028-04-23"]),
    C: zone(["2027-02-06", "2027-02-21"], ["2027-04-03", "2027-04-18"], ["2028-02-12", "2028-02-27"], ["2028-04-15", "2028-05-01"]),
  };
  const ANNEES = [2027, 2028];

  /** Jours fériés français (Pâques par l'algorithme de Meeus). */
  function feriesFrance(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = Date.UTC(annee, mois - 1, jour);
    const rel = (n) => new Date(paques + n * JOUR_MS).toISOString().slice(0, 10);
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

  // ---------- Configuration ----------

  /** Complète et nettoie une configuration de planning (import, stockage). */
  function normaliser(p) {
    p = p || {};
    const d = PLANNING_DEFAUT;
    const regle = (r, def) => {
      r = r || {};
      return {
        jour: JOURS.includes(r.jour) ? r.jour : def.jour,
        heure: heureNorm(r.heure || def.heure),
        compte: r.compte === "recoit" ? "recoit" : "rend",
      };
    };
    const z = String(p.zone || d.zone).toUpperCase();
    return {
      nom: String(p.nom || d.nom),
      zone: ZONES.includes(z) ? z : d.zone,
      hors: regle(p.hors, d.hors),
      vacances: regle(p.vacances, d.vacances),
      semainesPapa: p.semainesPapa === "impaires" ? "impaires" : "paires",
      petitesVacancesPapa: +p.petitesVacancesPapa === 2 ? 2 : 1,
      etePapa: p.etePapa === "2-4" ? "2-4" : "1-3",
    };
  }

  function texteRegles(p) {
    p = normaliser(p);
    const autre = (n) => (n === 1 ? 2 : 1);
    const compte = (r) => (r.compte === "rend" ? "au parent qui rend les enfants" : "au parent qui les reçoit");
    const q = p.etePapa === "1-3" ? ["1 et 3", "2 et 4"] : ["2 et 4", "1 et 3"];
    return [
      `Hors vacances : échange le ${p.hors.jour} à ${p.hors.heure} ; Papa a les semaines ${p.semainesPapa}, ` +
        `Maman les semaines ${p.semainesPapa === "paires" ? "impaires" : "paires"} (n° ISO de la semaine de l'échange).`,
      `Vacances (zone ${p.zone}) : échange le ${p.vacances.jour} à ${p.vacances.heure} ; petites vacances : Papa a la ` +
        `${p.petitesVacancesPapa === 1 ? "1re" : "2e"} semaine les années paires, la ${autre(p.petitesVacancesPapa) === 1 ? "1re" : "2e"} ` +
        `les années impaires ; été : Papa a les quinzaines ${q[0]} les années paires, ${q[1]} les années impaires ` +
        "(année du début des vacances).",
      p.hors.compte === p.vacances.compte
        ? `Le jour d'échange compte ${compte(p.hors)}. Un échange un jour férié est reporté au lendemain.`
        : `Le jour d'échange compte ${compte(p.hors)} hors vacances, ${compte(p.vacances)} en vacances. ` +
          "Un échange un jour férié est reporté au lendemain.",
    ];
  }

  // ---------- Calcul ----------

  /**
   * Planning de l'année `annee` selon la configuration `p`.
   * Renvoie { annee, jours: [{iso, js, quantieme, mois, parent, echange, ferie}],
   *           total: {P, M, ecart, mois}, blocs, courtes, incomplet }.
   * `courtes` : périodes de moins de COURT_MIN jours comptés chez un même
   * parent ({parent, du, au, jours}) ; les jours concernés ont `court: true`.
   *
   * Le temps est mesuré en minutes (jour * 1440 + heure). Qui a les enfants à
   * l'instant t : le bloc de vacances qui contient t, sinon la semaine hors
   * vacances ouverte par le dernier échange hors vacances avant t (parité ISO).
   */
  function calculer(p, annee) {
    p = normaliser(p);
    const debut = versJour(`${annee}-01-01`), fin = versJour(`${annee}-12-31`);
    const de = debut - 70, a = fin + 70; // marge : vacances et semaines à cheval sur l'année

    const feries = new Map();
    for (const y of [annee - 1, annee, annee + 1]) for (const f of feriesFrance(y)) feries.set(versJour(f.date), f.nom);
    const reporter = (j) => { while (feries.has(j)) j++; return j; }; // férié : reporté au lendemain

    const regle = (r) => ({ jour: JOURS.indexOf(r.jour), min: minutes(r.heure), heure: r.heure, compte: r.compte });
    const hors = regle(p.hors), vac = regle(p.vacances);
    const instant = (j, r) => reporter(j) * 1440 + r.min;

    // Blocs de vacances : semaines (quinzaines l'été) d'un échange vacances au
    // suivant, à partir du premier jour d'échange vacances dans les vacances.
    const blocs = [];
    for (const v of VACANCES[p.zone]) {
      const du = versJour(v.du), au = versJour(v.au);
      if (au < de || du > a) continue;
      const ete = v.nom === "Été", longueur = ete ? 14 : 7, nbMax = ete ? 4 : 2;
      const paire = +v.du.slice(0, 4) % 2 === 0;
      let s = du;
      while (jourSemaine(s) !== vac.jour) s++;
      // un bloc peut se terminer au plus tard le jour de la reprise (au + 1)
      for (let k = 0; k < nbMax && s + longueur <= au + 1; k++, s += longueur) {
        const papaAnneePaire = ete ? (k % 2 === 0) === (p.etePapa === "1-3") : k + 1 === p.petitesVacancesPapa;
        blocs.push({
          vacances: `${v.nom} ${v.du.slice(0, 4)}`, numero: k + 1, ete,
          debut: instant(s, vac), fin: instant(s + longueur, vac),
          parent: papaAnneePaire === paire ? "P" : "M",
        });
      }
    }

    // Semaines hors vacances : ouvertes par chaque échange hors vacances.
    const semaines = [];
    for (let j = de; j <= a; j++) {
      if (jourSemaine(j) !== hors.jour) continue;
      const paire = semaineIso(j) % 2 === 0;
      semaines.push({ t: instant(j, hors), parent: paire === (p.semainesPapa === "paires") ? "P" : "M" });
    }

    function parentA(t) {
      for (const b of blocs) if (b.debut <= t && t < b.fin) return b.parent;
      let parent = semaines[0].parent === "P" ? "M" : "P";
      for (const s of semaines) { if (s.t > t) break; parent = s.parent; }
      return parent;
    }

    // Échanges : instants candidats où le parent change.
    const candidats = new Map();
    for (const s of semaines) candidats.set(s.t, hors);
    for (const b of blocs) { candidats.set(b.debut, vac); candidats.set(b.fin, vac); }
    const echanges = new Map(); // jour -> [{rend, recoit, heure, compte}]
    for (const t of [...candidats.keys()].sort((x, y) => x - y)) {
      const avant = parentA(t - 1), apres = parentA(t);
      if (avant === apres) continue;
      const r = candidats.get(t), j = Math.floor(t / 1440);
      if (!echanges.has(j)) echanges.set(j, []);
      echanges.get(j).push({ rend: avant, recoit: apres, heure: r.heure, compte: r.compte });
    }

    // Parent compté chaque jour, marge comprise (pour les périodes à cheval sur l'année).
    const parJour = new Map(), echJour = new Map();
    for (let j = de; j <= a; j++) {
      const liste = echanges.get(j);
      let parent, echange = null;
      if (liste) {
        const e0 = liste[0], e1 = liste[liste.length - 1];
        echange = { rend: e0.rend, recoit: e1.recoit, heure: e0.heure, compte: e0.compte };
        parent = e0.compte === "rend" ? e0.rend : e1.recoit;
        if (echange.rend === echange.recoit) echange = null; // aller-retour dans la journée
      } else parent = parentA(j * 1440);
      parJour.set(j, parent); echJour.set(j, echange);
    }

    // Périodes courtes : moins de COURT_MIN jours comptés d'affilée chez le même
    // parent (la première et la dernière période de la marge, tronquées, sont ignorées).
    const courts = new Set(), courtes = [];
    for (let j = de, run = de; j <= a; j++) {
      if (j < a && parJour.get(j + 1) === parJour.get(j)) continue;
      const n = j - run + 1;
      if (run > de && j < a && n < COURT_MIN && j >= debut && run <= fin) {
        for (let x = run; x <= j; x++) courts.add(x);
        courtes.push({ parent: parJour.get(j), du: versIso(run), au: versIso(j), jours: n });
      }
      run = j + 1;
    }

    const jours = [], total = { P: 0, M: 0, mois: MOIS.map(() => ({ P: 0, M: 0 })) };
    for (let j = debut; j <= fin; j++) {
      const iso = versIso(j), parent = parJour.get(j);
      const mois = +iso.slice(5, 7) - 1;
      total[parent]++; total.mois[mois][parent]++;
      jours.push({ iso, js: jourSemaine(j), quantieme: +iso.slice(8), mois, parent, echange: echJour.get(j),
        ferie: feries.get(j) || null, court: courts.has(j) });
    }
    total.ecart = Math.abs(total.P - total.M);

    const fmt = (t) => {
      const j = Math.floor(t / 1440), h = heureNorm(`${Math.floor((t % 1440) / 60)}h${String(t % 60).padStart(2, "0")}`);
      return { iso: versIso(j), js: jourSemaine(j), heure: h };
    };
    const blocsAnnee = blocs
      .filter((b) => b.fin > debut * 1440 && b.debut < (fin + 1) * 1440)
      .map((b) => Object.assign({}, b, { du: fmt(b.debut), au: fmt(b.fin) }));

    return { annee, jours, total, blocs: blocsAnnee, courtes, incomplet: fin > versJour(CALENDRIER_CONNU_JUSQUA) };
  }

  /** Jours (iso) de vacances de la zone z pendant l'année. */
  function joursVacances(z, annee) {
    const out = new Map();
    for (const v of VACANCES[z]) {
      for (let j = versJour(v.du); j <= versJour(v.au); j++) {
        const iso = versIso(j);
        if (iso.startsWith(String(annee))) out.set(iso, v.nom);
      }
    }
    return out;
  }

  const api = {
    JOURS, MOIS, ZONES, NOM, ANNEES, VACANCES, PLANNING_DEFAUT, CALENDRIER_CONNU_JUSQUA, COURT_MIN,
    versJour, versIso, jourSemaine, semaineIso, heureNorm, feriesFrance,
    normaliser, texteRegles, calculer, joursVacances,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Garde = api;
})(typeof window !== "undefined" ? window : globalThis);
