# Prompt : Clone de Microsoft Bubble pour Fable 5

## Contexte et objectif

Génère une application web complète qui reproduit fidèlement **Microsoft Bubble**, le jeu de type
"bubble shooter" inclus dans la suite **Microsoft Solitaire Collection** (Windows 10/11, Xbox,
mobile). L'application doit être entièrement autonome dans un seul fichier HTML ou dans une
arborescence de fichiers statiques (HTML + CSS + JS vanilla), sans dépendances externes à
l'exception d'éventuelles polices Google Fonts.

---

## Description du jeu original

Microsoft Bubble est un jeu de tir de bulles (bubble shooter) classique :

- Une grille hexagonale de bulles colorées occupe la partie haute de l'écran.
- Le joueur dispose d'un lanceur (shooter) en bas au centre.
- Il vise et tire une bulle colorée vers la grille.
- Quand 3 bulles ou plus de la même couleur se touchent, elles éclatent et disparaissent.
- Les bulles qui ne sont plus attachées à la grille tombent également.
- Le jeu monte en difficulté niveau après niveau.
- Des power-ups spéciaux enrichissent le gameplay.
- Une interface soignée reprend l'esthétique Microsoft Fluent Design.

---

## Spécifications techniques

### Stack

- **Langage** : HTML5 + CSS3 + JavaScript ES2022 (vanilla, pas de framework)
- **Rendu** : Canvas 2D API (`<canvas>`)
- **Résolution canvas** : 420 × 680 px (logique interne), responsive via CSS `scale`
- **Cible** : navigateurs modernes (Chrome, Firefox, Safari, Edge) — desktop et mobile
- **Persistance** : `localStorage` pour scores, progression, paramètres

### Architecture des fichiers

```
/
├── index.html          ← point d'entrée, contient tout OU importe les modules
├── src/
│   ├── main.js         ← initialisation, game loop
│   ├── grid.js         ← logique grille hexagonale
│   ├── projectile.js   ← physique du tir
│   ├── solver.js       ← flood-fill, détection clusters, bulles flottantes
│   ├── powerups.js     ← logique des power-ups
│   ├── levels.js       ← données des niveaux Adventure mode
│   ├── audio.js        ← Web Audio API (sons synthétiques)
│   ├── renderer.js     ← dessin canvas (bulles, effets, UI)
│   ├── particles.js    ← système de particules
│   ├── ui.js           ← overlays, menus, HUD
│   └── store.js        ← localStorage, état global
└── style.css
```

Si un seul fichier est préféré, tout doit être dans `index.html` avec des blocs `<script>` modulaires
bien commentés.

---

## Grille hexagonale

### Géométrie

- **Rayon de bulle** : `R = 20px`
- **Diamètre** : `D = 40px`
- **Espacement vertical** : `ROW_H = R × √3 ≈ 34.64px`
- **Colonnes** : 10 bulles par rangée
- **Décalage** : les rangées d'index absolu **impair** sont décalées de +R vers la droite
- **Index absolu** : `absRow(gi) = gi + topAbs`; `topAbs` décrémente à chaque `dropRow()`

```js
function colX(col, gi) {
  const isOdd = absRow(gi) % 2 !== 0;
  return R + col * D + (isOdd ? R : 0);
}
function rowY(gi) { return R + gi * ROW_H; }
```

### Voisins hexagonaux

Chaque cellule `(gi, col)` a 6 voisins. Les offsets dépendent de la parité de la rangée absolue :

```js
function neighbours(gi, col) {
  const odd = absRow(gi) % 2 !== 0;
  return [
    [gi-1, odd ? col   : col-1],
    [gi-1, odd ? col+1 : col  ],
    [gi,   col-1],
    [gi,   col+1],
    [gi+1, odd ? col   : col-1],
    [gi+1, odd ? col+1 : col  ],
  ].filter(([r,c]) => r>=0 && r<grid.length && c>=0 && c<COLS && grid[r][c] !== null);
}
```

---

## Couleurs et palette

### Couleurs de bulles (8 couleurs disponibles)

| Nom        | Hex       | Usage                      |
|------------|-----------|----------------------------|
| Rouge      | `#E74C3C` | couleur de base             |
| Bleu       | `#2980B9` | couleur de base             |
| Vert       | `#27AE60` | couleur de base             |
| Jaune      | `#F1C40F` | couleur de base             |
| Violet     | `#8E44AD` | couleur de base             |
| Orange     | `#E67E22` | couleur de base             |
| Cyan       | `#1ABC9C` | ajoutée au niveau 3+        |
| Rose       | `#E91E8C` | ajoutée au niveau 5+        |

Les niveaux bas utilisent 4-5 couleurs ; les niveaux élevés en utilisent 6-8.

### Palette UI (thème Microsoft Bubble)

```css
:root {
  --bg-dark:    #0D1B4B;   /* fond bleu nuit foncé  */
  --bg-mid:     #1A2E6B;   /* fond grille            */
  --accent:     #4A9EFF;   /* bleu Microsoft         */
  --accent2:    #FF6B35;   /* orange highlight       */
  --gold:       #FFD700;   /* scores, étoiles        */
  --text-main:  #FFFFFF;
  --text-sub:   #A8BFE8;
  --panel-bg:   rgba(10, 20, 60, 0.92);
  --shadow:     rgba(74, 158, 255, 0.4);
}
```

---

## Physique du projectile

```js
const SPD = 14;          // vitesse px/frame

function shoot(targetX, targetY) {
  const dx = targetX - SX, dy = targetY - SY;
  if (dy >= -8) return;  // bloquer les tirs vers le bas
  const len = Math.hypot(dx, dy);
  projectile = {
    x: SX, y: SY,
    vx: (dx/len) * SPD,
    vy: (dy/len) * SPD,
    color: currentColor
  };
}

// Rebond sur les murs gauche/droit
if (projectile.x - R < 0)  { projectile.x = R;   projectile.vx =  Math.abs(projectile.vx); }
if (projectile.x + R > W)  { projectile.x = W-R;  projectile.vx = -Math.abs(projectile.vx); }

// Collision avec une bulle de la grille : distance < 2R - 1
// Collision avec le plafond (y - R <= 0) : snap immédiat
```

---

## Logique de résolution (place, cluster, floating)

### Snap sur la cellule la plus proche

```js
function snapCell(px, py) {
  let bestR=-1, bestC=-1, bestD=Infinity;
  for (let r=0; r<grid.length+1; r++)
    for (let c=0; c<COLS; c++) {
      if (r < grid.length && grid[r][c] !== null) continue;
      const dx=px-colX(c,r), dy=py-rowY(r);
      const d=dx*dx+dy*dy;
      if (d < bestD) { bestD=d; bestR=r; bestC=c; }
    }
  return [bestR, bestC];
}
```

### Flood-fill cluster (itératif, pas récursif)

```js
function cluster(gi, col, color) {
  const seen=new Set(), stack=[[gi,col]], res=[];
  while (stack.length) {
    const [r,c] = stack.pop();
    const k = r*100+c;
    if (seen.has(k)) continue;
    if (grid[r]?.[c] !== color) continue;
    seen.add(k); res.push([r,c]);
    neighbours(r,c).forEach(nb => stack.push(nb));
  }
  return res;
}
```

### Bulles flottantes (BFS depuis la rangée 0)

```js
function findFloating() {
  const attached=new Set(), queue=[];
  for (let c=0; c<COLS; c++)
    if (grid[0]?.[c]) { attached.add(c); queue.push([0,c]); }
  let head=0;
  while (head < queue.length) {
    const [r,c]=queue[head++];
    neighbours(r,c).forEach(([nr,nc]) => {
      const k=nr*100+nc;
      if (!attached.has(k)) { attached.add(k); queue.push([nr,nc]); }
    });
  }
  const fl=[];
  for (let r=0; r<grid.length; r++)
    for (let c=0; c<COLS; c++)
      if (grid[r][c] && !attached.has(r*100+c)) fl.push([r,c]);
  return fl;
}
```

---

## Système de score

| Action                          | Points                         |
|---------------------------------|-------------------------------|
| Bulle de cluster éliminée       | `10 × level × multiplier`     |
| Bulle flottante tombée           | `5 × level`                   |
| Niveau complété (bonus)         | `500 × level`                 |
| Combo (clusters successifs)     | Multiplier +0.5x par combo    |
| Perfect (niveau sans pénalité)  | Bonus +1000 pts                |

Le **multiplier de combo** se réinitialise si un tir ne provoque aucune explosion.

---

## Power-ups

Cinq power-ups apparaissent aléatoirement dans le shooter (probabilité ajustable par niveau) :

| Power-up          | Icône | Effet                                                         |
|-------------------|-------|---------------------------------------------------------------|
| **Bombe**         | 💣    | Détruit toutes les bulles dans un rayon de 3R autour du point d'impact |
| **Arc-en-ciel**   | 🌈    | Correspond à n'importe quelle couleur (wild card)              |
| **Laser**         | ⚡    | Traverse toute la colonne et détruit tout sur son passage      |
| **Boule de feu**  | 🔥    | Détruit un cluster de 5+ bulles quelle que soit la taille     |
| **Glace**         | ❄️    | Gèle et brise la rangée occupée la plus basse                  |

Les power-ups ont leur propre rendu visuel animé (halo pulsant, icône centrée).

---

## Modes de jeu

### 1. Classic Mode (niveaux progressifs)

Le jeu n'est **pas continu** : il enchaîne des niveaux de plus en plus garnis
(rangées et couleurs croissantes, voir tableau de difficulté).

- **Stock de billes** : le joueur démarre avec 30 billes ; chaque tir en consomme une.
- **Récupération** : chaque bille qui tombe (flottante ou via Power Line) revient
  dans le stock ; chaque niveau terminé rapporte **+5 billes**.
- **Power Line** : à chaque niveau, une bille aléatoire de la **rangée du haut**
  porte le bonus (anneau électrique pulsant + ⚡). Quand cette bille est éclatée
  en l'associant à d'autres billes de sa couleur (cluster ≥ 3, ou détruite par
  un power-up), toutes les billes restantes **tombent** (points + récupération)
  et le niveau est gagné.
- Game over si le stock tombe à zéro avec des billes restantes, ou si une bulle
  passe la ligne de danger (`DLIM = SY - R×4`).
- Fin de niveau : grille vidée (pops) ou Power Line activée.

### 2. Adventure Mode (niveaux fixes)

- 50+ niveaux prédéfinis avec des configurations initiales spécifiques.
- Chaque niveau a : un nombre limité de tirs, une configuration de bulles, des objectifs.
- Objectifs possibles : vider la grille, atteindre un score, éliminer des bulles spéciales.
- Système d'étoiles : 1 à 3 étoiles selon le score final.
- Progression sauvegardée en `localStorage`.

**Format d'un niveau :**
```js
{
  id: 1,
  name: "Démarrage en douceur",
  maxShots: 30,
  colors: ['#E74C3C','#2980B9','#27AE60','#F1C40F'],
  grid: [
    "RRBGYRRBGY",  // R=rouge B=bleu G=vert Y=jaune
    "BGRYBGRYBB",
    "GYRRGYRRRG",
    "YRBBYRBBYR",
  ],
  target: { type: 'clear', bonus: 1000 },
  stars: [500, 1500, 3000]
}
```

### 3. Daily Challenge

- Un niveau aléatoire unique généré par `seed = new Date().toDateString()`.
- Disponible une fois par jour, score soumis au leaderboard local.

---

## Interface utilisateur

### Écran principal (menu)

```
┌─────────────────────────────────┐
│         MICROSOFT BUBBLE        │ ← titre animé, gradient bleu→orange
│                                 │
│  [🏆 Jouer - Classique ]        │
│  [🗺️  Aventure          ]        │
│  [📅 Défi du jour       ]        │
│  [⚙️  Paramètres         ]        │
│                                 │
│  Meilleur score : 12 450        │
│  Niveau max atteint : 14        │
└─────────────────────────────────┘
```

### HUD en jeu (pendant la partie)

```
┌─────────────────────────────────┐
│ Score: 4 200  Niveau 3  ★★☆    │
│ ─────────────────── [PAUSE]     │
│                                 │
│  [grille de bulles hexagonale]  │
│                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ [danger] │
│                                 │
│     [guide de visée pointillé]  │
│                                 │
│  NEXT:  [●]   [   shooter   ]   │
│         couleur   viseur+barre  │
└─────────────────────────────────┘
```

### Overlay de pause

- Boutons : Reprendre / Recommencer / Menu
- Affiche le score actuel et le meilleur score

### Overlay de fin de niveau / Game Over

- Score final, étoiles obtenues (Adventure), meilleur score
- Animation : confettis si nouveau record, particules rouges si game over
- Boutons : Suivant / Rejouer / Menu

### Écran de progression Adventure

- Grille de niveaux style carte (map), 5 niveaux par rangée
- Bulles verrouillées pour les niveaux non débloqués
- Étoiles affichées sur chaque niveau complété

---

## Rendu visuel des bulles

Chaque bulle est rendue avec un dégradé radial donnant un effet 3D :

```js
function drawBubble(ctx, x, y, color, alpha=1, scale=1) {
  const r = R * scale;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Corps de la bulle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  const gr = ctx.createRadialGradient(x-r*.3, y-r*.32, r*.05, x, y, r);
  gr.addColorStop(0,   lighten(color, 70));
  gr.addColorStop(0.4, color);
  gr.addColorStop(1,   darken(color, 50));
  ctx.fillStyle = gr;
  ctx.fill();

  // Reflet
  ctx.beginPath();
  ctx.arc(x - r*.27, y - r*.27, r*.22, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // Contour subtil
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}
```

### Animations des bulles

- **Apparition** : scale 0 → 1 en 150ms avec easing `easeOutBounce`
- **Explosion** : scale 1 → 0 + burst de 12 particules couleur de la bulle
- **Tremblement** (danger) : oscillation ±2px si la rangée est proche de la ligne rouge
- **Hover** (grille editor) : léger agrandissement au survol de la souris

---

## Système de particules

```js
function burst(x, y, color, count=12) {
  for (let i=0; i<count; i++) {
    const a = (Math.PI*2*i)/count;
    particles.push({
      x, y,
      vx: Math.cos(a) * (2+Math.random()*4),
      vy: Math.sin(a) * (2+Math.random()*4),
      r:  3 + Math.random()*4,
      color,
      life: 1.0
    });
  }
}

// Mise à jour chaque frame
p.x    += p.vx;
p.y    += p.vy;
p.vy   += 0.12;       // gravité
p.life -= 0.04;
p.r    *= 0.97;       // rétrécissement
```

Effets supplémentaires :
- **Score flottant** : texte "+X0" qui monte et s'estompe depuis le point d'impact
- **Éclairs combo** : lignes électriques entre les bulles explosées si combo ≥ 3
- **Confettis de victoire** : 80 particules multicolores retombant de la partie haute

---

## Guide de visée

La ligne de visée est calculée par tracé pas à pas avec rebonds :

```js
function drawAimGuide(ctx, aimX, aimY) {
  let dx = aimX - SX, dy = aimY - SY;
  if (dy >= -8) return;
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  let x=SX, y=SY; ctx.moveTo(x, y);

  for (let i=0; i<300 && y>R; i++) {
    x += dx*14; y += dy*14;
    if (x-R < 0)  { x=R+(R-x);     dx=-dx; }
    if (x+R > W)  { x=W-R-(x-W+R); dx=-dx; }
    ctx.lineTo(x, y);
    // Arrêt si collision imminente avec une bulle
    if (wouldCollide(x, y)) break;
  }
  ctx.stroke();
  ctx.restore();
}
```

---

## Progression de difficulté

| Niveau | Rangées initiales | Couleurs | Power-ups |
|--------|:-----------------:|:--------:|:---------:|
| 1      | 4                 | 4        | aucun     |
| 2–3    | 5                 | 4        | 5%        |
| 4–6    | 6                 | 5        | 8%        |
| 7–10   | 7                 | 5        | 10%       |
| 11–15  | 8                 | 6        | 12%       |
| 16+    | 9                 | 6–8      | 15%       |

---

## Sons (Web Audio API — synthétiques, aucun fichier audio)

Tous les sons sont générés via oscillateurs Web Audio. Pas de fichier MP3/OGG requis.

```js
function playPop(color) {
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = 440 + colorToFreqOffset(color);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.18);
}
```

| Événement         | Son                                      |
|-------------------|------------------------------------------|
| Tir               | Bruit blanc court (50ms)                 |
| Explosion bulle   | Sinusoïde descendante (180ms)            |
| Combo             | Accord majeur ascendant                  |
| Level up          | Fanfare 4 notes                          |
| Game over         | Ton grave descendant                     |
| Power-up collecté | Arpège pentatonique                      |

---

## Accessibilité et responsive

- La canvas est centrée et scale via `transform: scale(min(1, viewportW/420))`.
- Support complet tactile (touch events) pour mobile.
- Les boutons ont un minimum de 44×44px (WCAG).
- `prefers-reduced-motion` : désactiver les animations non essentielles.
- `prefers-color-scheme` : le thème sombre est le thème principal (déjà correct).
- Attribut `aria-label` sur le canvas et les boutons overlay.

---

## Paramètres (écran Settings)

```
┌─────────────────────────────┐
│  ⚙️  Paramètres              │
│                             │
│  Son          [ON / OFF]    │
│  Musique      [ON / OFF]    │
│  Vibrations   [ON / OFF]    │
│  Guide visée  [ON / OFF]    │
│  Qualité gfx  [Haute/Basse] │
│                             │
│  Réinitialiser progression  │
│  Effacer les scores         │
│                             │
│  [← Retour]                 │
└─────────────────────────────┘
```

Persistés dans `localStorage` sous la clé `"bubbleSettings"`.

---

## Leaderboard local

```js
// Structure dans localStorage["bubbleLB"]
[
  { name: "Joueur 1", score: 15200, level: 8, date: "2025-01-15" },
  ...  // 10 entrées maximum
]
```

- Saisie du nom si nouveau high score (prompt HTML natif ou mini-form dans overlay).
- Affichage dans un écran dédié avec médailles 🥇🥈🥉 pour le top 3.

---

## Contraintes de qualité

1. **Pas de fuite mémoire** : annuler le `requestAnimationFrame` avant chaque `startGame()`.
2. **Limiter les particules** : maximum 200 simultanément (`particles.splice(0, particles.length-200)` si dépassé).
3. **Pause sur visibilité cachée** : écouter `visibilitychange`, mettre `lastTs = performance.now()` à la reprise.
4. **Sécurité** : aucune entrée utilisateur évaluée comme code, pas d'`innerHTML` non sanitisé.
5. **Performance** : cibler 60fps sur CPU modeste, profiler avec `performance.now()` si nécessaire.
6. **Pas de dépendance externe** : tout en vanilla JS/CSS, la police `'Segoe UI'` est une police système.

---

## Livrables attendus

1. **`index.html`** (ou arborescence `src/`) contenant le jeu complet et fonctionnel.
2. **`README.md`** expliquant comment lancer le jeu (ouvrir `index.html` dans un navigateur).
3. Tout le code commenté en **français** ou en **anglais** (cohérent).
4. Le code doit passer un linter ESLint standard sans erreurs.
5. Aucune dépendance npm requise — le jeu doit s'ouvrir directement dans un navigateur sans serveur.

---

## Ordre de développement recommandé

1. Grille hexagonale + rendu des bulles statiques
2. Shooter + physique du projectile + rebonds
3. Snap + algorithme cluster + bulles flottantes
4. Score + HUD + niveaux Classic mode
5. Système de particules + effets visuels
6. Power-ups
7. Adventure mode + niveaux prédéfinis
8. Menus + écrans overlay (menu, pause, game over, progression)
9. Sons Web Audio
10. Responsive + touch + accessibilité
11. Paramètres + leaderboard local
12. Daily challenge

---

*Ce document est le prompt de référence pour la génération autonome par Fable 5.*
*Toute ambiguïté doit être résolue dans le sens le plus fidèle au jeu Microsoft Bubble original.*
