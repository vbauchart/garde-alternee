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
  const FUSION_LIMITE = 6; // valeur maximale du réglage fusionMax (jours)

  const PLANNING_DEFAUT = {
    nom: "Planning 1",
    zone: "C",
    hors: { jour: "mercredi", heure: "18h", compte: "rend" },     // échange hors vacances
    vacances: { jour: "samedi", heure: "18h", compte: "rend" },   // échange en vacances
    semainesPapa: "paires",       // semaines ISO (de l'échange qui ouvre la semaine) de Papa
    petitesVacancesPapa: 1,       // semaine de Papa aux petites vacances, années paires
    etePapa: "1-3",               // quinzaines de Papa l'été, années paires ("1-3" ou "2-4")
    fusionMax: 3,                 // période de fusionMax jours ou moins rendue à l'autre parent (0 : jamais)
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
  // Données intégrées ci-dessous (secours hors ligne), remplacées dans le
  // navigateur par celles de data.gouv.fr (chargerVacances).

  const NOEL_2026 = { nom: "Noël", du: "2026-12-19", au: "2027-01-03" };
  const ETE_2027 = { nom: "Été", du: "2027-07-03", au: "2027-09-01" };
  const TOUSSAINT_2027 = { nom: "Toussaint", du: "2027-10-23", au: "2027-11-07" };
  const NOEL_2027 = { nom: "Noël", du: "2027-12-18", au: "2028-01-02" };
  // Calendrier 2028-2029 pas encore publié : la fin de l'été 2028 est arrêtée au
  // 31 août, Toussaint et Noël 2028 manquent.
  const ETE_2028 = { nom: "Été", du: "2028-07-04", au: "2028-08-31" };

  const zone = (h27, p27, h28, p28) => [
    NOEL_2026,
    { nom: "Hiver", du: h27[0], au: h27[1] }, { nom: "Printemps", du: p27[0], au: p27[1] },
    ETE_2027, TOUSSAINT_2027, NOEL_2027,
    { nom: "Hiver", du: h28[0], au: h28[1] }, { nom: "Printemps", du: p28[0], au: p28[1] },
    ETE_2028,
  ];
  let VACANCES = {
    A: zone(["2027-02-13", "2027-02-28"], ["2027-04-10", "2027-04-25"], ["2028-02-19", "2028-03-05"], ["2028-04-22", "2028-05-08"]),
    B: zone(["2027-02-20", "2027-03-07"], ["2027-04-17", "2027-05-02"], ["2028-02-05", "2028-02-20"], ["2028-04-08", "2028-04-23"]),
    C: zone(["2027-02-06", "2027-02-21"], ["2027-04-03", "2027-04-18"], ["2028-02-12", "2028-02-27"], ["2028-04-15", "2028-05-01"]),
  };
  let ANNEES = [2027, 2028];
  let CALENDRIER_CONNU_JUSQUA = "2028-08-31";
  let SOURCE_VACANCES = { type: "integre", date: null }; // "integre" ou "data.gouv" (date de téléchargement)

  /** Requête de l'API Opendatasoft du ministère (jeu « Le calendrier scolaire » de data.gouv.fr). */
  function urlCalendrierOfficiel(depuisAnnee) {
    const q = new URLSearchParams({
      select: "description,start_date,end_date,zones,population",
      where: `zones in ("Zone A","Zone B","Zone C") and start_date>=date'${depuisAnnee}-08-01'`,
      group_by: "description,start_date,end_date,zones,population",
      order_by: "start_date",
    });
    return "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/exports/json?" + q;
  }

  /**
   * Lignes de l'API -> { vacances: {A,B,C}, annees, connuJusqua }, ou null si
   * les données sont inutilisables. Les dates sont en UTC (minuit heure de
   * Paris) : +12 h donne le bon jour quel que soit le décalage. end_date est le
   * jour de la reprise. Les ponts (Ascension) et les dates des enseignants sont
   * ignorés ; un été dont seul le début est publié est arrêté au 31 août.
   * annees : années (>= anneeMin) couvertes, marge de 70 jours avant le 1er janvier.
   */
  function lireCalendrierOfficiel(lignes, anneeMin) {
    if (!Array.isArray(lignes)) return null;
    const NOMS = [[/toussaint/i, "Toussaint"], [/no[eë]l/i, "Noël"], [/hiver/i, "Hiver"],
      [/printemps/i, "Printemps"], [/[ée]t[ée]/i, "Été"]];
    const jourParis = (s) => (Date.parse(s) ? versJour(new Date(Date.parse(s) + 43200000).toISOString().slice(0, 10)) : NaN);
    const parZone = { A: new Map(), B: new Map(), C: new Map() };
    for (const l of lignes) {
      const z = String((l && l.zones) || "").replace(/^Zone\s+/i, "");
      if (!parZone[z] || /enseignant/i.test(l.population || "") || /pont/i.test(l.description || "")) continue;
      const n = NOMS.find(([re]) => re.test(l.description || ""));
      const du = jourParis(l.start_date), fin = jourParis(l.end_date);
      if (!n || !Number.isFinite(du)) continue;
      const nom = n[1], iso = versIso(du);
      let au = Number.isFinite(fin) && fin > du ? fin - 1 : NaN;
      if (!Number.isFinite(au)) {
        if (nom !== "Été") continue;
        au = versJour(`${iso.slice(0, 4)}-08-31`); // seul le début de l'été est connu
      }
      const cle = `${nom} ${iso}`, deja = parZone[z].get(cle);
      if (!deja || versJour(deja.au) < au) parZone[z].set(cle, { nom, du: iso, au: versIso(au) });
    }
    const vacances = {};
    for (const z of ZONES) {
      vacances[z] = [...parZone[z].values()].sort((x, y) => (x.du < y.du ? -1 : 1));
      if (!vacances[z].length) return null;
    }
    const premier = Math.max(...ZONES.map((z) => versJour(vacances[z][0].du)));
    const connuJusqua = versIso(Math.min(...ZONES.map((z) => Math.max(...vacances[z].map((v) => versJour(v.au))))));
    const annees = [];
    for (let y = anneeMin || 0; y <= +connuJusqua.slice(0, 4); y++) {
      if (premier <= versJour(`${y}-01-01`) - 70) annees.push(y);
    }
    if (!annees.length) return null;
    return { vacances, annees, connuJusqua };
  }

  /** Remplace le calendrier intégré par celui de data.gouv.fr. Renvoie false si les données sont inutilisables. */
  function chargerVacances(lignes, date, anneeMin) {
    const c = lireCalendrierOfficiel(lignes, anneeMin);
    if (!c) return false;
    VACANCES = c.vacances; ANNEES = c.annees; CALENDRIER_CONNU_JUSQUA = c.connuJusqua;
    SOURCE_VACANCES = { type: "data.gouv", date: date || null };
    return true;
  }

  // ---------- Jours fériés ----------
  // Calculés (secours hors ligne, et au-delà des années publiées), remplacés
  // dans le navigateur par ceux de data.gouv.fr (chargerFeries).

  let FERIES = null; // Map iso -> nom, téléchargés
  let SOURCE_FERIES = { type: "calcul", date: null, jusqua: null }; // "calcul" ou "data.gouv"

  /** API Etalab du jeu « Jours fériés en France » de data.gouv.fr (métropole, toutes les années). */
  const urlFeries = () => "https://calendrier.api.gouv.fr/jours-feries/metropole.json";

  /** { "AAAA-MM-JJ": "nom" } -> remplace le calcul pour les années publiées. false si inutilisable. */
  function chargerFeries(donnees, date) {
    if (!donnees || typeof donnees !== "object" || Array.isArray(donnees)) return false;
    const m = new Map();
    for (const [iso, nom] of Object.entries(donnees)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(versJour(iso)) && typeof nom === "string") m.set(iso, nom);
    }
    if (m.size < 10) return false;
    FERIES = m;
    SOURCE_FERIES = { type: "data.gouv", date: date || null, jusqua: Math.max(...[...m.keys()].map((iso) => +iso.slice(0, 4))) };
    return true;
  }

  /** Jours fériés de l'année : téléchargés si l'année est publiée, sinon calculés. */
  function feriesFrance(annee) {
    if (FERIES) {
      const liste = [...FERIES].filter(([iso]) => iso.startsWith(`${annee}-`)).map(([date, nom]) => ({ date, nom }));
      if (liste.length) return liste.sort((x, y) => (x.date < y.date ? -1 : 1));
    }
    return feriesCalcules(annee);
  }

  /** Jours fériés français calculés (Pâques par l'algorithme de Meeus). */
  function feriesCalcules(annee) {
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
  /** Seuil de fusion (0 à FUSION_LIMITE). Anciennes configurations : case fusionCourtes (cochée = 3, décochée = 0). */
  function fusionMax(p) {
    if (p.fusionMax !== undefined && p.fusionMax !== "") {
      const n = Math.round(+p.fusionMax);
      if (Number.isFinite(n)) return Math.min(FUSION_LIMITE, Math.max(0, n));
    }
    if (p.fusionCourtes === false || p.fusionCourtes === "false") return 0;
    return PLANNING_DEFAUT.fusionMax;
  }

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
      fusionMax: fusionMax(p),
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
      ...(p.fusionMax ? [`Une période de ${p.fusionMax} jour${p.fusionMax > 1 ? "s" : ""} ou moins chez un parent, entre deux périodes de l'autre, ` +
        "est rendue à l'autre parent (les deux échanges qui l'encadrent sont supprimés)."] : []),
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

    // Transitions : instants candidats où le parent change, dans l'ordre.
    const candidats = new Map();
    for (const s of semaines) candidats.set(s.t, hors);
    for (const b of blocs) { candidats.set(b.debut, vac); candidats.set(b.fin, vac); }
    const trans = [];
    for (const t of [...candidats.keys()].sort((x, y) => x - y)) {
      if (t < de * 1440) continue;
      const avant = parentA(t - 1), apres = parentA(t);
      if (avant === apres) continue;
      const r = candidats.get(t);
      trans.push({ t, rend: avant, recoit: apres, heure: r.heure, compte: r.compte });
    }
    const parent0 = parentA(de * 1440);

    // Parent compté chaque jour (marge comprise) et échange du jour, d'après les transitions.
    function compter() {
      const parJour = new Map(), echJour = new Map();
      let k = 0, courant = parent0;
      for (let j = de; j <= a; j++) {
        const liste = [];
        while (k < trans.length && Math.floor(trans[k].t / 1440) === j) liste.push(trans[k++]);
        let parent = courant, echange = null;
        if (liste.length) {
          const e0 = liste[0], e1 = liste[liste.length - 1];
          echange = { rend: e0.rend, recoit: e1.recoit, heure: e0.heure, compte: e0.compte };
          parent = e0.compte === "rend" ? e0.rend : e1.recoit;
          courant = e1.recoit;
          if (echange.rend === echange.recoit) echange = null; // aller-retour dans la journée
        }
        parJour.set(j, parent); echJour.set(j, echange);
      }
      return { parJour, echJour };
    }
    // Suites de jours comptés d'affilée chez le même parent (la première et la
    // dernière de la marge, tronquées, sont exclues).
    function suites(parJour) {
      const out = [];
      for (let j = de, run = de; j <= a; j++) {
        if (j < a && parJour.get(j + 1) === parJour.get(j)) continue;
        if (run > de && j < a) out.push({ parent: parJour.get(j), du: run, au: j, n: j - run + 1 });
        run = j + 1;
      }
      return out;
    }

    // Option fusion : la plus courte période de p.fusionMax jours ou moins est
    // rendue à l'autre parent (suppression des deux transitions qui l'encadrent),
    // puis on recommence.
    const fusionnes = new Set(), fusions = [];
    let { parJour, echJour } = compter();
    while (p.fusionMax > 0) {
      const c = suites(parJour).filter((x) => x.n <= p.fusionMax).sort((x, y) => x.n - y.n || x.du - y.du)[0];
      if (!c) break;
      // période (entre deux transitions) de ce parent qui recouvre le plus ces jours
      let meilleur = -1, recouvre = 0;
      for (let i = 0; i + 1 < trans.length; i++) {
        if (trans[i].recoit !== c.parent) continue;
        const r = Math.min(trans[i + 1].t, (c.au + 1) * 1440) - Math.max(trans[i].t, c.du * 1440);
        if (r > recouvre) { recouvre = r; meilleur = i; }
      }
      if (meilleur < 0) break;
      trans.splice(meilleur, 2);
      for (let x = c.du; x <= c.au; x++) fusionnes.add(x);
      if (c.au >= debut && c.du <= fin) {
        fusions.push({ parent: c.parent, au_profit: c.parent === "P" ? "M" : "P", du: versIso(c.du), au: versIso(c.au), jours: c.n });
      }
      ({ parJour, echJour } = compter());
    }
    fusions.sort((x, y) => (x.du < y.du ? -1 : 1));

    // Périodes courtes : moins de COURT_MIN jours comptés d'affilée chez le même parent.
    const courts = new Set(), courtes = [];
    for (const c of suites(parJour)) {
      if (c.n < COURT_MIN && c.au >= debut && c.du <= fin) {
        for (let x = c.du; x <= c.au; x++) courts.add(x);
        courtes.push({ parent: c.parent, du: versIso(c.du), au: versIso(c.au), jours: c.n });
      }
    }

    const jours = [], total = { P: 0, M: 0, mois: MOIS.map(() => ({ P: 0, M: 0 })) };
    for (let j = debut; j <= fin; j++) {
      const iso = versIso(j), parent = parJour.get(j);
      const mois = +iso.slice(5, 7) - 1;
      total[parent]++; total.mois[mois][parent]++;
      jours.push({ iso, js: jourSemaine(j), quantieme: +iso.slice(8), mois, parent, echange: echJour.get(j),
        ferie: feries.get(j) || null, court: courts.has(j), fusionne: fusionnes.has(j) && !courts.has(j) });
    }
    total.ecart = Math.abs(total.P - total.M);

    const fmt = (t) => {
      const j = Math.floor(t / 1440), h = heureNorm(`${Math.floor((t % 1440) / 60)}h${String(t % 60).padStart(2, "0")}`);
      return { iso: versIso(j), js: jourSemaine(j), heure: h };
    };
    const blocsAnnee = blocs
      .filter((b) => b.fin > debut * 1440 && b.debut < (fin + 1) * 1440)
      .map((b) => Object.assign({}, b, { du: fmt(b.debut), au: fmt(b.fin) }));

    return { annee, jours, total, blocs: blocsAnnee, courtes, fusions, incomplet: fin > versJour(CALENDRIER_CONNU_JUSQUA) };
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

  // ---------- Export agenda (iCalendar) ----------

  /**
   * Périodes de garde du parent ("P" ou "M") pendant l'année, d'un échange au
   * suivant : [{ du: {iso, min}, au: {iso, min} }] (min = minutes depuis minuit,
   * heure de Paris). Les périodes à cheval sur l'année sont coupées au 1er
   * janvier 0h et au 1er janvier suivant 0h.
   */
  function periodes(p, annee, parent) {
    const jours = calculer(p, annee).jours, out = [];
    const j0 = jours[0];
    let du = (j0.echange ? j0.echange.rend : j0.parent) === parent ? { iso: j0.iso, min: 0 } : null;
    for (const d of jours) {
      const e = d.echange;
      if (!e) continue;
      const min = minutes(e.heure);
      if (e.rend === parent && du) { out.push({ du, au: { iso: d.iso, min } }); du = null; }
      if (e.recoit === parent) du = { iso: d.iso, min };
    }
    if (du) out.push({ du, au: { iso: versIso(versJour(jours[jours.length - 1].iso) + 1), min: 0 } });
    return out;
  }

  /** Fichier .ics (texte CRLF) des périodes de garde du parent, heure de Paris. */
  function icalendar(p, annee, parent, maintenant) {
    p = normaliser(p);
    const dt = (x) => `${x.iso.replace(/-/g, "")}T${String(Math.floor(x.min / 60)).padStart(2, "0")}${String(x.min % 60).padStart(2, "0")}00`;
    const texte = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const plier = (l) => { // lignes de 75 octets au plus (RFC 5545)
      const out = []; let cur = "", n = 0;
      for (const c of l) {
        const t = new TextEncoder().encode(c).length;
        if (n + t > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
        cur += c; n += t;
      }
      out.push(cur);
      return out.join("\r\n ");
    };
    const fr = (x) => `${JOURS[jourSemaine(versJour(x.iso))]} ${x.iso.split("-").reverse().join("/")} ` +
      heureNorm(`${Math.floor(x.min / 60)}h${String(x.min % 60).padStart(2, "0")}`);
    const stamp = (maintenant || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const nom = NOM[parent], uidBase = `${parent}-${p.nom}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const lignes = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//garde-alternee//planning//FR", "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH", `X-WR-CALNAME:${texte(`Garde ${nom} ${annee}`)}`, "X-WR-TIMEZONE:Europe/Paris",
      "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
      "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
      "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
      "END:VTIMEZONE",
    ];
    for (const x of periodes(p, annee, parent)) {
      lignes.push("BEGIN:VEVENT",
        `UID:${uidBase}-${dt(x.du)}@garde-alternee`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Paris:${dt(x.du)}`, `DTEND;TZID=Europe/Paris:${dt(x.au)}`,
        `SUMMARY:${texte(`Enfants chez ${nom}`)}`,
        `DESCRIPTION:${texte(`${p.nom} (zone ${p.zone}) : du ${fr(x.du)} au ${fr(x.au)}.`)}`,
        "TRANSP:TRANSPARENT", "END:VEVENT");
    }
    lignes.push("END:VCALENDAR");
    return lignes.map(plier).join("\r\n") + "\r\n";
  }

  const api = {
    JOURS, MOIS, ZONES, NOM, PLANNING_DEFAUT, COURT_MIN, FUSION_LIMITE,
    versJour, versIso, jourSemaine, semaineIso, heureNorm, feriesFrance, feriesCalcules, urlFeries, chargerFeries,
    normaliser, texteRegles, calculer, joursVacances, periodes, icalendar,
    urlCalendrierOfficiel, lireCalendrierOfficiel, chargerVacances,
  };
  // calendrier scolaire : remplaçable par chargerVacances, donc lu à chaque accès
  Object.defineProperties(api, {
    VACANCES: { get: () => VACANCES, enumerable: true },
    ANNEES: { get: () => ANNEES, enumerable: true },
    CALENDRIER_CONNU_JUSQUA: { get: () => CALENDRIER_CONNU_JUSQUA, enumerable: true },
    SOURCE_VACANCES: { get: () => SOURCE_VACANCES, enumerable: true },
    SOURCE_FERIES: { get: () => SOURCE_FERIES, enumerable: true },
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Garde = api;
})(typeof window !== "undefined" ? window : globalThis);
