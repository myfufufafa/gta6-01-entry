// Solmar Bay — tuning constants. One job: every number the game balances on.
// The city is an original sun-soaked coastal town; nothing here comes from any
// commercial game: names, places, people and story are invented for this game.
export const SEED = 20261121;

export const WORLD = {
  width: 3200,
  height: 2400,
  roadWidth: 72,
  // Road centrelines: a regular grid plus the beachfront avenue.
  roadsX: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  roadsY: [200, 600, 1000, 1400, 1800, 2200],
  beachTop: 2280, // sand starts here; water below it
  waterTop: 2360,
  marinaLeft: 3080, // harbour water on the east edge
};

export const STEP = 1 / 60; // fixed simulation step, seconds

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  healthMax: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.38,
  shootCooldown: 0.22,
  bulletSpeed: 780,
  bulletDamage: 34,
  pistolAmmoStart: 24,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 170,
  drag: 0.55,
  steer: 2.6,
  handbrakeDrag: 2.4,
  healthMax: 100,
};

export const TRAFFIC = {
  count: 14,
  pedCount: 22,
  cruiseMin: 110,
  cruiseMax: 180,
};

export const WANTED = {
  max: 5,
  decaySeconds: 22, // quiet seconds before one star fades
  stealHeat: 1, // stealing a car in view of the police
  assaultHeat: 1, // hurting a pedestrian
  killHeat: 2, // killing a police officer
  copCarsPerStar: [0, 1, 2, 2, 3, 4],
  footCopsPerStar: [0, 1, 1, 2, 2, 3],
};

export const MONEY = {
  missionRewards: [150, 300, 500, 400, 1000],
  courierReward: 80,
  coinReward: 50,
  bustedFine: 120,
  wastedFine: 80,
  startCash: 40,
};

export const SAVE_KEY = 'solmar-bay-save-v1';

// District palettes, used by the world builder for building roofs and ground.
export const DISTRICTS = [
  { name: 'Marina', x0: 2600, x1: 3200, y0: 0, y1: 900, roof: ['#e8e4d8', '#dfe9ee', '#f2e6c9'], ground: '#cdbf9a' },
  { name: 'Downtown', x0: 1000, x1: 2600, y0: 0, y1: 1400, roof: ['#7d8ea3', '#5d6f85', '#93a7bd', '#6b7f95'], ground: '#b9b3a4' },
  { name: 'Barrio Sol', x0: 0, x1: 1000, y0: 600, y1: 2200, roof: ['#e07856', '#e8a34c', '#d95f6e', '#f0c453'], ground: '#c9a06a' },
  { name: 'Old Port', x0: 0, x1: 1000, y0: 0, y1: 600, roof: ['#8a7a68', '#a08b74', '#77695a'], ground: '#b0a58f' },
  { name: 'Beachfront', x0: 0, x1: 3200, y0: 2200, y1: 2400, roof: ['#f5ead0', '#eed9a8'], ground: '#e6d199' },
];

export const CAR_COLORS = [
  '#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#16a085',
  '#e67e22', '#8e44ad', '#7f8c8d', '#d35400', '#27ae60', '#b03a2e',
];

export const PED_COLORS = [
  '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22',
  '#fd79a8', '#00cec9', '#6c5ce7', '#d63031', '#00b894', '#fdcb6e',
];
