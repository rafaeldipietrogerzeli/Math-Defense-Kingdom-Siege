/**
 * Math Defense: Kingdom Siege - Core Game Logic
 */

const Game = {
  // Canvas and Context
  canvas: null,
  ctx: null,
  
  // Offscreen Spritesheet Canvas
  spritesheetCanvas: null,
  spriteSize: 64, // 64x64 px per sprite frame
  
  // Game States
  state: 'menu', // 'menu', 'levelSelect', 'tutorial', 'settings', 'playing', 'paused', 'gameOver', 'victory'
  difficulty: 'medium',
  soundEnabled: true,
  musicEnabled: true,
  
  // Player Stats
  score: 0,
  combo: 0,
  maxCombo: 0,
  crystals: 0,
  castleHp: 100,
  maxCastleHp: 100,
  castleShield: 0,
  maxCastleShield: 100,
  
  // Statistics for End Screen
  stats: {
    solved: 0,
    attempts: 0,
    accuracy: 100
  },
  
  // Level Configs (Balanced waves & spawns)
  activeLevel: 1,
  unlockedLevel: 1,
  levels: {
    1: {
      name: "Floresta dos Slimes",
      topic: "slime",
      enemyTypes: ['slime'],
      wavesCount: 3,
      baseSpeed: 0.45,
      spawnInterval: 5000,
      waveSpawns: [3, 5, 7] // fewer enemies per wave
    },
    2: {
      name: "Minas de Goblin",
      topic: "goblin",
      enemyTypes: ['slime', 'goblin'],
      wavesCount: 3,
      baseSpeed: 0.55,
      spawnInterval: 4800,
      waveSpawns: [4, 6, 8]
    },
    3: {
      name: "Pico do Dragão",
      topic: "dragon",
      enemyTypes: ['goblin', 'dragon'],
      wavesCount: 3,
      baseSpeed: 0.65,
      spawnInterval: 4500,
      waveSpawns: [4, 6, 8]
    },
    4: {
      name: "Trono do Caos (Boss)",
      topic: "boss",
      enemyTypes: ['boss'],
      wavesCount: 1,
      baseSpeed: 0.25,
      spawnInterval: 6000,
      waveSpawns: [1] // 1 Boss
    }
  },

  // Level Progression States
  waveIndex: 0,
  waveActive: false,
  waveSpawnedCount: 0,
  nextWaveTimer: 0,
  lastSpawnTime: 0,
  activeEnemiesLimit: 4, // Max active enemies on screen at once
  
  // Entities lists
  enemies: [],
  projectiles: [],
  towers: [],
  particles: [],
  pathPoints: [],
  interpolatedPath: [],
  
  // Background Scenery Elements (Scattered trees, rocks, crystals etc.)
  sceneryElements: [],
  
  // Spells States
  spellCooldowns: {
    freeze: 0,
    fireball: 0,
    shield: 0
  },
  spellCosts: {
    freeze: 15,
    fireball: 25,
    shield: 30
  },
  isFrozen: false,
  freezeTimer: 0,
  
  // Loop timestamp
  lastTime: 0,
  
  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.setupResize();
    this.setupPath();
    this.setupTowers();
    this.generateSpritesheets(); // Build spritesheets at startup
    this.bindEvents();
    
    // Sync settings checkmarks
    document.getElementById('setting-sound').checked = this.soundEnabled;
    document.getElementById('setting-music').checked = this.musicEnabled;
    
    // Start canvas rendering loop
    requestAnimationFrame((t) => this.loop(t));
  },
  
  setupResize() {
    const resize = () => {
      const container = document.getElementById('arena-container');
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      
      this.setupPath();
      this.setupTowers();
      this.generateScenery(); // Re-sculpt scenery for new dimensions
    };
    window.addEventListener('resize', resize);
    resize();
  },
  
  setupPath() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Control waypoints for the siege route
    this.pathPoints = [
      { x: w + 50, y: h * 0.4 },
      { x: w * 0.82, y: h * 0.25 },
      { x: w * 0.62, y: h * 0.75 },
      { x: w * 0.42, y: h * 0.25 },
      { x: w * 0.22, y: h * 0.65 },
      { x: w * 0.08, y: h * 0.45 }
    ];
    
    // Build smooth Catmull-Rom spline through waypoints
    this.interpolatedPath = this.buildCatmullRomPath(this.pathPoints, 1000);
  },
  
  buildCatmullRomPath(pts, totalSegments) {
    const result = [];
    const n = pts.length;
    const segsPerSpan = Math.ceil(totalSegments / (n - 1));
    
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[Math.min(i + 1, n - 1)];
      const p3 = pts[Math.min(i + 2, n - 1)];
      
      for (let s = 0; s < segsPerSpan; s++) {
        const t = s / segsPerSpan;
        const t2 = t * t;
        const t3 = t2 * t;
        
        result.push({
          x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
          y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
        });
      }
    }
    result.push(pts[n - 1]);
    
    // Normalize to exactly totalSegments+1 entries
    if (result.length > totalSegments + 1) result.length = totalSegments + 1;
    while (result.length < totalSegments + 1) result.push(pts[n - 1]);
    
    return result;
  },
  
  setupTowers() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    this.towers = [
      { x: w * 0.72, y: h * 0.80, angle: 0, rotateSpeed: 0.02, crystalRot: 0 },
      { x: w * 0.52, y: h * 0.20, angle: 0, rotateSpeed: 0.03, crystalRot: 1.5 },
      { x: w * 0.32, y: h * 0.80, angle: 0, rotateSpeed: 0.02, crystalRot: 3.1 }
    ];
  },

  /**
   * Generates procedural spritesheets onto an offscreen canvas at startup.
   * Creates 4 rows of 6 frames (64x64px each):
   * Row 0: Slime
   * Row 1: Goblin
   * Row 2: Dragon
   * Row 3: Boss
   */
  generateSpritesheets() {
    this.spritesheetCanvas = document.createElement('canvas');
    this.spritesheetCanvas.width = this.spriteSize * 6; // 6 frames
    this.spritesheetCanvas.height = this.spriteSize * 4; // 4 enemies
    const sctx = this.spritesheetCanvas.getContext('2d');
    
    const size = this.spriteSize;
    
    // Draw row-by-row
    for (let row = 0; row < 4; row++) {
      for (let frame = 0; frame < 6; frame++) {
        const cx = frame * size + size / 2;
        const cy = row * size + size / 2;
        
        sctx.save();
        sctx.translate(frame * size, row * size);
        
        if (row === 0) {
          // --- ROW 0: SLIME (Bounce animation) ---
          const squish = Math.sin((frame / 6) * Math.PI * 2) * 5;
          const bodyW = 20 + squish;
          const bodyH = 18 - squish;
          const bounceY = (frame === 2 || frame === 3) ? -6 : 0; // jump height
          
          // Draw slime body
          sctx.shadowBlur = 4;
          sctx.shadowColor = '#39ff14';
          sctx.fillStyle = '#39ff14';
          sctx.beginPath();
          sctx.ellipse(32, 36 + bounceY, bodyW, bodyH, 0, 0, Math.PI * 2);
          sctx.fill();
          
          // Face
          sctx.shadowBlur = 0;
          sctx.fillStyle = '#0a0b10';
          sctx.beginPath();
          sctx.arc(26, 34 + bounceY, 2, 0, Math.PI * 2);
          sctx.arc(38, 34 + bounceY, 2, 0, Math.PI * 2);
          sctx.fill();
          
          // Smile
          sctx.strokeStyle = '#0a0b10';
          sctx.lineWidth = 1.5;
          sctx.beginPath();
          sctx.arc(32, 38 + bounceY, 3, 0, Math.PI);
          sctx.stroke();
          
        } else if (row === 1) {
          // --- ROW 1: GOBLIN (Walking frame animation) ---
          const bob = Math.sin((frame / 6) * Math.PI * 2) * 3;
          const legSwing = Math.sin((frame / 6) * Math.PI * 2) * 8;
          
          sctx.shadowBlur = 4;
          sctx.shadowColor = '#ffb700';
          
          // Dagger (swinging arm)
          const daggerAngle = Math.sin((frame / 6) * Math.PI * 2) * 0.4;
          sctx.save();
          sctx.translate(42, 32 + bob);
          sctx.rotate(daggerAngle);
          sctx.fillStyle = '#b0c4de';
          sctx.fillRect(0, -6, 3, 10); // Blade
          sctx.fillStyle = '#8b4513';
          sctx.fillRect(-2, 4, 7, 2); // Handle
          sctx.restore();
          
          // Legs
          sctx.strokeStyle = '#d49600';
          sctx.lineWidth = 3;
          sctx.lineCap = 'round';
          sctx.beginPath();
          // Left Leg
          sctx.moveTo(26, 38);
          sctx.lineTo(26 - legSwing, 46);
          // Right Leg
          sctx.moveTo(38, 38);
          sctx.lineTo(38 + legSwing, 46);
          sctx.stroke();
          
          // Body & Head
          sctx.fillStyle = '#ffb700';
          sctx.beginPath();
          sctx.arc(32, 30 + bob, 12, 0, Math.PI * 2);
          sctx.fill();
          
          // Spikes/Horns
          sctx.beginPath();
          sctx.moveTo(22, 22 + bob);
          sctx.lineTo(25, 16 + bob);
          sctx.lineTo(28, 22 + bob);
          sctx.moveTo(36, 22 + bob);
          sctx.lineTo(39, 16 + bob);
          sctx.lineTo(42, 22 + bob);
          sctx.fillStyle = '#ff3131';
          sctx.fill();
          
          // Angry eyes
          sctx.shadowBlur = 0;
          sctx.fillStyle = '#0a0b10';
          sctx.beginPath();
          sctx.arc(28, 28 + bob, 1.5, 0, Math.PI * 2);
          sctx.arc(36, 28 + bob, 1.5, 0, Math.PI * 2);
          sctx.fill();
          
          // Angry brow
          sctx.strokeStyle = '#0a0b10';
          sctx.lineWidth = 1.5;
          sctx.beginPath();
          sctx.moveTo(25, 25 + bob); sctx.lineTo(30, 27 + bob);
          sctx.moveTo(39, 25 + bob); sctx.lineTo(34, 27 + bob);
          sctx.stroke();
          
        } else if (row === 2) {
          // --- ROW 2: DRAGON (Wing flapping) ---
          const flap = Math.sin((frame / 6) * Math.PI * 2) * 14;
          const headBob = Math.cos((frame / 6) * Math.PI * 2) * 2;
          
          sctx.shadowBlur = 6;
          sctx.shadowColor = '#ff3131';
          sctx.fillStyle = '#ff3131';
          
          // Wings
          sctx.beginPath();
          // Left Wing
          sctx.moveTo(26, 32);
          sctx.lineTo(12, 32 + flap);
          sctx.lineTo(20, 42);
          sctx.closePath();
          // Right Wing
          sctx.moveTo(38, 32);
          sctx.lineTo(52, 32 + flap);
          sctx.lineTo(44, 42);
          sctx.closePath();
          sctx.fill();
          
          // Tail
          sctx.strokeStyle = '#b31212';
          sctx.lineWidth = 3;
          sctx.beginPath();
          sctx.moveTo(32, 42);
          sctx.quadraticCurveTo(32 + Math.sin(frame) * 5, 48, 28, 54);
          sctx.stroke();
          
          // Body & Head
          sctx.beginPath();
          sctx.ellipse(32, 34, 10, 12, 0, 0, Math.PI * 2);
          sctx.fill();
          
          // Head
          sctx.beginPath();
          sctx.arc(32, 20 + headBob, 7, 0, Math.PI * 2);
          sctx.fill();
          
          // Glowing yellow eyes
          sctx.shadowBlur = 0;
          sctx.fillStyle = '#ffff00';
          sctx.beginPath();
          sctx.arc(29, 19 + headBob, 1.5, 0, Math.PI * 2);
          sctx.arc(35, 19 + headBob, 1.5, 0, Math.PI * 2);
          sctx.fill();
          
        } else if (row === 3) {
          // --- ROW 3: BOSS (Arquimago Floating & Orbiting runes) ---
          const hover = Math.sin((frame / 6) * Math.PI * 2) * 4;
          const magicSpin = (frame / 6) * Math.PI * 2;
          
          sctx.shadowBlur = 8;
          sctx.shadowColor = '#8a2be2';
          
          // Wizard Robe
          sctx.fillStyle = '#1f143d';
          sctx.strokeStyle = '#8a2be2';
          sctx.lineWidth = 1.5;
          sctx.beginPath();
          sctx.moveTo(32, 14 + hover);
          sctx.lineTo(20, 48 + hover);
          sctx.lineTo(44, 48 + hover);
          sctx.closePath();
          sctx.fill();
          sctx.stroke();
          
          // Wizard Hat
          sctx.fillStyle = '#8a2be2';
          sctx.beginPath();
          sctx.moveTo(24, 18 + hover);
          sctx.lineTo(32, 4 + hover);
          sctx.lineTo(40, 18 + hover);
          sctx.closePath();
          sctx.fill();
          
          // Staff
          sctx.save();
          sctx.translate(44, 28 + hover);
          sctx.rotate(0.1);
          sctx.strokeStyle = '#8b4513';
          sctx.lineWidth = 2.5;
          sctx.beginPath();
          sctx.moveTo(0, -12);
          sctx.lineTo(0, 22);
          sctx.stroke();
          
          // Staff Crystal
          sctx.shadowBlur = 10;
          sctx.shadowColor = '#00ffff';
          sctx.fillStyle = '#00ffff';
          sctx.beginPath();
          sctx.arc(0, -14, 4, 0, Math.PI * 2);
          sctx.fill();
          sctx.restore();
          
          // Orbiting elemental spells
          sctx.shadowBlur = 4;
          sctx.shadowColor = '#00ffff';
          sctx.fillStyle = '#00ffff';
          
          const ox = 32 + Math.cos(magicSpin) * 20;
          const oy = 32 + hover + Math.sin(magicSpin) * 8;
          sctx.beginPath();
          sctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
          sctx.fill();
          
          const ox2 = 32 + Math.cos(magicSpin + Math.PI) * 20;
          const oy2 = 32 + hover + Math.sin(magicSpin + Math.PI) * 8;
          sctx.fillStyle = '#ff3131';
          sctx.shadowColor = '#ff3131';
          sctx.beginPath();
          sctx.arc(ox2, oy2, 3.5, 0, Math.PI * 2);
          sctx.fill();
        }
        
        sctx.restore();
      }
    }
  },
  
  generateScenery() {
    this.sceneryElements = [];
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Create random placement coordinates avoiding the path coordinates
    for (let i = 0; i < 22; i++) {
      const rx = Math.random() * (w - 100) + 50;
      const ry = Math.random() * (h - 150) + 75;
      
      // Check distance to path points to avoid blocking the visual road
      let tooCloseToPath = false;
      this.interpolatedPath.forEach((pt, step) => {
        if (step % 20 === 0) { // check every 20th point
          if (Math.hypot(pt.x - rx, pt.y - ry) < 50) {
            tooCloseToPath = true;
          }
        }
      });
      
      // Also avoid tower positions
      this.towers.forEach(t => {
        if (Math.hypot(t.x - rx, t.y - ry) < 45) {
          tooCloseToPath = true;
        }
      });
      
      if (!tooCloseToPath) {
        this.sceneryElements.push({
          x: rx,
          y: ry,
          scale: Math.random() * 0.4 + 0.8,
          varId: Math.floor(Math.random() * 3) // variant
        });
      }
    }
  },
  
  bindEvents() {
    // Buttons in Main Menu
    document.getElementById('btn-play').addEventListener('click', () => {
      SoundEngine.playClick();
      this.changeState('levelSelect');
    });
    document.getElementById('btn-tutorial').addEventListener('click', () => {
      SoundEngine.playClick();
      this.changeState('tutorial');
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      SoundEngine.playClick();
      this.changeState('settings');
    });
    
    // Back buttons
    document.querySelectorAll('.btn-back-menu').forEach(btn => {
      btn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.changeState('menu');
      });
    });
    
    document.querySelectorAll('.btn-back-levels').forEach(btn => {
      btn.addEventListener('click', () => {
        SoundEngine.playClick();
        this.changeState('levelSelect');
      });
    });

    // Level selector cards
    document.querySelectorAll('.level-card').forEach(card => {
      card.querySelector('.btn-play-level').addEventListener('click', (e) => {
        e.stopPropagation();
        SoundEngine.playClick();
        const levelNum = parseInt(card.getAttribute('data-level'));
        this.startLevel(levelNum);
      });
      card.addEventListener('click', () => {
        if (card.classList.contains('unlocked')) {
          SoundEngine.playClick();
          const levelNum = parseInt(card.getAttribute('data-level'));
          this.startLevel(levelNum);
        }
      });
    });
    
    // Settings checkboxes & select
    document.getElementById('setting-sound').addEventListener('change', (e) => {
      this.soundEnabled = e.target.checked;
      SoundEngine.toggleSound(this.soundEnabled);
      SoundEngine.playClick();
    });
    
    document.getElementById('setting-music').addEventListener('change', (e) => {
      this.musicEnabled = e.target.checked;
      SoundEngine.toggleSound(this.soundEnabled);
      if (this.musicEnabled) {
        SoundEngine.startBGM(this.activeLevel);
      } else {
        SoundEngine.stopBGM();
      }
      SoundEngine.playClick();
    });
    
    document.getElementById('setting-difficulty').addEventListener('change', (e) => {
      this.difficulty = e.target.value;
      SoundEngine.playClick();
    });
    
    // Math input checking
    const mathInput = document.getElementById('math-input');
    
    mathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.checkAnswer(mathInput.value.trim());
      }
    });

    // FIX KEYBOARD INPUT BUG: Intercept Q, W, E keys globally to cast spells
    window.addEventListener('keydown', (e) => {
      if (this.state === 'playing') {
        const key = e.key.toLowerCase();
        if (['q', 'w', 'e'].includes(key)) {
          // Prevent Q, W, E from getting written inside the input text field
          e.preventDefault();
          if (key === 'q') this.castSpell('freeze');
          if (key === 'w') this.castSpell('fireball');
          if (key === 'e') this.castSpell('shield');
        }
      }
    }, { capture: true });
    
    // Prevent spell buttons from stealing focus when clicked
    document.querySelectorAll('.spell-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents the input from losing focus
      });
    });
    
    // Keep input field focused
    window.addEventListener('click', () => {
      if (this.state === 'playing') {
        mathInput.focus();
      }
    });

    // Pause UI
    document.getElementById('btn-pause-trigger').addEventListener('click', () => {
      SoundEngine.playClick();
      this.pauseGame();
    });
    
    document.getElementById('btn-resume-game').addEventListener('click', () => {
      SoundEngine.playClick();
      this.resumeGame();
    });
    
    document.getElementById('btn-exit-to-levels').addEventListener('click', () => {
      SoundEngine.playClick();
      this.stopLevelSession();
      this.changeState('levelSelect');
    });
    
    // End screens buttons
    document.getElementById('btn-retry-level').addEventListener('click', () => {
      SoundEngine.playClick();
      this.startLevel(this.activeLevel);
    });
    
    document.getElementById('btn-next-level').addEventListener('click', () => {
      SoundEngine.playClick();
      if (this.activeLevel < 4) {
        this.startLevel(this.activeLevel + 1);
      } else {
        this.changeState('levelSelect');
      }
    });

    // Spells panel click handlers
    document.getElementById('spell-freeze').addEventListener('click', () => this.castSpell('freeze'));
    document.getElementById('spell-fireball').addEventListener('click', () => this.castSpell('fireball'));
    document.getElementById('spell-shield').addEventListener('click', () => this.castSpell('shield'));
  },
  
  changeState(newState) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('pause-modal').classList.remove('active');
    
    this.state = newState;
    
    let screenId = '';
    if (newState === 'menu') screenId = 'main-menu';
    else if (newState === 'levelSelect') screenId = 'level-select';
    else if (newState === 'tutorial') screenId = 'tutorial-screen';
    else if (newState === 'settings') screenId = 'settings-screen';
    else if (newState === 'playing') screenId = 'gameplay-view';
    else if (newState === 'gameOver') screenId = 'defeat-screen';
    else if (newState === 'victory') screenId = 'victory-screen';
    
    if (screenId) {
      document.getElementById(screenId).classList.add('active');
    }
    
    if (newState === 'playing') {
      document.getElementById('math-input').value = '';
      setTimeout(() => document.getElementById('math-input').focus(), 100);
      if (this.musicEnabled) {
        SoundEngine.startBGM(this.activeLevel); // Load stage BGM
      }
    } else {
      document.getElementById('math-input').blur();
      if (newState !== 'paused') {
        SoundEngine.stopBGM();
      }
    }
  },
  
  startLevel(levelNum) {
    this.activeLevel = levelNum;
    const config = this.levels[levelNum];
    
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.crystals = 0;
    this.castleHp = 100;
    this.castleShield = 0;
    this.stats.solved = 0;
    this.stats.attempts = 0;
    this.stats.accuracy = 100;
    
    this.waveIndex = 0;
    this.waveActive = false;
    this.waveSpawnedCount = 0;
    this.nextWaveTimer = 2000;
    
    this.spellCooldowns.freeze = 0;
    this.spellCooldowns.fireball = 0;
    this.spellCooldowns.shield = 0;
    this.isFrozen = false;
    this.freezeTimer = 0;
    
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    
    this.generateScenery(); // Build scenery layout for background decoration
    
    document.getElementById('stage-title').innerText = `Fase ${levelNum}: ${config.name}`;
    this.updateHUD();
    
    this.changeState('playing');
    
    SoundEngine.playLevelUp();
  },
  
  stopLevelSession() {
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.waveActive = false;
  },
  
  pauseGame() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause-modal').classList.add('active');
    }
  },
  
  resumeGame() {
    if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause-modal').classList.remove('active');
      setTimeout(() => document.getElementById('math-input').focus(), 50);
    }
  },
  
  updateHUD() {
    document.getElementById('txt-score').innerText = String(this.score).padStart(5, '0');
    document.getElementById('crystal-count').innerText = this.crystals;
    
    const hpPercent = Math.max(0, this.castleHp);
    const healthBar = document.getElementById('castle-health');
    healthBar.style.width = `${hpPercent}%`;
    
    if (this.castleShield > 0) {
      healthBar.className = 'progress-bar-fill fill-green';
      document.getElementById('castle-health-txt').innerText = `${this.castleHp} + ${this.castleShield} Shield`;
    } else {
      if (this.castleHp > 30) {
        healthBar.className = 'progress-bar-fill fill-green';
      } else {
        healthBar.className = 'progress-bar-fill fill-red';
      }
      document.getElementById('castle-health-txt').innerText = `${this.castleHp} / 100`;
    }
    
    const lvl = this.levels[this.activeLevel];
    const waveDisplay = Math.min(this.waveIndex + 1, lvl.wavesCount);
    document.getElementById('wave-status').innerText = `Onda ${waveDisplay} / ${lvl.wavesCount}`;
    
    const comboContainer = document.getElementById('combo-container');
    if (this.combo >= 2) {
      document.getElementById('txt-combo').innerText = `x${this.combo}`;
      comboContainer.style.opacity = '1';
    } else {
      comboContainer.style.opacity = '0';
    }
    
    const btnFreeze = document.getElementById('spell-freeze');
    const btnFireball = document.getElementById('spell-fireball');
    const btnShield = document.getElementById('spell-shield');
    
    btnFreeze.disabled = (this.crystals < this.spellCosts.freeze || this.spellCooldowns.freeze > 0);
    btnFireball.disabled = (this.crystals < this.spellCosts.fireball || this.spellCooldowns.fireball > 0);
    btnShield.disabled = (this.crystals < this.spellCosts.shield || this.spellCooldowns.shield > 0 || this.castleShield >= this.maxCastleShield);
    
    document.getElementById('cooldown-freeze').style.height = `${(this.spellCooldowns.freeze / 10000) * 100}%`;
    document.getElementById('cooldown-fireball').style.height = `${(this.spellCooldowns.fireball / 15000) * 100}%`;
    document.getElementById('cooldown-shield').style.height = `${(this.spellCooldowns.shield / 20000) * 100}%`;
  },
  
  checkAnswer(value) {
    if (value === '') return;
    
    this.stats.attempts++;
    const numAnswer = Number(value);
    const isIntegerAnswer = Number.isInteger(numAnswer);
    
    const candidates = this.enemies.filter(e => !e.deadPending);
    
    let match = null;
    let closestEntranceIndex = -1;
    
    if (isIntegerAnswer) {
      candidates.forEach(enemy => {
        const isMatch = Array.isArray(enemy.answer) 
          ? enemy.answer.includes(numAnswer) 
          : enemy.answer === numAnswer;
          
        if (isMatch) {
          if (enemy.progress > closestEntranceIndex) {
            match = enemy;
            closestEntranceIndex = enemy.progress;
          }
        }
      });
    }
    
    const inputWrapper = document.querySelector('.input-glow-wrapper');
    
    if (match) {
      match.deadPending = true;
      
      let nearestTower = this.towers[0];
      let minDist = Infinity;
      this.towers.forEach(t => {
        const d = Math.hypot(t.x - match.x, t.y - match.y);
        if (d < minDist) {
          minDist = d;
          nearestTower = t;
        }
      });
      
      this.projectiles.push({
        x: nearestTower.x,
        y: nearestTower.y - 20,
        target: match,
        speed: 12,
        damage: 1, // Solves 1 stage of shield or kills regular enemy
        color: match.type === 'slime' ? varColor('color-secondary') : 
               match.type === 'goblin' ? varColor('color-orange') : 
               match.type === 'dragon' ? varColor('color-red') : varColor('color-primary')
      });
      
      this.stats.solved++;
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      
      let pointReward = 10;
      let crystalReward = 5;
      
      if (match.type === 'goblin') { pointReward = 20; crystalReward = 8; }
      else if (match.type === 'dragon') { pointReward = 35; crystalReward = 12; }
      else if (match.type === 'boss') { pointReward = 150; crystalReward = 30; }
      
      this.score += pointReward * this.combo;
      this.crystals += crystalReward;
      
      document.getElementById('math-input').value = '';
      
      inputWrapper.style.boxShadow = '0 0 20px var(--color-green)';
      setTimeout(() => { inputWrapper.style.boxShadow = ''; }, 200);
      
      SoundEngine.playShoot();
      this.updateHUD();
      
    } else {
      this.combo = 0;
      
      inputWrapper.classList.add('wrong-shake');
      inputWrapper.style.boxShadow = '0 0 20px var(--color-red)';
      SoundEngine.playClick();
      
      setTimeout(() => {
        inputWrapper.classList.remove('wrong-shake');
        inputWrapper.style.boxShadow = '';
      }, 300);
      
      document.getElementById('math-input').value = '';
      this.updateHUD();
    }
    
    this.stats.accuracy = Math.round((this.stats.solved / this.stats.attempts) * 100) || 0;
  },
  
  castSpell(spellType) {
    if (this.state !== 'playing') return;
    
    const cost = this.spellCosts[spellType];
    if (this.crystals < cost || this.spellCooldowns[spellType] > 0) return;
    
    if (spellType === 'freeze') {
      this.crystals -= cost;
      this.isFrozen = true;
      this.freezeTimer = 5000;
      this.spellCooldowns.freeze = 10000;
      
      for (let i = 0; i < 40; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: Math.random() * 0.5 + 0.2,
          color: '#e0ffff',
          alpha: 0.8,
          life: 0.8,
          maxLife: 0.8,
          size: Math.random() * 3 + 1
        });
      }
      SoundEngine.playFreeze();
      
    } else if (spellType === 'fireball') {
      const targets = this.enemies.filter(e => !e.deadPending);
      if (targets.length === 0) return;
      
      this.crystals -= cost;
      this.spellCooldowns.fireball = 15000;
      
      targets.sort((a,b) => b.progress - a.progress);
      const mainTarget = targets[0];
      mainTarget.deadPending = true;
      
      this.projectiles.push({
        x: mainTarget.x,
        y: -50,
        target: mainTarget,
        speed: 15,
        damage: 1, // Destroys regular or boss shield tick
        isFireball: true,
        color: '#ff4500'
      });
      SoundEngine.playFireball();
      
    } else if (spellType === 'shield') {
      if (this.castleShield >= this.maxCastleShield) return;
      
      this.crystals -= cost;
      this.castleShield = Math.min(this.maxCastleShield, this.castleShield + 20);
      this.spellCooldowns.shield = 20000;
      
      const castleX = this.canvas.width * 0.08;
      const castleY = this.canvas.height * 0.5;
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI - Math.PI/2;
        const dist = 50 + Math.random() * 40;
        this.particles.push({
          x: castleX + Math.cos(angle) * dist,
          y: castleY + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * 2,
          vy: -Math.sin(angle) * 2,
          color: '#00ffff',
          alpha: 0.9,
          life: 0.5,
          maxLife: 0.5,
          size: Math.random() * 4 + 2
        });
      }
      SoundEngine.playShield();
    }
    
    this.updateHUD();
  },
  
  spawnEnemy() {
    const config = this.levels[this.activeLevel];
    
    let type = config.enemyTypes[0];
    if (config.enemyTypes.length > 1) {
      type = config.enemyTypes[Math.floor(Math.random() * config.enemyTypes.length)];
    }
    
    // BALANCE: Boss only spawns when the screen is empty of other enemies
    if (type === 'boss' && this.enemies.length > 0) {
      return;
    }
    
    const equation = MathGenerator.generate(type, this.difficulty);
    
    let hp = 1;
    let size = 22;
    let color = '#39ff14';
    let speedMult = 1.0;
    
    if (type === 'goblin') {
      hp = 1;
      size = 22;
      color = '#ffb700';
      speedMult = 1.25;
    } else if (type === 'dragon') {
      hp = 1;
      size = 28;
      color = '#ff3131';
      speedMult = 1.4;
    } else if (type === 'boss') {
      hp = 5; // Boss has 5 shields (must solve 5 equations sequentially)
      size = 45;
      color = '#8a2be2';
      speedMult = 0.38; // extremely slow to make 5 equations solvable
    }
    
    let speed = config.baseSpeed * speedMult;
    if (this.difficulty === 'easy') speed *= 0.75;
    if (this.difficulty === 'hard') speed *= 1.35;
    
    this.enemies.push({
      id: Math.random().toString(36).substr(2, 9),
      x: this.pathPoints[0].x,
      y: this.pathPoints[0].y,
      progress: 0,
      speed: speed,
      hp: hp,
      maxHp: hp,
      type: type,
      question: equation.question,
      answer: equation.answer,
      size: size,
      color: color,
      deadPending: false,
      pulse: 0,
      frameTime: 0,
      currentFrame: 0
    });
    
    this.waveSpawnedCount++;
  },
  
  handleWaveProgression(dt) {
    const config = this.levels[this.activeLevel];
    
    if (!this.waveActive && this.enemies.length === 0) {
      if (this.waveIndex < config.wavesCount) {
        if (this.nextWaveTimer > 0) {
          this.nextWaveTimer -= dt;
        } else {
          this.waveActive = true;
          this.waveSpawnedCount = 0;
          this.lastSpawnTime = Date.now();
          this.updateHUD();
        }
      } else {
        this.triggerVictory();
      }
    }
    
    if (this.waveActive) {
      const maxSpawns = config.waveSpawns[this.waveIndex];
      if (this.waveSpawnedCount < maxSpawns) {
        // BALANCE: Cap active enemies on screen at once to prevent overcrowding
        const activeCount = this.enemies.filter(e => !e.deadPending).length;
        if (activeCount >= this.activeEnemiesLimit) {
          return; // Pause spawns until an enemy is resolved
        }
        
        const now = Date.now();
        let currentInterval = config.spawnInterval;
        if (this.difficulty === 'easy') currentInterval *= 1.3;
        if (this.difficulty === 'hard') currentInterval *= 0.8;
        
        if (now - this.lastSpawnTime >= currentInterval) {
          this.spawnEnemy();
          this.lastSpawnTime = now;
        }
      } else if (this.enemies.length === 0) {
        this.waveActive = false;
        this.waveIndex++;
        this.nextWaveTimer = 3500;
        SoundEngine.playLevelUp();
      }
    }
  },
  
  triggerVictory() {
    this.state = 'victory';
    
    if (this.activeLevel === this.unlockedLevel && this.unlockedLevel < 4) {
      this.unlockedLevel++;
      const nextCard = document.querySelector(`.level-card[data-level="${this.unlockedLevel}"]`);
      if (nextCard) {
        nextCard.classList.remove('locked');
        nextCard.classList.add('unlocked');
        const lockIcon = nextCard.querySelector('.level-lock');
        if (lockIcon) lockIcon.remove();
      }
    }
    
    document.getElementById('victory-score').innerText = this.score;
    document.getElementById('victory-solved').innerText = this.stats.solved;
    document.getElementById('victory-combo').innerText = `x${this.maxCombo}`;
    document.getElementById('victory-accuracy').innerText = `${this.stats.accuracy}%`;
    
    this.changeState('victory');
    SoundEngine.playVictory();
  },
  
  triggerDefeat() {
    this.state = 'gameOver';
    
    document.getElementById('defeat-score').innerText = this.score;
    document.getElementById('defeat-solved').innerText = this.stats.solved;
    document.getElementById('defeat-combo').innerText = `x${this.maxCombo}`;
    document.getElementById('defeat-accuracy').innerText = `${this.stats.accuracy}%`;
    
    this.changeState('gameOver');
    SoundEngine.playDefeat();
  },
  
  damageCastle(amt) {
    if (this.castleShield > 0) {
      this.castleShield -= amt;
      if (this.castleShield < 0) {
        this.castleHp += this.castleShield;
        this.castleShield = 0;
      }
    } else {
      this.castleHp -= amt;
    }
    
    const view = document.getElementById('gameplay-view');
    view.classList.add('damage-flash');
    setTimeout(() => view.classList.remove('damage-flash'), 300);
    
    SoundEngine.playDamage();
    this.updateHUD();
    
    if (this.castleHp <= 0) {
      this.triggerDefeat();
    }
  },
  
  loop(time) {
    if (this.lastTime === 0) this.lastTime = time;
    // requestAnimationFrame can be paused while the tab is in the background.
    // Cap elapsed time so returning cannot advance enemies across the path.
    const dt = Math.min(Math.max(time - this.lastTime, 0), 100);
    this.lastTime = time;
    
    this.update(dt);
    this.render();
    
    requestAnimationFrame((t) => this.loop(t));
  },
  
  update(dt) {
    const castleX = this.canvas.width * 0.08;
    const castleY = this.canvas.height * 0.5;

    // Background particles update (works even when paused for aesthetic depth)
    this.particles.forEach((p, idx) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= (dt / 1000);
      if (p.life <= 0) this.particles.splice(idx, 1);
    });

    if (this.state !== 'playing') return;
    
    // Spells Cooldowns
    for (let spell in this.spellCooldowns) {
      if (this.spellCooldowns[spell] > 0) {
        this.spellCooldowns[spell] = Math.max(0, this.spellCooldowns[spell] - dt);
        this.updateHUD();
      }
    }
    
    // Freeze effect countdown
    if (this.isFrozen) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.isFrozen = false;
      }
    }
    
    // WAVE PACING
    this.handleWaveProgression(dt);
    
    // DYNAMIC CASTLE HP DAMAGE EMISSIONS
    // Smoke if HP < 70
    if (this.castleHp < 70 && Math.random() < 0.08) {
      this.particles.push({
        x: castleX - 60 + Math.random() * 20,
        y: castleY - 70 + Math.random() * 140,
        vx: -Math.random() * 0.5 - 0.1,
        vy: -Math.random() * 1.0 - 0.4,
        color: 'rgba(90, 90, 100, 0.4)',
        alpha: 0.5,
        life: 1.2,
        maxLife: 1.2,
        size: Math.random() * 5 + 3
      });
    }
    // Fire + Heavy Smoke if HP < 35
    if (this.castleHp < 35) {
      if (Math.random() < 0.2) {
        this.particles.push({
          x: castleX - 50 + Math.random() * 25,
          y: castleY - 50 + Math.random() * 100,
          vx: -Math.random() * 0.4 - 0.1,
          vy: -Math.random() * 0.8 - 0.4,
          color: Math.random() > 0.4 ? '#ff4500' : '#ff8c00',
          alpha: 0.9,
          life: 0.6,
          maxLife: 0.6,
          size: Math.random() * 4 + 2
        });
      }
      if (Math.random() < 0.15) {
        this.particles.push({
          x: castleX - 55 + Math.random() * 20,
          y: castleY - 60 + Math.random() * 110,
          vx: -Math.random() * 0.8 - 0.2,
          vy: -Math.random() * 1.2 - 0.6,
          color: '#3a3a3a',
          alpha: 0.7,
          life: 1.4,
          maxLife: 1.4,
          size: Math.random() * 7 + 4
        });
      }
    }
    
    // 1. Update Enemies (walking spritesheet frames)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      let currentSpeed = enemy.speed;
      if (this.isFrozen) currentSpeed *= 0.5;
      
      enemy.progress += currentSpeed * (dt / 16.66);
      
      if (enemy.progress >= 1000) {
        const damageAmt = enemy.type === 'boss' ? 50 : 15;
        this.damageCastle(damageAmt);
        this.enemies.splice(i, 1);
        continue;
      }
      
      const pathIndex = Math.floor(enemy.progress);
      const coord = this.interpolatedPath[pathIndex] || this.pathPoints[this.pathPoints.length - 1];
      
      enemy.x = coord.x;
      enemy.y = coord.y;
      
      enemy.pulse += 0.05;
      
      // Update walk animation frame counter
      enemy.frameTime += dt;
      const frameSpeed = enemy.type === 'boss' ? 140 : 100; // time per frame in ms
      if (enemy.frameTime >= frameSpeed) {
        enemy.frameTime = 0;
        enemy.currentFrame = (enemy.currentFrame + 1) % 6; // Loop through 6 frames
      }
    }
    
    // 2. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      
      const dx = proj.target.x - proj.x;
      const dy = proj.target.y - proj.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < proj.speed) {
        const hitEnemy = proj.target;
        hitEnemy.hp -= proj.damage;
        
        // Spawn sparks
        for (let j = 0; j < 12; j++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 4 + 1;
          this.particles.push({
            x: hitEnemy.x,
            y: hitEnemy.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: proj.color,
            alpha: 1.0,
            life: 0.4,
            maxLife: 0.4,
            size: Math.random() * 3 + 1.5
          });
        }
        
        if (proj.isFireball) {
          for (let k = 0; k < 25; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            this.particles.push({
              x: hitEnemy.x,
              y: hitEnemy.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              color: '#ff4500',
              alpha: 1.0,
              life: 0.6,
              maxLife: 0.6,
              size: Math.random() * 5 + 2
            });
          }
        }
        
        if (hitEnemy.hp <= 0) {
          const idx = this.enemies.indexOf(hitEnemy);
          if (idx !== -1) {
            this.enemies.splice(idx, 1);
          }
        } else {
          // Boss loses shield - generate new equation instantly
          hitEnemy.deadPending = false;
          const equation = MathGenerator.generate(hitEnemy.type, this.difficulty);
          hitEnemy.question = equation.question;
          hitEnemy.answer = equation.answer;
        }
        
        SoundEngine.playHit();
        this.projectiles.splice(i, 1);
        continue;
      }
      
      proj.x += (dx / dist) * proj.speed;
      proj.y += (dy / dist) * proj.speed;
    }
    
    // 3. Update Towers angles
    const targets = this.enemies.filter(e => !e.deadPending);
    this.towers.forEach(tower => {
      tower.crystalRot += 0.02;
      
      if (targets.length > 0) {
        targets.sort((a,b) => b.progress - a.progress);
        const aimTarget = targets[0];
        
        const dx = aimTarget.x - tower.x;
        const dy = aimTarget.y - tower.y;
        tower.angle = Math.atan2(dy, dx);
      }
    });
  },
  
  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    this.ctx.clearRect(0, 0, w, h);
    
    // --- 1. RENDER STAGE-SPECIFIC SCENERY BACKGROUND ---
    this.renderSceneryBackground(w, h);
    
    // --- Draw road using interpolatedPath so it matches enemy movement ---
    let pathStroke = '#2a3045';
    let pathEdge = '#3d4b6e';
    let pathNeonEdge = 'rgba(0, 255, 255, 0.18)';
    let pathFill = '#1a1f30';
    if (this.activeLevel === 2) { pathStroke = '#33363e'; pathEdge = '#555'; pathNeonEdge = 'rgba(255, 183, 0, 0.15)'; pathFill = '#222329'; }
    else if (this.activeLevel === 3) { pathStroke = '#3a1515'; pathEdge = '#5a2020'; pathNeonEdge = 'rgba(255, 49, 49, 0.2)'; pathFill = '#1d0c0c'; }
    else if (this.activeLevel === 4) { pathStroke = '#2a1a45'; pathEdge = '#4a2e6e'; pathNeonEdge = 'rgba(138, 43, 226, 0.25)'; pathFill = '#161129'; }
    
    const ip = this.interpolatedPath;
    
    // Outer glow border (wide)
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = pathNeonEdge;
    this.ctx.lineWidth = 28;
    this.ctx.beginPath();
    this.ctx.moveTo(ip[0].x, ip[0].y);
    for (let i = 1; i < ip.length; i += 3) {
      this.ctx.lineTo(ip[i].x, ip[i].y);
    }
    this.ctx.stroke();
    
    // Road edge border
    this.ctx.strokeStyle = pathEdge;
    this.ctx.lineWidth = 22;
    this.ctx.beginPath();
    this.ctx.moveTo(ip[0].x, ip[0].y);
    for (let i = 1; i < ip.length; i += 3) {
      this.ctx.lineTo(ip[i].x, ip[i].y);
    }
    this.ctx.stroke();
    
    // Road fill
    this.ctx.strokeStyle = pathFill;
    this.ctx.lineWidth = 16;
    this.ctx.beginPath();
    this.ctx.moveTo(ip[0].x, ip[0].y);
    for (let i = 1; i < ip.length; i += 3) {
      this.ctx.lineTo(ip[i].x, ip[i].y);
    }
    this.ctx.stroke();
    
    // Center lane dashes (subtle)
    this.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([8, 16]);
    this.ctx.beginPath();
    this.ctx.moveTo(ip[0].x, ip[0].y);
    for (let i = 1; i < ip.length; i += 3) {
      this.ctx.lineTo(ip[i].x, ip[i].y);
    }
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // --- 2. DRAW BASE/CASTLE WITH DAMAGE STATES ---
    this.renderCastleBase();
    
    // --- 3. DRAW SCENERY LAYER ON TOP OF BACKGROUND ---
    this.renderSceneryObjects();
    
    // --- 4. DRAW TOWERS ---
    this.towers.forEach(t => {
      this.ctx.fillStyle = '#1b1d28';
      this.ctx.strokeStyle = '#2d3345';
      this.ctx.lineWidth = 2;
      
      this.ctx.beginPath();
      this.ctx.arc(t.x, t.y, 18, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = '#12141c';
      this.ctx.beginPath();
      this.ctx.arc(t.x, t.y, 10, 0, Math.PI*2);
      this.ctx.fill();
      
      const yOffset = -22 + Math.sin(t.crystalRot) * 4;
      
      this.ctx.save();
      this.ctx.translate(t.x, t.y + yOffset);
      this.ctx.rotate(t.crystalRot);
      
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#8a2be2';
      this.ctx.fillStyle = '#8a2be2';
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, -10);
      this.ctx.lineTo(6, 0);
      this.ctx.lineTo(0, 10);
      this.ctx.lineTo(-6, 0);
      this.ctx.closePath();
      this.ctx.fill();
      
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
    });
    
    // --- 5. DRAW ENEMIES (Real frame-by-frame spritesheets) ---
    this.enemies.forEach(e => {
      this.ctx.save();
      
      // If frozen, draw ice background glow
      if (this.isFrozen) {
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00ffff';
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, e.size + 4, 0, Math.PI*2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
      }
      
      // Map enemy type to row index of spritesheet:
      let rowIndex = 0; // Slime
      if (e.type === 'goblin') rowIndex = 1;
      else if (e.type === 'dragon') rowIndex = 2;
      else if (e.type === 'boss') rowIndex = 3;
      
      const frameIndex = e.currentFrame;
      const sx = frameIndex * this.spriteSize;
      const sy = rowIndex * this.spriteSize;
      const sw = this.spriteSize;
      const sh = this.spriteSize;
      
      // Target destination rectangle centered on enemy coords
      const drawSize = e.size * 2; // double size of collision radius
      const dx = e.x - drawSize / 2;
      const dy = e.y - drawSize / 2;
      
      // Draw frame from offscreen canvas spritesheet
      this.ctx.drawImage(this.spritesheetCanvas, sx, sy, sw, sh, dx, dy, drawSize, drawSize);
      
      this.ctx.restore();
      
      // Draw Math Equation Glass Bubble
      const bubbleY = e.y - e.size - 18;
      
      this.ctx.font = 'bold 15px "JetBrains Mono"';
      const text = e.question;
      const textWidth = this.ctx.measureText(text).width;
      const padX = 12;
      const padY = 6;
      
      this.ctx.fillStyle = 'rgba(10, 11, 16, 0.82)';
      this.ctx.strokeStyle = e.deadPending ? '#555' : e.color;
      this.ctx.lineWidth = 1.5;
      
      this.ctx.beginPath();
      this.ctx.roundRect(e.x - textWidth/2 - padX, bubbleY - 14 - padY, textWidth + padX*2, 20 + padY*2, 8);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = e.deadPending ? '#6c778c' : '#ffffff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(text, e.x, bubbleY + 2);
      
      if (e.type === 'boss') {
        const barW = 50;
        const tickW = barW / e.maxHp;
        const barY = bubbleY + 14;
        
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(e.x - barW/2, barY, barW, 4);
        
        this.ctx.fillStyle = varColor('color-primary');
        this.ctx.fillRect(e.x - barW/2, barY, tickW * e.hp, 4);
      }
    });
    
    // --- 6. DRAW PROJECTILES ---
    this.projectiles.forEach(p => {
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      
      if (p.isFireball) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
        this.ctx.fill();
        
        this.ctx.fillStyle = 'rgba(255, 69, 0, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y - 12, 10, 0, Math.PI*2);
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
        this.ctx.fill();
      }
      this.ctx.shadowBlur = 0;
    });
    
    // --- 7. DRAW PARTICLES ---
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.alpha * (p.life / p.maxLife));
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1.0;
    
    // --- 8. DRAW FREEZE OVERLAY ---
    if (this.isFrozen) {
      this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
      this.ctx.lineWidth = 15;
      this.ctx.strokeRect(0, 0, w, h);
      
      this.ctx.fillStyle = 'rgba(0, 255, 255, 0.04)';
      this.ctx.fillRect(0, 0, w, h);
    }
  },
  
  renderSceneryBackground(w, h) {
    if (this.activeLevel === 1) {
      // Forest: vibrant grass green gradient
      const grad = this.ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, w);
      grad.addColorStop(0, '#0c1d12');
      grad.addColorStop(1, '#050c07');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
    } else if (this.activeLevel === 2) {
      // Mine: dark cave rocks gradient
      const grad = this.ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, w);
      grad.addColorStop(0, '#15171c');
      grad.addColorStop(1, '#0b0c0e');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
    } else if (this.activeLevel === 3) {
      // Volcano: obsidian volcanic rock red-black
      const grad = this.ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, w);
      grad.addColorStop(0, '#240b0b');
      grad.addColorStop(1, '#080303');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
      
      // Draw flowing magma under the path
      this.ctx.strokeStyle = 'rgba(255, 69, 0, 0.08)';
      this.ctx.lineWidth = 45;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      const mp = this.interpolatedPath;
      this.ctx.moveTo(mp[0].x, mp[0].y);
      for (let i = 1; i < mp.length; i += 5) {
        this.ctx.lineTo(mp[i].x, mp[i].y);
      }
      this.ctx.stroke();
    } else if (this.activeLevel === 4) {
      // Chaos Throne: deep space nebula and marble grid
      const grad = this.ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, w);
      grad.addColorStop(0, '#1b0e2b');
      grad.addColorStop(1, '#050308');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
      
      // Draw subtle stars
      this.ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 30; i++) {
        const x = (Math.sin(i * 99) * 0.5 + 0.5) * w;
        const y = (Math.cos(i * 123) * 0.5 + 0.5) * h;
        const starSize = 1.0 + Math.sin(Date.now()/500 + i) * 0.5;
        this.ctx.globalAlpha = 0.4 + Math.sin(Date.now()/300 + i) * 0.3;
        this.ctx.fillRect(x, y, starSize, starSize);
      }
      this.ctx.globalAlpha = 1.0;
    }
    
    // Cinematic Vignette Overlay (darkens edges to increase focus and map quality)
    const vignette = this.ctx.createRadialGradient(w/2, h/2, h * 0.3, w/2, h/2, w * 0.7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, w, h);
  },
  
  renderCastleBase() {
    const cx = this.canvas.width * 0.08;
    const cy = this.canvas.height * 0.5;
    const ctx = this.ctx;
    
    // --- CASTLE GATEHOUSE ---
    // Stone foundation base
    ctx.fillStyle = '#0a0c14';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 70, 90, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Back wall with gradient
    const wallGrad = ctx.createLinearGradient(0, cy - 75, 0, cy + 75);
    wallGrad.addColorStop(0, '#242a45');
    wallGrad.addColorStop(1, '#111320');
    ctx.fillStyle = wallGrad;
    ctx.strokeStyle = '#3d4b6e';
    ctx.lineWidth = 2;
    ctx.fillRect(0, cy - 75, cx + 10, 150);
    ctx.strokeRect(0, cy - 75, cx + 10, 150);
    
    // Brick pattern on wall
    ctx.strokeStyle = 'rgba(61, 75, 110, 0.4)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 10; row++) {
      const by = cy - 75 + row * 15;
      ctx.beginPath();
      ctx.moveTo(0, by);
      ctx.lineTo(cx + 10, by);
      ctx.stroke();
      const offset = (row % 2) * 12;
      for (let col = 0; col < 6; col++) {
        ctx.beginPath();
        ctx.moveTo(offset + col * 24, by);
        ctx.lineTo(offset + col * 24, by + 15);
        ctx.stroke();
      }
    }
    
    // Left tower with cylindrical gradient shading
    const towerGrad = ctx.createLinearGradient(cx - 15, 0, cx + 15, 0);
    towerGrad.addColorStop(0, '#121522');
    towerGrad.addColorStop(0.4, '#2d3352');
    towerGrad.addColorStop(0.8, '#2d3352');
    towerGrad.addColorStop(1, '#0e111d');
    ctx.fillStyle = towerGrad;
    ctx.fillRect(cx - 15, cy - 85, 30, 170);
    ctx.strokeStyle = '#3d4b6e';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 15, cy - 85, 30, 170);
    
    // Tower crenellations (top)
    ctx.fillStyle = '#2d354d';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - 15 + i * 12, cy - 95, 8, 12);
    }
    // Tower crenellations (bottom)
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - 15 + i * 12, cy + 83, 8, 12);
    }
    
    // Gate archway (dark entrance)
    ctx.fillStyle = '#0a0b12';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 22);
    ctx.lineTo(cx - 10, cy - 10);
    ctx.arc(cx, cy - 10, 10, Math.PI, 0);
    ctx.lineTo(cx + 10, cy + 22);
    ctx.closePath();
    ctx.fill();
    
    // Iron gate bars
    ctx.strokeStyle = '#555e78';
    ctx.lineWidth = 2;
    for (let i = -6; i <= 6; i += 4) {
      ctx.beginPath();
      ctx.moveTo(cx + i, cy - 8);
      ctx.lineTo(cx + i, cy + 22);
      ctx.stroke();
    }
    
    // Portal energy core
    let portalColor = '#00ffff';
    let portalGlow = '#00ffff';
    if (this.castleHp < 35) {
      portalColor = '#ff3131';
      portalGlow = '#ff3131';
    } else if (this.castleHp < 70) {
      portalColor = '#ffaa00';
      portalGlow = '#ffaa00';
    }
    
    const pulse = Math.sin(Date.now() / 400) * 3;
    ctx.shadowBlur = 20 + pulse;
    ctx.shadowColor = portalGlow;
    ctx.fillStyle = portalColor;
    ctx.beginPath();
    ctx.arc(cx, cy + 5, 6 + pulse * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Torch flames on tower
    const torchFlicker = Math.random() * 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff8c00';
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.arc(cx, cy - 55, 3 + torchFlicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(cx, cy - 56, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.arc(cx, cy + 60, 3 + torchFlicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(cx, cy + 59, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Banner above gate
    ctx.fillStyle = '#6a1b9a';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 38);
    ctx.lineTo(cx + 7, cy - 38);
    ctx.lineTo(cx + 5, cy - 25);
    ctx.lineTo(cx, cy - 22);
    ctx.lineTo(cx - 5, cy - 25);
    ctx.closePath();
    ctx.fill();
    // Crown symbol on banner
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 29);
    ctx.lineTo(cx - 2, cy - 33);
    ctx.lineTo(cx, cy - 30);
    ctx.lineTo(cx + 2, cy - 33);
    ctx.lineTo(cx + 3, cy - 29);
    ctx.stroke();
    
    // DAMAGE OVERLAYS
    if (this.castleHp < 70) {
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 50);
      ctx.lineTo(cx - 5, cy - 40);
      ctx.lineTo(cx - 10, cy - 30);
      ctx.moveTo(cx + 8, cy + 40);
      ctx.lineTo(cx + 2, cy + 50);
      ctx.stroke();
      // Rubble dots
      ctx.fillStyle = '#3d4b6e';
      ctx.fillRect(cx - 8, cy + 70, 4, 3);
      ctx.fillRect(cx + 3, cy + 72, 3, 2);
    }
    if (this.castleHp < 35) {
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy - 60);
      ctx.lineTo(cx - 3, cy - 45);
      ctx.lineTo(cx + 8, cy - 35);
      ctx.moveTo(cx - 10, cy + 55);
      ctx.lineTo(cx + 5, cy + 65);
      ctx.stroke();
      // Missing brick chunks
      ctx.fillStyle = '#0a0b12';
      ctx.fillRect(cx + 5, cy - 80, 8, 6);
      ctx.fillRect(cx - 12, cy + 75, 10, 5);
    }
    
    // Shield visual barrier
    if (this.castleShield > 0) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, 95 + Math.sin(Date.now() / 200) * 5, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // HP Text
    ctx.font = 'bold 10px "Outfit"';
    ctx.fillStyle = portalColor;
    ctx.textAlign = 'center';
    ctx.fillText(`${this.castleHp} HP`, cx, cy + 100);
  },
  
  renderSceneryObjects() {
    this.sceneryElements.forEach(s => {
      this.ctx.save();
      this.ctx.translate(s.x, s.y);
      this.ctx.scale(s.scale, s.scale);
      
      if (this.activeLevel === 1) {
        // --- Forest Scenery (Glowing blue mushrooms & small trees) ---
        if (s.varId === 0) {
          // Blue Mushroom
          this.ctx.shadowBlur = 6;
          this.ctx.shadowColor = '#00ffff';
          this.ctx.fillStyle = '#00ffff';
          this.ctx.beginPath();
          this.ctx.arc(0, -6, 8, Math.PI, 0);
          this.ctx.fill();
          
          this.ctx.shadowBlur = 0;
          this.ctx.fillStyle = '#dcdcdc';
          this.ctx.fillRect(-2, -6, 4, 10);
        } else {
          // Pine tree
          this.ctx.fillStyle = '#8b4513';
          this.ctx.fillRect(-2, 0, 4, 10);
          this.ctx.fillStyle = '#1e4d2b';
          this.ctx.beginPath();
          this.ctx.moveTo(0, -18);
          this.ctx.lineTo(10, 0);
          this.ctx.lineTo(-10, 0);
          this.ctx.closePath();
          this.ctx.fill();
        }
      } else if (this.activeLevel === 2) {
        // --- Mine Scenery (Gold/Cyan crystal clusters) ---
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = s.varId === 0 ? '#ffd700' : '#00ffff';
        this.ctx.fillStyle = s.varId === 0 ? '#ffd700' : '#00ffff';
        
        // Draw crystal shards pointing up
        this.ctx.beginPath();
        this.ctx.moveTo(0, -14);
        this.ctx.lineTo(5, 2);
        this.ctx.lineTo(-5, 2);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.moveTo(-6, -10);
        this.ctx.lineTo(-2, 2);
        this.ctx.lineTo(-9, 2);
        this.ctx.closePath();
        this.ctx.fill();
        
      } else if (this.activeLevel === 3) {
        // --- Volcano Scenery (Molten rocks / fumaroles) ---
        this.ctx.fillStyle = '#1c1c1c';
        this.ctx.strokeStyle = '#ff4500';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Hot lava crack lines inside rock
        this.ctx.strokeStyle = '#ff8c00';
        this.ctx.beginPath();
        this.ctx.moveTo(-6, -2);
        this.ctx.lineTo(6, 4);
        this.ctx.stroke();
      } else if (this.activeLevel === 4) {
        // --- Chaos Throne Scenery (Royal purple banners & floor runes) ---
        if (s.varId === 0) {
          // Magic runic circle drawn on ground
          this.ctx.strokeStyle = 'rgba(138, 43, 226, 0.4)';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 16, 0, Math.PI*2);
          this.ctx.stroke();
          
          this.ctx.fillStyle = 'rgba(138, 43, 226, 0.1)';
          this.ctx.fill();
        } else {
          // Small floating purple orb
          const floatOffset = Math.sin(Date.now() / 300 + s.x) * 4;
          this.ctx.shadowBlur = 8;
          this.ctx.shadowColor = '#8a2be2';
          this.ctx.fillStyle = '#8a2be2';
          this.ctx.beginPath();
          this.ctx.arc(0, floatOffset, 4, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
      
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
    });
  }
};

function varColor(name) {
  if (name === 'color-secondary') return '#00ffff';
  if (name === 'color-orange') return '#ffb700';
  if (name === 'color-red') return '#ff3131';
  if (name === 'color-primary') return '#8a2be2';
  return '#ffffff';
}

window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
