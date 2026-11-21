// Staged screenshot scenes. One job: put the real game into a photogenic,
// deterministic state for each ?shot= name, then the boot code renders one
// frame of it. Every pixel comes from the game's own renderer and state:
// the title menu, a drive through traffic, a police chase, a mission fight.

import { WORLD } from './config.js';
import { MISSIONS, PLACES, spawnMissionCar, spawnThugs } from './world.js';
import { clamp } from './random.js';

const STEP = 1 / 60;

// Move traffic and pedestrians forward for `seconds` so the scene is alive
// (cars mid-road, people mid-sidewalk) without any player input.
function settle(state, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    for (const c of state.traffic) {
      c.x += Math.cos(c.angle) * c.speed * STEP;
      c.y += Math.sin(c.angle) * c.speed * STEP;
      if (c.x < 40) c.x = WORLD.width - 80;
      if (c.x > WORLD.width - 40) c.x = 80;
      if (c.y < 40) c.y = WORLD.height - 80;
      if (c.y > WORLD.height - 40) c.y = 80;
    }
    for (const p of state.peds) {
      if (p.down > 0) continue;
      if (p.vertical) p.y += p.vy * p.speed * STEP;
      else p.x += p.vx * p.speed * STEP;
      p.x = clamp(p.x, 30, WORLD.width - 30);
      p.y = clamp(p.y, 30, WORLD.height - 30);
    }
  }
}

function aimCamera(state) {
  const p = state.player;
  state.camera.x = clamp(p.x, 1280 / 2 - 40, WORLD.width - 1280 / 2 + 40);
  state.camera.y = clamp(p.y, 720 / 2 - 40, WORLD.height - 720 / 2 + 40);
}

function startMissionState(state, index) {
  const def = MISSIONS[index];
  state.missionIndex = index;
  state.mission = { def, stage: 0, thugsLeft: 0, hasBag: false };
  state.missionStage = 'active';
  state.missionTitle = def.title;
  state.objectiveText = def.objective;
  state.missionTarget = { x: def.target.x, y: def.target.y };
}

/** Stage `name` on `state` and return the screen to render + banner. */
export function stageShot(name, state) {
  const p = state.player;
  if (name === 'start') {
    state.screen = 'title';
    state.menuIndex = 0;
    state.showHelp = false;
    state.time = 17 * 3600 + 24 * 60;
    state.camera.x = 1600;
    state.camera.y = 900;
    settle(state, 2);
    return { screen: 'title', banner: null };
  }

  if (name === 'drive') {
    // Mara driving a blue sedan down a Downtown avenue, traffic around her,
    // mission 1 active on the HUD with the minimap live.
    state.screen = 'play';
    const car = {
      kind: 'player', x: 1400, y: 1060, angle: 0, speed: 300,
      color: '#2980b9', length: 52, width: 26, health: 100, missionCar: false,
    };
    state.car = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    p.money = 190;
    startMissionState(state, 0);
    // traffic ahead and behind on the same avenue
    state.traffic[0].x = 1560; state.traffic[0].y = 1018; state.traffic[0].angle = 0; state.traffic[0].speed = 150;
    state.traffic[1].x = 1240; state.traffic[1].y = 1042; state.traffic[1].angle = 0; state.traffic[1].speed = 170;
    state.traffic[2].x = 1400; state.traffic[2].y = 580; state.traffic[2].angle = Math.PI / 2; state.traffic[2].speed = 140;
    settle(state, 1.5);
    aimCamera(state);
    return { screen: 'play', banner: null };
  }

  if (name === 'chase') {
    // Wanted level 3: two police cars on Mara's tail, sirens flashing,
    // mission 4 (Heat Run) on the HUD.
    state.screen = 'play';
    const car = {
      kind: 'player', x: 1800, y: 1400, angle: Math.PI / 2, speed: 420,
      color: '#c0392b', length: 52, width: 26, health: 82, missionCar: false,
    };
    state.car = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    p.angle = Math.PI / 2;
    p.money = 640;
    p.wanted = 3;
    startMissionState(state, 3);
    state.objectiveText = 'Escape the police and reach the Safehouse';
    state.copCars = [
      { kind: 'cop', x: 1800, y: 1180, angle: Math.PI / 2, speed: 430, color: '#1c2733', length: 52, width: 26, health: 100, siren: 0.2 },
      { kind: 'cop', x: 1748, y: 1240, angle: Math.PI / 2, speed: 410, color: '#1c2733', length: 52, width: 26, health: 100, siren: 0.7 },
    ];
    state.cops = [
      { x: 2200, y: 1400, angle: 0, speed: 200, color: '#1c2733', state: 'chase', down: 0 },
    ];
    state.traffic[0].x = 1980; state.traffic[0].y = 1418; state.traffic[0].angle = 0; state.traffic[0].speed = 150;
    state.traffic[1].x = 1620; state.traffic[1].y = 1382; state.traffic[1].angle = Math.PI; state.traffic[1].speed = 160;
    state.damageFlash = 0.25;
    settle(state, 1);
    aimCamera(state);
    return { screen: 'play', banner: null }; // no banner: it would cover the chase
  }

  // 'mission' (default): on-foot firefight at the Old Docks, mission 3.
  // Mara stands on the road north of the warehouse, facing the crew.
  state.screen = 'play';
  p.x = PLACES.docks.x + 60;
  p.y = PLACES.docks.y - 20;
  p.angle = Math.PI / 2; // facing south, toward the two thugs still standing
  p.onFoot = true;
  p.hasPistol = true;
  p.ammo = 18;
  p.health = 78;
  p.money = 490;
  p.wanted = 1;
  startMissionState(state, 2);
  state.objectiveText = 'Defeat the Tiburones crew at the Old Docks (2 left)';
  spawnThugs(state, 4);
  state.thugs[0].down = true;
  state.thugs[1].down = true;
  state.thugs[2].x = PLACES.docks.x + 30;
  state.thugs[2].y = PLACES.docks.y + 40;
  state.thugs[2].health = 45;
  state.thugs[3].x = PLACES.docks.x + 130;
  state.thugs[3].y = PLACES.docks.y + 60;
  state.thugs[3].health = 70;
  state.bullets = [
    { x: p.x + 10, y: p.y + 40, vx: 0, vy: 780, life: 0.5, from: 'player', damage: 34 },
  ];
  state.particles = [
    { x: state.thugs[2].x, y: state.thugs[2].y, vx: 40, vy: -30, life: 0.5, max: 0.9, color: '#e74c3c', size: 4 },
    { x: state.thugs[2].x + 8, y: state.thugs[2].y - 6, vx: -50, vy: 20, life: 0.4, max: 0.9, color: '#f5d76e', size: 3 },
  ];
  state.pickups = [{ kind: 'health', x: p.x + 120, y: p.y + 40 }];
  settle(state, 0.5);
  aimCamera(state);
  return { screen: 'play', banner: null }; // HUD already names the mission
}
