"""Fonctions partagées : chargement des données, calcul des gardes, rendu calendrier.

La source de vérité est data/planning_2027.json. Les deux PDF sont dérivés
de ce module (voir generate_papa_maman.py et generate_papa_tierce.py).
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
ORANGE = "#F4B183"    # Tierce / Maman indisponible
VERT = "#A9D18E"      # Nuit libre à deux
VIOLET = "#C9A9DD"    # Vacances zone B (Amiens)
JAUNE = "#FFE699"     # Vacances zone C (Paris)
ROUGE = "#F19C99"     # Jour férié
GRIS_ENTETE = "#404040"
GRIS_LEGER = "#F2F2F2"

MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
           "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"]  # lundi=0 .. dimanche=6


# --- Chargement et modèle --------------------------------------------------

def charger(path=None) -> dict:
    """Charge un fichier de planning (par défaut data/planning_2027.json).

    Usage en ligne de commande : le 1er argument éventuel est le chemin du JSON.
    """
    if path is None:
        import sys
        path = sys.argv[1] if len(sys.argv) > 1 else DATA
    with open(path, encoding="utf-8") as f:
        return json.load(f)


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


def jours_echange(segments, regles=None) -> dict:
    """Détecte les jours d'échange entre deux segments consécutifs.

    Selon la règle applicable (regles["echanges"]) :
      - « rend »   : l'échange a lieu le dernier jour du segment qui se termine
                     (ex. mercredi/samedi 18h, jour compté pour celui qui rend) ;
      - « recoit » : l'échange a lieu le premier jour du segment qui commence
                     (ex. lundi 11h, jour compté pour celui qui reçoit).

    Retourne {date: (parent_qui_rend, parent_qui_recoit, heure)}.
    """
    echanges = (regles or {}).get("echanges", ECHANGES_DEFAUT)
    recoit_jours = {e["jour"]: e["heure"] for e in echanges
                    if e["jour_attribue_a"] == "recoit"}
    rend_jours = {e["jour"]: e["heure"] for e in echanges
                  if e["jour_attribue_a"] == "rend"}
    ech = {}
    for seg, suiv in zip(segments, segments[1:]):
        fin, debut = _d(seg["au"]), _d(suiv["du"])
        rend, recoit = seg["parent"], suiv["parent"]
        if JOURS_NOMS[debut.weekday()] in recoit_jours:
            ech[debut] = (rend, recoit, recoit_jours[JOURS_NOMS[debut.weekday()]])
        else:
            ech[fin] = (rend, recoit, rend_jours.get(JOURS_NOMS[fin.weekday()], "18h"))
    return ech


def nuits_tierce(data: dict) -> set:
    """Nuits où Tierce a ses enfants : du soir de « du » au matin de « au ».

    La nuit d'une date x va du soir de x au matin de x+1. Si la plage a une
    « fin » (rendu le matin), la nuit de « au » est libre ; sinon (fin d'année)
    elle est comptée.
    """
    nuits = set()
    for seg in data["tierce_indisponible"]:
        d, fin = _d(seg["du"]), _d(seg["au"])
        if seg.get("fin"):
            fin -= dt.timedelta(days=1)
        while d <= fin:
            nuits.add(d)
            d += dt.timedelta(days=1)
    return nuits


def jours_libres(data: dict) -> set:
    """Nuits « libres à deux » : CALCULÉES, jamais saisies dans le JSON.

    Une date x est libre si la nuit de x (soir de x → matin de x+1) est sans
    enfants pour Papa (chez Maman cette nuit-là, c.-à-d. après l'échange s'il y
    en a un ce jour) ET pour Tierce (nuits_tierce).
    """
    garde = jours_de_segments(data["garde_segments"])
    ech = jours_echange(data["garde_segments"], data["regles"])
    tierce = nuits_tierce(data)

    def nuit_papa(x):
        return ech[x][1] if x in ech else garde.get(x)

    return {x for x in garde if nuit_papa(x) == "maman" and x not in tierce}


def weekends_libres(libres: set) -> list:
    """Week-ends libres : nuits du vendredi ET du samedi libres à deux.
    Retourne les samedis."""
    return sorted(x for x in libres
                  if x.weekday() == 5 and x - dt.timedelta(days=1) in libres)


def libelles_tierce(data: dict) -> dict:
    """Libellés des échanges de Tierce : {date: « dès 11h » / « fin matin »}."""
    lab = {}
    for seg in data["tierce_indisponible"]:
        if seg.get("des"):
            lab[_d(seg["du"])] = f"dès {seg['des']}"
        if seg.get("fin"):
            lab[_d(seg["au"])] = f"fin {seg['fin']}"
    return lab


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
        libre    : bool (nuit « libre à deux » du soir de ce jour)
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


def nom_sortie(base: str, data: dict) -> str:
    """Nom du PDF : base + suffixe de la variante (ex. « _lundi ») + .pdf."""
    return f"{base}{data.get('suffixe', '')}.pdf"


def nouvelle_sortie(nom) -> PdfPages:
    return PdfPages(RACINE / nom)
