export interface Point {
  x: number;
  y: number;
}

export interface Entity extends Point {
  width: number;
  height: number;
  speed: number;
}

export type PlaneType = 'standard' | 'light' | 'heavy' | 'tech' | 'blast';

export interface PlaneData {
  id: PlaneType;
  name: string;
  description: string;
  price: number;
  health: number;
  speed: number;
  fireRate: number;
  color: string;
}

export interface Player extends Entity {
  type: PlaneType;
  health: number;
  maxHealth: number;
  score: number;
  lastShot: number;
  fireRate: number;
  activeBuffs: {
    type: 'rapidFire' | 'shield' | 'spreadShot';
    endTime: number;
  }[];
}

export interface Enemy extends Entity {
  type: 'basic' | 'fast' | 'heavy' | 'boss';
  health: number;
  maxHealth: number;
  lastShot: number;
  fireRate: number;
}

export interface Bullet extends Entity {
  owner: 'player' | 'enemy';
  damage: number;
  vx?: number;
  vy?: number;
}

export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface PowerUp extends Entity {
  type: 'rapidFire' | 'shield' | 'spreadShot';
}

export interface GameState {
  status: 'menu' | 'playing' | 'gameover' | 'paused' | 'countdown' | 'shop';
  score: number;
  highScore: number;
  totalCurrency: number;
  ownedPlanes: PlaneType[];
  selectedPlane: PlaneType;
  countdownValue?: number;
}
