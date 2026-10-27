// GEOMETRY — procedural builders for every catalog component.
// Each factory returns a THREE.Group centered on its mounting origin so the
// stack layout math in engineering.ts positions it exactly. Materials are
// created per-instance so selection highlights never bleed between parts.

import * as THREE from 'three';

const CYAN = 0x00d9ff;
const AMBER = 0xffaa00;

function metal(color: number, metalness = 0.9, roughness = 0.25): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, metalness, roughness, envMapIntensity: 0.9 });
}

function glowing(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.1,
  });
}

function mesh(geom: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geom, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

function cyl(rt: number, rb: number, h: number, seg = 24): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg);
}

// Small cylinder bolt ring around a joint
function boltRing(radius: number, count = 12, size = 0.06): THREE.Group {
  const g = new THREE.Group();
  const boltMat = metal(0x666666, 0.95, 0.3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const b = mesh(new THREE.CylinderGeometry(size, size, 0.08, 6), boltMat);
    b.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    g.add(b);
  }
  return g;
}

export function createSpacecraftBus(): THREE.Group {
  const group = new THREE.Group();
  const body = mesh(cyl(1.35, 1.35, 3.6, 32), metal(0xb8bcc4, 0.85, 0.3));
  group.add(body);

  // gold MLI wrap band
  const wrap = mesh(cyl(1.37, 1.37, 1.4, 32), metal(0xd4af37, 0.9, 0.35));
  wrap.position.y = -0.7;
  group.add(wrap);

  // structural ribs
  for (const y of [-1.5, 0, 1.5]) {
    const rib = mesh(new THREE.TorusGeometry(1.38, 0.05, 8, 40), metal(0x8a8f98, 0.9, 0.35));
    rib.rotation.x = Math.PI / 2;
    rib.position.y = y;
    group.add(rib);
  }

  // hatch + emissive strip lights
  const hatch = mesh(new THREE.BoxGeometry(0.6, 0.9, 0.06), metal(0x3a4048, 0.8, 0.4));
  hatch.position.set(0, 0.6, 1.34);
  group.add(hatch);
  const strip = mesh(new THREE.BoxGeometry(1.6, 0.04, 0.02), glowing(CYAN, 2));
  strip.position.set(0, 1.4, 1.36);
  group.add(strip);

  // top docking ring
  const dock = mesh(cyl(1.1, 1.25, 0.25, 32), metal(0x6a6f78, 0.95, 0.25));
  dock.position.y = 1.85;
  group.add(dock);
  const dockRing = boltRing(1.18);
  dockRing.position.set(0, 1.98, 0);
  group.add(dockRing);

  // bottom fitting
  const fit = mesh(cyl(1.0, 1.2, 0.3, 32), metal(0x555a63, 0.95, 0.25));
  fit.position.y = -1.9;
  group.add(fit);

  return group;
}

export function createNoseCone(): THREE.Group {
  const group = new THREE.Group();
  const tip = mesh(
    new THREE.ConeGeometry(1.15, 1.5, 32),
    metal(0xd9dde2, 0.85, 0.22)
  );
  tip.position.y = 0.85;
  group.add(tip);

  const skirtTop = mesh(cyl(1.15, 1.28, 0.7, 32), metal(0xd9dde2, 0.85, 0.22));
  group.add(skirtTop);

  // separation seam line
  const seam = mesh(new THREE.TorusGeometry(1.16, 0.03, 8, 40), glowing(AMBER, 1.2));
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -0.35;
  group.add(seam);

  const seamRing = boltRing(1.3, 16);
  seamRing.position.set(0, -1.05, 0);
  group.add(seamRing);
  return group;
}

export function createPayloadBay(): THREE.Group {
  const group = new THREE.Group();
  const shell = mesh(cyl(1.32, 1.32, 2.4, 32), metal(0x9aa0a8, 0.8, 0.35));
  group.add(shell);

  // clamshell doors (slightly splayed panels)
  const doorMat = metal(0x7d838c, 0.8, 0.4);
  for (const side of [-1, 1]) {
    const door = mesh(new THREE.BoxGeometry(1.5, 1.7, 0.06), doorMat);
    door.position.set(side * 0.92, 0, 0.75);
    door.rotation.y = side * 0.35;
    group.add(door);
  }

  // interior rail + indicator lights
  const rail = mesh(new THREE.BoxGeometry(2.2, 0.1, 0.12), metal(0x40454d, 0.9, 0.3));
  rail.position.y = -1.05;
  group.add(rail);
  for (let i = 0; i < 3; i++) {
    const light = mesh(new THREE.SphereGeometry(0.05, 8, 8), glowing(0x33ff88, 1.5));
    light.position.set(-0.7 + i * 0.7, 0.95, 1.25);
    group.add(light);
  }
  return group;
}

export function createSeparator(): THREE.Group {
  const group = new THREE.Group();
  const ring = mesh(cyl(1.3, 1.3, 0.28, 32), metal(0xc0622f, 0.7, 0.4));
  group.add(ring);
  const band = mesh(new THREE.TorusGeometry(1.31, 0.045, 8, 48), glowing(AMBER, 1.0));
  band.rotation.x = Math.PI / 2;
  group.add(band);
  group.add(boltRing(1.2, 16, 0.05));
  return group;
}

export function createMainEngine(): THREE.Group {
  const group = new THREE.Group();
  // thrust structure dome
  const dome = mesh(new THREE.SphereGeometry(1.1, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal(0x8d6642, 0.95, 0.3));
  dome.position.y = 0.65;
  group.add(dome);

  // combustion chamber + throat + bell
  const chamber = mesh(cyl(0.42, 0.34, 0.55, 24), metal(0x5a5f66, 0.95, 0.2));
  chamber.position.y = -0.05;
  group.add(chamber);    const bell = mesh(new THREE.CylinderGeometry(0.34, 0.95, 1.0, 32, 1, true), metal(0x33373d, 0.95, 0.18));
  bell.position.y = -0.8;
  group.add(bell);

  // turbopump greebles
  const pump = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), metal(0x777c84, 0.9, 0.25));
  pump.position.set(0.65, 0.25, 0.3);
  pump.rotation.z = Math.PI / 2;
  group.add(pump);
  for (const [x, z] of [[0.7, -0.3], [-0.6, 0.4]] as [number, number][]) {
    const pipe = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), metal(0x999ea6, 0.9, 0.25));
    pipe.position.set(x, 0.45, z);
    pipe.rotation.z = x > 0 ? -0.6 : 0.6;
    group.add(pipe);
  }

  // Gimbal actuator blocks
  for (const a of [0, Math.PI]) {
    const act = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), metal(0x2c3037, 0.85, 0.35));
    act.position.set(Math.cos(a) * 0.7, 0.4, Math.sin(a) * 0.7);
    group.add(act);
  }
  return group;
}

function tankLine(color: number, height: number, radius: number, emissiveBand: number): THREE.Group {
  const g = new THREE.Group();
  const barrel = mesh(cyl(radius, radius, height * 0.75, 32), metal(color, 0.55, 0.18));
  g.add(barrel);

  // hemispherical domes
  const domeMat = metal(color, 0.55, 0.18);
  const top = mesh(new THREE.SphereGeometry(radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  top.position.y = height * 0.375;
  g.add(top);
  const bottom = mesh(
    new THREE.SphereGeometry(radius, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    domeMat
  );
  bottom.position.y = -height * 0.375;
  bottom.rotation.x = Math.PI; // dome opens downward
  g.add(bottom);

  // weld ring & level sensor band
  const weld = mesh(new THREE.TorusGeometry(radius + 0.01, 0.03, 8, 40), metal(0x60666e, 0.95, 0.25));
  weld.rotation.x = Math.PI / 2;
  weld.position.y = 0;
  g.add(weld);
  const band = mesh(new THREE.TorusGeometry(radius + 0.02, 0.02, 6, 40), glowing(emissiveBand, 1.1));
  band.rotation.x = Math.PI / 2;
  band.position.y = height * 0.2;
  g.add(band);
  return g;
}

export function createFuelTank(): THREE.Group {
  return tankLine(0xd8d2c6, 1.9, 1.28, 0xff8833);
}

export function createOxidizerTank(): THREE.Group {
  const g = tankLine(0xbfd4e6, 1.6, 1.1, 0x33aaff);
  // fill / drain lines
  const line = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), metal(0x8d99a6, 0.9, 0.3));
  line.position.set(1.2, 0, 0);
  g.add(line);
  return g;
}

export function createFirstStageStructure(): THREE.Group {
  const group = new THREE.Group();
  const skin = mesh(cyl(1.38, 1.42, 2.2, 32), metal(0xdfdfdf, 0.35, 0.45));
  group.add(skin);

  // isogrid panel detail stripes
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const stripe = mesh(new THREE.BoxGeometry(0.05, 1.9, 0.03), metal(0x9aa0a8, 0.8, 0.4));
    stripe.position.set(Math.cos(a) * 1.42, 0, Math.sin(a) * 1.42);
    stripe.rotation.y = -a;
    group.add(stripe);
  }

  // cable raceway + status light
  const raceway = mesh(new THREE.BoxGeometry(0.25, 1.7, 0.18), metal(0x33373d, 0.8, 0.4));
  raceway.position.set(0, 0, 1.42);
  group.add(raceway);
  const light = mesh(new THREE.SphereGeometry(0.05, 8, 8), glowing(0x33ff88, 1.4));
  light.position.set(0, 0.9, 1.5);
  group.add(light);
  return group;
}

export function createUpperStageStructure(): THREE.Group {
  const group = new THREE.Group();
  const skin = mesh(cyl(1.3, 1.34, 2.0, 32), metal(0xc9cdd4, 0.4, 0.4));
  group.add(skin);

  const ringTop = mesh(cyl(1.25, 1.3, 0.18, 32), metal(0x6a6f78, 0.9, 0.25));
  ringTop.position.y = 0.95;
  group.add(ringTop);

  // mounting bosses for satellite deck
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const boss = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), metal(0x555a63, 0.95, 0.3));
    boss.position.set(Math.cos(a) * 1.15, 1.12, Math.sin(a) * 1.15);
    group.add(boss);
  }

  const vent = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), metal(0x40454d, 0.9, 0.3));
  vent.position.set(1.28, 0.1, 0);
  vent.rotation.z = Math.PI / 2;
  group.add(vent);
  return group;
}

export function createSolarPanel(): THREE.Group {
  const group = new THREE.Group();
  // mounting yoke
  const yoke = mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), metal(0x44484f, 0.9, 0.3));
  group.add(yoke);
  const arm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), metal(0x777c84, 0.9, 0.25));
  arm.rotation.z = Math.PI / 2;
  arm.position.x = 0.5;
  group.add(arm);

  // substrate + cells spanning outward on local +x
  const panel = mesh(new THREE.BoxGeometry(3.2, 1.9, 0.07), metal(0x14181f, 0.85, 0.35));
  panel.position.x = 0.9;
  group.add(panel);

  const cellMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a2a52,
    metalness: 0.55,
    roughness: 0.18,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.32, 0.03), cellMat, 10 * 5);
  const m4 = new THREE.Matrix4();
  let ci = 0;
  for (let gx = 0; gx < 10; gx++) {
    for (let gy = 0; gy < 5; gy++) {
      m4.setPosition(-0.72 + gx * 0.335, -0.71 + gy * 0.36, 0.06);
      cells.setMatrixAt(ci++, m4);
    }
  }
  cells.position.x = 0.9;
  cells.castShadow = true;
  group.add(cells);

  // hinge line + edge emissive run
  const hinge = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), metal(0x6a6f78, 0.9, 0.3));
  hinge.position.x = -0.75;
  group.add(hinge);
  const edge = mesh(new THREE.BoxGeometry(3.0, 0.03, 0.02), glowing(CYAN, 1.2));
  edge.position.set(0.95, 0.97, 0.02);
  group.add(edge);

  return group;
}

export function createBattery(): THREE.Group {
  const group = new THREE.Group();
  const case_ = mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8), metal(0x2b3440, 0.75, 0.35));
  group.add(case_);
  for (let i = 0; i < 4; i++) {
    const cell = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 12), metal(0x8fa0b4, 0.8, 0.25));
    cell.position.set(-0.33 + i * 0.22, 0.28, 0);
    group.add(cell);
  }
  const led = mesh(new THREE.BoxGeometry(0.7, 0.05, 0.04), glowing(0x33ff88, 1.4));
  led.position.set(0, -0.1, 0.42);
  group.add(led);
  return group;
}

export function createAntenna(): THREE.Group {
  const group = new THREE.Group();

  const base = mesh(cyl(0.45, 0.55, 0.3, 16), metal(0x4a4f57, 0.9, 0.35));
  base.position.y = -0.65;
  group.add(base);

  const mast = mesh(cyl(0.09, 0.09, 0.7, 8), metal(0x8a8f98, 0.9, 0.3));
  mast.position.y = -0.2;
  group.add(mast);

  // parabolic dish open toward +y (sky)
  const dish = mesh(
    new THREE.SphereGeometry(1.15, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.32),
    metal(0xe6e9ee, 0.6, 0.16)
  );
  dish.rotation.x = -Math.PI * 0.62;
  dish.position.y = 0.35;
  group.add(dish);

  const feed = mesh(cyl(0.08,0.08,0.55,8), metal(0x555a63, 0.95, 0.25));
  const feedGroup = new THREE.Group();
  feedGroup.position.y = 0.62;
  feed.position.y = 0.12;
  feedGroup.add(feed);
  const horn = mesh(cyl(0.12, 0.2, 0.22, 12), metal(0x8a5a2f, 0.85, 0.3));
  horn.position.y = 0.42;
  feedGroup.add(horn);
  group.add(feedGroup);

  // quad support struts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const strut = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), metal(0x777c84, 0.9, 0.3));
    strut.position.set(Math.cos(a) * 0.32, 0.62, Math.sin(a) * 0.32);
    strut.rotation.x = Math.cos(a) * 0.6;
    strut.rotation.z = -Math.sin(a) * 0.6;
    group.add(strut);
  }

  // gimbal ring
  const gimbal = mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 24), metal(0x6a6f78, 0.9, 0.3));
  gimbal.rotation.x = Math.PI / 2;
  gimbal.position.y = -0.42;
  group.add(gimbal);
  return group;
}

export function createRelay(): THREE.Group {
  const group = new THREE.Group();
  const mount = mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.3, 12), metal(0x4a4f57, 0.9, 0.35));
  mount.position.y = -0.25;
  group.add(mount);
  const patch = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), metal(0xd8dce2, 0.5, 0.2));
  patch.position.y = 0.05;
  patch.rotation.x = 0.35;
  group.add(patch);
  const helix = mesh(new THREE.ConeGeometry(0.18, 0.4, 12), metal(0x8fa0b4, 0.85, 0.3));
  helix.position.y = 0.32;
  group.add(helix);
  const led = mesh(new THREE.SphereGeometry(0.04, 8, 8), glowing(0x33ff88, 1.4));
  led.position.set(0.22, 0.12, 0.3);
  group.add(led);
  return group;
}

export function createNavigationSensor(): THREE.Group {
  const group = new THREE.Group();
  const cube = mesh(new THREE.BoxGeometry(0.55, 0.5, 0.62), metal(0x26313d, 0.8, 0.3));
  group.add(cube);

  // star-tracker lenses (2 heads with blue-black glass)
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1a33,
    metalness: 0.2,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  for (const [x, z] of [[-0.18, 0.33], [0.18, 0.33]] as [number, number][]) {
    const hood = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 16), metal(0x111418, 0.9, 0.2));
    hood.position.set(x, 0.06, z);
    hood.rotation.x = Math.PI / 2;
    group.add(hood);
    const lens = mesh(new THREE.SphereGeometry(0.09, 16, 16), lensMat);
    lens.position.set(x, 0.06, z + 0.06);
    group.add(lens);
  }

  const led = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), glowing(CYAN, 1.6));
  led.position.set(0, -0.22, 0.33);
  group.add(led);
  return group;
}

export function createAvionics(): THREE.Group {
  const group = new THREE.Group();
  const chassis = mesh(new THREE.BoxGeometry(0.32, 0.5, 0.85), metal(0x30363e, 0.85, 0.35));
  group.add(chassis);

  // module cards with emissive seams
  for (let i = 0; i < 5; i++) {
    const card = mesh(new THREE.BoxGeometry(0.02, 0.42, 0.74), metal(0x59606a, 0.9, 0.3));
    card.position.set(0.17, 0, -0.32 + i * 0.16);
    group.add(card);
    if (i % 2 === 0) {
      const glow = mesh(new THREE.BoxGeometry(0.025, 0.03, 0.6), glowing(CYAN, 1.3));
      glow.position.set(0.19, 0.08, -0.32 + i * 0.16);
      group.add(glow);
    }
  }
  return group;
}

export function createScienceInstrument(): THREE.Group {
  const group = new THREE.Group();
  const tube = mesh(cyl(0.32, 0.38, 0.9, 24), metal(0x1c222c, 0.85, 0.28));
  group.add(tube);

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x8fc4ff,
    metalness: 0.1,
    roughness: 0.03,
    transmission: 0.85,
    transparent: true,
    ior: 1.52,
    thickness: 0.2,
  });
  const aperture = mesh(new THREE.SphereGeometry(0.3, 24, 16), lensMat);
  aperture.position.z = 0.35;
  aperture.scale.set(1, 1, 0.45);
  group.add(aperture);

  const hood = mesh(new THREE.TorusGeometry(0.34, 0.05, 10, 28), metal(0x0e1116, 0.9, 0.2));
  hood.position.z = 0.42;
  group.add(hood);

  // electronics box at back + sensor link
  const back = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), metal(0x33393f, 0.85, 0.35));
  back.position.z = -0.55;
  group.add(back);
  const led = mesh(new THREE.SphereGeometry(0.04, 8, 8), glowing(0x33ff88, 1.5));
  led.position.set(0.2, 0.28, -0.55);
  group.add(led);
  return group;
}

export function createRadiator(): THREE.Group {
  const group = new THREE.Group();
  const mount = mesh(new THREE.BoxGeometry(0.4, 0.25, 0.25), metal(0x44484f, 0.9, 0.3));
  group.add(mount);

  const finMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f6,
    metalness: 0.3,
    roughness: 0.55,
  });
  const fin = mesh(new THREE.BoxGeometry(2.1, 1.15, 0.05), finMat);
  fin.position.x = 1.05;
  group.add(fin);

  // heat pipe channels
  for (let i = 0; i < 3; i++) {
    const pipe = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), metal(0x9aa0a8, 0.9, 0.3));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(1.0, -0.4 + i * 0.4, 0.05);
    group.add(pipe);
  }
  return group;
}

export function createLandingLegs(): THREE.Group {
  const group = new THREE.Group();
  // mounting bracket at top, strut folds outward-down
  const bracket = mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), metal(0x3b4046, 0.9, 0.3));
  group.add(bracket);

  const strutMat = metal(0xd0d3d8, 0.6, 0.25);
  const upper = mesh(cyl(0.09, 0.09, 1.05, 10), strutMat);
  upper.position.set(0.55, -0.45, 0);
  upper.rotation.z = 0.7;
  group.add(upper);
  const lower = mesh(cyl(0.07, 0.07, 0.75, 10), strutMat);
  lower.position.set(1.02, -0.95, 0);
  lower.rotation.z = 0.35;
  group.add(lower);

  const pad = mesh(cyl(0.42, 0.28, 0.16, 16), metal(0x2b2f35, 0.8, 0.4));
  pad.position.set(1.16, -1.28, 0);
  group.add(pad);

  const piston = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), metal(0x8fa0b4, 0.95, 0.2));
  piston.position.set(0.85, -0.72, 0.22);
  piston.rotation.z = 0.5;
  group.add(piston);
  return group;
}
