# Garde alternée 2027

Données et scripts pour construire, maintenir et imprimer le planning de garde
2027, versionnés sous Git.

## Idée générale

Une **source de vérité unique** (`data/planning_2027.json`) décrit le planning de
garde de Papa. Les **deux PDF sont dérivés** de ce fichier :

- **`planning_garde_2027_papa_maman.pdf`** — document de négociation Papa /
  Maman : qui garde les enfants chaque jour + total des jours.
- **`planning_2027_papa_tierce.pdf`** — disponibilité du couple Papa & Tierce : Papa
  s'aligne sur le planning (fixe) de Tierce pour maximiser les week-ends à deux.

Les règles sont décrites dans [`CONTRAINTES.md`](CONTRAINTES.md).

## Arborescence

```
data/planning_2027.json          Source de vérité (garde, Tierce, vacances, fériés)
scripts/common.py                Chargement + calculs + rendu partagés
scripts/generate_papa_maman.py   -> planning_garde_2027_papa_maman.pdf
scripts/generate_papa_tierce.py      -> planning_2027_papa_tierce.pdf
scripts/count_days.py            Comptage des jours + contrôle d'équité
CONTRAINTES.md                   Règles du planning
pyproject.toml / uv.lock         Dépendances (gérées par uv)
```

## Utilisation

Les dépendances et l'exécution sont gérées par [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                        # installe les dépendances

# Comptage et vérification d'équité
uv run python scripts/count_days.py

# (Re)génération des deux PDF après modification du JSON
uv run python scripts/generate_papa_maman.py
uv run python scripts/generate_papa_tierce.py
```

## Modifier le planning

1. Éditer `data/planning_2027.json` (champ `garde_segments` : une plage
   `du`/`au` par période, avec le `parent` qui garde — le dernier jour d'une
   plage est le jour d'échange, attribué à ce parent).
2. `count_days.py` vérifie qu'aucun jour n'est en trou ni en double et affiche
   l'écart Papa/Maman.
3. Régénérer les deux PDF.

## État des données

- **`garde_segments`** : exact, transcrit des PDF et vérifié
  (**Papa 181 / Maman 184**, écart 3).
- **`tierce_indisponible`** : reconstruction alignée sur les semaines de Papa (le
  planning réel de Tierce est l'entrée fixe — corriger ici le cas échéant).
- **`vacances` / `feries`** : calendrier de référence, à ajuster si besoin.

## Pour viser un écart plus faible

L'écart de 3 vient des longues périodes de transition de vacances (rentrées de
janvier, septembre, Toussaint, Noël) attribuées à Maman. Décaler un jour
d'échange (dans le respect des règles mercredi/samedi 18h) rééquilibre : modifier
la plage concernée dans le JSON puis relancer `count_days.py` pour voir l'effet.
