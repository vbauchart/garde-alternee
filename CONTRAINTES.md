# Contraintes du planning de garde 2027

Ce document fixe les règles de construction du planning. Elles sont la
référence : toute modification des données (`data/planning_2027.json`) doit les
respecter.

## Acteurs

- **Papa** et **Maman** : les deux parents, qui négocient le planning 2027.
- **Jours à éviter** : jours où Papa préfère ne pas avoir la garde (activité,
  déplacement…). Ils sont **fixes** et facultatifs.

## Objectif

1. **Définir un planning de garde équitable** des enfants entre Papa et Maman
   pour 2027 (compte des jours le plus équilibré possible).
2. **Placer les périodes « sans enfants » de Papa sur les jours à éviter** afin
   de **maximiser les week-ends libres** (en vert dans le PDF des jours à éviter).

## Règles d'échange

| Période | Jour d'échange | Heure |
|---|---|---|
| Scolaire | **Mercredi** | 18h00 |
| Vacances | **Samedi** | 18h00 |

- **Attribution d'un jour d'échange** : le jour est compté pour le parent qui
  **rend** les enfants, c'est-à-dire celui qui les a gardés **jusqu'à 18h**.
  Exemple : un mercredi où Papa rend les enfants à 18h est compté « Papa ».
- **Jour férié** : un échange qui tombe un jour férié est **reporté au
  lendemain** (ex. sam. 25/12 Noël → échange le dim. 26/12 18h).
- Pendant les vacances scolaires, on bascule sur un rythme **samedi → samedi
  18h** (quinzaines l'été).
- Les **jours à éviter sont fixes** : c'est le planning de garde qui s'adapte
  pour que Papa n'ait pas les enfants ces jours-là.

## Jours à éviter (fixes)

- Périodes **lundi → lundi** en semaine scolaire ; en vacances, jusqu'au
  **dimanche 11h**.
- Chaque période va du jour « du » (dès l'heure « des ») au jour « au »
  (jusqu'à l'heure « fin » : le soir de « au » n'est alors plus à éviter).
- Données : `jours_a_eviter` dans le fichier séparé `data/a_eviter_2027.json`.

## Journées, soirs et week-ends libres

- Les cases **LIBRE** (colonne « À éviter », en vert) sont les jours où Papa
  **n'a pas les enfants le soir** et qui sont **à éviter**. Elles sont
  **calculées** et ne sont **jamais stockées** dans le JSON.
- Un jour compte jusqu'au lendemain matin : Papa n'a pas les enfants le soir si
  la nuit revient à Maman **après** l'échange du jour (ex. mercredi où Papa
  rend à 18h → soir chez Maman, donc libre).
- Un **week-end libre** = vendredi et samedi libres.
- Total : **139 journées et soirs libres / 21 week-ends** (planning principal,
  dont Noël 24–25/12), **163 / 20 week-ends** (variante lundi).
- Planning principal : **20 week-ends** (les 19 de l'original + le 6–7/02
  gagné grâce à l'échange janvier/février).

## Contrainte d'équité

- À la fin de l'année, le **total des jours** de Papa et de Maman doit rester
  **équitable**.
- Baseline transcrite des PDF d'origine : Papa 181 / Maman 184 (écart 3).
- État négocié actuel : **Papa 182 / Maman 183** (écart 1).
- Cible : réduire l'écart au minimum sans casser les alignements de week-end.
- Vérification : `uv run python scripts/count_days.py`.

### Échange négocié janvier / février

Pour rééquilibrer (écart 3 → 1) tout en partageant équitablement les vacances
d'hiver, deux bornes d'échange ont été décalées (toutes deux un mercredi 18h) :

- **Janvier** : Papa garde jusqu'au **mercredi 6/01** (au lieu du 2/01). Maman
  reprend le 7/01. → +4 jours pour Papa.
- **Février** : Papa rend les enfants le **mercredi 3/02** (au lieu du 6/02).
  Maman enchaîne du 4 au 13/02. → −3 jours pour Papa (+3 pour Maman).
- Net : +1 jour pour Papa (182 / 183).

## Partage des vacances d'hiver

- **1ʳᵉ semaine (6–13/02)** : **Maman**.
- **2ᵉ semaine (14–20/02)** : **Papa**.

## Variante « lundi 11h » (proposition alternative)

Fichier séparé : `data/planning_2027_lundi.json` → PDF suffixés `_lundi`.

| Période | Jour d'échange | Heure | Jour compté pour |
|---|---|---|---|
| Scolaire | **Lundi** | 11h00 | le parent qui **reçoit** (il a les enfants l'après-midi) |
| Vacances (zone C) | **Samedi** | 18h00 | le parent qui **rend** |

- Semaines scolaires : alternance lundi 11h → lundi 11h.
- Vacances : moitiés samedi 18h → samedi 18h sur les dates officielles zone C.
  Les jours avant le début des vacances (lundi → samedi) restent au parent de
  la semaine en cours ; la fin des vacances (dernier samedi 18h → reprise)
  rejoint la semaine scolaire suivante, sauf contrainte de week-end.
- Mêmes contraintes que le planning principal : jours à éviter fixes, les 19
  week-ends libres de l'original conservés, équité des jours.
- Résultat : **Papa 183 / Maman 182** (écart 1), **20 week-ends
  libres** (les 19 de l'original + le 6–7/11).
- Points à négocier :
  - **Hiver** : Papa a la 1ʳᵉ semaine (6–13/02), Maman la 2ᵉ (13–20/02) —
    inverse de l'échange négocié dans le planning principal.
  - **Printemps** : Maman n'a qu'un week-end (sam. 17/04 18h → lun. 19/04 11h)
    entre deux blocs de Papa. C'est imposé par le week-end libre du 3/04 et
    les règles samedi/lundi ; l'alternative est un bloc de 16 jours pour Papa
    (10 → 26/04).
  - **Toussaint** : Papa du lun. 18/10 au sam. 30/10 (13 jours), Maman du
    30/10 au lun. 8/11.

## Zones de vacances

- La **zone de référence** se choisit dans les règles (`regles.zone` : A, B
  ou C ; **B par défaut**). Ses vacances définissent les plages de vacances
  des enfants, déclenchent l'échange du samedi et fixent l'été (blocs plus
  longs). Le planning 2027 négocié utilise la **zone C**.
- Les **deux autres zones** sont affichées **à titre purement indicatif**
  (elles n'interviennent ni dans les règles d'échange ni dans les calculs).

## Jours fériés 2027

Jour de l'an (01/01), Lundi de Pâques (29/03), Fête du Travail (01/05),
Ascension (06/05), Victoire 1945 (08/05), Lundi de Pentecôte (17/05), Fête
nationale (14/07), Assomption (15/08), Toussaint (01/11), Armistice (11/11),
Noël (25/12).

## Fiabilité des données

- `garde_segments` : transcrit des PDF d'origine (181/184), puis négocié
  (182/183).
- `jours_a_eviter` (`data/a_eviter_2027.json`) : **exact**, complément des semaines du PDF d'origine.
- `vacances` : calendrier officiel des zones A, B et C.
- `feries` : jours fériés 2027.
