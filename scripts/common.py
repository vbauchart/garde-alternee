"""Fonctions partagées : chargement des données, calcul des gardes, rendu calendrier.

La source de vérité est data/planning_2027.json ; les jours à éviter sont
dans un fichier séparé et facultatif (data/a_eviter_2027.json). Les deux PDF sont
dérivés de ce module (voir generate_pdf.py).
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# --- Chemins ---------------------------------------------------------------

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data" / "planning_2027.json"

# --- Couleurs (proches des PDF d'origine) ----------------------------------

BLEU = "#9DC3E6"      # Papa indisponible
ORANGE = "#F4B183"    # Jour à éviter / Maman indisponible
VERT = "#A9D18E"      # Journée et soir libres
VIOLET = "#C9A9DD"    # Vacances des zones indicatives
JAUNE = "#FFE699"     # Vacances de la zone de référence
ROUGE = "#F19C99"     # Jour férié
GRIS_ENTETE = "#404040"
GRIS_LEGER = "#F2F2F2"

MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
           "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"]  # lundi=0 .. dimanche=6


# --- Chargement et modèle --------------------------------------------------

def lire_arguments() -> tuple[list[str], str | None]:
    """Arguments de la ligne de commande : [planning.json ...] [--a-eviter a_eviter.json]."""
    import sys
    args, a_eviter = sys.argv[1:], None
    if "--a-eviter" in args:
        k = args.index("--a-eviter")
        if k + 1 >= len(args):
            sys.exit("--a-eviter attend le chemin d'un fichier JSON (ex. data/a_eviter_2027.json)")
        a_eviter = args[k + 1]
        del args[k:k + 2]
    return args, a_eviter


def charger(path=None, a_eviter=None) -> dict:
    """Charge un fichier de planning (par défaut data/planning_2027.json).

    Les jours à éviter (où Papa préfère ne pas avoir la garde : activité,
    déplacement…) sont un fichier SÉPARÉ et facultatif ({annee,
    jours_a_eviter}) : `a_eviter` s'il est donné, sinon `a_eviter_<annee>.json` à côté
    du planning s'il existe. Un ancien planning contenant encore
    `jours_a_eviter` reste accepté. Ajoute data["avec_a_eviter"] (bool).

    Usage en ligne de commande : [planning.json] [--a-eviter a_eviter.json].
    """
    if path is None:
        args, a_eviter_cli = lire_arguments()
        path = args[0] if args else DATA
        a_eviter = a_eviter or a_eviter_cli
    path = Path(path)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if a_eviter is None and "jours_a_eviter" not in data:
        auto = path.parent / f"a_eviter_{data['annee']}.json"
        a_eviter = auto if auto.exists() else None
    if a_eviter is not None:
        with open(a_eviter, encoding="utf-8") as f:
            v = json.load(f)
        if v.get("annee", data["annee"]) != data["annee"]:
            print(f"⚠  {a_eviter} : jours à éviter {v['annee']} ≠ planning {data['annee']}")
        data["jours_a_eviter"] = v["jours_a_eviter"]
    data["avec_a_eviter"] = "jours_a_eviter" in data
    data.setdefault("jours_a_eviter", [])
    return data


ZONES = ("A", "B", "C")
ZONE_DEFAUT = "B"


def zone_reference(data: dict) -> str:
    """Zone de vacances de référence (regles.zone, B par défaut)."""
    z = str(data.get("regles", {}).get("zone", ZONE_DEFAUT)).upper()
    return z if z in ZONES else ZONE_DEFAUT


def vacances_zones(data: dict) -> dict:
    """{zone: ensemble des dates de vacances} pour les zones présentes dans le JSON."""
    vac = data.get("vacances", {})
    return {z: ensemble_de_segments(vac[f"zone_{z.lower()}"])
            for z in ZONES if f"zone_{z.lower()}" in vac}


def _d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def jours_de_segments(segments) -> dict:
    """Retourne {date: parent} pour une liste de segments {du, au, parent?}."""
    m = {}
    for seg in segments:
        d, fin = _d(seg["du"]), _d(seg["au"])
        while d <= fin:
            m[d] = seg.get("parent", True)
            d += dt.timedelta(days=1)
    return m


def ensemble_de_segments(segments) -> set:
    """Retourne l'ensemble des dates couvertes par des plages {du, au}."""
    return set(jours_de_segments(segments).keys())


JOURS_NOMS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

# Règles par défaut (variante historique) : échange à 18h, jour attribué à
# celui qui rend les enfants.
ECHANGES_DEFAUT = [
    {"jour": "mercredi", "heure": "18h", "jour_attribue_a": "rend"},
    {"jour": "samedi", "heure": "18h", "jour_attribue_a": "rend"},
]


def jours_echange(segments, regles=None, feries=()) -> dict:
    """Détecte les jours d'échange entre deux segments consécutifs.

    Selon la règle applicable (regles["echanges"]) :
      - « rend »   : l'échange a lieu le dernier jour du segment qui se termine
                     (ex. mercredi/samedi 18h, jour compté pour celui qui rend) ;
      - « recoit » : l'échange a lieu le premier jour du segment qui commence
                     (ex. lundi 11h, jour compté pour celui qui reçoit).

    Un échange qui tombe un jour férié est reporté au lendemain (ex. samedi
    25/12 férié -> échange le dimanche 26/12) : feries = dates fériées.

    Retourne {date: (parent_qui_rend, parent_qui_recoit, heure)}.
    """
    feries = {_d(f["date"]) if isinstance(f, dict) else f for f in feries}

    def jour_regle(x):
        """Nom du jour de règle auquel x correspond (report férié compris)."""
        if x in feries:
            return None
        veille = x - dt.timedelta(days=1)
        if veille in feries:
            return JOURS_NOMS[veille.weekday()]
        return JOURS_NOMS[x.weekday()]

    echanges = (regles or {}).get("echanges", ECHANGES_DEFAUT)
    recoit_jours = {e["jour"]: e["heure"] for e in echanges
                    if e["jour_attribue_a"] == "recoit"}
    rend_jours = {e["jour"]: e["heure"] for e in echanges
                  if e["jour_attribue_a"] == "rend"}
    ech = {}
    for seg, suiv in zip(segments, segments[1:]):
        fin, debut = _d(seg["au"]), _d(suiv["du"])
        rend, recoit = seg["parent"], suiv["parent"]
        jd = jour_regle(debut)
        if jd in recoit_jours:
            ech[debut] = (rend, recoit, recoit_jours[jd])
        else:
            ech[fin] = (rend, recoit, rend_jours.get(jour_regle(fin), "18h"))
    return ech


def nuits_a_eviter(data: dict) -> set:
    """Journées à éviter : tous les jours de « du » à « au » inclus (journée et soir)."""
    return ensemble_de_segments(data["jours_a_eviter"])


def jours_libres(data: dict) -> set:
    """Journées et soirs libres : CALCULÉS, jamais saisies dans le JSON.

    Une date x est libre si Papa n'a pas les enfants le soir de x (chez Maman
    cette nuit-là, c.-à-d. après l'échange s'il y en a un ce jour) ET si ce
    soir-là est à éviter (nuits_a_eviter : activité, déplacement…).
    """
    garde = jours_de_segments(data["garde_segments"])
    ech = jours_echange(data["garde_segments"], data["regles"], data.get("feries", []))
    a_eviter = nuits_a_eviter(data)

    def nuit_papa(x):
        return ech[x][1] if x in ech else garde.get(x)

    return {x for x in garde if nuit_papa(x) == "maman" and x in a_eviter}


def weekends_libres(libres: set) -> list:
    """Week-ends libres : vendredi ET samedi libres.
    Retourne les samedis."""
    return sorted(x for x in libres
                  if x.weekday() == 5 and x - dt.timedelta(days=1) in libres)


def compter(data: dict) -> dict:
    """Compte les jours attribués à chaque parent sur l'année."""
    garde = jours_de_segments(data["garde_segments"])
    papa = sum(1 for p in garde.values() if p == "papa")
    maman = sum(1 for p in garde.values() if p == "maman")
    return {"papa": papa, "maman": maman, "total": papa + maman,
            "ecart": abs(papa - maman)}


# --- Rendu -----------------------------------------------------------------

def _dessiner_mois(ax, mois_idx, annee, x0, largeur, y_haut, h_ligne,
                   entetes_cols, remplir):
    """Dessine un bloc mensuel.

    remplir(date, ncols) -> (cellules, libre)
        cellules : liste [(couleur|None, texte|None), ...] par colonne de données
        libre    : bool (journée et soir libres)
    """
    ncols = len(entetes_cols)
    x_label_w = largeur * 0.26
    x_data = x0 + x_label_w
    data_w = largeur - x_label_w
    col_w = data_w / ncols

    # Bandeau du mois
    ax.add_patch(mpatches.Rectangle((x0, y_haut - h_ligne), largeur, h_ligne,
                                    facecolor=GRIS_ENTETE, edgecolor="white", lw=0.5))
    ax.text(x0 + largeur / 2, y_haut - h_ligne / 2, MOIS_FR[mois_idx],
            ha="center", va="center", color="white", fontsize=7, fontweight="bold")

    # Sous-entêtes de colonnes
    y_sub = y_haut - 2 * h_ligne
    for c, nom in enumerate(entetes_cols):
        cx = x_data + c * col_w
        ax.add_patch(mpatches.Rectangle((cx, y_sub), col_w, h_ligne,
                                        facecolor=GRIS_ENTETE, edgecolor="white", lw=0.5))
        ax.text(cx + col_w / 2, y_sub + h_ligne / 2, nom,
                ha="center", va="center", color="white", fontsize=3.6, fontweight="bold")

    # Jours
    nb_jours = _nb_jours(annee, mois_idx + 1)
    for j in range(1, nb_jours + 1):
        date = dt.date(annee, mois_idx + 1, j)
        y = y_sub - j * h_ligne
        we = date.weekday() >= 5

        # Cellule libellé du jour
        ax.add_patch(mpatches.Rectangle((x0, y), x_label_w, h_ligne,
                                        facecolor=GRIS_LEGER if we else "white",
                                        edgecolor="#BFBFBF", lw=0.3))
        ax.text(x0 + 0.004, y + h_ligne / 2, f"{JOURS_FR[date.weekday()]} {j}",
                ha="left", va="center", fontsize=3.6,
                fontweight="bold" if we else "normal")

        cellules, libre = remplir(date, ncols)
        if libre:
            # Vert sur les deux premières colonnes + « LIBRE »
            ax.add_patch(mpatches.Rectangle((x_data, y), col_w * min(2, ncols), h_ligne,
                                            facecolor=VERT, edgecolor="#BFBFBF", lw=0.3))
            ax.text(x_data + col_w, y + h_ligne / 2, "LIBRE",
                    ha="center", va="center", fontsize=3.4, color="#375623")
            start = 2
        else:
            start = 0
        for c in range(start, ncols):
            cx = x_data + c * col_w
            couleur, texte = cellules[c]
            ax.add_patch(mpatches.Rectangle((cx, y), col_w, h_ligne,
                                            facecolor=couleur or "white",
                                            edgecolor="#BFBFBF", lw=0.3))
            if texte:
                ax.text(cx + col_w / 2, y + h_ligne / 2, texte,
                        ha="center", va="center", fontsize=2.9)


def _nb_jours(annee, mois):
    if mois == 12:
        return 31
    return (dt.date(annee, mois + 1, 1) - dt.timedelta(days=1)).day


def dessiner_page(pdf, titre, mois_indices, annee, entetes_cols, remplir,
                  legende, note):
    """Dessine une page (un semestre) avec 6 mois côte à côte."""
    fig = plt.figure(figsize=(11.69, 8.27))  # A4 paysage
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    ax.text(0.012, 0.965, titre, fontsize=13, fontweight="bold", va="center")

    # Légende
    x = 0.012
    for couleur, label in legende:
        ax.add_patch(mpatches.Rectangle((x, 0.915), 0.013, 0.018,
                                        facecolor=couleur, edgecolor="#808080", lw=0.4))
        ax.text(x + 0.017, 0.924, label, fontsize=6, va="center")
        x += 0.017 + 0.0072 * len(label) + 0.01

    # Mois
    marge_g, marge_d = 0.012, 0.012
    largeur_tot = 1 - marge_g - marge_d
    largeur_mois = largeur_tot / 6
    y_haut = 0.88
    h_ligne = 0.0245
    for k, mi in enumerate(mois_indices):
        x0 = marge_g + k * largeur_mois
        _dessiner_mois(ax, mi, annee, x0 + 0.003, largeur_mois - 0.006,
                       y_haut, h_ligne, entetes_cols, remplir)

    if note:
        ax.text(0.012, 0.02, note, fontsize=6, va="center", style="italic")

    pdf.savefig(fig)
    plt.close(fig)


def nouvelle_sortie(nom) -> PdfPages:
    return PdfPages(RACINE / nom)
