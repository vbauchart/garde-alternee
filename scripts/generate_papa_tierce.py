#!/usr/bin/env python3
"""Génère le PDF Papa & Tierce à partir d'un fichier de planning JSON.

Usage :
    uv run python scripts/generate_papa_tierce.py [data/planning_2027.json]

PDF de disponibilité du couple Papa & Tierce. Papa s'aligne sur le planning (fixe)
de Tierce pour maximiser les week-ends libres à deux.
Colonnes : Papa | Tierce | B | C.
  - Papa indisponible (bleu)  = Papa a ses enfants (= jours « Papa »).
  - Tierce indisponible (orange) = Tierce a ses enfants.
  - Week-end libre à deux (vert) = les deux sont libres.
"""

import common as c

NOTE_PAPA_TIERCE_DEFAUT = [
    "Jours d'échange coloriés (Papa : 18h, jour attribué à celui qui rend les "
    "enfants ; Tierce : lun. matin). Vacances : zones B (indicative) et C.",
    "Été : Papa du sam. 17 au sam. 31/07 et du sam. 14 au sam. 28/08. "
    "Toussaint : Papa du mer. 20 au sam. 30/10. Objectif : maximiser les "
    "week-ends libres à deux (vert).",
]


def main():
    data = c.charger()
    garde = c.jours_de_segments(data["garde_segments"])
    echanges = c.jours_echange(data["garde_segments"], data["regles"])
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
        (c.VERT, "Week-end libre à deux"), (c.VIOLET, "Vacances zone B (Amiens)"),
        (c.JAUNE, "Vacances zone C (Paris)"), (c.ROUGE, "Jour férié (col. C)"),
    ]
    note1, note2 = data.get("notes_papa_tierce", NOTE_PAPA_TIERCE_DEFAUT)

    annee = data["annee"]
    variante = data.get("titre_variante", "")
    sortie = c.nom_sortie("planning_2027_papa_tierce", data)
    with c.nouvelle_sortie(sortie) as pdf:
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 1er semestre (Papa & Tierce)",
                        range(0, 6), annee, entetes, remplir, legende, note1)
        c.dessiner_page(pdf, f"Planning {annee}{variante} : 2e semestre (Papa & Tierce)",
                        range(6, 12), annee, entetes, remplir, legende, note2)
    print(f"✓ {sortie}")
    nb_we = sum(1 for x in libres if x.weekday() == 5)
    print(f"  Week-ends libres à deux : {nb_we} (+{len(libres) - 2 * nb_we} jour(s) isolé(s))")


if __name__ == "__main__":
    main()
