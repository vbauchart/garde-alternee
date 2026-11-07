#!/usr/bin/env python3
"""Génère planning_garde_2027_papa_maman.pdf à partir de data/planning_2027.json.

PDF de négociation Papa / Maman : qui garde les enfants chaque jour.
Colonnes : Papa | Maman | Zone C. Échange mercredi (scolaire) ou samedi
(vacances) à 18h ; le jour est attribué au parent qui rend les enfants.
"""

import common as c


def main():
    data = c.charger()
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"])
    zone_c = c.ensemble_de_segments(data["vacances"]["zone_c"])
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "Maman", "Zone C"]

    def remplir(date, ncols):
        cells = [(None, None)] * ncols
        parent = garde.get(date)
        # Colonnes Papa / Maman
        papa_cell = (c.BLEU, None) if parent == "papa" else (None, None)
        maman_cell = (c.ORANGE, None) if parent == "maman" else (None, None)
        if date in echanges:
            rend, recoit = echanges[date]
            labels = {rend: "fin 18h", recoit: "dès 18h"}
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
    note1 = ("Jour d'échange : colorié chez les deux (attribué au parent qui rend "
             "les enfants à 18h). Mercredi en période scolaire, samedi en vacances.")
    cpt = c.compter(data)
    note2 = (f"Total 2027 : Papa {cpt['papa']} jours, Maman {cpt['maman']} jours "
             f"(écart {cpt['ecart']}).     "
             "Signature Papa :                    Date :              "
             "Signature Maman :                    Date :")

    annee = data["annee"]
    with c.nouvelle_sortie("planning_garde_2027_papa_maman.pdf") as pdf:
        c.dessiner_page(pdf, "Proposition de planning de garde 2027 : 1er semestre",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, "Proposition de planning de garde 2027 : 2e semestre",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print("✓ planning_garde_2027_papa_maman.pdf")
    print(f"  Papa {cpt['papa']} / Maman {cpt['maman']} (écart {cpt['ecart']})")


if __name__ == "__main__":
    main()
