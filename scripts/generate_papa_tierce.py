#!/usr/bin/env python3
"""Génère planning_2027_papa_tierce.pdf à partir de data/planning_2027.json.

PDF de disponibilité du couple Papa & Tierce. Papa s'aligne sur le planning (fixe)
de Tierce pour maximiser les week-ends libres à deux.
Colonnes : Papa | Tierce | B | C.
  - Papa indisponible (bleu)  = Papa a ses enfants (= jours « Papa »).
  - Tierce indisponible (orange) = Tierce a ses enfants.
  - Week-end libre à deux (vert) = les deux sont libres.
"""

import common as c


def main():
    data = c.charger()
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"])
    tierce = c.ensemble_de_segments(data["tierce_indisponible"])
    libres = {c._d(x) for x in data["weekends_libres"]}
    zone_b = c.ensemble_de_segments(data["vacances"]["zone_b"])
    zone_c = c.ensemble_de_segments(data["vacances"]["zone_c"])
    feries = {c._d(f["date"]) for f in data["feries"]}

    entetes = ["Papa", "Tierce", "B", "C"]

    def remplir(date, ncols):
        # Colonne Papa : bleu quand Papa a les enfants (jour « Papa »)
        papa_cell = (c.BLEU, None) if garde.get(date) == "papa" else (None, None)
        if date in echanges and echanges[date][0] == "papa":
            papa_cell = (c.BLEU, "fin 18h")
        elif date in echanges and echanges[date][1] == "papa":
            papa_cell = (c.BLEU, "dès 18h")
        # Colonne Tierce : orange quand Tierce a ses enfants
        tierce_cell = (c.ORANGE, None) if date in tierce else (None, None)
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
        (c.VERT, "Week-end libre à deux"), (c.VIOLET, "Vacances zone B (Amiens)"),
        (c.JAUNE, "Vacances zone C (Paris)"), (c.ROUGE, "Jour férié (col. C)"),
    ]
    note1 = ("Jours d'échange coloriés (Papa : 18h, jour attribué à celui qui rend "
             "les enfants). Tierce indisponible = reconstruction alignée, à corriger "
             "avec son planning réel. Vacances : zones B et C.")
    note2 = ("Été : Papa du sam. 17 au sam. 31/07 et du sam. 14 au sam. 28/08. "
             "Toussaint : Papa du mer. 20 au sam. 30/10. Objectif : maximiser les "
             "week-ends libres à deux (vert).")

    annee = data["annee"]
    with c.nouvelle_sortie("planning_2027_papa_tierce.pdf") as pdf:
        c.dessiner_page(pdf, "Planning 2027 : 1er semestre (Papa & Tierce)",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, "Planning 2027 : 2e semestre (Papa & Tierce)",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print("✓ planning_2027_papa_tierce.pdf")
    print(f"  Week-ends/jours libres à deux : {len(libres)}")


if __name__ == "__main__":
    main()
