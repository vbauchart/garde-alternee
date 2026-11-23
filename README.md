# Garde alternée

Éditeur web du planning de garde Papa / Maman. Le planning est **calculé par
des règles strictes** (jour et heure d'échange hors vacances et en vacances,
zone de vacances, parité des semaines, partage des vacances selon la parité
de l'année). Les règles sont décrites dans [`CONTRAINTES.md`](CONTRAINTES.md).

## Utilisation

Ouvrir `outil/editeur.html` dans un navigateur (ou la version publiée sur
GitHub Pages).

- **Planning 1** : les règles du planning.
- **Planning 2** (facultatif) : une variante, réglée de la même façon et
  affichée à côté du planning 1 dans le calendrier (jours différents marqués
  « • », totaux comparés).
- **Calendrier** : l'année choisie, jour par jour, avec les échanges, les
  vacances des trois zones et les jours fériés. Les vacances sont
  téléchargées depuis data.gouv.fr à l'ouverture (calendrier intégré en
  secours hors ligne) ; les années proposées sont celles qu'elles couvrent.
- **Télécharger le PDF** : 2 pages A4 paysage (calendrier, règles, totaux,
  signatures).
- **Exporter l'agenda (ICS)…** : choisir le planning (1 ou 2), le parent et
  l'année ; télécharge `garde_<parent>_<année>.ics`, avec un événement
  « Enfants chez … » par période de garde, d'un échange au suivant (heure de
  Paris). Les périodes à cheval sur deux années sont coupées au 1er janvier.
- **Exporter le JSON / Ouvrir…** : sauvegarder ou recharger la configuration
  (`garde_<année>.json`). Les réglages sont aussi gardés dans le navigateur ;
  « Remettre à zéro » les efface.

## Arborescence

```
outil/editeur.html      Interface (calendrier, réglages, export)
outil/core.js           Calcul du planning par les règles + calendrier scolaire
                        (intégré, ou chargé depuis data.gouv.fr)
outil/impression.js     Mise en page du PDF
outil/jspdf.umd.min.js  Bibliothèque jsPDF
CONTRAINTES.md          Règles du planning
```

`core.js` et `impression.js` fonctionnent aussi avec node (tests) :

```bash
node -e 'const G = require("./outil/core.js"); console.log(G.calculer({}, 2027).total)'
```

## Données personnelles

Les exports (JSON, PDF) peuvent être rangés dans `data/` (ignoré par Git),
par exemple un clone du dépôt privé `garde-alternee-data`.
