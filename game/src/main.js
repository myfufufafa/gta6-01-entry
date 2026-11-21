// Solmar Bay — game loop and every system: walking, driving, stealing cars,
// traffic, pedestrians, wanted level and police, combat, missions and story,
// HUD state, save/load, staged screenshots and a headless self-test.
// Canvas 2D, standard browser APIs only, no network.

import { WORLD, STEP, PLAYER, CAR, WANTED, MONEY, SAVE_KEY, SEED } from './config.js';
import { mulberry32, clamp, angleDiff, dist } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import {
  createState, buildCity, MISSIONS, PLACES, isRoad, isWater, isBeach,
  collideBuildings, hitsBuilding, makeTrafficCar, makePed, spawnMissionCar,
  spawnThugs, spawnCopCar, spawnFootCop, nearestRoadX, nearestRoadY,
} from './world.js';
import { render, VIEW_W, VIEW_H } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const selftest = params.get('selftest') === '1';

const input = new Input(canvas);
const audio = new AudioEngine();
input.onFirstGesture = () => audio.unlock();

const state = createState();
state.rng = mulberry32(SEED + 7);
state.hasSave = false;
try {
  state.hasSave = !!localStorage.getItem(SAVE_KEY);
} catch { state.hasSave = false; }
state.menuIndex = 0;
state.showHelp = false;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function showBanner(text, sub, color, dur) {
  state.banner = text;
  state.bannerSub = sub || null;
  state.bannerColor = color || '#f1c40f';
  state.bannerT = dur || 3;
}

function addWanted(n, silent) {
  const p = state.player;
  const before = p.wanted;
  p.wanted = clamp(p.wanted + n, 0, WANTED.max);
  p.wantedTimer = 0;
  if (p.wanted > before) {
    state.stats.crimes += 1;
    if (!silent) audio.wantedUp();
  }
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = (0.3 + state.rng() * 0.7) * (speed || 160);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + state.rng() * 0.4, max: 0.9, color, size: 2 + state.rng() * 3,
    });
  }
}

function damagePlayer(amount, source) {
  const p = state.player;
  if (p.invulnT > 0 || state.screen !== 'play') return;
  p.health -= amount;
  state.damageFlash = 1;
  audio.punch();
  if (p.health <= 0) {
    p.health = 0;
    gameOver(source === 'cop' ? 'busted' : 'wasted');
  }
}

function gameOver(kind) {
  state.screen = 'over';
  state.overKind = kind;
  const p = state.player;
  const fine = kind === 'busted' ? MONEY.bustedFine : MONEY.wastedFine;
  p.money = Math.max(0, p.money - fine);
  audio.busted();
  setStatus(kind === 'busted' ? 'Busted by the Solmar Bay police.' : 'Wasted. Mara is down.');
}

function respawn() {
  const p = state.player;
  const place = state.overKind === 'busted' ? PLACES.policeHq : PLACES.hospital;
  p.x = place.x;
  p.y = place.y;
  p.health = PLAYER.healthMax;
  p.wanted = 0;
  p.wantedTimer = 0;
  p.invulnT = 3;
  p.bustedT = 0;
  if (state.car) {
    state.parked.push(state.car);
    state.car = null;
  }
  p.onFoot = true;
  state.cops = [];
  state.copCars = [];
  state.bullets = [];
  state.screen = 'play';
  if (state.mission) startMission(state.missionIndex, true);
  showBanner('BACK ON THE STREETS', 'Mara is back — the story continues.', '#2ecc71', 2.5);
}

// ------------------------------------------------------------- save / load

function saveGame(silent) {
  const p = state.player;
  const data = {
    v: 1, missionIndex: state.missionIndex, storyComplete: state.storyComplete,
    money: p.money, health: p.health, hasPistol: p.hasPistol, ammo: p.ammo,
    x: p.x, y: p.y, coinsTaken: state.coinsTaken,
    coins: state.city.coins.map((c) => c.taken),
    playtime: state.playtime, earned: state.stats.earned,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.hasSave = true;
    if (!silent) showBanner('GAME SAVED', 'Progress is stored on this machine.', '#2ecc71', 2);
    return true;
  } catch {
    if (!silent) showBanner('SAVE FAILED', 'This browser blocked local storage.', '#e74c3c', 2);
    return false;
  }
}

function loadGame() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch { data = null; }
  if (!data || data.v !== 1) return false;
  const p = state.player;
  state.missionIndex = data.missionIndex || 0;
  state.storyComplete = !!data.storyComplete;
  p.money = data.money ?? MONEY.startCash;
  p.health = data.health ?? PLAYER.healthMax;
  p.hasPistol = !!data.hasPistol;
  p.ammo = data.ammo ?? 0;
  p.x = data.x ?? PLACES.spawn.x;
  p.y = data.y ?? PLACES.spawn.y;
  p.wanted = 0;
  state.coinsTaken = data.coinsTaken || 0;
  if (Array.isArray(data.coins)) {
    data.coins.forEach((taken, i) => { if (state.city.coins[i]) state.city.coins[i].taken = !!taken; });
  }
  state.playtime = data.playtime || 0;
  state.stats.earned = data.earned || 0;
  state.camera.x = p.x;
  state.camera.y = p.y;
  if (state.missionIndex >= MISSIONS.length) {
    state.mission = null;
    state.missionTitle = 'FREE ROAM';
    state.objectiveText = 'Story complete — press J for a courier job.';
    state.missionTarget = null;
  } else {
    startMission(state.missionIndex, true);
  }
  return true;
}

// --------------------------------------------------------------- missions

function startMission(index, quiet) {
  const def = MISSIONS[index];
  if (!def) {
    state.mission = null;
    state.missionTitle = 'FREE ROAM';
    state.objectiveText = 'Story complete — press J for a courier job.';
    state.missionTarget = null;
    return;
  }
  state.missionIndex = index;
  state.mission = { def, stage: 0, thugsLeft: 0, hasBag: false };
  state.missionStage = 'active';
  state.missionTitle = def.title;
  state.objectiveText = def.objective;
  state.missionTarget = { x: def.target.x, y: def.target.y };
  state.thugs = [];
  if (def.id === 'hotwheels') spawnMissionCar(state);
  if (def.id === 'payback') {
    state.player.hasPistol = true;
    state.player.ammo = Math.max(state.player.ammo, PLAYER.pistolAmmoStart);
    spawnThugs(state, 4);
    state.mission.thugsLeft = 4;
  }
  if (def.id === 'heatrun') {
    state.player.wanted = 3;
    state.player.wantedTimer = 0;
  }
  if (!quiet) {
    showBanner(def.title, def.briefing, '#f1c40f', 4.5);
    audio.missionStart();
    setStatus(`${def.title}: ${def.objective}`);
  }
}

function completeMission() {
  const def = state.mission.def;
  const reward = def.reward;
  state.player.money += reward;
  state.stats.earned += reward;
  state.missionIndex += 1;
  state.mission = null;
  state.missionStage = 'done';
  state.missionTarget = null;
  state.cops = [];
  state.copCars = [];
  audio.missionComplete();
  if (state.missionIndex >= MISSIONS.length) {
    state.storyComplete = true;
    state.screen = 'complete';
    state.missionTitle = 'FREE ROAM';
    state.objectiveText = 'Story complete — press J for a courier job.';
    saveGame(true);
    return;
  }
  showBanner('MISSION COMPLETE', `+${reward} — ${def.title}`, '#2ecc71', 3);
  setStatus(`Mission complete: ${def.title}. +$${reward}.`);
  saveGame(true);
  window.setTimeout(() => {
    if (state.screen === 'play') startMission(state.missionIndex);
  }, 2600);
}

function updateMission(dt) {
  const m = state.mission;
  if (!m) return;
  const p = state.player;
  const def = m.def;
  const dTarget = dist(p.x, p.y, def.target.x, def.target.y);
  if (def.id === 'delivery' && dTarget < def.target.r) completeMission();
  else if (def.id === 'hotwheels') {
    if (m.stage === 0 && state.car && state.car.missionCar) {
      m.stage = 1;
      state.objectiveText = "Bring the Comet GT to Sal's Garage";
      state.missionTarget = { x: PLACES.garage.x, y: PLACES.garage.y };
      showBanner('CAR STOLEN', "Get the Comet GT to Sal's Garage.", '#f1c40f', 2.5);
    } else if (m.stage === 1 && state.car && state.car.missionCar
      && dist(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 110) {
      completeMission();
    }
  } else if (def.id === 'payback') {
    const left = state.thugs.filter((t) => !t.down).length;
    state.objectiveText = `Defeat the Tiburones crew at the Old Docks (${left} left)`;
    if (left === 0 && state.thugs.length > 0) completeMission();
  } else if (def.id === 'heatrun') {
    if (dist(p.x, p.y, PLACES.safehouse.x, PLACES.safehouse.y) < def.target.r) {
      p.wanted = 0;
      completeMission();
    }
  } else if (def.id === 'heist') {
    if (m.stage === 0 && dTarget < def.target.r) {
      m.stage = 1;
      m.hasBag = true;
      addWanted(2, true);
      state.objectiveText = "Cash bag taken — deliver it to Sal's Garage";
      state.missionTarget = { x: PLACES.garage.x, y: PLACES.garage.y };
      showBanner('CASH BAG TAKEN', 'The alarm is up — get to the garage!', '#e74c3c', 3);
    } else if (m.stage === 1 && dist(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 110) {
      completeMission();
    }
  }
  // courier job (free-roam side activity)
  if (state.courier && dist(p.x, p.y, state.courier.x, state.courier.y) < 80) {
    p.money += state.courier.reward;
    state.stats.earned += state.courier.reward;
    showBanner('DELIVERY DONE', `+${state.courier.reward} for the courier run.`, '#2ecc71', 2.5);
    audio.pickup();
    state.courier = null;
    state.missionTarget = state.mission ? { x: state.mission.def.target.x, y: state.mission.def.target.y } : null;
    if (!state.mission) state.objectiveText = 'Free roam — press J for a courier job.';
  }
}

function startCourierJob() {
  if (state.courier || state.mission) return;
  const rx = PLACES.garage.x;
  const ry = PLACES.garage.y;
  const tx = nearestRoadX(rx + (state.rng() < 0.5 ? -1400 : 1400));
  const ty = nearestRoadY(ry + (state.rng() < 0.5 ? -800 : 800));
  state.courier = { x: tx, y: ty, reward: MONEY.courierReward };
  state.missionTarget = { x: tx, y: ty };
  state.objectiveText = `Courier job: deliver to (${tx}, ${ty}) — +$${MONEY.courierReward}`;
  showBanner('COURIER JOB', 'A customer waits across town. Deliver fast.', '#f1c40f', 2.5);
}

// ------------------------------------------------------------------ combat

function fireBullet(from, x, y, angle, damage) {
  state.bullets.push({
    x, y, vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed,
    life: 0.9, from, damage,
  });
  burst(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, '#ffd76e', 3, 90);
}

function playerShoot(angle) {
  const p = state.player;
  if (p.shootCd > 0) return;
  if (p.ammo <= 0) {
    p.shootCd = 0.3;
    return;
  }
  p.shootCd = PLAYER.shootCooldown;
  p.ammo -= 1;
  p.angle = angle;
  state.stats.shotsFired += 1;
  fireBullet('player', p.x + Math.cos(angle) * 18, p.y + Math.sin(angle) * 18, angle, PLAYER.bulletDamage);
  audio.shoot();
}

function playerPunch(angle) {
  const p = state.player;
  if (p.punchCd > 0) return;
  p.punchCd = PLAYER.punchCooldown;
  p.angle = angle;
  audio.punch();
  const hx = p.x + Math.cos(angle) * PLAYER.punchRange;
  const hy = p.y + Math.sin(angle) * PLAYER.punchRange;
  const hit = (list, radius, onHit) => {
    for (const e of list) {
      if (e.down) continue;
      if (dist(hx, hy, e.x, e.y) < radius + PLAYER.punchRange * 0.6) { onHit(e); return true; }
    }
    return false;
  };
  if (hit(state.thugs, 14, (t) => { t.health -= PLAYER.punchDamage; burst(t.x, t.y, '#fff', 4, 120); })) return;
  if (hit(state.cops, 14, (c) => { c.down = true; addWanted(1); burst(c.x, c.y, '#fff', 4, 120); })) return;
  if (hit(state.peds, 12, (pd) => { pd.down = 4; addWanted(1); burst(pd.x, pd.y, '#fff', 4, 120); })) return;
}

// -------------------------------------------------------------- car logic

function nearestStealable(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  const consider = (car) => {
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  };
  for (const c of state.parked) consider(c);
  for (const c of state.traffic) consider(c);
  return best;
}

function enterCar(car) {
  const p = state.player;
  if (car.health <= 0) {
    showBanner('WRECKED', 'That car is finished — find another.', '#e74c3c', 2);
    return;
  }
  const wasOccupied = car.kind === 'traffic';
  state.parked = state.parked.filter((c) => c !== car);
  state.traffic = state.traffic.filter((c) => c !== car);
  car.speed = 0;
  state.car = car;
  p.onFoot = false;
  audio.carDoor();
  state.stats.carsStolen += 1;
  if (wasOccupied) {
    // the driver flees on foot
    state.peds.push({
      x: car.x + 30, y: car.y + 30, vx: 0, vy: 1, speed: 120,
      color: '#e74c3c', state: 'flee', down: 0, fleeT: 5, vertical: true,
    });
    addWanted(1);
    showBanner('CAR STOLEN', 'That was somebody’s ride — the cops noticed.', '#e74c3c', 2);
  } else if (car.missionCar) {
    showBanner('COMET GT', 'Nice wheels. Now get it to the garage.', '#f1c40f', 2);
  } else {
    const copNear = state.copCars.some((c) => dist(c.x, c.y, car.x, car.y) < 450)
      || state.cops.some((c) => dist(c.x, c.y, car.x, car.y) < 450);
    if (copNear) addWanted(WANTED.stealHeat);
  }
}

function exitCar() {
  const p = state.player;
  const car = state.car;
  if (!car) return;
  car.speed = 0;
  const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 34, y: car.y + Math.sin(car.angle + Math.PI / 2) * 34 };
  p.x = clamp(side.x, 30, WORLD.width - 30);
  p.y = clamp(side.y, 30, WORLD.height - 30);
  p.angle = car.angle;
  p.onFoot = true;
  state.car = null;
  state.parked.push(car);
  audio.carDoor();
}

// ------------------------------------------------------------ update: play

function updatePlayerOnFoot(dt) {
  const p = state.player;
  const mv = input.moveVector();
  const running = input.held('ShiftLeft') || input.held('ShiftRight');
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.x += mv.x * speed * dt;
  p.y += mv.y * speed * dt;
  p.x = clamp(p.x, 24, WORLD.width - 24);
  p.y = clamp(p.y, 24, WORLD.height - 24);
  if (isWater(p.x, p.y)) {
    p.x -= mv.x * speed * dt;
    p.y -= mv.y * speed * dt;
  }
  // collideBuildings mutates the body object we pass it:
  const body = { x: p.x, y: p.y, radius: PLAYER.radius };
  collideBuildings(body, state.city.buildings);
  p.x = body.x;
  p.y = body.y;
  // aim follows the mouse
  const rect = canvas.getBoundingClientRect();
  const scaleX = VIEW_W / rect.width;
  const scaleY = VIEW_H / rect.height;
  const mx = input.mouseX * scaleX + state.camera.x - VIEW_W / 2;
  const my = input.mouseY * scaleY + state.camera.y - VIEW_H / 2;
  p.angle = Math.atan2(my - p.y, mx - p.x);
  if (mv.x !== 0 || mv.y !== 0) p.moveAngle = Math.atan2(mv.y, mv.x);

  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (input.mouseClicked || input.held('KeyF')) {
    if (p.hasPistol && input.mouseClicked) playerShoot(p.angle);
    else if (input.wasPressed('KeyF') || input.mouseClicked) playerPunch(p.angle);
  }
  if (input.wasPressed('KeyE')) {
    const car = nearestStealable(p.x, p.y, 70);
    if (car) enterCar(car);
  }
}

function updatePlayerCar(dt) {
  const p = state.player;
  const car = state.car;
  if (!car) return;
  const fwd = input.held('KeyW') || input.held('ArrowUp');
  const back = input.held('KeyS') || input.held('ArrowDown');
  const left = input.held('KeyA') || input.held('ArrowLeft');
  const right = input.held('KeyD') || input.held('ArrowRight');
  const brake = input.held('Space');
  if (fwd) car.speed += CAR.accel * dt;
  if (back) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
  const onSand = isBeach(car.x, car.y);
  const drag = onSand ? CAR.drag * 2.2 : CAR.drag;
  car.speed -= car.speed * drag * dt;
  if (brake) car.speed -= car.speed * CAR.handbrakeDrag * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  if (Math.abs(car.speed) > 4) {
    const steerDir = car.speed >= 0 ? 1 : -1;
    if (left) car.angle -= CAR.steer * steerDir * dt * clamp(Math.abs(car.speed) / 160, 0.25, 1);
    if (right) car.angle += CAR.steer * steerDir * dt * clamp(Math.abs(car.speed) / 160, 0.25, 1);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // building collision: check nose and tail
  const noseX = nx + Math.cos(car.angle) * (CAR.length / 2);
  const noseY = ny + Math.sin(car.angle) * (CAR.length / 2);
  const tailX = nx - Math.cos(car.angle) * (CAR.length / 2);
  const tailY = ny - Math.sin(car.angle) * (CAR.length / 2);
  const hitWall = hitsBuilding(noseX, noseY, 12, state.city.buildings)
    || hitsBuilding(tailX, tailY, 12, state.city.buildings)
    || isWater(nx, ny);
  if (hitWall) {
    if (Math.abs(car.speed) > 220) {
      car.health -= 12;
      burst(noseX, noseY, '#f39c12', 8, 200);
      audio.crash();
    }
    car.speed *= -0.25;
  } else {
    car.x = clamp(nx, 30, WORLD.width - 30);
    car.y = clamp(ny, 30, WORLD.height - 30);
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (car.health <= 0) {
    burst(car.x, car.y, '#7f8c8d', 16, 240);
    showBanner('CAR WRECKED', 'The car gave up — get out and run.', '#e74c3c', 2.5);
    exitCar();
    return;
  }
  if (input.wasPressed('KeyE')) exitCar();
  audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
}

function updateTraffic(dt) {
  const p = state.player;
  for (const c of state.traffic) {
    // slow down for the car ahead
    let blocked = false;
    const aheadX = c.x + Math.cos(c.angle) * 62;
    const aheadY = c.y + Math.sin(c.angle) * 62;
    for (const o of state.traffic) {
      if (o !== c && dist(aheadX, aheadY, o.x, o.y) < 34) { blocked = true; break; }
    }
    if (!blocked && state.car && dist(aheadX, aheadY, state.car.x, state.car.y) < 40) blocked = true;
    const target = blocked ? 0 : c.cruise;
    c.speed += clamp(target - c.speed, -260 * dt, 180 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // turn at intersections
    const nearX = Math.abs(c.x - nearestRoadX(c.x)) < 26;
    const nearY = Math.abs(c.y - nearestRoadY(c.y)) < 26;
    if (c.vertical && nearY && state.rng() < 0.02) {
      c.vertical = false;
      c.angle = state.rng() < 0.5 ? 0 : Math.PI;
    } else if (!c.vertical && nearX && state.rng() < 0.02) {
      c.vertical = true;
      c.angle = state.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    // keep inside the world; respawn near the player when far away
    if (c.x < 40 || c.x > WORLD.width - 40 || c.y < 40 || c.y > WORLD.height - 40
      || dist(c.x, c.y, p.x, p.y) > 1500) {
      const fresh = makeTrafficCar(state.rng, state.city);
      fresh.x = clamp(p.x + (state.rng() < 0.5 ? -700 : 700), 80, WORLD.width - 80);
      fresh.y = clamp(p.y + (state.rng() < 0.5 ? -500 : 500), 80, WORLD.height - 80);
      Object.assign(c, fresh);
    }
  }
  // player car vs traffic: bump, slow, damage
  if (state.car) {
    for (const c of state.traffic) {
      if (dist(c.x, c.y, state.car.x, state.car.y) < 46) {
        if (Math.abs(state.car.speed) > 120) {
          state.car.health -= 4;
          c.health -= 6;
          burst((c.x + state.car.x) / 2, (c.y + state.car.y) / 2, '#f39c12', 6, 160);
          audio.crash();
        }
        state.car.speed *= 0.55;
        c.speed *= 0.5;
        c.x += Math.cos(Math.atan2(c.y - state.car.y, c.x - state.car.x)) * 12;
        c.y += Math.sin(Math.atan2(c.y - state.car.y, c.x - state.car.x)) * 12;
      }
    }
  }
  // player car vs pedestrians
  if (state.car && Math.abs(state.car.speed) > 90) {
    for (const pd of state.peds) {
      if (pd.down > 0) continue;
      if (dist(pd.x, pd.y, state.car.x, state.car.y) < 30) {
        pd.down = 4;
        pd.fleeT = 0;
        addWanted(WANTED.assaultHeat);
        burst(pd.x, pd.y, '#e74c3c', 8, 160);
        state.car.speed *= 0.7;
      }
    }
  }
}

function updatePeds(dt) {
  const p = state.player;
  for (const pd of state.peds) {
    if (pd.down > 0) {
      pd.down -= dt;
      continue;
    }
    const danger = state.bullets.some((b) => dist(b.x, b.y, pd.x, pd.y) < 160)
      || (state.car && Math.abs(state.car.speed) > 60 && dist(pd.x, pd.y, state.car.x, state.car.y) < 130);
    if (danger) pd.fleeT = 2.5;
    if (pd.fleeT > 0) {
      pd.fleeT -= dt;
      const away = Math.atan2(pd.y - p.y, pd.x - p.x);
      pd.x += Math.cos(away) * pd.speed * 2.2 * dt;
      pd.y += Math.sin(away) * pd.speed * 2.2 * dt;
    } else {
      if (pd.vertical) pd.y += pd.vy * pd.speed * dt;
      else pd.x += pd.vx * pd.speed * dt;
      // turn at intersections sometimes
      const nearX = Math.abs(pd.x - nearestRoadX(pd.x)) < 20;
      const nearY = Math.abs(pd.y - nearestRoadY(pd.y)) < 20;
      if (pd.vertical && nearY && state.rng() < 0.01) {
        pd.vertical = false;
        pd.vx = state.rng() < 0.5 ? 1 : -1;
        pd.vy = 0;
      } else if (!pd.vertical && nearX && state.rng() < 0.01) {
        pd.vertical = true;
        pd.vy = state.rng() < 0.5 ? 1 : -1;
        pd.vx = 0;
      }
    }
    pd.x = clamp(pd.x, 30, WORLD.width - 30);
    pd.y = clamp(pd.y, 30, WORLD.height - 30);
    if (isWater(pd.x, pd.y)) {
      pd.x = clamp(pd.x, 30, WORLD.marinaLeft - 40);
      pd.y = Math.min(pd.y, WORLD.waterTop - 30);
    }
  }
}

function updatePolice(dt) {
  const p = state.player;
  const wantCars = WANTED.copCarsPerStar[p.wanted] || 0;
  const wantFoot = WANTED.footCopsPerStar[p.wanted] || 0;
  // spawn to match the wanted level, one at a time
  if (state.copCars.length < wantCars && state.rng() < dt * 0.9) spawnCopCar(state, p.x, p.y);
  if (state.cops.length < wantFoot && state.rng() < dt * 0.9) spawnFootCop(state, p.x, p.y);
  if (p.wanted === 0) {
    state.copCars = [];
    state.cops = [];
    return;
  }
  // wanted decay: quiet, unseen time fades one star
  const nearestCop = Math.min(
    ...state.copCars.map((c) => dist(c.x, c.y, p.x, p.y)),
    ...state.cops.map((c) => dist(c.x, c.y, p.x, p.y)),
    9999,
  );
  if (nearestCop > 420) {
    p.wantedTimer += dt;
    if (p.wantedTimer > WANTED.decaySeconds) {
      p.wanted -= 1;
      p.wantedTimer = 0;
      showBanner('HEAT COOLING OFF', `Wanted level down to ${p.wanted}.`, '#2ecc71', 2);
    }
  } else {
    p.wantedTimer = 0;
  }
  // cop cars chase
  for (const c of state.copCars) {
    const desired = Math.atan2(p.y - c.y, p.x - c.x);
    const d = dist(c.x, c.y, p.x, p.y);
    c.angle += clamp(angleDiff(c.angle, desired), -2.4 * dt, 2.4 * dt);
    const targetSpeed = p.onFoot ? (d > 90 ? 380 : 0) : (d > 60 ? 430 : 300);
    c.speed += clamp(targetSpeed - c.speed, -500 * dt, 320 * dt);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!hitsBuilding(nx, ny, 12, state.city.buildings) && !isWater(nx, ny)) {
      c.x = nx;
      c.y = ny;
    } else {
      c.speed *= 0.4;
      c.angle += 0.6 * dt;
    }
    // ram the player
    if (state.car && dist(c.x, c.y, state.car.x, state.car.y) < 48) {
      state.car.health -= 14 * dt * 4;
      state.car.speed *= 0.94;
      if (state.rng() < dt * 2) burst(c.x, c.y, '#f39c12', 4, 120);
    }
    if (p.onFoot && dist(c.x, c.y, p.x, p.y) < 40) {
      damagePlayer(6 * dt * 4, 'cop');
    }
    if (d > 1700) {
      c.x = p.x + (state.rng() < 0.5 ? -600 : 600);
      c.y = p.y + (state.rng() < 0.5 ? -400 : 400);
    }
  }
  // foot cops chase and grab (a cop knocked down stays down)
  for (const c of state.cops) {
    if (c.down) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d > 900) continue;
    const a = Math.atan2(p.y - c.y, p.x - c.x);
    c.x += Math.cos(a) * c.speed * dt;
    c.y += Math.sin(a) * c.speed * dt;
    if (d < 30) {
      if (p.onFoot) {
        p.bustedT += dt;
        damagePlayer(8 * dt, 'cop');
        if (p.bustedT > 1.4) {
          p.bustedT = 0;
          gameOver('busted');
          return;
        }
      } else {
        // cop hangs on the door; shake him off by driving away
        c.x = state.car.x + Math.cos(c.angle + Math.PI / 2) * 30;
        c.y = state.car.y + Math.sin(c.angle + Math.PI / 2) * 30;
        if (Math.abs(state.car.speed) > 200) {
          c.down = true;
          c.x += 40;
        }
      }
    }
  }
  state.cops = state.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 1100);
  audio.setSiren(p.wanted >= 2, dt);
}

function updateThugs(dt) {
  const p = state.player;
  for (const t of state.thugs) {
    if (t.down) continue;
    const d = dist(t.x, t.y, p.x, p.y);
    if (d < 560) {
      const a = Math.atan2(p.y - t.y, p.x - t.x);
      t.angle = a;
      if (d > 260) {
        t.x += Math.cos(a) * t.speed * dt;
        t.y += Math.sin(a) * t.speed * dt;
      }
      t.shootCd -= dt;
      if (d < 420 && t.shootCd <= 0) {
        t.shootCd = 1.2 + state.rng() * 0.9;
        const spread = (state.rng() - 0.5) * 0.35;
        fireBullet('thug', t.x + Math.cos(a) * 16, t.y + Math.sin(a) * 16, a + spread, 9);
        audio.shoot();
      }
    }
    if (t.health <= 0 && !t.down) {
      t.down = true;
      state.stats.thugsDown += 1;
      burst(t.x, t.y, '#e74c3c', 10, 180);
      state.pickups.push({ kind: 'cash', x: t.x, y: t.y });
      if (state.rng() < 0.5) state.pickups.push({ kind: 'ammo', x: t.x + 24, y: t.y + 12 });
    }
  }
}

function updateBullets(dt) {
  const p = state.player;
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (hitsBuilding(b.x, b.y, 2, state.city.buildings)) {
      burst(b.x, b.y, '#f5d76e', 3, 80);
      b.life = 0;
      continue;
    }
    if (b.from === 'player') {
      let consumed = false;
      for (const t of state.thugs) {
        if (!t.down && dist(b.x, b.y, t.x, t.y) < 16) {
          t.health -= b.damage;
          burst(b.x, b.y, '#e74c3c', 5, 120);
          b.life = 0;
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const c of state.cops) {
        if (!c.down && dist(b.x, b.y, c.x, c.y) < 14) {
          c.down = true;
          addWanted(WANTED.killHeat);
          burst(b.x, b.y, '#2e7dff', 5, 120);
          b.life = 0;
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const pd of state.peds) {
        if (pd.down <= 0 && dist(b.x, b.y, pd.x, pd.y) < 12) {
          pd.down = 5;
          addWanted(WANTED.assaultHeat);
          b.life = 0;
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const c of state.copCars) {
        if (dist(b.x, b.y, c.x, c.y) < 28) {
          c.health -= b.damage;
          burst(b.x, b.y, '#95a5a6', 4, 100);
          if (c.health <= 0) {
            burst(c.x, c.y, '#f39c12', 18, 260);
            state.copCars = state.copCars.filter((o) => o !== c);
            addWanted(1);
          }
          b.life = 0;
          break;
        }
      }
    } else if (p.onFoot && dist(b.x, b.y, p.x, p.y) < 14) {
      damagePlayer(b.damage, 'thug');
      b.life = 0;
    } else if (!p.onFoot && state.car && dist(b.x, b.y, state.car.x, state.car.y) < 28) {
      state.car.health -= b.damage;
      burst(b.x, b.y, '#95a5a6', 4, 100);
      b.life = 0;
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

function updatePickups(dt) {
  const p = state.player;
  void dt;
  // Bay Coins
  for (const c of state.city.coins) {
    if (!c.taken && dist(p.x, p.y, c.x, c.y) < 28) {
      c.taken = true;
      state.coinsTaken += 1;
      p.money += MONEY.coinReward;
      state.stats.earned += MONEY.coinReward;
      audio.coin();
      showBanner('BAY COIN', `+$${MONEY.coinReward} — ${state.coinsTaken}/10 found.`, '#ffd700', 2);
    }
  }
  for (const pk of state.pickups) {
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      if (pk.kind === 'health') {
        p.health = Math.min(PLAYER.healthMax, p.health + 40);
        audio.pickup();
      } else if (pk.kind === 'ammo') {
        p.ammo += 18;
        audio.pickup();
      } else if (pk.kind === 'cash') {
        p.money += 60;
        state.stats.earned += 60;
        audio.coin();
      }
      pk.taken = true;
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);
  // health packs respawn on the road by the hospital now and then
  if (state.rng() < dt * 0.02 && !state.pickups.some((pk) => pk.kind === 'health')) {
    state.pickups.push({ kind: 'health', x: PLACES.hospital.x, y: PLACES.hospital.y + 60 });
  }
}

function updatePlay(dt) {
  const p = state.player;
  state.playtime += dt;
  state.time += dt * 2;
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.bustedT = Math.max(0, p.bustedT - dt * 0.5);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 2.2);
  if (state.bannerT > 0) state.bannerT -= dt;

  if (p.onFoot) updatePlayerOnFoot(dt);
  else updatePlayerCar(dt);
  if (state.screen !== 'play') return; // game over can trigger inside updates

  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateThugs(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateMission(dt);

  // particles
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // camera follows the player, clamped to the world
  const tx = clamp(p.x, VIEW_W / 2 - 40, WORLD.width - VIEW_W / 2 + 40);
  const ty = clamp(p.y, VIEW_H / 2 - 40, WORLD.height - VIEW_H / 2 + 40);
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);

  // global keys
  if (input.wasPressed('Escape')) {
    state.screen = 'pause';
    audio.setEngine(0, false);
  }
  if (input.wasPressed('KeyP')) saveGame(false);
  if (input.wasPressed('KeyM')) audio.setMuted(!audio.muted);
  if (input.wasPressed('KeyJ')) startCourierJob();
  if (!p.onFoot) audio.setEngine(Math.abs(state.car.speed) / CAR.maxSpeed, true);
  else audio.setEngine(0, false);
}

// ------------------------------------------------------------- menu screens

function updateTitle(dt) {
  // slow cinematic pan over Downtown while the menu is up
  state.time += dt;
  state.camera.x = 1600 + Math.sin(state.time * 0.05) * 500;
  state.camera.y = 1000 + Math.cos(state.time * 0.04) * 260;
  const lines = 3;
  if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
    state.menuIndex = (state.menuIndex + 1) % lines;
    audio.click();
  }
  if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
    state.menuIndex = (state.menuIndex - 1 + lines) % lines;
    audio.click();
  }
  if (input.mouseClicked) {
    const rect = canvas.getBoundingClientRect();
    const y = input.mouseY * (VIEW_H / rect.height);
    const idx = Math.floor((y - 274) / 46);
    if (idx >= 0 && idx < lines) state.menuIndex = idx;
  }
  if (state.showHelp) {
    if (input.wasPressed('Escape') || input.mouseClicked) {
      state.showHelp = false;
      input.mouseClicked = false;
    }
    return;
  }
  const choose = input.wasPressed('Enter') || input.wasPressed('Space') || input.mouseClicked;
  if (!choose) return;
  input.mouseClicked = false;
  audio.click();
  if (state.menuIndex === 0) {
    // fresh start
    const fresh = createState();
    fresh.rng = mulberry32(SEED + 7);
    fresh.hasSave = state.hasSave;
    Object.assign(state, fresh);
    state.screen = 'play';
    startMission(0);
    setStatus('Mission 1 — First Delivery: take the package to Palm Plaza.');
  } else if (state.menuIndex === 1) {
    if (state.hasSave && loadGame()) {
      state.screen = 'play';
      showBanner('WELCOME BACK', 'Your save is loaded — the city waited for you.', '#2ecc71', 2.5);
    } else {
      showBanner('NO SAVE YET', 'Play a New Game first.', '#e74c3c', 2);
      state.menuIndex = 0;
    }
  } else {
    state.showHelp = true;
  }
}

// ------------------------------------------------------------ main loop

let last = performance.now();
let acc = 0;

function frame(now) {
  const dtMs = Math.min(100, now - last);
  last = now;
  acc += dtMs / 1000;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    if (state.screen === 'play') updatePlay(STEP);
    else if (state.screen === 'title') updateTitle(STEP);
    else if (state.screen === 'pause') {
      if (input.wasPressed('Escape')) state.screen = 'play';
      if (input.wasPressed('KeyP')) saveGame(false);
      if (input.wasPressed('KeyM')) audio.setMuted(!audio.muted);
      if (input.wasPressed('KeyQ')) {
        state.screen = 'title';
        state.menuIndex = 0;
      }
    } else if (state.screen === 'over' || state.screen === 'complete') {
      if (input.wasPressed('Enter')) {
        if (state.screen === 'over') respawn();
        else state.screen = 'play';
      }
    }
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) acc = 0;
  render(ctx, state);
  input.endFrame();
  requestAnimationFrame(frame);
}

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ------------------------------------------------------------------ boot

if (shotName) {
  // Staged screenshot: play the real rules forward deterministically, draw
  // one frame, and stop. No loop, no sound.
  const scene = stageShot(shotName, state);
  state.screen = scene.screen;
  state.banner = scene.banner || null;
  state.bannerT = scene.banner ? 3 : 0;
  render(ctx, state);
  document.title = 'shot-ready';
  setStatus(`Screenshot staged: ${shotName}.`);
} else if (selftest) {
  window.__selftest = runSelfTest();
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.textContent = JSON.stringify(window.__selftest, null, 2);
  document.body.appendChild(pre);
  document.title = 'selftest-done';
} else {
  setStatus('Solmar Bay loaded. Choose New Game to start.');
  requestAnimationFrame(frame);
}

// Expose the live state for debugging and for the shot stager.
window.__game = state;

// ------------------------------------------------------------- self-test
// Runs the real update code headlessly on a throwaway state and reports
// pass/fail per system. Read by headless Chrome with ?selftest=1.

function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
  // The save/load check writes localStorage: keep the player's real save.
  let priorSave = null;
  try { priorSave = localStorage.getItem(SAVE_KEY); } catch { priorSave = null; }
  try {
    const s = createState();
    s.rng = mulberry32(SEED + 7);
    s.screen = 'play';
    const stepN = (n, fn) => { for (let i = 0; i < n; i += 1) { if (fn) fn(); } };
    // 1. walking moves the player
    const x0 = s.player.x;
    s.player.x += PLAYER.walkSpeed * 1;
    check('walk', s.player.x > x0, `x ${x0} -> ${s.player.x}`);
    // 2. entering a parked car works
    const parked = s.parked[0];
    const before = s.parked.length;
    s.player.x = parked.x;
    s.player.y = parked.y;
    // simulate enterCar on the test state by swapping the live state in
    const live = state;
    // (use the real enterCar via a temporary state swap)
    const saved = { ...live };
    Object.assign(live, s);
    live.rng = s.rng;
    enterCar(parked);
    check('enter-car', live.car === parked && !live.player.onFoot, `parked ${before} -> ${live.parked.length}`);
    check('steal-count', live.stats.carsStolen === 1, `stolen=${live.stats.carsStolen}`);
    // 3. driving accelerates: put the car on a road, hold W for a second
    live.car.speed = 0;
    live.car.x = 600;
    live.car.y = 1000;
    live.car.angle = Math.PI / 2; // south along the x=600 avenue
    const keyBackup = input.keys;
    input.keys = new Set(['KeyW']);
    const yBeforeDrive = live.car.y;
    for (let i = 0; i < 60; i += 1) updatePlayerCar(STEP);
    check('drive', live.car.speed > 100 && live.car.y > yBeforeDrive + 100, `speed=${live.car.speed.toFixed(1)} y+${(live.car.y - yBeforeDrive).toFixed(0)}`);
    input.keys = keyBackup;
    // 4. wanted rises on a crime and police spawn
    const w0 = live.player.wanted;
    addWanted(2);
    check('wanted-up', live.player.wanted === w0 + 2, `wanted=${live.player.wanted}`);
    updatePolice(STEP);
    updatePolice(2);
    check('police-spawn', live.copCars.length + live.cops.length > 0, `cops=${live.copCars.length + live.cops.length}`);
    // 5. shooting a thug hurts it
    live.thugs = [{ x: live.player.x + 60, y: live.player.y, angle: 0, health: 100, shootCd: 9, speed: 100, color: '#000', down: false }];
    live.player.hasPistol = true;
    live.player.ammo = 10;
    live.player.onFoot = true;
    live.car = null;
    fireBullet('player', live.player.x, live.player.y, 0, PLAYER.bulletDamage);
    stepN(30, () => updateBullets(STEP));
    check('shoot-thug', live.thugs[0].health < 100, `thug hp=${live.thugs[0].health}`);
    // 6. mission 1 completes by arriving at the Plaza
    startMission(0, true);
    live.player.x = PLACES.plaza.x;
    live.player.y = PLACES.plaza.y;
    updateMission(STEP);
    check('mission-1', live.missionIndex === 1, `missionIndex=${live.missionIndex}`);
    // 7. save/load round-trip
    live.player.money = 1234;
    const savedOk = saveGame(true);
    live.player.money = 0;
    const loadedOk = loadGame();
    check('save-load', savedOk && loadedOk && live.player.money === 1234, `money=${live.player.money}`);
    // 8. world is deterministic: rebuild and compare
    const city2 = buildCity(SEED);
    check('deterministic-city', city2.buildings.length === s.city.buildings.length
      && city2.buildings[0].x === s.city.buildings[0].x,
    `buildings=${s.city.buildings.length}`);
    // restore the live state the player actually sees, and their real save
    Object.assign(live, saved);
    live.rng = mulberry32(SEED + 7);
    try {
      if (priorSave === null) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, priorSave);
    } catch { /* storage unavailable: nothing to restore */ }
  } catch (err) {
    results.push({ name: 'exception', ok: false, detail: String(err && err.stack || err) });
  }
  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, results };
}
