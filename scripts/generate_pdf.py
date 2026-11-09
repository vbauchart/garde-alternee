#!/usr/bin/env python3
"""Génère les deux PDF (Papa / Maman et jours à éviter de Papa) d'un ou plusieurs JSON.

Usage :
    uv run python scripts/generate_pdf.py                  # tous les data/planning_*.json
    uv run python scripts/generate_pdf.py data/planning_2027_lundi.json [...] [--a-eviter data/a_eviter_2027.json]

Les jours à éviter sont facultatifs : par défaut a_eviter_<annee>.json à côté du
planning. Sans lui, seul le PDF Papa / Maman est généré.

Le nom du JSON sert de suffixe au nom des PDF (à la racine du dépôt) :
    data/planning_2027_lundi.json -> papa_maman_planning_2027_lundi.pdf
                                     papa_a_eviter_planning_2027_lundi.pdf

- Papa / Maman : document de négociation, qui garde les enfants chaque jour.
  Colonnes Papa | Maman | Zone de référence ; règles d'échange lues dans le JSON.
- Jours à éviter : disponibilité de Papa. Colonnes Papa | À éviter | B | C.
  Papa a les enfants (bleu) = jours « Papa » ; jour à éviter (orange) ;
  LIBRE (vert) = journée et soir libres (sans enfants, jour à éviter)
  (calculé, jamais stocké dans le JSON).
"""

import sys
from pathlib import Path

import common as c

NOTE_PAPA_A_EVITER_DEFAUT = [
    "Jours d'échange coloriés (heure et attribution selon les règles du "
    "planning). Vacances : zone de référence et zones indicatives.",
    "Objectif : maximiser les week-ends libres (vert). Notes "
    "personnalisables dans le JSON (champ notes_papa_a_eviter).",
]


def papa_maman(data: dict, nom: str):
    regles = data["regles"]
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], regles, data["feries"])
    zone = c.zone_reference(data)
    zone_ref = c.vacances_zones(data).get(zone, set())
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "Maman", f"Zone {zone}"]

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
        # Colonne zone de référence : férié prioritaire, sinon vacances
        if date in feries:
            zc = (c.ROUGE, None)
        elif date in zone_ref:
            zc = (c.JAUNE, None)
        else:
            zc = (None, None)
        return [papa_cell, maman_cell, zc], False

    legende = [
        (c.BLEU, "Papa"), (c.ORANGE, "Maman"),
        (c.JAUNE, f"Vacances zone {zone}"), (c.ROUGE, "Jour férié"),
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



def papa_a_eviter(data: dict, nom: str):
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], data["regles"], data["feries"])
    a_eviter = c.ensemble_de_segments(data["jours_a_eviter"])
    a_eviter_lab = c.libelles_a_eviter(data)
    libres = c.jours_libres(data)
    zone = c.zone_reference(data)
    zones = c.vacances_zones(data)
    zone_ref = zones.get(zone, set())
    indicatives = [z for z in zones if z != zone]
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "À éviter", "Ind.", zone]

    def remplir(date, ncols):
        # Colonne Papa : bleu quand Papa a les enfants (jour « Papa »)
        papa_cell = (c.BLEU, None) if garde.get(date) == "papa" else (None, None)
        if date in echanges:
            rend, recoit, heure = echanges[date]
            if rend == "papa":
                papa_cell = (c.BLEU, f"fin {heure}")
            elif recoit == "papa":
                papa_cell = (c.BLEU, f"dès {heure}")
        # Colonne À éviter : orange les jours à éviter
        a_eviter_cell = (c.ORANGE, a_eviter_lab.get(date)) if date in a_eviter else (None, None)
        # Colonnes vacances
        # Zones indicatives regroupées : lettres des zones en vacances ce jour-là
        ind = " ".join(z for z in indicatives if date in zones[z])
        b_cell = (c.VIOLET, ind) if ind else (None, None)
        if date in feries:
            cc_cell = (c.ROUGE, None)
        elif date in zone_ref:
            cc_cell = (c.JAUNE, None)
        else:
            cc_cell = (None, None)
        return [papa_cell, a_eviter_cell, b_cell, cc_cell], (date in libres)

    legende = [
        (c.BLEU, "Papa a les enfants"), (c.ORANGE, "Jour à éviter"),
        (c.VERT, "Journée et soir libres"), (c.VIOLET, f"Vacances zones {' / '.join(indicatives)} (indicatif)"),
        (c.JAUNE, f"Vacances zone {zone}"), (c.ROUGE, f"Jour férié (col. {zone})"),
    ]
    note1, note2 = data.get("notes_papa_a_eviter") or data.get("notes_papa_a_eviter") or NOTE_PAPA_A_EVITER_DEFAUT

    annee = data["annee"]
    variante = data.get("titre_variante", "")
    sortie = f"papa_a_eviter_{nom}.pdf"
    with c.nouvelle_sortie(sortie) as pdf:
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 1er semestre (jours à éviter)",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 2e semestre (jours à éviter)",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print(f"✓ {sortie}")
    nb_we = len(c.weekends_libres(libres))
    print(f"  Journées et soirs libres : {len(libres)} (dont {nb_we} week-ends ven.+sam.)")



def main():
    chemins, a_eviter = c.lire_arguments()
    chemins = chemins or sorted(str(p) for p in (c.RACINE / "data").glob("planning_*.json"))
    for chemin in chemins:
        data = c.charger(chemin, a_eviter)
        nom = Path(chemin).stem
        papa_maman(data, nom)
        if data["avec_a_eviter"]:
            papa_a_eviter(data, nom)
        else:
            print(f"  (pas de jours à éviter : papa_a_eviter_{nom}.pdf non généré)")


if __name__ == "__main__":
    main()
