#!/usr/bin/env python3
"""Génère les deux PDF (Papa / Maman et Papa & Tierce) d'un ou plusieurs JSON.

Usage :
    uv run python scripts/generate_pdf.py                  # tous les data/planning_*.json
    uv run python scripts/generate_pdf.py data/planning_2027_lundi.json [...] [--tierce data/tierce_2027.json]

Le planning de Tierce est facultatif : par défaut tierce_<annee>.json à côté du
planning. Sans lui, seul le PDF Papa / Maman est généré.

Le nom du JSON sert de suffixe au nom des PDF (à la racine du dépôt) :
    data/planning_2027_lundi.json -> papa_maman_planning_2027_lundi.pdf
                                     papa_tierce_planning_2027_lundi.pdf

- Papa / Maman : document de négociation, qui garde les enfants chaque jour.
  Colonnes Papa | Maman | Zone C ; règles d'échange lues dans le JSON.
- Papa & Tierce : disponibilité du couple. Colonnes Papa | Tierce | B | C.
  Papa indisponible (bleu) = jours « Papa » ; Tierce indisponible (orange) ;
  LIBRE (vert) = nuit libre à deux, du soir de ce jour au lendemain matin
  (calculé, jamais stocké dans le JSON).
"""

import sys
from pathlib import Path

import common as c

NOTE_PAPA_TIERCE_DEFAUT = [
    "Jours d'échange coloriés (Papa : 18h, jour attribué à celui qui rend les "
    "enfants ; Tierce : lun. matin). Vacances : zones B (indicative) et C.",
    "Été : Papa du sam. 17 au sam. 31/07 et du sam. 14 au sam. 28/08. "
    "Toussaint : Papa du mer. 20 au sam. 30/10. Objectif : maximiser les "
    "week-ends libres à deux (vert).",
]


def papa_maman(data: dict, nom: str):
    regles = data["regles"]
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], regles, data["feries"])
    zone_c = c.ensemble_de_segments(data["vacances"]["zone_c"])
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "Maman", "Zone C"]

    def remplir(date, ncols):
        parent = garde.get(date)
        # Colonnes Papa / Maman
        papa_cell = (c.BLEU, None) if parent == "papa" else (None, None)
        maman_cell = (c.ORANGE, None) if parent == "maman" else (None, None)
        if date in echanges:
            rend, recoit, heure = echanges[date]
            labels = {rend: f"fin {heure}", recoit: f"dès {heure}"}
            papa_cell = (c.BLEU, labels.get("papa"))
            maman_cell = (c.ORANGE, labels.get("maman"))
        # Colonne Zone C : férié prioritaire, sinon vacances
        if date in feries:
            zc = (c.ROUGE, None)
        elif date in zone_c:
            zc = (c.JAUNE, None)
        else:
            zc = (None, None)
        return [papa_cell, maman_cell, zc], False

    legende = [
        (c.BLEU, "Papa"), (c.ORANGE, "Maman"),
        (c.JAUNE, "Vacances zone C"), (c.ROUGE, "Jour férié"),
    ]
    sco, vac = regles["echange_scolaire"], regles["echange_vacances"]
    note1 = (f"Jour d'échange : colorié chez les deux. Période scolaire : "
             f"{sco['jour']} {sco['heure']} ; vacances : {vac['jour']} "
             f"{vac['heure']}. {regles['attribution']}")
    cpt = c.compter(data)
    note2 = (f"Total {data['annee']} : Papa {cpt['papa']} jours, Maman {cpt['maman']} "
             f"jours (écart {cpt['ecart']}).     "
             "Signature Papa :                    Date :              "
             "Signature Maman :                    Date :")

    annee = data["annee"]
    variante = data.get("titre_variante", "")
    titre = f"Proposition de planning de garde {annee}{variante}"
    sortie = f"papa_maman_{nom}.pdf"
    with c.nouvelle_sortie(sortie) as pdf:
        c.dessiner_page(pdf, f"{titre} : 1er semestre",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, f"{titre} : 2e semestre",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print(f"✓ {sortie}")
    print(f"  Papa {cpt['papa']} / Maman {cpt['maman']} (écart {cpt['ecart']})")



def papa_tierce(data: dict, nom: str):
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], data["regles"], data["feries"])
    tierce = c.ensemble_de_segments(data["tierce_indisponible"])
    tierce_lab = c.libelles_tierce(data)
    libres = c.jours_libres(data)
    zone_b = c.ensemble_de_segments(data["vacances"]["zone_b"])
    zone_c = c.ensemble_de_segments(data["vacances"]["zone_c"])
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "Tierce", "B", "C"]

    def remplir(date, ncols):
        # Colonne Papa : bleu quand Papa a les enfants (jour « Papa »)
        papa_cell = (c.BLEU, None) if garde.get(date) == "papa" else (None, None)
        if date in echanges:
            rend, recoit, heure = echanges[date]
            if rend == "papa":
                papa_cell = (c.BLEU, f"fin {heure}")
            elif recoit == "papa":
                papa_cell = (c.BLEU, f"dès {heure}")
        # Colonne Tierce : orange quand Tierce a ses enfants
        tierce_cell = (c.ORANGE, tierce_lab.get(date)) if date in tierce else (None, None)
        # Colonnes vacances
        b_cell = (c.VIOLET, None) if date in zone_b else (None, None)
        if date in feries:
            cc_cell = (c.ROUGE, None)
        elif date in zone_c:
            cc_cell = (c.JAUNE, None)
        else:
            cc_cell = (None, None)
        return [papa_cell, tierce_cell, b_cell, cc_cell], (date in libres)

    legende = [
        (c.BLEU, "Papa : indisponible"), (c.ORANGE, "Tierce : indisponible"),
        (c.VERT, "Nuit libre à deux (soir → lendemain matin)"), (c.VIOLET, "Vacances zone B (Amiens)"),
        (c.JAUNE, "Vacances zone C (Paris)"), (c.ROUGE, "Jour férié (col. C)"),
    ]
    note1, note2 = data.get("notes_papa_tierce", NOTE_PAPA_TIERCE_DEFAUT)

    annee = data["annee"]
    variante = data.get("titre_variante", "")
    sortie = f"papa_tierce_{nom}.pdf"
    with c.nouvelle_sortie(sortie) as pdf:
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 1er semestre (Papa & Tierce)",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 2e semestre (Papa & Tierce)",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print(f"✓ {sortie}")
    nb_we = len(c.weekends_libres(libres))
    print(f"  Nuits libres à deux : {len(libres)} (dont {nb_we} week-ends ven.+sam.)")



def main():
    chemins, tierce = c.lire_arguments()
    chemins = chemins or sorted(str(p) for p in (c.RACINE / "data").glob("planning_*.json"))
    for chemin in chemins:
        data = c.charger(chemin, tierce)
        nom = Path(chemin).stem
        papa_maman(data, nom)
        if data["avec_tierce"]:
            papa_tierce(data, nom)
        else:
            print(f"  (pas de planning de Tierce : papa_tierce_{nom}.pdf non généré)")


if __name__ == "__main__":
    main()
