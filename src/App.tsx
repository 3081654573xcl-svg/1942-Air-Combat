import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Heart, Shield, Zap, Target, Pause, ShoppingCart, ChevronLeft, ChevronRight, Lock, Home } from 'lucide-react';
import { cn } from './lib/utils';
import { Player, Enemy, Bullet, Particle, GameState, PowerUp, PlaneData, PlaneType } from './types';
import { soundManager } from './soundUtils';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 640;

const PLANES: PlaneData[] = [
  {
    id: 'standard',
    name: 'P-38 Lightning',
    description: 'Balanced standard fighter.',
    price: 0,
    health: 100,
    speed: 2.5,
    fireRate: 200,
    color: '#1d4ed8'
  },
  {
    id: 'light',
    name: 'Swift Interceptor',
    description: 'High speed, lower health.',
    price: 5000,
    health: 70,
    speed: 3.8,
    fireRate: 150,
    color: '#10b981'
  },
  {
    id: 'heavy',
    name: 'Flying Fortress',
    description: 'Massive health, slower speed.',
    price: 15000,
    health: 250,
    speed: 1.8,
    fireRate: 300,
    color: '#4b5563'
  },
  {
    id: 'tech',
    name: 'Laser Prototype',
    description: 'Advanced tech, high fire rate.',
    price: 30000,
    health: 100,
    speed: 2.8,
    fireRate: 100,
    color: '#8b5cf6'
  },
  {
    id: 'blast',
    name: 'Bomber Special',
    description: 'Heavy damage, wide bullets.',
    price: 50000,
    health: 150,
    speed: 2.2,
    fireRate: 400,
    color: '#f59e0b'
  }
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedHighScore = localStorage.getItem('1942_highScore');
    const savedCurrency = localStorage.getItem('1942_currency');
    const savedPlanes = localStorage.getItem('1942_ownedPlanes');
    const savedSelected = localStorage.getItem('1942_selectedPlane');

    return {
      status: 'menu',
      score: 0,
      highScore: savedHighScore ? parseInt(savedHighScore) : 0,
      totalCurrency: savedCurrency ? parseInt(savedCurrency) : 0,
      ownedPlanes: savedPlanes ? JSON.parse(savedPlanes) : ['standard'],
      selectedPlane: (savedSelected as PlaneType) || 'standard',
    };
  });

  const [hud, setHud] = useState({
    health: 100,
    score: 0,
    time: 0,
    activeBuffs: [] as { type: string; endTime: number }[],
    bossHealth: null as { current: number; max: number } | null,
  });

  // Game refs for mutable state outside React render cycle
  const playerRef = useRef<Player>({
    x: CANVAS_WIDTH / 2 - 20,
    y: CANVAS_HEIGHT - 80,
    width: 40,
    height: 40,
    speed: 2.5,
    type: 'standard',
    health: 100,
    maxHealth: 100,
    score: 0,
    lastShot: 0,
    fireRate: 250,
    activeBuffs: [],
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const frameRef = useRef<number>(0);
  const lastEnemySpawnRef = useRef<number>(0);
  const lastPowerUpSpawnRef = useRef<number>(0);
  const lastBossDefeatedTimeRef = useRef<number>(0);
  const bossCountRef = useRef<number>(0);
  const gameStartTimeRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number>(0);
  const totalPausedTimeRef = useRef<number>(0);
  const backgroundOffsetRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => (keysRef.current[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keysRef.current[e.code] = false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const resetGame = () => {
    const planeData = PLANES.find(p => p.id === gameState.selectedPlane) || PLANES[0];
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - 20,
      y: CANVAS_HEIGHT - 80,
      width: 40,
      height: 40,
      speed: planeData.speed,
      type: planeData.id,
      health: planeData.health,
      maxHealth: planeData.health,
      score: 0,
      lastShot: 0,
      fireRate: planeData.fireRate,
      activeBuffs: [],
    };
    enemiesRef.current = [];
    bulletsRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    gameStartTimeRef.current = performance.now();
    lastBossDefeatedTimeRef.current = 0;
    bossCountRef.current = 0;
    totalPausedTimeRef.current = 0;
    setGameState(prev => ({ ...prev, status: 'playing', score: 0 }));
    setHud({ health: planeData.health, score: 0, time: 0, activeBuffs: [], bossHealth: null });
  };

  const togglePause = () => {
    setGameState(prev => {
      if (prev.status === 'playing') {
        pauseStartTimeRef.current = performance.now();
        return { ...prev, status: 'paused' };
      }
      if (prev.status === 'paused') {
        return { ...prev, status: 'countdown', countdownValue: 3 };
      }
      return prev;
    });
  };

  const spawnEnemy = (timestamp: number) => {
    // Don't spawn normal enemies if a boss is active
    const bossActive = enemiesRef.current.some(e => e.type === 'boss');
    if (bossActive) return;

    const gameTime = timestamp - gameStartTimeRef.current;
    // Difficulty increases over 2 minutes, interval drops from 3000ms to 800ms
    const difficultyFactor = Math.min(gameTime / 120000, 1); 
    const currentSpawnInterval = 3000 - (difficultyFactor * 2200);

    if (timestamp - lastEnemySpawnRef.current > currentSpawnInterval) {
      const types: Enemy['type'][] = ['basic', 'fast', 'heavy'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      let enemy: Enemy = {
        x: Math.random() * (CANVAS_WIDTH - 40),
        y: -50,
        width: 40,
        height: 40,
        speed: type === 'fast' ? 1.5 : type === 'heavy' ? 0.6 : 1.0,
        type,
        health: type === 'heavy' ? 50 : 20,
        maxHealth: type === 'heavy' ? 50 : 20,
        lastShot: 0,
        fireRate: type === 'heavy' ? 1500 : 2500,
      };
      
      enemiesRef.current.push(enemy);
      lastEnemySpawnRef.current = timestamp;
    }
  };

  const spawnPowerUp = (timestamp: number) => {
    if (timestamp - lastPowerUpSpawnRef.current > 8000) { // Every 8 seconds
      const types: PowerUp['type'][] = ['rapidFire', 'shield', 'spreadShot'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      powerUpsRef.current.push({
        x: Math.random() * (CANVAS_WIDTH - 30),
        y: -30,
        width: 30,
        height: 30,
        speed: 1.2,
        type,
      });
      lastPowerUpSpawnRef.current = timestamp;
    }
  };

  const spawnBoss = (timestamp: number) => {
    const gameTime = timestamp - gameStartTimeRef.current;
    
    // Check if a boss is already active
    const bossActive = enemiesRef.current.some(e => e.type === 'boss');
    if (bossActive) return;

    // Spawn 60 seconds after the last boss was defeated (or 60s into the game for the first boss)
    if (gameTime - lastBossDefeatedTimeRef.current > 60000) {
      bossCountRef.current++;
      const health = 500 + (bossCountRef.current - 1) * 300;
      
      enemiesRef.current.push({
        x: CANVAS_WIDTH / 2 - 40,
        y: -100,
        width: 80,
        height: 80,
        speed: 0.4,
        type: 'boss',
        health: health,
        maxHealth: health,
        lastShot: 0,
        fireRate: 800,
      });
    }
  };

  const createExplosion = (x: number, y: number, color: string = '#ff9900') => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  };

  const update = (timestamp: number) => {
    if (gameState.status === 'paused') return;
    
    if (gameState.status === 'countdown') {
      const elapsedSincePause = performance.now() - pauseStartTimeRef.current;
      // We don't use the timestamp here because we want real-time countdown
      // But we need to update the countdown value
      const countdownSeconds = 3 - Math.floor((performance.now() - (pauseStartTimeRef.current + 500)) / 1000);
      
      if (countdownSeconds <= 0) {
        totalPausedTimeRef.current += performance.now() - pauseStartTimeRef.current;
        setGameState(prev => ({ ...prev, status: 'playing' }));
      } else if (countdownSeconds !== gameState.countdownValue) {
        setGameState(prev => ({ ...prev, countdownValue: countdownSeconds }));
      }
      return;
    }

    if (gameState.status !== 'playing') return;

    const adjustedTimestamp = timestamp - totalPausedTimeRef.current;
    const player = playerRef.current;

    // Movement
    if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) player.x -= player.speed;
    if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) player.x += player.speed;
    if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) player.y -= player.speed;
    if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) player.y += player.speed;

    // Bounds
    player.x = Math.max(0, Math.min(CANVAS_WIDTH - player.width, player.x));
    player.y = Math.max(0, Math.min(CANVAS_HEIGHT - player.height, player.y));

    // Shooting
    const hasRapidFire = player.activeBuffs.some(b => b.type === 'rapidFire');
    const hasSpreadShot = player.activeBuffs.some(b => b.type === 'spreadShot');
    const currentFireRate = hasRapidFire ? player.fireRate / 2 : player.fireRate;

    if (keysRef.current['Space'] && adjustedTimestamp - player.lastShot > currentFireRate) {
      const bulletDamage = player.type === 'blast' ? 25 : player.type === 'tech' ? 15 : 10;
      const bulletWidth = player.type === 'blast' ? 12 : 4;
      const bulletHeight = player.type === 'tech' ? 25 : 12;
      const bulletColor = player.type === 'tech' ? '#a855f7' : player.type === 'blast' ? '#f97316' : '#60a5fa';

      if (hasSpreadShot) {
        // Spread shot: 3 bullets
        bulletsRef.current.push({ x: player.x + player.width / 2 - bulletWidth / 2, y: player.y, width: bulletWidth, height: bulletHeight, speed: -4.0, owner: 'player', damage: bulletDamage });
        bulletsRef.current.push({ x: player.x, y: player.y + 10, width: bulletWidth, height: bulletHeight, speed: -4.0, owner: 'player', damage: bulletDamage });
        bulletsRef.current.push({ x: player.x + player.width - bulletWidth, y: player.y + 10, width: bulletWidth, height: bulletHeight, speed: -4.0, owner: 'player', damage: bulletDamage });
      } else {
        bulletsRef.current.push({
          x: player.x + player.width / 2 - bulletWidth / 2,
          y: player.y,
          width: bulletWidth,
          height: bulletHeight,
          speed: -4.0,
          owner: 'player',
          damage: bulletDamage,
        });
      }
      player.lastShot = adjustedTimestamp;
      soundManager.playShoot();
    }

    // Spawn enemies and power-ups
    spawnEnemy(adjustedTimestamp);
    spawnPowerUp(adjustedTimestamp);
    spawnBoss(adjustedTimestamp);

    // Update buffs
    player.activeBuffs = player.activeBuffs.filter(b => b.endTime > adjustedTimestamp);

    // Update power-ups
    powerUpsRef.current.forEach((pu, index) => {
      pu.y += pu.speed;
      
      // Collision with player
      if (
        player.x < pu.x + pu.width &&
        player.x + player.width > pu.x &&
        player.y < pu.y + pu.height &&
        player.y + player.height > pu.y
      ) {
        // Apply buff
        const existing = player.activeBuffs.find(b => b.type === pu.type);
        if (existing) {
          existing.endTime = adjustedTimestamp + 10000;
        } else {
          player.activeBuffs.push({ type: pu.type, endTime: adjustedTimestamp + 10000 });
        }
        
        soundManager.playPowerUp();
        createExplosion(pu.x + pu.width / 2, pu.y + pu.height / 2, '#00ff00');
        powerUpsRef.current.splice(index, 1);
      }

      if (pu.y > CANVAS_HEIGHT) {
        powerUpsRef.current.splice(index, 1);
      }
    });

    // Update enemies
    enemiesRef.current.forEach((enemy, index) => {
      if (enemy.type === 'boss') {
        // Boss movement: move down to 100px then oscillate
        if (enemy.y < 80) {
          enemy.y += enemy.speed;
        } else {
          enemy.x += Math.sin(adjustedTimestamp / 1000) * 1.5;
          // Keep boss within horizontal bounds
          enemy.x = Math.max(20, Math.min(CANVAS_WIDTH - enemy.width - 20, enemy.x));
        }

        // Boss shooting: Multiple Patterns
        if (adjustedTimestamp - enemy.lastShot > enemy.fireRate) {
          const pattern = Math.floor((adjustedTimestamp / 5000) % 3); // Change pattern every 5 seconds
          
          if (pattern === 0) {
            // Pattern 0: 5-way spread
            [-0.4, -0.2, 0, 0.2, 0.4].forEach(angle => {
              bulletsRef.current.push({
                x: enemy.x + enemy.width / 2 - 3,
                y: enemy.y + enemy.height - 10,
                width: 6,
                height: 15,
                speed: 2.2,
                vx: Math.sin(angle) * 2.5,
                vy: Math.cos(angle) * 2.5,
                owner: 'enemy',
                damage: 20,
              });
            });
          } else if (pattern === 1) {
            // Pattern 1: Circular burst
            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * Math.PI * 2;
              bulletsRef.current.push({
                x: enemy.x + enemy.width / 2 - 3,
                y: enemy.y + enemy.height / 2,
                width: 6,
                height: 6,
                speed: 2.0,
                vx: Math.cos(angle) * 2.0,
                vy: Math.sin(angle) * 2.0,
                owner: 'enemy',
                damage: 15,
              });
            }
          } else {
            // Pattern 2: Targeted burst (towards player)
            const dx = (player.x + player.width / 2) - (enemy.x + enemy.width / 2);
            const dy = (player.y + player.height / 2) - (enemy.y + enemy.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const vx = (dx / dist) * 3.5;
            const vy = (dy / dist) * 3.5;
            
            bulletsRef.current.push({
              x: enemy.x + enemy.width / 2 - 3,
              y: enemy.y + enemy.height - 10,
              width: 8,
              height: 8,
              speed: 3.5,
              vx,
              vy,
              owner: 'enemy',
              damage: 25,
            });
          }

          enemy.lastShot = adjustedTimestamp;
          soundManager.playEnemyShoot();
        }
      } else {
        enemy.y += enemy.speed;
        
        // Enemy shooting
        if (adjustedTimestamp - enemy.lastShot > enemy.fireRate) {
          bulletsRef.current.push({
            x: enemy.x + enemy.width / 2 - 2,
            y: enemy.y + enemy.height,
            width: 4,
            height: 10,
            speed: 1.8,
            owner: 'enemy',
            damage: 10,
          });
          enemy.lastShot = adjustedTimestamp;
          soundManager.playEnemyShoot();
        }
      }

      // Collision with player
      if (
        player.x < enemy.x + enemy.width &&
        player.x + player.width > enemy.x &&
        player.y < enemy.y + enemy.height &&
        player.y + player.height > enemy.y
      ) {
        const hasShield = player.activeBuffs.some(b => b.type === 'shield');
        if (!hasShield) {
          player.health -= 20;
          soundManager.playHit();
        }
        enemy.health = 0;
        createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, hasShield ? '#4299e1' : '#ff9900');
        if (!hasShield) soundManager.playExplosion();
      }

      if (enemy.y > CANVAS_HEIGHT || enemy.health <= 0) {
        if (enemy.health <= 0) {
          player.score += enemy.type === 'boss' ? 5000 : enemy.type === 'heavy' ? 500 : 100;
          createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.type === 'boss' ? '#f59e0b' : '#ff9900');
          soundManager.playExplosion();
        }
        
        if (enemy.type === 'boss') {
          lastBossDefeatedTimeRef.current = adjustedTimestamp - gameStartTimeRef.current;
        }
        
        enemiesRef.current.splice(index, 1);
      }
    });

    // Update bullets
    bulletsRef.current.forEach((bullet, bIndex) => {
      if (bullet.vx !== undefined && bullet.vy !== undefined) {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
      } else {
        bullet.y += bullet.speed;
      }

      if (bullet.owner === 'player') {
        enemiesRef.current.forEach((enemy) => {
          if (
            bullet.x < enemy.x + enemy.width &&
            bullet.x + bullet.width > enemy.x &&
            bullet.y < enemy.y + enemy.height &&
            bullet.y + bullet.height > enemy.y
          ) {
            enemy.health -= bullet.damage;
            bullet.y = -100; // Mark for removal
            createExplosion(bullet.x, bullet.y, '#ffffff');
          }
        });
      } else {
        if (
          bullet.x < player.x + player.width &&
          bullet.x + bullet.width > player.x &&
          bullet.y < player.y + player.height &&
          bullet.y + bullet.height > player.y
        ) {
          const hasShield = player.activeBuffs.some(b => b.type === 'shield');
          if (!hasShield) {
            player.health -= bullet.damage;
            soundManager.playHit();
          }
          bullet.y = CANVAS_HEIGHT + 100; // Mark for removal
          createExplosion(bullet.x, bullet.y, hasShield ? '#4299e1' : '#ff0000');
        }
      }

      if (bullet.y < -50 || bullet.y > CANVAS_HEIGHT + 50 || bullet.x < -50 || bullet.x > CANVAS_WIDTH + 50) {
        bulletsRef.current.splice(bIndex, 1);
      }
    });

    // Update particles
    particlesRef.current.forEach((p, index) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      if (p.life <= 0) particlesRef.current.splice(index, 1);
    });

    // Update background
    backgroundOffsetRef.current = (backgroundOffsetRef.current + 0.3) % CANVAS_HEIGHT;

    // Check game over
    if (player.health <= 0) {
      setGameState(prev => {
        const newScore = player.score;
        const newHighScore = Math.max(prev.highScore, newScore);
        const newTotalCurrency = prev.totalCurrency + newScore;
        localStorage.setItem('1942_highScore', newHighScore.toString());
        localStorage.setItem('1942_currency', newTotalCurrency.toString());
        return { ...prev, status: 'gameover', score: newScore, highScore: newHighScore, totalCurrency: newTotalCurrency };
      });
    }

    // Update HUD
    const activeBoss = enemiesRef.current.find(e => e.type === 'boss');
    setHud({ 
      health: player.health, 
      score: player.score,
      time: Math.floor((adjustedTimestamp - gameStartTimeRef.current) / 1000),
      activeBuffs: [...player.activeBuffs],
      bossHealth: activeBoss ? { current: activeBoss.health, max: activeBoss.maxHealth } : null,
    });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Background (Deep Ocean with Gradient)
    const bgGradient = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT
    );
    bgGradient.addColorStop(0, '#1e3a8a');
    bgGradient.addColorStop(1, '#172554');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw Islands/Waves with more detail
    ctx.fillStyle = 'rgba(30, 64, 175, 0.4)';
    for (let i = -1; i < 2; i++) {
      const y = backgroundOffsetRef.current + i * CANVAS_HEIGHT;
      
      // Island 1
      ctx.beginPath();
      ctx.ellipse(80, y + 120, 40, 25, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Island 2
      ctx.beginPath();
      ctx.ellipse(350, y + 450, 60, 35, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();

      // Small waves
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for(let j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.moveTo(100 + j * 50, y + 200 + j * 100);
        ctx.lineTo(130 + j * 50, y + 200 + j * 100);
        ctx.stroke();
      }
    }

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw Power-ups
    powerUpsRef.current.forEach(pu => {
      const color = pu.type === 'rapidFire' ? '#fbbf24' : pu.type === 'shield' ? '#3b82f6' : '#10b981';
      
      // Outer glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      
      // Rotating ring
      const angle = (Date.now() / 500) % (Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pu.x + pu.width / 2, pu.y + pu.height / 2, pu.width / 2 + 4, angle, angle + Math.PI * 1.5);
      ctx.stroke();

      // Main body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pu.x + pu.width / 2, pu.y + pu.height / 2, pu.width / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;

      // Icon
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(pu.type === 'rapidFire' ? 'Z' : pu.type === 'shield' ? 'S' : 'T', pu.x + pu.width / 2, pu.y + pu.height / 2 + 5);
    });

    // Draw Bullets
    bulletsRef.current.forEach(b => {
      let color = b.owner === 'player' ? '#60a5fa' : '#ef4444';
      if (b.owner === 'player') {
        const p = playerRef.current;
        if (p.type === 'tech') color = '#a855f7';
        if (p.type === 'blast') color = '#f97316';
      }
      ctx.fillStyle = color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      
      // Bullet shape
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    });

    // Draw Enemies
    enemiesRef.current.forEach(e => {
      ctx.save();
      ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
      
      if (e.type === 'boss') {
        // Boss: Massive Flying Fortress (Grey/Steel style from image)
        ctx.fillStyle = '#475569'; // Steel Grey
        
        // Main Hull (Rounded)
        ctx.beginPath();
        ctx.ellipse(0, 0, 45, 35, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Massive Wings
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(-70, -10);
        ctx.lineTo(70, -10);
        ctx.lineTo(60, 15);
        ctx.lineTo(-60, 15);
        ctx.closePath();
        ctx.fill();

        // Engine Pods with Fire Trails
        const engineX = [-50, -25, 25, 50];
        engineX.forEach(x => {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x - 8, -20, 16, 30);
          
          // Fire Trail
          const fireHeight = 15 + Math.random() * 10;
          const gradient = ctx.createLinearGradient(0, -20, 0, -20 - fireHeight);
          gradient.addColorStop(0, '#f97316');
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.fillRect(x - 4, -20 - fireHeight, 8, fireHeight);
        });

        // Turrets
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(-25, 15, 10, 0, Math.PI * 2);
        ctx.arc(25, 15, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Cockpit (Glass)
        ctx.fillStyle = '#0ea5e9';
        ctx.beginPath();
        ctx.ellipse(0, 15, 12, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Boss Health Bar (Mini)
        ctx.restore(); // Exit translate for health bar
        ctx.save();
        const barWidth = 120;
        const barHeight = 8;
        const healthPercent = e.health / e.maxHealth;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x + e.width / 2 - barWidth / 2, e.y - 25, barWidth, barHeight);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(e.x + e.width / 2 - barWidth / 2, e.y - 25, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x + e.width / 2 - barWidth / 2, e.y - 25, barWidth, barHeight);
        ctx.save(); // Re-save for next restoration
      } else if (e.type === 'heavy') {
        // Heavy Bomber (Black/Dark Grey with Red Cockpit style)
        ctx.fillStyle = '#111827'; // Black
        
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wings
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-45, -5, 90, 10);
        
        // Red Cockpit
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.ellipse(0, 10, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Engines with fire
        [-30, 30].forEach(x => {
          ctx.fillStyle = '#374151';
          ctx.fillRect(x - 6, -12, 12, 15);
          const fireH = 8 + Math.random() * 5;
          ctx.fillStyle = '#f97316';
          ctx.fillRect(x - 3, -12 - fireH, 6, fireH);
        });
      } else if (e.type === 'fast') {
        // Interceptor (Red with Black Crosses style)
        ctx.fillStyle = '#991b1b'; // Red
        
        // Body
        ctx.beginPath();
        ctx.moveTo(0, 25);
        ctx.lineTo(-18, -10);
        ctx.lineTo(0, -22);
        ctx.lineTo(18, -10);
        ctx.closePath();
        ctx.fill();
        
        // Wings
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(-22, -2, 44, 6);
        
        // Black Crosses (Simplified)
        ctx.fillStyle = '#000';
        ctx.fillRect(-18, 0, 6, 2);
        ctx.fillRect(-16, -2, 2, 6);
        ctx.fillRect(12, 0, 6, 2);
        ctx.fillRect(14, -2, 2, 6);
      } else {
        // Basic Fighter (Green Zero style)
        ctx.fillStyle = '#064e3b'; // Dark Green
        
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wings
        ctx.fillStyle = '#065f46';
        ctx.beginPath();
        ctx.ellipse(0, 0, 35, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Red Circles (Hinomaru)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(-25, 0, 5, 0, Math.PI * 2);
        ctx.arc(25, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Propeller
        const propAngle = (Date.now() / 40) % (Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(propAngle) * 12, 22 + Math.sin(propAngle) * 12);
        ctx.lineTo(Math.cos(propAngle + Math.PI) * 12, 22 + Math.sin(propAngle + Math.PI) * 12);
        ctx.stroke();
      }
      
      ctx.restore();
    });

    // Draw Player
    const p = playerRef.current;
    if (gameState.status === 'playing') {
      const hasShield = p.activeBuffs.some(b => b.type === 'shield');
      
      if (hasShield) {
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.9, Date.now() / 200, Date.now() / 200 + Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
      
      // Player Fighter (Dynamic color based on type)
      const planeData = PLANES.find(pd => pd.id === p.type) || PLANES[0];
      ctx.fillStyle = planeData.color;
      
      // Body (Rounded)
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Wings (Rounded)
      ctx.fillStyle = planeData.color;
      ctx.beginPath();
      ctx.ellipse(0, -2, 38, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // White Circles on Wings
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-28, -2, 6, 0, Math.PI * 2);
      ctx.arc(28, -2, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Tail
      ctx.fillStyle = planeData.color;
      ctx.beginPath();
      ctx.moveTo(-10, 15);
      ctx.lineTo(10, 15);
      ctx.lineTo(0, 25);
      ctx.closePath();
      ctx.fill();
      
      // Cockpit (Glass)
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.ellipse(0, -5, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Propeller (Animated)
      const propAngle = (Date.now() / 30) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(propAngle) * 15, -22 + Math.sin(propAngle) * 15);
      ctx.lineTo(Math.cos(propAngle + Math.PI) * 15, -22 + Math.sin(propAngle + Math.PI) * 15);
      ctx.stroke();

      // Engine Fire (if moving up)
      if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) {
        const fireH = 10 + Math.random() * 10;
        const fireGrad = ctx.createLinearGradient(0, 20, 0, 20 + fireH);
        fireGrad.addColorStop(0, planeData.color);
        fireGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fireGrad;
        ctx.fillRect(-4, 20, 8, fireH);
      }

      ctx.restore();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const render = (timestamp: number) => {
      update(timestamp);
      draw(ctx);
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [gameState.status]);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex items-center justify-center p-0 sm:p-4 font-sans text-white overflow-hidden">
      <div className="relative bg-neutral-900 sm:rounded-2xl shadow-2xl overflow-hidden border-x border-y sm:border border-white/10 w-full max-w-[480px] aspect-[3/4] max-h-[100dvh] sm:max-h-[min(90vh,640px)]">
        {/* CRT Effect Overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
        
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full block touch-none"
        />

        {/* HUD */}
        {gameState.status === 'playing' && (
          <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex justify-between items-start pointer-events-none z-20">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-tighter">Integrity</span>
                </div>
                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                  <motion.div
                    className="h-full bg-gradient-to-r from-red-600 to-red-400"
                    initial={{ width: '100%' }}
                    animate={{ width: `${hud.health}%` }}
                  />
                </div>
              </div>
              
              {/* Active Buffs */}
              <div className="flex gap-2">
                <AnimatePresence>
                  {hud.activeBuffs?.map((buff, i) => (
                    <motion.div
                      key={`${buff.type}-${i}`}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className={cn(
                        "p-2 rounded-lg border backdrop-blur-xl shadow-lg",
                        buff.type === 'rapidFire' ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                        buff.type === 'shield' ? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                        "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      )}
                    >
                      {buff.type === 'rapidFire' ? <Zap className="w-4 h-4" /> :
                       buff.type === 'shield' ? <Shield className="w-4 h-4" /> :
                       <Target className="w-4 h-4" />}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Boss Health Bar */}
            <AnimatePresence>
              {hud.bossHealth && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute top-24 left-1/2 -translate-x-1/2 w-64 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] drop-shadow-md">Boss Detected</span>
                  <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-red-500/30 backdrop-blur-md">
                    <motion.div
                      className="h-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500"
                      initial={{ width: '100%' }}
                      animate={{ width: `${(hud.bossHealth.current / hud.bossHealth.max) * 100}%` }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePause}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"
                >
                  <Pause className="w-4 h-4" />
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Combat Score</span>
                  <span className="text-2xl font-mono font-black text-white tracking-tighter">
                    {hud.score.toString().padStart(6, '0')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-3 py-1 rounded-md border border-white/10">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-white/40 uppercase">Time</span>
                  <span className="text-xs font-mono font-bold">
                    {Math.floor(hud.time / 60).toString().padStart(2, '0')}:{(hud.time % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-white/40 uppercase">Best</span>
                  <span className="text-xs font-mono font-bold">
                    {gameState.highScore.toString().padStart(6, '0')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Overlay Screens */}
        <AnimatePresence>
          {gameState.status === 'paused' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center z-30"
            >
              <h2 className="text-4xl sm:text-6xl font-black italic tracking-tighter text-white mb-8">PAUSED</h2>
              <div className="w-full max-w-xs space-y-4">
                <button
                  onClick={togglePause}
                  className="w-full bg-white text-slate-950 font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                >
                  <Play className="w-6 h-6 fill-current" />
                  RESUME
                </button>
                <button
                  onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
                  className="w-full bg-white/10 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 border border-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 transition-all"
                >
                  <Home className="w-6 h-6" />
                  BACK TO MENU
                </button>
              </div>
            </motion.div>
          )}

          {gameState.status === 'countdown' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
            >
              <motion.span
                key={gameState.countdownValue}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="text-9xl font-black italic text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]"
              >
                {gameState.countdownValue}
              </motion.span>
            </motion.div>
          )}

          {gameState.status === 'menu' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8 text-center z-30 overflow-y-auto"
            >
              <div className="relative mb-6 sm:mb-12 shrink-0">
                <motion.div
                  animate={{ 
                    rotate: [0, 2, -2, 0],
                    y: [0, -5, 5, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="relative z-10"
                >
                  <h1 className="text-6xl sm:text-8xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                    1942
                  </h1>
                </motion.div>
                <div className="absolute -inset-4 bg-blue-500/20 blur-3xl rounded-full" />
              </div>
              
              <p className="text-blue-400 text-[10px] sm:text-xs font-bold uppercase tracking-[0.5em] mb-8 sm:mb-16 animate-pulse shrink-0">
                Pacific Theater Simulator
              </p>
              
              <div className="space-y-4 sm:space-y-6 w-full max-w-xs shrink-0">
                <button
                  onClick={resetGame}
                  className="w-full bg-white text-slate-950 font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] group"
                >
                  <Play className="w-6 h-6 fill-current" />
                  INITIATE MISSION
                </button>
                
                <div className="flex items-center justify-center gap-2 text-white/30 text-[10px] font-bold uppercase tracking-widest pt-4 sm:pt-6">
                  <Trophy className="w-3 h-3" />
                  Fleet Record: {gameState.highScore.toString().padStart(6, '0')}
                </div>

                <button
                  onClick={() => setGameState(prev => ({ ...prev, status: 'shop' }))}
                  className="w-full bg-blue-600/20 text-blue-400 font-bold py-4 rounded-xl flex items-center justify-center gap-3 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
                >
                  <ShoppingCart className="w-5 h-5" />
                  HANGAR & SHOP
                </button>
              </div>

              <div className="mt-8 sm:mt-12 text-[10px] font-bold text-white/40 flex items-center gap-2 shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                CURRENCY: {gameState.totalCurrency.toLocaleString()}
              </div>

              <div className="mt-10 sm:mt-20 flex gap-8 sm:gap-12 text-[9px] text-white/20 font-bold uppercase tracking-[0.2em] shrink-0">
                <div className="flex flex-col gap-2">
                  <span className="text-white/40">Navigation</span>
                  <span>WASD / ARROWS</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-white/40">Weaponry</span>
                  <span>SPACEBAR</span>
                </div>
              </div>
            </motion.div>
          )}

          {gameState.status === 'shop' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center p-4 sm:p-6 z-50"
            >
              <div className="w-full flex justify-between items-center mb-4 sm:mb-8">
                <button
                  onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-black italic tracking-tighter">HANGAR</h2>
                <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono font-bold text-emerald-400">{gameState.totalCurrency.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex-1 w-full overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {PLANES.map((plane) => {
                  const isOwned = gameState.ownedPlanes.includes(plane.id);
                  const isSelected = gameState.selectedPlane === plane.id;
                  const canAfford = gameState.totalCurrency >= plane.price;

                  return (
                    <div
                      key={plane.id}
                      className={cn(
                        "p-4 rounded-2xl border transition-all",
                        isSelected ? "bg-blue-600/20 border-blue-500" : "bg-white/5 border-white/10"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-black italic text-lg">{plane.name}</h3>
                          <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{plane.description}</p>
                        </div>
                        <div className="flex flex-col items-end">
                          {!isOwned && (
                            <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold">
                              <span>{plane.price.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/30 uppercase font-bold">Armor</span>
                          <div className="h-1 bg-white/5 rounded-full mt-1">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${(plane.health / 250) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/30 uppercase font-bold">Speed</span>
                          <div className="h-1 bg-white/5 rounded-full mt-1">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(plane.speed / 4) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/30 uppercase font-bold">Firepower</span>
                          <div className="h-1 bg-white/5 rounded-full mt-1">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(200 / plane.fireRate) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      {isOwned ? (
                        <button
                          onClick={() => {
                            setGameState(prev => ({ ...prev, selectedPlane: plane.id }));
                            localStorage.setItem('1942_selectedPlane', plane.id);
                          }}
                          className={cn(
                            "w-full py-2 rounded-xl font-black text-xs transition-all",
                            isSelected ? "bg-blue-500 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"
                          )}
                        >
                          {isSelected ? 'SELECTED' : 'SELECT PLANE'}
                        </button>
                      ) : (
                        <button
                          disabled={!canAfford}
                          onClick={() => {
                            if (canAfford) {
                              const newOwned = [...gameState.ownedPlanes, plane.id];
                              const newCurrency = gameState.totalCurrency - plane.price;
                              setGameState(prev => ({
                                ...prev,
                                ownedPlanes: newOwned,
                                totalCurrency: newCurrency,
                                selectedPlane: plane.id
                              }));
                              localStorage.setItem('1942_ownedPlanes', JSON.stringify(newOwned));
                              localStorage.setItem('1942_currency', newCurrency.toString());
                              localStorage.setItem('1942_selectedPlane', plane.id);
                            }
                          }}
                          className={cn(
                            "w-full py-2 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all",
                            canAfford ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-white/5 text-white/20 cursor-not-allowed"
                          )}
                        >
                          {!canAfford && <Lock className="w-3 h-3" />}
                          {canAfford ? 'PURCHASE' : 'INSUFFICIENT FUNDS'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
          {gameState.status === 'gameover' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 sm:p-8 text-center z-30 overflow-y-auto"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-6 sm:mb-12 shrink-0"
              >
                <h2 className="text-3xl sm:text-5xl font-black italic tracking-tighter text-white mb-4">MISSION TERMINATED</h2>
                <div className="h-1 w-32 bg-red-500 mx-auto rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)]" />
              </motion.div>

              <div className="bg-white/5 rounded-3xl p-6 sm:p-8 w-full max-w-xs mb-8 sm:mb-12 border border-white/10 backdrop-blur-md shrink-0">
                <div className="space-y-6">
                  <div>
                    <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-1">Final Score</p>
                    <p className="text-4xl sm:text-5xl font-mono font-black text-white tracking-tighter">
                      {gameState.score.toString().padStart(6, '0')}
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-center pt-6 border-t border-white/10">
                    <div className="text-left">
                      <p className="text-white/20 text-[8px] font-bold uppercase">Flight Time</p>
                      <p className="text-sm font-mono font-bold text-white/60">
                        {Math.floor(hud.time / 60).toString().padStart(2, '0')}:{(hud.time % 60).toString().padStart(2, '0')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/20 text-[8px] font-bold uppercase">Record</p>
                      <p className="text-sm font-mono font-bold text-white/60">
                        {gameState.highScore.toString().padStart(6, '0')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={resetGame}
                className="w-full max-w-xs bg-red-500 text-white font-black py-4 sm:py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-400 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(239,68,68,0.3)] shrink-0"
              >
                <RotateCcw className="w-6 h-6" />
                RE-ENGAGE
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
