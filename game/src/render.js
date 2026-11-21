// Drawing. One job: turn the state into frames — the city, the cars, the
// people, the HUD with its minimap, and the menus. Canvas 2D only, no images.

import { WORLD } from './config.js';
import { PLACES } from './world.js';
import { clamp } from './random.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

function fmtClock(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor(seconds / 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtMoney(n) {
  return `$${Math.floor(n).toLocaleString('en-US')}`;
}

function drawStar(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawCarShape(ctx, car, flashing) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.length;
  const W = car.width;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // body
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // cabin + windshield
  ctx.fillStyle = 'rgba(20,28,38,0.85)';
  ctx.beginPath();
  ctx.roundRect(-L / 6, -W / 2 + 4, L / 3, W - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.7)';
  ctx.fillRect(L / 6, -W / 2 + 5, 4, W - 10);
  // headlights
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 6);
  ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 6);
  // police livery
  if (car.kind === 'cop') {
    ctx.fillStyle = '#f4f6f7';
    ctx.fillRect(-L / 6 - 2, -W / 2, 4, W);
    ctx.fillStyle = flashing ? '#ff2e2e' : '#2e7dff';
    ctx.beginPath();
    ctx.arc(0, -W / 2 + 3, 4, 0, Math.PI * 2);
    ctx.arc(0, W / 2 - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  ctx.restore();
}

function drawWorld(ctx, state, cam) {
  const { city } = state;
  const x0 = cam.x - VIEW_W / 2 - 60;
  const y0 = cam.y - VIEW_H / 2 - 60;
  const x1 = cam.x + VIEW_W / 2 + 60;
  const y1 = cam.y + VIEW_H / 2 + 60;

  // ground
  ctx.fillStyle = '#a3ad7c';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // district ground tints
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  // beach + water
  ctx.fillStyle = '#e6d199';
  ctx.fillRect(Math.max(x0, 0), WORLD.beachTop, Math.min(x1, WORLD.width) - Math.max(x0, 0), WORLD.height - WORLD.beachTop);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(Math.max(x0, 0), WORLD.waterTop, Math.min(x1, WORLD.width) - Math.max(x0, 0), WORLD.height - WORLD.waterTop);
  ctx.fillRect(WORLD.marinaLeft, Math.max(y0, 0), WORLD.width - WORLD.marinaLeft, Math.min(y1, WORLD.height) - Math.max(y0, 0));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let wy = WORLD.waterTop + 14; wy < WORLD.height; wy += 26) {
    ctx.beginPath();
    ctx.moveTo(Math.max(x0, 0) + 10, wy);
    ctx.lineTo(Math.min(x1, WORLD.width) - 10, wy);
    ctx.stroke();
  }
  // parks
  for (const p of city.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#79a85e';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  // roads
  ctx.fillStyle = '#3d434c';
  for (const rx of WORLD.roadsX) ctx.fillRect(rx - WORLD.roadWidth / 2, Math.max(y0, 0), WORLD.roadWidth, Math.min(y1, WORLD.height) - Math.max(y0, 0));
  for (const ry of WORLD.roadsY) ctx.fillRect(Math.max(x0, 0), ry - WORLD.roadWidth / 2, Math.min(x1, WORLD.width) - Math.max(x0, 0), WORLD.roadWidth);
  // sidewalks
  ctx.fillStyle = '#c9c2b2';
  for (const rx of WORLD.roadsX) {
    ctx.fillRect(rx - WORLD.roadWidth / 2 - 10, Math.max(y0, 0), 10, Math.min(y1, WORLD.height) - Math.max(y0, 0));
    ctx.fillRect(rx + WORLD.roadWidth / 2, Math.max(y0, 0), 10, Math.min(y1, WORLD.height) - Math.max(y0, 0));
  }
  for (const ry of WORLD.roadsY) {
    ctx.fillRect(Math.max(x0, 0), ry - WORLD.roadWidth / 2 - 10, Math.min(x1, WORLD.width) - Math.max(x0, 0), 10);
    ctx.fillRect(Math.max(x0, 0), ry + WORLD.roadWidth / 2, Math.min(x1, WORLD.width) - Math.max(x0, 0), 10);
  }
  // lane dashes
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const rx of WORLD.roadsX) {
    ctx.beginPath();
    ctx.moveTo(rx, Math.max(y0, 0));
    ctx.lineTo(rx, Math.min(y1, WORLD.height));
    ctx.stroke();
  }
  for (const ry of WORLD.roadsY) {
    ctx.beginPath();
    ctx.moveTo(Math.max(x0, 0), ry);
    ctx.lineTo(Math.min(x1, WORLD.width), ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // buildings
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // roof detail: inner court or skylight
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.2, b.w * 0.64, b.h * 0.6);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    }
    if (b.label) {
      ctx.fillStyle = 'rgba(20,20,20,0.75)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // trees
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // coins
  for (const c of city.coins) {
    if (c.taken || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const pulse = 1 + Math.sin(state.time * 3 + c.x) * 0.15;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 10 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', c.x, c.y + 4);
  }
  ctx.restore();
}

function drawPickups(ctx, state) {
  for (const p of state.pickups) {
    if (p.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 11, p.y - 11, 22, 22);
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
      ctx.fillRect(p.x - 8, p.y - 3, 16, 6);
    } else if (p.kind === 'ammo') {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(p.x - 11, p.y - 8, 22, 16);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', p.x, p.y + 3);
    } else if (p.kind === 'cash') {
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', p.x, p.y + 4);
    }
  }
}

function drawPeople(ctx, state, cam) {
  const x0 = cam.x - VIEW_W / 2 - 40;
  const y0 = cam.y - VIEW_H / 2 - 40;
  const x1 = cam.x + VIEW_W / 2 + 40;
  const y1 = cam.y + VIEW_H / 2 + 40;
  const drawWalker = (x, y, color, down, ring) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (down) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 7, 0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(x, y - 2, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  for (const p of state.peds) drawWalker(p.x, p.y, p.color, p.down > 0, null);
  for (const t of state.thugs) {
    drawWalker(t.x, t.y, t.color, false, '#e74c3c');
    if (!t.down) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(t.x - 14, t.y - 22, 28, 5);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(t.x - 14, t.y - 22, 28 * Math.max(0, t.health / 100), 5);
    }
  }
  for (const c of state.cops) drawWalker(c.x, c.y, c.color, false, '#2e7dff');
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (!p.onFoot) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Mara: teal jacket, dark hair
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(6, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (p.hasPistol) {
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -2, 12, 4);
  }
  ctx.restore();
  // aim line when armed
  if (p.hasPistol && state.screen === 'play') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 90, p.y + Math.sin(p.angle) * 90);
    ctx.stroke();
  }
}

function drawMissionMarker(ctx, state, cam) {
  const target = state.missionTarget;
  if (!target) return;
  const { x, y } = target;
  const pulse = 1 + Math.sin(state.time * 4) * 0.2;
  // beacon beam
  ctx.fillStyle = 'rgba(241,196,15,0.10)';
  ctx.fillRect(x - 26, y - 220, 52, 220);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#f1c40f';
  ctx.strokeStyle = '#7d6608';
  ctx.lineWidth = 2;
  const s = 16 * pulse;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();
  // off-screen edge arrow
  const vx0 = cam.x - VIEW_W / 2 + 40;
  const vy0 = cam.y - VIEW_H / 2 + 40;
  const vx1 = cam.x + VIEW_W / 2 - 40;
  const vy1 = cam.y + VIEW_H / 2 - 40;
  if (x < vx0 || x > vx1 || y < vy0 || y > vy1) {
    const ax = clamp(x, vx0, vx1);
    const ay = clamp(y, vy0, vy1);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(y - cam.y, x - cam.x));
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawHud(ctx, state) {
  const p = state.player;
  // top-left: health + money + objective
  ctx.fillStyle = 'rgba(10,14,20,0.62)';
  ctx.fillRect(16, 14, 300, 96);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MARA SOLANO', 28, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(28, 46, 180, 12);
  ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(28, 46, 180 * Math.max(0, p.health / 100), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 216, 57);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(fmtMoney(p.money), 28, 82);
  ctx.fillStyle = '#f1c40f';
  ctx.font = '12px sans-serif';
  ctx.fillText(`SOLMAR BAY  •  ${fmtClock(state.time)}`, 28, 100);
  // objective panel
  const objective = state.objectiveText;
  if (objective) {
    ctx.fillStyle = 'rgba(10,14,20,0.62)';
    ctx.fillRect(16, 122, 340, 52);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(state.missionTitle || 'FREE ROAM', 28, 143);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(objective, 28, 163);
  }
  // wanted stars, top-right
  ctx.fillStyle = 'rgba(10,14,20,0.62)';
  ctx.fillRect(VIEW_W - 236, 14, 220, 46);
  for (let i = 0; i < 5; i += 1) {
    drawStar(ctx, VIEW_W - 208 + i * 40, 37, 14, i < p.wanted ? '#f1c40f' : 'rgba(255,255,255,0.18)');
  }
  // mission progress
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Missions ${state.missionIndex}/5${state.storyComplete ? ' — STORY DONE' : ''}`, VIEW_W - 16, 78);
  ctx.textAlign = 'left';
  // bottom-right: weapon / speed / hints
  if (!p.onFoot && state.car) {
    ctx.fillStyle = 'rgba(10,14,20,0.62)';
    ctx.fillRect(VIEW_W - 176, VIEW_H - 92, 160, 76);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(state.car.speed) * 0.32)} km/h`, VIEW_W - 28, VIEW_H - 58);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(state.car.missionCar ? 'COMET GT — STOLEN' : 'E — exit car', VIEW_W - 28, VIEW_H - 34);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(VIEW_W - 236, VIEW_H - 92, 220, 76);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(p.hasPistol ? `Pistol  •  ${p.ammo} rounds — click to shoot` : 'Fists  •  F to punch', VIEW_W - 224, VIEW_H - 62);
    ctx.fillStyle = '#f1c40f';
    ctx.fillText('E — enter car   •   Shift — run', VIEW_W - 224, VIEW_H - 40);
    ctx.textAlign = 'left';
  }
  // banner
  if (state.banner && state.bannerT > 0) {
    const a = Math.min(1, state.bannerT);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,14,20,0.75)';
    ctx.fillRect(0, VIEW_H / 2 - 52, VIEW_W, 84);
    ctx.fillStyle = state.bannerColor || '#f1c40f';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.banner, VIEW_W / 2, VIEW_H / 2 - 12);
    if (state.bannerSub) {
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      ctx.fillText(state.bannerSub, VIEW_W / 2, VIEW_H / 2 + 16);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  // damage flash
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(231,76,60,${Math.min(0.4, state.damageFlash * 0.4)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // story complete ribbon
  if (state.storyComplete && state.screen === 'play') {
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★ STORY COMPLETE — free roam: press J for a courier job ★', VIEW_W / 2, 132);
    ctx.textAlign = 'left';
  }
}

function drawMinimap(ctx, state) {
  const MW = 200;
  const MH = 150;
  const mx = 16;
  const my = VIEW_H - MH - 16;
  const sx = MW / WORLD.width;
  const sy = MH / WORLD.height;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect(mx - 4, my - 4, MW + 8, MH + 8);
  ctx.fillStyle = '#3d434c';
  ctx.fillRect(mx, my, MW, MH);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(mx + WORLD.marinaLeft * sx, my, MW - WORLD.marinaLeft * sx, MH);
  ctx.fillRect(mx, my + WORLD.waterTop * sy, MW, MH - WORLD.waterTop * sy);
  ctx.fillStyle = '#e6d199';
  ctx.fillRect(mx, my + WORLD.beachTop * sy, MW, (WORLD.waterTop - WORLD.beachTop) * sy);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const rx of WORLD.roadsX) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * sx, my);
    ctx.lineTo(mx + rx * sx, my + MH);
    ctx.stroke();
  }
  for (const ry of WORLD.roadsY) {
    ctx.beginPath();
    ctx.moveTo(mx, my + ry * sy);
    ctx.lineTo(mx + MW, my + ry * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const c of state.copCars) dot(c.x, c.y, '#2e7dff', 3);
  for (const t of state.thugs) dot(t.x, t.y, '#e74c3c', 3);
  if (state.missionTarget) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.25;
    dot(state.missionTarget.x, state.missionTarget.y, '#f1c40f', 5 * pulse);
  }
  for (const c of state.traffic) dot(c.x, c.y, '#95a5a6', 2);
  const p = state.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 4, my - 4, MW + 8, MH + 8);
}

function drawMenu(ctx, state, lines, selected) {
  ctx.fillStyle = 'rgba(8,10,16,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('SOLMAR BAY', VIEW_W / 2, 150);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('An open-world crime story — drive, steal, run, survive.', VIEW_W / 2, 188);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#f5d76e';
  ctx.fillText('A 100% original game. No Rockstar names, art, music or maps.', VIEW_W / 2, 214);
  lines.forEach((line, i) => {
    const y = 300 + i * 46;
    if (i === selected) {
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(VIEW_W / 2 - 190, y - 26, 380, 38);
      ctx.fillStyle = '#111';
    } else {
      ctx.fillStyle = '#fff';
    }
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText(line, VIEW_W / 2, y);
  });
  ctx.textAlign = 'left';
}

export function render(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  // world, translated by the camera
  ctx.save();
  ctx.translate(VIEW_W / 2 - cam.x, VIEW_H / 2 - cam.y);
  drawWorld(ctx, state, cam);
  drawPickups(ctx, state);
  for (const car of state.parked) drawCarShape(ctx, car, false);
  for (const car of state.traffic) drawCarShape(ctx, car, false);
  for (const car of state.copCars) drawCarShape(ctx, car, Math.floor(state.time * 4) % 2 === 0);
  if (state.car) drawCarShape(ctx, state.car, false);
  drawPeople(ctx, state, cam);
  drawPlayer(ctx, state);
  // bullets
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    ctx.stroke();
  }
  // particles
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawMissionMarker(ctx, state, cam);
  ctx.restore();

  // golden-hour grade over everything, subtle
  ctx.fillStyle = 'rgba(255,170,60,0.05)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (state.screen === 'play' || state.screen === 'pause') {
    drawHud(ctx, state);
    drawMinimap(ctx, state);
  }

  if (state.screen === 'title') {
    const lines = ['NEW GAME', state.hasSave ? 'CONTINUE' : 'CONTINUE (no save yet)', 'HOW TO PLAY'];
    drawMenu(ctx, state, lines, state.menuIndex || 0);
    if (state.showHelp) {
      ctx.fillStyle = 'rgba(8,10,16,0.88)';
      ctx.fillRect(240, 120, 800, 480);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 24px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOW TO PLAY', VIEW_W / 2, 168);
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      const help = [
        'WASD / arrows — walk or drive      Shift — run',
        'E — enter / steal a car, exit a car      Space — handbrake',
        'Mouse — aim      Click — shoot (pistol)      F — punch',
        'M — mute      P — save game      Esc — pause',
        'Steal cars, take missions from Sal, and watch the stars:',
        'crime raises your wanted level and the police come for you.',
        'Lose them, or reach the Safehouse, to cool off.',
        'Finish all 5 missions to complete Mara’s story.',
        'Collect the 10 gold Bay Coins hidden around the city.',
      ];
      help.forEach((h, i) => ctx.fillText(h, VIEW_W / 2, 214 + i * 34));
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#f5d76e';
      ctx.fillText('Press Esc or click to go back.', VIEW_W / 2, 566);
      ctx.textAlign = 'left';
    }
  }

  if (state.screen === 'pause') {
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 260);
    ctx.fillStyle = '#fff';
    ctx.font = '17px sans-serif';
    const lines = ['Esc — resume', 'P — save game', 'M — mute sound', 'Q — quit to title'];
    lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 320 + i * 34));
    ctx.textAlign = 'left';
  }

  if (state.screen === 'over') {
    ctx.fillStyle = state.overKind === 'busted' ? 'rgba(20,40,90,0.78)' : 'rgba(90,10,10,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.fillText(state.overKind === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, 300);
    ctx.font = '18px sans-serif';
    ctx.fillText(state.overKind === 'busted'
      ? 'The Solmar Bay police took you in. You lost some cash — and your heat.'
      : 'Mara went down. The crew patched her up at Solmar General.',
    VIEW_W / 2, 348);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('Press Enter to keep playing', VIEW_W / 2, 420);
    ctx.textAlign = 'left';
  }

  if (state.screen === 'complete') {
    ctx.fillStyle = 'rgba(8,10,16,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('STORY COMPLETE', VIEW_W / 2, 240);
    ctx.fillStyle = '#fff';
    ctx.font = '19px sans-serif';
    ctx.fillText('Mara paid the debt. Solmar Bay is hers now.', VIEW_W / 2, 288);
    ctx.fillText(`Money earned: ${fmtMoney(state.stats.earned)}   •   Cars stolen: ${state.stats.carsStolen}`, VIEW_W / 2, 330);
    ctx.fillText(`Thugs beaten: ${state.stats.thugsDown}   •   Bay Coins: ${state.coinsTaken}/10`, VIEW_W / 2, 362);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('Press Enter — free roam continues', VIEW_W / 2, 440);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
