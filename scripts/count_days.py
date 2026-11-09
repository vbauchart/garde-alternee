#!/usr/bin/env python3
"""Compte les jours de garde par parent et par mois, et vérifie l'équité.

Usage : python scripts/count_days.py [planning.json] [--tierce tierce.json]
(le planning de Tierce est cherché par défaut dans tierce_<annee>.json à côté du planning)
"""

import datetime as dt

import common as c


def main():
    data = c.charger()
    garde = c.jours_de_segments(data["garde_segments"])
    annee = data["annee"]

    print(f"Comptage des jours de garde {annee}")
    print("=" * 46)
    print(f"{'Mois':<12}{'Papa':>8}{'Maman':>8}{'Total':>8}")
    print("-" * 46)
    tp = tm = 0
    for mi in range(12):
        jp = sum(1 for d, p in garde.items() if d.month == mi + 1 and p == "papa")
        jm = sum(1 for d, p in garde.items() if d.month == mi + 1 and p == "maman")
        tp += jp
        tm += jm
        print(f"{c.MOIS_FR[mi]:<12}{jp:>8}{jm:>8}{jp + jm:>8}")
    print("-" * 46)
    print(f"{'TOTAL':<12}{tp:>8}{tm:>8}{tp + tm:>8}")
    print("=" * 46)
    ecart = abs(tp - tm)
    pct_p = 100 * tp / (tp + tm)
    print(f"Écart : {ecart} jour(s)  |  Papa {pct_p:.1f}% / Maman {100 - pct_p:.1f}%")
    if data["avec_tierce"]:
        libres = c.jours_libres(data)
        we = c.weekends_libres(libres)
        print(f"Nuits libres à deux (Papa & Tierce) : {len(libres)}")
        print(f"Week-ends libres (nuits ven. + sam.) : {len(we)} — "
              + ", ".join(f"{x:%d/%m}" for x in we))
        hors_we = sorted(x for x in libres if x.weekday() not in (4, 5))
        if hors_we:
            print("Autres nuits libres (date du soir) : " + ", ".join(f"{x:%d/%m}" for x in hors_we))
    else:
        print("(Pas de planning de Tierce : nuits libres à deux non calculées. "
              "Fournir tierce_<annee>.json à côté du planning ou --tierce FICHIER.)")

    # Vérifications de cohérence
    manquants = [dt.date(annee, 1, 1) + dt.timedelta(days=i)
                 for i in range((dt.date(annee, 12, 31) - dt.date(annee, 1, 1)).days + 1)
                 if (dt.date(annee, 1, 1) + dt.timedelta(days=i)) not in garde]
    if manquants:
        print(f"\n⚠  {len(manquants)} jour(s) non couvert(s) ! ex. {manquants[:5]}")
    else:
        print("\n✓ Tous les jours de l'année sont couverts, sans trou ni chevauchement.")


if __name__ == "__main__":
    main()
