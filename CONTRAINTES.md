# Règles du planning de garde

Le planning n'est plus construit à la main ni optimisé : il est **entièrement
calculé** à partir de règles strictes. Pour changer le planning, on change les
règles. Le calcul est dans `outil/core.js` (`calculer`).

Deux plannings peuvent être réglés (onglets « Planning 1 » et « Planning 2 ») :
le planning 2 est une variante, affichée à côté du planning 1 dans le
calendrier pour comparer.

## Réglages d'un planning

| Réglage | Valeurs | Par défaut |
|---|---|---|
| Zone de vacances | A, B ou C | C |
| Échange hors vacances | jour, heure, jour compté pour celui qui rend / reçoit | mercredi 18h, rend |
| Échange en vacances | jour, heure, jour compté pour celui qui rend / reçoit | samedi 18h, rend |
| Semaines hors vacances | Papa a les semaines paires ou impaires | paires |
| Petites vacances | les années paires, Papa a la 1ʳᵉ ou la 2ᵉ semaine | 1ʳᵉ |
| Été | les années paires, Papa a les quinzaines 1 et 3 ou 2 et 4 | 1 et 3 |
| Fusion des périodes courtes | oui / non (case à cocher) | oui |

Maman a toujours l'inverse de Papa. Les années impaires, le partage des
vacances est inversé.

## Définitions

- **Semaine (hors vacances)** : du jour d'échange hors vacances (à l'heure
  d'échange) au jour d'échange suivant. Elle est **paire** si l'échange qui
  l'ouvre tombe une semaine ISO 8601 de numéro pair.
  - Exemple (mercredi 18h, Papa = paires) : du mer. 13/01/2027 18h (S2) au
    mer. 20/01 18h → Papa ; du mer. 20/01 (S3) au mer. 27/01 → Maman.
  - Les années à 53 semaines ISO (2026) donnent deux semaines impaires
    d'affilée (S53 puis S1) : le même parent a deux semaines de suite. La
    règle s'applique telle quelle (en pratique, cela tombe pendant Noël).
- **Vacances** : celles de la zone choisie (calendrier officiel). Elles
  commencent au **premier jour d'échange vacances compris dans les vacances
  officielles** et se déroulent en blocs d'un échange vacances au suivant :
  - **petites vacances** (Toussaint, Noël, hiver, printemps) : 2 semaines ;
  - **été** : jusqu'à 4 quinzaines (autant qu'il en tient).
  - Un bloc se termine au plus tard le jour de la reprise des cours.
  - Avant le premier bloc et après le dernier, le **rythme hors vacances**
    s'applique (parité de la semaine en cours).
  - Exemple (hiver 2027, zone C, du sam. 6/02 au dim. 21/02) : rythme hors
    vacances jusqu'au sam. 6/02 18h, 1ʳᵉ semaine jusqu'au sam. 13/02 18h,
    2ᵉ semaine jusqu'au sam. 20/02 18h, puis rythme hors vacances.
- **Année paire / impaire** : année du **début** des vacances (Noël
  2026-2027 → 2026 → année paire).
- **Jour d'échange** : compté pour le parent qui **rend** les enfants ou pour
  celui qui les **reçoit**, selon le réglage de l'échange (hors vacances ou
  vacances).
- **Fusion des périodes courtes** (option) : une période de **3 jours ou
  moins** (jours comptés) chez un parent, coincée entre deux périodes de
  l'autre parent, est **rendue à l'autre parent** : les deux échanges qui
  l'encadrent sont supprimés et les trois périodes n'en font plus qu'une.
  - Cela arrive surtout au début ou à la fin des vacances, quand le jour
    d'échange des vacances diffère du jour d'échange hors vacances.
  - Exemple (réglages par défaut, 2027) : Papa aurait les enfants du mer.
    30/06 18h au sam. 3/07 18h (début de l'été, 1ʳᵉ quinzaine à Maman) ;
    avec la fusion, Maman les garde du mer. 23/06 au sam. 17/07.
  - Les fusions sont faites de la plus courte à la plus longue. Elles ne
    compensent pas les jours perdus : l'écart Papa / Maman peut augmenter.
  - Les jours fusionnés sont hachurés dans le calendrier et listés à gauche.
- **Jour férié** : un échange qui tombe un jour férié est **reporté au
  lendemain**, à la même heure (ex. sam. 25/12/2027 → dim. 26/12 18h).

## Données

- **Vacances scolaires** : calendrier officiel des zones A, B et C,
  téléchargé à l'ouverture de l'éditeur depuis le jeu de données
  [« Le calendrier scolaire »](https://www.data.gouv.fr/datasets/le-calendrier-scolaire)
  (API de data.education.gouv.fr). Le dernier téléchargement est gardé dans
  le navigateur ; sans réseau ni cache, le calendrier intégré à
  `outil/core.js` (`VACANCES`, de Noël 2026-2027 à l'été 2028) sert de
  secours. La source et la date du téléchargement sont affichées à côté du
  choix de l'année (détail au survol).
  - Les années proposées sont celles que le calendrier couvre, à partir de
    l'année en cours.
  - Dates des élèves (pas celles des enseignants) ; les ponts (Ascension) ne
    sont pas des vacances au sens des règles et sont ignorés.
  - Quand seul le début de l'été est publié, l'été est arrêté au 31 août, et
    les vacances suivantes manquent (l'éditeur l'indique).
- **Jours fériés** : calculés (`feriesFrance`, Pâques par l'algorithme de
  Meeus).
- Les deux zones non choisies sont affichées **à titre indicatif**.
