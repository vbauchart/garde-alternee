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

### Variantes

Chaque script accepte en argument le fichier JSON à utiliser (par défaut
`data/planning_2027.json`). Une variante déclare dans son JSON un `suffixe`
ajouté au nom des PDF, et ses propres règles d'échange (`regles.echanges`).

```bash
# Variante « lundi 11h » -> *_lundi.pdf
uv run python scripts/count_days.py         data/planning_2027_lundi.json
uv run python scripts/generate_papa_maman.py data/planning_2027_lundi.json
uv run python scripts/generate_papa_tierce.py    data/planning_2027_lundi.json
```

## Modifier le planning

1. Éditer `data/planning_2027.json` (champ `garde_segments` : une plage
   `du`/`au` par période, avec le `parent` qui garde — le dernier jour d'une
   plage est le jour d'échange, attribué à ce parent).
2. `count_days.py` vérifie qu'aucun jour n'est en trou ni en double, affiche
   l'écart Papa/Maman et la liste des week-ends libres à deux.
3. Régénérer les deux PDF.

Les week-ends « libres à deux » ne sont pas saisis : ils sont calculés à partir
de la garde de Papa et du planning de Tierce (`tierce_indisponible`).

## État des données

- **`garde_segments`** : transcrit des PDF d'origine (181/184) puis négocié
  (**Papa 182 / Maman 183**). Variante lundi : 183/182.
- **`tierce_indisponible`** : semaines réelles de Tierce, transcrites du PDF Papa & Tierce
  d'origine (planning fixe).
- **`vacances`** : dates zones B et C reprises du PDF d'origine.
