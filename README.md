# Garde alternée 2027

Données et scripts pour construire, maintenir et imprimer le planning de garde
2027, versionnés sous Git.

## Idée générale

Une **source de vérité unique** (`data/planning_2027.json`) décrit le planning de
garde Papa / Maman. Le **planning tierce** (personne tierce dont on veut
aligner les périodes libres) est un fichier séparé et facultatif
(`data/tierce_2027.json`). Les **deux PDF sont dérivés** de ces fichiers :

- **`papa_maman_<json>.pdf`** — document de négociation Papa /
  Maman : qui garde les enfants chaque jour + total des jours.
- **`papa_tierce_<json>.pdf`** — disponibilité de Papa et de la personne
  tierce : Papa s'aligne sur le planning tierce (fixe) pour maximiser les
  week-ends à deux.

Les règles sont décrites dans [`CONTRAINTES.md`](CONTRAINTES.md).

## Arborescence

```
data/planning_2027.json          Source de vérité (garde, règles, vacances, fériés)
data/tierce_2027.json            Planning tierce (facultatif, chargé à part)
scripts/common.py                Chargement + calculs + rendu partagés
scripts/generate_pdf.py          -> papa_maman_<json>.pdf + papa_tierce_<json>.pdf
scripts/count_days.py            Comptage des jours + contrôle d'équité
CONTRAINTES.md                   Règles du planning
pyproject.toml / uv.lock         Dépendances (gérées par uv)
```

## Données (dépôt privé)

Les JSON de `data/` et les PDF générés ne sont **pas** versionnés ici : ils
vivent dans un dépôt privé séparé, à cloner dans `data/` (ignoré par Git) :

```bash
git clone https://github.com/vbauchart/garde-alternee-data.git data
```

## Utilisation

Les dépendances et l'exécution sont gérées par [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                        # installe les dépendances

# Comptage et vérification d'équité
uv run python scripts/count_days.py

# (Re)génération des deux PDF de chaque JSON de data/
uv run python scripts/generate_pdf.py
```

### Variantes

Chaque variante est un JSON de `data/` avec ses propres règles d'échange
(`regles.echanges`). Le **nom du JSON** sert de suffixe aux PDF :
`data/planning_2027_lundi.json` → `papa_maman_planning_2027_lundi.pdf` et
`papa_tierce_planning_2027_lundi.pdf`. `count_days.py` prend le JSON en argument
(par défaut `data/planning_2027.json`), `generate_pdf.py` un ou plusieurs JSON
(par défaut tous).

```bash
# Variante « lundi 11h » seule
uv run python scripts/count_days.py   data/planning_2027_lundi.json
uv run python scripts/generate_pdf.py data/planning_2027_lundi.json
```

## Éditeur interactif

En ligne : <https://vbauchart.github.io/garde-alternee/> (aucune donnée n'y est
publiée ; les JSON chargés restent dans le navigateur).

`outil/editeur.html` : ouvrir le fichier dans un navigateur (double-clic, sans
serveur), puis charger un ou plusieurs JSON de `data/` (bouton ou glisser-déposer).

- **Calendrier** : clic sur un jour = il passe à l'autre parent jusqu'au
  prochain échange (déplace l'échange) ; Maj+clic = ce jour seulement ;
  Ctrl+clic = verrouiller le jour pour la suggestion. Annuler / rétablir
  (Ctrl+Z / Ctrl+Y).
- **Plages** : édition du/au/parent ; l'année reste toujours couverte.
- **Planning tierce** : calendrier où un clic ajoute/retire un jour du planning
  tierce (Maj+clic = jusqu'au dernier jour cliqué) ; seul le planning tierce y est
  affiché. Tableau des périodes pour les heures « dès » / « fin ».
  « Exporter le planning tierce » télécharge `tierce_<année>.json` (à placer dans `data/`).
- **Règles & suggestion** : jour, heure et attribution des échanges (scolaire
  et vacances), suffixe du fichier JSON (donc des PDF) ; « Proposer un planning » calcule le meilleur
  planning selon ces règles (équité, longueur des blocs, week-ends libres avec
  le planning tierce, jours verrouillés) dans un nouveau scénario.
- En direct : compteurs Papa/Maman (total, écart, par mois), nuits et
  week-ends libres à deux, alertes (échange hors règle, bloc trop long/court, nuit libre perdue
  par rapport à la référence).
- **Scénarios** : chaque fichier ouvert, copie ou suggestion est un scénario
  nommé, conservé dans le navigateur. « Exporter le JSON » télécharge
  `planning_2027<suffixe>.json`, à placer dans `data/` pour générer les PDF.

La logique (`outil/core.js`) reprend les mêmes règles que `scripts/common.py`
(mêmes comptes, échanges et nuits libres).

## Modifier le planning

1. Éditer `data/planning_2027.json` (champ `garde_segments` : une plage
   `du`/`au` par période, avec le `parent` qui garde — le dernier jour d'une
   plage est le jour d'échange, attribué à ce parent).
2. `count_days.py` vérifie qu'aucun jour n'est en trou ni en double, affiche
   l'écart Papa/Maman, le nombre de nuits libres à deux et les week-ends libres.
3. Régénérer les PDF (`generate_pdf.py`).

Les nuits « libres à deux » (cases LIBRE = nuit du soir de ce jour au matin
suivant) ne sont pas saisies : elles sont calculées à partir de la garde de Papa et du planning tierce (`tierce_indisponible` de `data/tierce_2027.json`).

## Planning tierce (fichier séparé)

`data/tierce_<année>.json` = `{"annee": 2027, "tierce_indisponible": [...]}`. Il est
**facultatif** :

- Scripts : pris automatiquement s'il est à côté du planning, ou `--tierce FICHIER`.
  Sans lui, `count_days.py` ne calcule pas les nuits libres et `generate_pdf.py`
  ne produit que le PDF Papa / Maman.
- Éditeur : bouton « Planning tierce… » (ou glisser le fichier). Il est commun à
  tous les scénarios et pris en compte dans les nuits libres, les alertes et la
  suggestion (bonus week-ends libres à deux). Sans lui, la suggestion n'optimise
  que l'équité et la longueur des blocs.
- Un planning qui contient encore `tierce_indisponible` reste accepté (l'éditeur
  en extrait le planning tierce).

## État des données

- **`garde_segments`** : transcrit des PDF d'origine (181/184) puis négocié
  (**Papa 182 / Maman 183**). Variante lundi : 183/182.
- **`tierce_indisponible`** (`data/tierce_2027.json`) : semaines réelles du planning tierce, transcrites du PDF
  d'origine (planning fixe).
- **`vacances`** : dates zones B et C reprises du PDF d'origine.
