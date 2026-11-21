# Solmar Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/myfufufafa/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/myfufufafa/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Entry for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC).

An original open-world crime game in the spirit of GTA 6, built for the
make.fun `gta6-01` bounty. 100% original: the city, characters, vehicles,
names, story, art and sound are invented for this game. Nothing comes from
Rockstar Games or any other commercial game.

## Play

```sh
node serve.ts        # then open http://localhost:8080
```

Desktop Chrome, keyboard + mouse, no network request: `game/` is plain
static files (Canvas 2D, no libraries).

- **WASD / arrows** — walk or drive · **Shift** — run
- **E** — enter / steal a car, exit a car · **Space** — handbrake
- **Mouse** — aim · **Click** — shoot (pistol) · **F** — punch
- **M** — mute · **P** — save game · **Esc** — pause · **J** — courier job

## The game

Mara Solano, a courier in the sun-soaked coastal city of Solmar Bay, owes a
debt and works it off for garage owner Sal Ortiz across 5 story missions:
a delivery, a car theft, a fight with the Tiburones crew at the Old Docks,
a police escape, and a bank heist. Then free roam with repeatable courier
jobs and 10 hidden Bay Coins.

Systems: a drivable city on foot and by car, traffic and pedestrians,
stealable cars, a 5-star wanted level with pursuing police cars and foot
cops, combat (fists + pistol), a HUD with health, money, wanted stars and a
live minimap, a start screen, pause menu, save/load (localStorage), and
procedural WebAudio sound (engine, sirens, gunshots, music).

## Entry

- `main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json` via `vendor/makefun-game.ts`.
- `screenshots/` holds 4 real renders of the game, staged deterministically
  with `?shot=start|drive|chase|mission` (see `game/src/shots.js`).
- `?selftest=1` runs the systems headlessly in the page and reports
  pass/fail per system.

## License

MIT — see `LICENSE`.
