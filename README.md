# Garde alternée 2027

Données et scripts pour construire, maintenir et imprimer le planning de garde
2027, versionnés sous Git.

## Idée générale

Une **source de vérité unique** (`data/planning_2027.json`) décrit le planning de
garde Papa / Maman. Les **jours à éviter** (jours où Papa préfère ne pas avoir
la garde : activité, déplacement…) sont dans un fichier séparé et facultatif
(`data/a_eviter_2027.json`). Les **deux PDF sont dérivés** de ces fichiers :

- **`papa_maman_<json>.pdf`** — document de négociation Papa / Maman : qui
  garde les enfants chaque jour + total des jours.
- **`papa_a_eviter_<json>.pdf`** — disponibilité de Papa : jours à éviter et
  journées et soirs libres, pour maximiser les week-ends libres.

Les règles sont décrites dans [`CONTRAINTES.md`](CONTRAINTES.md).

## Arborescence

```
data/planning_2027.json          Source de vérité (garde, règles, vacances, fériés)
data/a_eviter_2027.json          Jours à éviter (facultatif, chargé à part)
scripts/common.py                Chargement + calculs + rendu partagés
scripts/generate_pdf.py          -> papa_maman_<json>.pdf + papa_a_eviter_<json>.pdf
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
`papa_a_eviter_planning_2027_lundi.pdf`. `count_days.py` prend le JSON en argument
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
Au premier lancement, l'éditeur charge les jours à éviter par défaut
(`outil/a_eviter_defaut.js`, copie de `data/a_eviter_2027.json`) et propose
directement une suggestion de planning (options par défaut) ; « Nouveau » crée un planning vide de l'année choisie.

`outil/editeur.html` : ouvrir le fichier dans un navigateur (double-clic, sans
serveur), puis charger un ou plusieurs JSON de `data/` (bouton ou glisser-déposer).

- **Calendrier** : clic sur un jour = il passe à l'autre parent jusqu'au
  prochain échange (déplace l'échange) ; Maj+clic = ce jour seulement ;
  Ctrl+clic = verrouiller le jour pour la suggestion. Annuler / rétablir
  (Ctrl+Z / Ctrl+Y).
- **Plages** : édition du/au/parent ; l'année reste toujours couverte.
- **Jours à éviter** : calendrier où un clic marque/démarque un jour à éviter
  (Maj+clic = jusqu'au dernier jour cliqué) ; seuls les jours à éviter y sont
  affichés (journées pleines). Tableau des périodes du / au.
  « Exporter les jours à éviter » télécharge `a_eviter_<année>.json` (à placer dans `data/`).
- **Règles & suggestion** : zone de vacances de référence (A, B ou C ; les deux
  autres sont affichées à titre indicatif dans le calendrier), jour, heure et
  attribution des échanges (scolaire et vacances), suffixe du fichier JSON (donc des PDF) ; « Proposer un planning » calcule le meilleur
  planning selon ces règles (équité, longueur des blocs, week-ends libres sur
  les jours à éviter, jours verrouillés) dans un nouveau scénario.
- En direct : compteurs Papa/Maman (total, écart, par mois), journées et soirs
  libres et week-ends libres, alertes (échange hors règle, bloc trop long/court,
  journée libre perdue par rapport à la référence).
- **Export & PDF** : « PDF Papa / Maman » et « PDF jours à éviter » téléchargent
  directement les mêmes documents que `generate_pdf.py` (2 pages A4 paysage),
  générés dans le navigateur avec [jsPDF](https://github.com/parallax/jsPDF)
  (`outil/jspdf.umd.min.js`, licence MIT ; mise en page dans `outil/impression.js`).
- **Scénarios** : chaque fichier ouvert, copie ou suggestion est un scénario
  nommé, conservé dans le navigateur. « Exporter le JSON » télécharge
  `planning_2027<suffixe>.json`, à placer dans `data/` pour générer les PDF.

La logique (`outil/core.js`) reprend les mêmes règles que `scripts/common.py`
(mêmes comptes, échanges et journées libres).

## Modifier le planning

1. Éditer `data/planning_2027.json` (champ `garde_segments` : une plage
   `du`/`au` par période, avec le `parent` qui garde — le dernier jour d'une
   plage est le jour d'échange, attribué à ce parent).
2. `count_days.py` vérifie qu'aucun jour n'est en trou ni en double, affiche
   l'écart Papa/Maman, le nombre de journées et soirs libres et les week-ends libres.
3. Régénérer les PDF (`generate_pdf.py`).

Les **journées et soirs libres** (cases LIBRE) ne sont pas saisis : un jour
est libre quand Papa n'a pas les enfants le soir (chez Maman cette nuit-là)
**et** que ce jour est à éviter (`jours_a_eviter` de `data/a_eviter_2027.json`).

## Jours à éviter (fichier séparé)

`data/a_eviter_<année>.json` = `{"annee": 2027, "jours_a_eviter": [{"du", "au"}, ...]}` :
périodes où Papa préfère ne pas avoir la garde, en **journées pleines**
(journée et soir) du jour « du » au jour « au » inclus. Ce fichier est **facultatif** :

- Scripts : pris automatiquement s'il est à côté du planning, ou `--a-eviter FICHIER`.
  Sans lui, `count_days.py` ne calcule pas les journées et soirs libres et
  `generate_pdf.py` ne produit que le PDF Papa / Maman.
- Éditeur : bouton « Jours à éviter… » (ou glisser le fichier). Ils sont communs
  à tous les scénarios et pris en compte dans les journées libres, les alertes
  et la suggestion (bonus week-ends libres). Sans eux, la suggestion n'optimise
  que l'équité et la longueur des blocs.
- Un planning qui contient encore `jours_a_eviter` reste accepté (l'éditeur
  les en extrait).

## État des données

- **`garde_segments`** : transcrit des PDF d'origine (181/184) puis négocié
  (**Papa 182 / Maman 183**). Variante lundi : 183/182.
- **`jours_a_eviter`** (`data/a_eviter_2027.json`) : complément des semaines
  transcrites du PDF d'origine (fixe).
- **`vacances`** : calendrier officiel des zones A, B et C ; la zone de
  référence est choisie dans `regles.zone` (B par défaut, C pour le planning 2027).
