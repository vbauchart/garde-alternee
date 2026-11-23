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
- **Jour férié** : un échange qui tombe un jour férié est **reporté au
  lendemain**, à la même heure (ex. sam. 25/12/2027 → dim. 26/12 18h).

## Données

- **Vacances scolaires** : calendrier officiel des zones A, B et C, intégré à
  `outil/core.js` (`VACANCES`), de Noël 2026-2027 à l'été 2028. Le calendrier
  2028-2029 n'est pas encore publié : la fin de l'été 2028 est arrêtée au
  31 août, et Toussaint et Noël 2028 manquent (l'éditeur l'indique).
- **Jours fériés** : calculés (`feriesFrance`, Pâques par l'algorithme de
  Meeus).
- Les deux zones non choisies sont affichées **à titre indicatif**.
