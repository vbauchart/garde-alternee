# Contraintes du planning de garde 2027

Ce document fixe les règles de construction du planning. Elles sont la
référence : toute modification des données (`data/planning_2027.json`) doit les
respecter.

## Acteurs

- **Papa** (moi). Dans le PDF *Papa / Maman*, je suis « Papa » ; dans
  le PDF *Papa / Tierce*, je suis « Papa ».
- **Maman** : l'autre parent des enfants, avec qui je négocie le planning 2027.
- **Tierce** : une personne tierce. Elle a son propre planning de garde (de ses enfants),
  **fixe et non négociable**.

## Objectif

1. **Définir un planning de garde équitable** des enfants entre Papa et Maman
   pour 2027 (compte des jours le plus équilibré possible).
2. **Aligner les périodes « sans enfants » de Papa sur celles de Tierce** afin de
   **maximiser les week-ends libres à deux** (en vert dans le PDF Papa / Tierce).

## Règles d'échange

| Période | Jour d'échange | Heure |
|---|---|---|
| Scolaire | **Mercredi** | 18h00 |
| Vacances | **Samedi** | 18h00 |

- **Attribution d'un jour d'échange** : le jour est compté pour le parent qui
  **rend** les enfants, c'est-à-dire celui qui les a gardés **jusqu'à 18h**.
  Exemple : un mercredi où Papa rend les enfants à 18h est compté « Papa ».
- Pendant les vacances scolaires, on bascule sur un rythme **samedi → samedi
  18h** (quinzaines l'été).
- Le planning de **Tierce est fixe** : c'est Papa qui adapte ses semaines pour faire
  coïncider ses périodes libres avec celles de Tierce.

## Contrainte d'équité

- À la fin de l'année, le **total des jours** de Papa et de Maman doit rester
  **équitable**.
- Baseline transcrite des PDF d'origine : **Papa 181 / Maman 184** (écart 3).
- Cible : réduire l'écart au minimum sans casser les alignements de week-end.
- Vérification : `python scripts/count_days.py`.

## Zones de vacances

- **Zone C (Paris)** : zone des enfants → c'est elle qui déclenche l'échange du
  samedi. Fenêtres négociées listées dans le JSON.
- **Zone B (Amiens)** : zone de Tierce → sert de référence pour ses disponibilités.

## Jours fériés 2027

Jour de l'an (01/01), Lundi de Pâques (29/03), Fête du Travail (01/05),
Ascension (06/05), Victoire 1945 (08/05), Lundi de Pentecôte (17/05), Fête
nationale (14/07), Assomption (15/08), Toussaint (01/11), Armistice (11/11),
Noël (25/12).

## Fiabilité des données

- `garde_segments` : **exact**, transcrit et vérifié depuis les PDF (181/184).
- `tierce_indisponible` : **reconstruction** alignée sur les semaines de Papa. Le
  planning réel de Tierce étant l'entrée fixe, corriger ici si une date diffère.
- `vacances` / `feries` : calendrier de référence, à ajuster si besoin.
