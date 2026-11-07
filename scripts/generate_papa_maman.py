#!/usr/bin/env python3
"""Génère le PDF Papa / Maman à partir d'un fichier de planning JSON.

Usage :
    uv run python scripts/generate_papa_maman.py [data/planning_2027.json]

PDF de négociation Papa / Maman : qui garde les enfants chaque jour.
Colonnes : Papa | Maman | Zone C. Les règles d'échange (jour, heure,
attribution du jour) viennent du JSON. Le nom de sortie reçoit le « suffixe »
de la variante (ex. planning_garde_2027_papa_maman_lundi.pdf).
"""

import common as c


def main():
    data = c.charger()
    regles = data["regles"]
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], regles)
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
    sortie = c.nom_sortie("planning_garde_2027_papa_maman", data)
    with c.nouvelle_sortie(sortie) as pdf:
        c.dessiner_page(pdf, f"{titre} : 1er semestre",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, f"{titre} : 2e semestre",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print(f"✓ {sortie}")
    print(f"  Papa {cpt['papa']} / Maman {cpt['maman']} (écart {cpt['ecart']})")


if __name__ == "__main__":
    main()
