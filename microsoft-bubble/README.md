# Microsoft Bubble — Clone

Clone du jeu **Microsoft Bubble** (Microsoft Solitaire Collection), généré à partir du prompt
[`../bubble-clone-prompt-fable5.md`](../bubble-clone-prompt-fable5.md).

100 % HTML/CSS/JavaScript vanilla — aucune dépendance, aucun build, aucun serveur requis.

## Lancer le jeu

Ouvrir simplement `index.html` dans un navigateur moderne (Chrome, Firefox, Safari, Edge) :

```bash
# double-clic sur index.html, ou :
open index.html        # macOS
xdg-open index.html    # Linux
```

Fonctionne aussi via un serveur statique si préféré :

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Modes de jeu

| Mode | Description |
|------|-------------|
| 🏆 **Classique** | Niveaux progressifs (de plus en plus de billes et de couleurs). Vous disposez d'un **stock de billes** : chaque tir en consomme une, chaque bille qui tombe est récupérée, et chaque niveau terminé rapporte **+5 billes**. Game over quand le stock est vide. |
| 🗺️ **Aventure** | 50 niveaux à débloquer, nombre de tirs limité, 1 à 3 étoiles selon le score. |
| 📅 **Défi du jour** | Un niveau unique par jour, identique pour tous (génération par seed de date). |

## Power Line

Une ligne électrique brille sous la **dernière rangée** de chaque niveau. Dès qu'elle est
dégagée (plus aucune bille sur cette rangée ni en dessous), la Power Line s'active :
**toutes les billes restantes tombent**, sont comptées (et récupérées dans le stock en
Classique), et le niveau est gagné. C'est le raccourci stratégique du jeu.

## Commandes

- **Souris** : déplacer pour viser, clic pour tirer.
- **Tactile** : glisser pour viser, relâcher pour tirer.
- **⏸** : pause (automatique si l'onglet passe en arrière-plan).

## Power-ups

| | Effet |
|---|---|
| 💣 Bombe | Détruit toutes les bulles dans un rayon de 3R autour de l'impact. |
| 🌈 Arc-en-ciel | S'adapte à la couleur produisant le plus grand cluster. |
| ⚡ Laser | Traverse la grille et détruit tout sur son passage. |
| 🔥 Boule de feu | Détruit le cluster touché quelle que soit sa taille. |
| ❄️ Glace | Gèle et brise la rangée occupée la plus basse (aide à dégager la Power Line). |

## Architecture

```
index.html        point d'entrée
style.css         thème Fluent sombre, overlays, responsive
src/
├── store.js      localStorage : paramètres, scores, progression
├── audio.js      sons synthétiques Web Audio (aucun fichier audio)
├── grid.js       géométrie de la grille hexagonale
├── solver.js     flood-fill, bulles flottantes, snap
├── levels.js     50 niveaux Aventure + défi quotidien (PRNG déterministe)
├── particles.js  particules, textes flottants, confettis
├── powerups.js   les 5 power-ups
├── renderer.js   rendu canvas (bulles 3D, viseur, lanceur)
├── ui.js         menus, HUD, overlays DOM
└── main.js       boucle de jeu, états, entrées
```

Données persistées dans `localStorage` : meilleur score, niveau max, étoiles Aventure,
classement local (top 10), meilleur score quotidien, paramètres.
