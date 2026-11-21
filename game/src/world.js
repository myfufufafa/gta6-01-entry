// The city of Solmar Bay and the game's state. One job: build a deterministic
// open world (roads, blocks, buildings, parks, landmarks) and the fresh state
// every run starts from. All names and places are original inventions.
// Districts: Old Port (NW), Downtown (centre), Marina (NE), Barrio Sol (SW),
// Beachfront (south sand and water).

import { WORLD, DISTRICTS, CAR_COLORS, PED_COLORS, TRAFFIC, MONEY, SEED } from './config.js';
import { mulberry32, pick, range, rangeInt, clamp } from './random.js';

// Places the story uses. Every coordinate sits on or beside a road so the
// player can always reach it on foot or by car.
export const PLACES = {
  garage: { x: 600, y: 1200, label: "Sal's Garage" },
  safehouse: { x: 2600, y: 1800, label: 'Safehouse' },
  plaza: { x: 1400, y: 600, label: 'Palm Plaza' },
  bank: { x: 1600, y: 600, label: 'Bay Bank' },
  docks: { x: 400, y: 200, label: 'Old Docks' },
  hospital: { x: 2200, y: 600, label: 'Solmar General' },
  policeHq: { x: 1400, y: 1800, label: 'Police HQ' },
  marinaCar: { x: 2960, y: 200, label: 'Marina' },
  stadium: { x: 2200, y: 1400, label: 'Bay Stadium' },
  spawn: { x: 600, y: 1350, label: 'Home' },
};

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[1];
}

export function isRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of WORLD.roadsX) if (Math.abs(x - rx) <= half) return true;
  for (const ry of WORLD.roadsY) if (Math.abs(y - ry) <= half) return true;
  return false;
}

export function isWater(x, y) {
  return y >= WORLD.waterTop || x >= WORLD.marinaLeft;
}

export function isBeach(x, y) {
  return y >= WORLD.beachTop && y < WORLD.waterTop;
}

export function nearestRoadX(x) {
  let best = WORLD.roadsX[0];
  for (const rx of WORLD.roadsX) if (Math.abs(rx - x) < Math.abs(best - x)) best = rx;
  return best;
}

export function nearestRoadY(y) {
  let best = WORLD.roadsY[0];
  for (const ry of WORLD.roadsY) if (Math.abs(ry - y) < Math.abs(best - y)) best = ry;
  return best;
}

/** Build the city. Deterministic for a given seed. */
export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  const half = WORLD.roadWidth / 2;

  // Landmark footprints: big named buildings, drawn with a label. Each one
  // sits fully inside one city block (between the roads, never across one),
  // so roads stay drivable and cars never spawn inside a building.
  const landmarks = [
    { x: 1080, y: 280, w: 240, h: 200, label: 'Palm Plaza', kind: 'mall' },
    { x: 1480, y: 680, w: 220, h: 200, label: 'Bay Bank', kind: 'bank' },
    { x: 1880, y: 680, w: 220, h: 200, label: 'Solmar General', kind: 'hospital' },
    { x: 1080, y: 1480, w: 220, h: 200, label: 'Police HQ', kind: 'police' },
    { x: 1880, y: 1080, w: 260, h: 220, label: 'Bay Stadium', kind: 'stadium' },
    { x: 280, y: 1080, w: 220, h: 200, label: "Sal's Garage", kind: 'garage' },
    { x: 2280, y: 1480, w: 200, h: 200, label: 'Safehouse', kind: 'house' },
    { x: 280, y: 280, w: 240, h: 200, label: 'Old Docks', kind: 'warehouse' },
  ];
  for (const lm of landmarks) {
    const d = districtAt(lm.x + lm.w / 2, lm.y + lm.h / 2);
    buildings.push({
      x: lm.x, y: lm.y, w: lm.w, h: lm.h, label: lm.label, kind: lm.kind,
      roof: lm.kind === 'hospital' ? '#e8e4d8' : pick(rng, d.roof),
      tall: lm.kind === 'bank' || lm.kind === 'mall',
    });
  }
  const landmarkRect = (x, y) => landmarks.some((lm) =>
    x < lm.x + lm.w + 40 && x + 60 > lm.x - 40 && y < lm.y + lm.h + 40 && y + 60 > lm.y - 40);

  // Ordinary blocks: one or two buildings, a park, or a parking lot.
  for (let i = 0; i < WORLD.roadsX.length - 1; i += 1) {
    for (let j = 0; j < WORLD.roadsY.length - 1; j += 1) {
      const x0 = WORLD.roadsX[i] + half + 14;
      const x1 = WORLD.roadsX[i + 1] - half - 14;
      const y0 = WORLD.roadsY[j] + half + 14;
      const y1 = WORLD.roadsY[j + 1] - half - 14;
      if (y0 > WORLD.beachTop - 80) continue; // beach strip stays open sand
      const roll = rng();
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (landmarkRect(x0, y0)) continue;
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 7; t += 1) {
          trees.push({ x: range(rng, x0 + 16, x1 - 16), y: range(rng, y0 + 16, y1 - 16), r: range(rng, 9, 15) });
        }
        continue;
      }
      if (roll < 0.28) continue; // open lot / parking, no building
      const d = districtAt(cx, cy);
      const split = rng() < 0.45;
      const spots = split
        ? [{ x: x0, y: y0, w: (x1 - x0) / 2 - 12, h: y1 - y0 }, { x: (x0 + x1) / 2 + 12, y: y0, w: (x1 - x0) / 2 - 12, h: y1 - y0 }]
        : [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
      for (const s of spots) {
        if (s.w < 60 || s.h < 60) continue;
        const bw = range(rng, 0.55, 0.8) * s.w;
        const bh = range(rng, 0.55, 0.8) * s.h;
        buildings.push({
          x: s.x + (s.w - bw) / 2, y: s.y + (s.h - bh) / 2, w: bw, h: bh,
          label: null, kind: 'block', roof: pick(rng, d.roof), tall: rng() < 0.3,
        });
      }
      if (rng() < 0.5) {
        trees.push({ x: range(rng, x0 + 10, x1 - 10), y: range(rng, y0 + 10, y1 - 10), r: range(rng, 8, 13) });
      }
    }
  }

  // Palm trees along the beachfront avenue.
  for (let x = 120; x < WORLD.width; x += 130) {
    trees.push({ x: x + range(rng, -20, 20), y: WORLD.beachTop - 30, r: 12 });
  }

  // Bay Coins: 10 collectibles in plazas, parks and the beach.
  const coins = [];
  const coinSpots = [
    { x: 1400, y: 480 }, { x: 600, y: 1000 }, { x: 2200, y: 1000 }, { x: 1000, y: 1800 },
    { x: 2600, y: 600 }, { x: 1800, y: 2200 }, { x: 800, y: 2240 }, { x: 3000, y: 1400 },
    { x: 400, y: 600 }, { x: 1400, y: 2200 },
  ];
  for (const c of coinSpots) coins.push({ x: c.x, y: c.y, taken: false });

  // Parking bays along road edges for stealable parked cars: 28 px off a
  // road centreline keeps the car on the road edge, clear of buildings.
  const parking = [];
  for (const rx of WORLD.roadsX) {
    for (const ry of WORLD.roadsY) {
      parking.push({ x: rx + 28, y: ry + 120 });
      parking.push({ x: rx - 28, y: ry - 120 });
    }
  }
  return { buildings, trees, parks, coins, parking };
}

/** Circle-vs-rectangle push-out. Mutates `e` ({x, y, radius}) if overlapping. */
export function collideBuildings(e, buildings) {
  for (const b of buildings) {
    const cx = clamp(e.x, b.x, b.x + b.w);
    const cy = clamp(e.y, b.y, b.y + b.h);
    const dx = e.x - cx;
    const dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < e.radius * e.radius) {
      if (d2 === 0) { e.y = b.y - e.radius; continue; }
      const d = Math.sqrt(d2);
      e.x = cx + (dx / d) * e.radius;
      e.y = cy + (dy / d) * e.radius;
    }
  }
}

/** True when a circle of radius `r` at (x, y) overlaps any building. */
export function hitsBuilding(x, y, r, buildings) {
  for (const b of buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- missions
// Five story missions, then free roam with repeatable courier jobs.
// Mara Solano, a courier who owes a debt, works it off for Sal Ortiz —
// an original story, written for this game.

export const MISSIONS = [
  {
    id: 'delivery', title: 'Mission 1 — First Delivery',
    briefing: "Sal: 'Mara, one package, Palm Plaza. No questions, no stops. The city is yours — drive or walk, your call.'",
    objective: 'Deliver the package to Palm Plaza',
    type: 'goto', target: { x: 1400, y: 600, r: 80 },
    reward: MONEY.missionRewards[0],
  },
  {
    id: 'hotwheels', title: 'Mission 2 — Hot Wheels',
    briefing: "Sal: 'A red Comet GT is parked at the Marina. Bring it to my garage. If the cops see you take it, run.'",
    objective: 'Steal the red Comet GT at the Marina, bring it to the garage',
    type: 'steal', target: { x: 2960, y: 200, r: 90 },
    reward: MONEY.missionRewards[1],
  },
  {
    id: 'payback', title: 'Mission 3 — Payback at the Docks',
    briefing: "Sal: 'Los Tiburones jumped my driver at the Old Docks. You have a pistol now — settle it. Watch your health.'",
    objective: 'Defeat the Tiburones crew at the Old Docks (4)',
    type: 'combat', target: { x: 400, y: 200, r: 130 },
    reward: MONEY.missionRewards[2],
  },
  {
    id: 'heatrun', title: 'Mission 4 — Heat Run',
    briefing: "Sal: 'Cops are all over you. Lose them and get to the Safehouse. Do not get busted.'",
    objective: 'Escape the police and reach the Safehouse',
    type: 'escape', target: { x: 2600, y: 1800, r: 80 },
    reward: MONEY.missionRewards[3],
  },
  {
    id: 'heist', title: 'Mission 5 — Bay Heist',
    briefing: "Sal: 'Last one. Grab the cash bag from Bay Bank and bring it to the garage. The whole city will be watching.'",
    objective: 'Take the cash bag from Bay Bank, deliver it to the garage',
    type: 'deliver', target: { x: 1600, y: 600, r: 80 },
    reward: MONEY.missionRewards[4],
  },
];

// ------------------------------------------------------------ state factory

export function makeTrafficCar(rng, city) {
  const vertical = rng() < 0.5;
  const color = pick(rng, CAR_COLORS);
  if (vertical) {
    const rx = pick(rng, WORLD.roadsX);
    const lane = rng() < 0.5 ? -18 : 18;
    const dir = rng() < 0.5 ? 1 : -1;
    return {
      kind: 'traffic', x: rx + lane, y: range(rng, 100, WORLD.height - 100),
      angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2, dir, vertical: true,
      speed: range(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
      cruise: range(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
      color, length: 50, width: 25, health: 100,
    };
  }
  const ry = pick(rng, WORLD.roadsY);
  const lane = rng() < 0.5 ? -18 : 18;
  const dir = rng() < 0.5 ? 1 : -1;
  return {
    kind: 'traffic', x: range(rng, 100, WORLD.width - 100), y: ry + lane,
    angle: dir > 0 ? 0 : Math.PI, dir, vertical: false,
    speed: range(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
    cruise: range(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
    color, length: 50, width: 25, health: 100,
  };
}

export function makePed(rng) {
  const vertical = rng() < 0.5;
  if (vertical) {
    const rx = pick(rng, WORLD.roadsX);
    return {
      x: rx + (rng() < 0.5 ? -48 : 48), y: range(rng, 100, WORLD.height - 100),
      vx: 0, vy: rng() < 0.5 ? 1 : -1, speed: range(rng, 34, 62),
      color: pick(rng, PED_COLORS), state: 'walk', down: 0, fleeT: 0, vertical: true,
    };
  }
  const ry = pick(rng, WORLD.roadsY);
  return {
    x: range(rng, 100, WORLD.width - 100), y: ry + (rng() < 0.5 ? -48 : 48),
    vx: rng() < 0.5 ? 1 : -1, vy: 0, speed: range(rng, 34, 62),
    color: pick(rng, PED_COLORS), state: 'walk', down: 0, fleeT: 0, vertical: false,
  };
}

export function createState() {
  const city = buildCity(SEED);
  const rng = mulberry32(SEED + 7);
  const traffic = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) traffic.push(makeTrafficCar(rng, city));
  const peds = [];
  for (let i = 0; i < TRAFFIC.pedCount; i += 1) peds.push(makePed(rng));
  const parked = [];
  const used = new Set();
  for (let i = 0; i < 10; i += 1) {
    let spot;
    let tries = 0;
    do {
      spot = city.parking[Math.floor(rng() * city.parking.length)];
      tries += 1;
    } while ((used.has(`${spot.x},${spot.y}`) || hitsBuilding(spot.x, spot.y, 30, city.buildings)) && tries < 40);
    if (hitsBuilding(spot.x, spot.y, 30, city.buildings)) continue; // never park inside a building
    used.add(`${spot.x},${spot.y}`);
    // Park facing along the nearest road, so the car can pull away cleanly.
    const alongVertical = Math.abs(spot.x - nearestRoadX(spot.x)) < Math.abs(spot.y - nearestRoadY(spot.y));
    parked.push({
      kind: 'parked', x: spot.x, y: spot.y,
      angle: alongVertical
        ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (rng() < 0.5 ? 0 : Math.PI),
      color: pick(rng, CAR_COLORS), length: 50, width: 25, health: 100,
      missionCar: false,
    });
  }
  return {
    seed: SEED,
    city,
    time: 17 * 3600 + 24 * 60, // 17:24, golden hour over the bay
    playtime: 0,
    screen: 'title',
    overKind: null,
    storyComplete: false,
    player: {
      x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
      health: 100, money: MONEY.startCash, wanted: 0, wantedTimer: 0,
      hasPistol: false, ammo: 0, punchCd: 0, shootCd: 0,
      inCar: null, onFoot: true, bustedT: 0, invulnT: 0,
    },
    car: null,
    traffic,
    peds,
    parked,
    cops: [],
    copCars: [],
    thugs: [],
    bullets: [],
    particles: [],
    pickups: [],
    missionIndex: 0,
    mission: null,
    missionStage: 'idle', // idle | active | done
    banner: null,
    bannerT: 0,
    courier: null,
    coinsTaken: 0,
    stats: { earned: 0, crimes: 0, carsStolen: 0, thugsDown: 0, shotsFired: 0 },
    camera: { x: PLACES.spawn.x, y: PLACES.spawn.y },
    damageFlash: 0,
    message: null,
    rngState: 0,
  };
}

/** A parked mission car: the red Comet GT at the Marina. */
export function spawnMissionCar(state) {
  const car = {
    kind: 'mission', x: PLACES.marinaCar.x, y: PLACES.marinaCar.y, angle: Math.PI / 2,
    color: '#c0392b', length: 54, width: 26, health: 100, missionCar: true, speed: 0,
  };
  state.parked.push(car);
  return car;
}

export function spawnThugs(state, count) {
  const rng = mulberry32(SEED + 99 + state.missionIndex * 13);
  for (let i = 0; i < count; i += 1) {
    // Thugs wait on the road north of the warehouse, never inside it.
    state.thugs.push({
      x: PLACES.docks.x + range(rng, -140, 140), y: PLACES.docks.y + range(rng, -50, 30),
      angle: 0, health: 100, shootCd: range(rng, 0.5, 1.6), speed: range(rng, 95, 130),
      color: '#2d3436', down: false,
    });
  }
}

export function spawnCopCar(state, nearX, nearY) {
  const rng = mulberry32((Math.floor(state.playtime * 60) + state.copCars.length * 31 + 5) >>> 0);
  const rx = nearestRoadX(nearX + range(rng, -500, 500));
  const ry = nearestRoadY(nearY + range(rng, -500, 500));
  const onVertical = rng() < 0.5;
  const car = {
    kind: 'cop', x: onVertical ? rx : clamp(nearX + range(rng, -400, 400), 60, WORLD.width - 60),
    y: onVertical ? clamp(nearY + range(rng, -400, 400), 60, WORLD.height - 60) : ry,
    angle: 0, speed: 0, color: '#1c2733', length: 52, width: 26, health: 100,
    siren: rng(),
  };
  state.copCars.push(car);
  return car;
}

export function spawnFootCop(state, nearX, nearY) {
  const rng = mulberry32((Math.floor(state.playtime * 60) + state.cops.length * 17 + 11) >>> 0);
  state.cops.push({
    x: clamp(nearX + range(rng, -260, 260), 40, WORLD.width - 40),
    y: clamp(nearY + range(rng, -260, 260), 40, WORLD.height - 40),
    angle: 0, speed: 200, color: '#1c2733', state: 'chase', down: 0,
  });
}

export { rangeInt };
