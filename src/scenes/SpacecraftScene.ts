// SPACECRAFT SCENE — Three.js rendering, animation and interaction.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  COMPONENT_CATALOG,
  ComponentDef,
  InstalledComponent,
} from '../lib/engineering';
import * as geo from '../lib/geometry';
import type { GestureCommand } from '../lib/handControl';
import type { HandFrame } from '../lib/handTracking';

interface Tween {
  t: number;
  dur: number;
  update: (k: number) => void;
  done?: () => void;
}

interface ComponentVisual {
  group: THREE.Group;
  def: ComponentDef;
  anchor: THREE.Vector3;
  anchorRotY: number;
  explodedOffset: THREE.Vector3;
  label: THREE.Sprite | null;
  line: THREE.Line | null;
}

const CYAN = 0x00d9ff;
const EXPLODE_STEP: Record<string, number> = {
  nose_cone: 5.6,
  payload_bay: 3.8,
  separator: 2.6,
  spacecraft_bus: 1.4,
  upper_stage_structure: 0,
  first_stage_structure: -1.6,
  oxidizer_tank: -2.8,
  fuel_tank: -3.6,
  main_engine: -4.8,
};

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class SpacecraftScene {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;

  private vehicle = new THREE.Group(); // holds all component groups
  private visuals = new Map<string, ComponentVisual>();
  private tweens: Tween[] = [];

  private selectedId: string | null = null;
  private selectionRing: THREE.Box3Helper | null = null;
  private hovered: { id: string; orig: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }[] } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private explodedAmount = 0;
  private explodedTarget = 0;

  private scanRig: THREE.Group;
  private missionView: THREE.Group;
  private satelliteDot: THREE.Mesh;
  private satelliteAngle = 0;

  private engineFlame: THREE.Group | null = null;
  private engineActive = false;
  private flamePulse = 0;

  private handCursor: THREE.Group;
  private handGrabbedId: string | null = null;
  private handNdc = new THREE.Vector2();
  private handControlActive = false;

  private cbSelect?: (id: string | null) => void;
  private cbInspect?: (id: string) => void;
  private cbHandGrab?: (id: string | null) => void;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private disposed = false;
  private resizeObs: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.scene.background = new THREE.Color(0x0a0e1c);
    this.scene.fog = new THREE.Fog(0x0a0e1c, 60, 180);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 500);
    this.camera.position.set(9.5, 6.5, 12.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // Studio reflections for the metallic materials
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = env.texture;
    pmrem.dispose();

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.target.set(0, 4.5, 0);

    // Lighting — studio key with soft shadow, cyan fill, warm rim
    const ambient = new THREE.AmbientLight(0x8ba4c8, 0.55);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xf4f7ff, 2.4);
    key.position.set(14, 22, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 24;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x2a9fd8, 0.8);
    fill.position.set(-16, 8, -12);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffb350, 0.5);
    rim.position.set(6, 4, -14);
    this.scene.add(rim);

    // Lab floor: platform disc + fine grid gridlines fading into fog
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 8.2, 0.35, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x131a26, metalness: 0.75, roughness: 0.42 })
    );
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    this.scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.7, 0.06, 8, 96),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);

    const grid = new THREE.GridHelper(90, 90, 0x0e2a44, 0x0b1c2e);
    grid.position.y = -0.4;
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).transparent = true;
    (grid.material as THREE.Material & { opacity: number }).opacity = 0.5;
    this.scene.add(grid);

    // Dust motes for atmosphere
    const moteCount = 350;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 70;
      motePos[i * 3 + 1] = Math.random() * 30;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({ color: 0x3d5068, size: 0.08, transparent: true, opacity: 0.55 })
    );
    this.scene.add(motes);

    // Component carrier
    this.scene.add(this.vehicle);

    // Scanning rig (intro): emissive ring + light column, hidden until used
    this.scanRig = new THREE.Group();
    const scanRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.04, 8, 80),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 2.4, transparent: true, opacity: 0.9 })
    );
    scanRing.rotation.x = Math.PI / 2;
    scanRing.name = 'scanRing';
    this.scanRig.add(scanRing);
    const scanPlane = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.22, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    scanPlane.name = 'scanPlane';
    this.scanRig.add(scanPlane);
    this.scanRig.visible = false;
    this.scene.add(this.scanRig);

    // Mission-ops view: Earth sphere + orbital rings + moving satellite
    this.missionView = new THREE.Group();
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(18, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x10365c, roughness: 0.75, metalness: 0.1 })
    );
    earth.position.set(0, -30, 0);
    this.missionView.add(earth);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(18.6, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.12, side: THREE.BackSide })
    );
    atmo.position.copy(earth.position);
    this.missionView.add(atmo);

    for (const [r, tilt, color] of [
      [26, 0.35, 0x00d9ff],
      [34, -0.2, 0xffaa00],
    ] as [number, number, number][]) {
      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.05, 8, 128),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
      );
      orbit.rotation.x = Math.PI / 2 + tilt;
      this.missionView.add(orbit);
    }

    this.satelliteDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 })
    );
    this.missionView.add(this.satelliteDot);

    this.missionView.visible = false;
    this.scene.add(this.missionView);

    // Hand cursor ghost (follows pinch position on the camera-facing plane)
    this.handCursor = new THREE.Group();
    const ghostCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 16),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9 })
    );
    ghostCore.name = 'ghostCore';
    this.handCursor.add(ghostCore);
    const ghostHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.02, 8, 32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55 })
    );
    this.handCursor.add(ghostHalo);
    this.handCursor.visible = false;
    this.scene.add(this.handCursor);

    // Pointer interaction
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointerup', () => this.onPointerUp());

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(container);

    this.animate();
  }

  // ------------------------------------------------------------- callbacks
  onSelect(cb: (id: string | null) => void): void {
    this.cbSelect = cb;
  }

  onInspect(cb: (id: string) => void): void {
    this.cbInspect = cb;
  }

  onHandGrab(cb: (id: string | null) => void): void {
    this.cbHandGrab = cb;
  }

  // ------------------------------------------------------------- tweens
  private addTween(dur: number, update: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur: this.reducedMotion ? 0.01 : dur, update, done });
  }

  // ------------------------------------------------------------- components
  private builderFor(id: string): (() => THREE.Group) | null {
    const map: Record<string, () => THREE.Group> = {
      spacecraft_bus: geo.createSpacecraftBus,
      nose_cone: geo.createNoseCone,
      payload_bay: geo.createPayloadBay,
      separator: geo.createSeparator,
      main_engine: geo.createMainEngine,
      fuel_tank: geo.createFuelTank,
      oxidizer_tank: geo.createOxidizerTank,
      first_stage_structure: geo.createFirstStageStructure,
      upper_stage_structure: geo.createUpperStageStructure,
      solar_panel: geo.createSolarPanel,
      battery: geo.createBattery,
      antenna: geo.createAntenna,
      relay: geo.createRelay,
      nav_sensor: geo.createNavigationSensor,
      avionics: geo.createAvionics,
      science: geo.createScienceInstrument,
      radiator: geo.createRadiator,
      landing_legs: geo.createLandingLegs,
    };
    return map[id] ?? null;
  }

  addComponent(inst: InstalledComponent, animate = true): void {
    if (this.visuals.has(inst.instanceId)) return;
    const build = this.builderFor(inst.id);
    if (!build) return;
    const group = build();
    group.traverse((o) => {
      o.userData.componentId = inst.instanceId;
      if (o instanceof THREE.Mesh) o.receiveShadow = true;
    });
    group.name = inst.instanceId;

    const def = COMPONENT_CATALOG[inst.id];
    const anchor = new THREE.Vector3(inst.position.x, inst.position.y, inst.position.z);
    const rotY = inst.id === 'solar_panel' ? 0 : 0;

    const visual: ComponentVisual = {
      group,
      def,
      anchor,
      anchorRotY: rotY,
      explodedOffset: this.computeExplodedOffset(inst, anchor),
      label: null,
      line: null,
    };
    this.visuals.set(inst.instanceId, visual);
    this.vehicle.add(group);

    if (!animate || this.reducedMotion) {
      group.position.copy(anchor);
      // Solar panels unfold quickly even without intro motion
      if (inst.id === 'solar_panel') this.deploySolarPanel(group, 0.01);
    } else {
      // Install animation: drop in from above the vehicle, snap onto anchor
      const startPos =
        inst.id === 'solar_panel'
          ? new THREE.Vector3(anchor.x, anchor.y + 1.2, anchor.z)
          : new THREE.Vector3(anchor.x + (anchor.y < 1 ? (Math.random() - 0.5) * 3 : 0), anchor.y + 6.5, anchor.z);
      group.position.copy(startPos);
      if (inst.id === 'solar_panel') {
        group.rotation.x = -1.2; // folded
        this.deploySolarPanel(group, 1.4);
      }
      this.addTween(1.15, (k) => {
        const e = ease(k);
        group.position.lerpVectors(startPos, anchor, e);
      });
      this.addTween(1.2, () => {}, () => this.snapFlash(anchor));
    }
  }

  private deploySolarPanel(group: THREE.Group, dur: number): void {
    this.addTween(dur, (k) => {
      group.rotation.x = -1.2 * (1 - ease(k));
    });
  }

  private snapFlash(pos: THREE.Vector3): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x99f2ff, transparent: true, opacity: 1 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(pos);
    this.scene.add(ring);
    this.addTween(0.5, (k) => {
      ring.scale.setScalar(1 + k * 2.2);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }, () => {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    });
  }

  removeComponent(instanceId: string): void {
    const visual = this.visuals.get(instanceId);
    if (!visual) return;
    if (this.selectedId === instanceId) this.selectComponent(null, false);
    if (this.handGrabbedId === instanceId) this.setHandGrab(null);
    this.vehicle.remove(visual.group);
    this.disposeObject(visual.group);
    if (visual.label) {
      visual.label.material.map?.dispose();
      visual.label.material.dispose();
    }
    if (visual.line) {
      visual.line.geometry.dispose();
      (visual.line.material as THREE.Material).dispose();
    }
    this.visuals.delete(instanceId);
  }

  clearAll(): void {
    for (const id of [...this.visuals.keys()]) this.removeComponent(id);
    this.vehicle.clear();
  }

  /** After a configuration change, tweens every part toward its layout anchor. */
  syncLayout(components: InstalledComponent[]): void {
    for (const inst of components) {
      const visual = this.visuals.get(inst.instanceId);
      if (!visual) continue;
      const target = new THREE.Vector3(inst.position.x, inst.position.y, inst.position.z);
      if (visual.anchor.distanceTo(target) < 0.01) continue;
      const from = visual.group.position.clone();
      visual.anchor.copy(target);
      visual.explodedOffset = this.computeExplodedOffset(inst, target);
      this.addTween(0.9, (k) => {
        visual.group.position.lerpVectors(from, this.explodeTarget(visual), ease(k));
      });
    }
  }

  private computeExplodedOffset(inst: InstalledComponent, anchor: THREE.Vector3): THREE.Vector3 {
    const step = EXPLODE_STEP[inst.id];
    const isSide =
      inst.stackRole === 'side' && COMPONENT_CATALOG[inst.id]?.stackRole === 'side';
    if (isSide && anchor.lengthSq() > 0.01) {
      const outward = anchor.clone().setY(0).normalize();
      return outward.multiplyScalar(3.2).add(new THREE.Vector3(0, step ?? 0, 0));
    }
    return new THREE.Vector3(step === undefined ? 0 : 0, step ?? 0, 0);
  }

  private explodeTarget(visual: ComponentVisual): THREE.Vector3 {
    return visual.anchor.clone().add(visual.explodedOffset.clone().multiplyScalar(this.explodedAmount));
  }

  private updateExplodedPositions(): void {
    for (const visual of this.visuals.values()) {
      visual.group.position.copy(this.explodeTarget(visual));
      // labels & connector lines visible in exploded mode
      if (this.explodedTarget === 1 && visual.label === null) {
        visual.label = this.makeLabel(`${visual.def.name}`, `${visual.def.mass} kg`);
        visual.label.position.copy(visual.group.position).add(new THREE.Vector3(1.6, 0.4, 0));
        this.scene.add(visual.label);
        const pts = [visual.anchor.clone().add(visual.explodedOffset).add(new THREE.Vector3(1.2, 0.3, 0))];
        const lineGeo = new THREE.BufferGeometry().setFromPoints([visual.group.position.clone(), pts[0]]);
        visual.line = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6 })
        );
        this.scene.add(visual.line);
      }
      if (visual.line) {
        const positions = (visual.line.geometry as THREE.BufferGeometry).attributes.position as
          | THREE.BufferAttribute
          | undefined;
        if (positions && positions.count >= 2) {
          positions.setXYZ(0, visual.group.position.x, visual.group.position.y, visual.group.position.z);
          positions.setXYZ(1, visual.group.position.x + 1.5, visual.group.position.y + 0.35, visual.group.position.z);
          positions.needsUpdate = true;
        }
        if (visual.label) {
          visual.label.position.copy(visual.group.position).add(new THREE.Vector3(1.7, 0.42, 0));
        }
      }
    }
  }

  setExploded(on: boolean): void {
    if (this.explodedTarget === (on ? 1 : 0)) return;
    this.explodedTarget = on ? 1 : 0;
    if (!on) {
      // detach labels/lines right away
      for (const visual of this.visuals.values()) {
        if (visual.label) {
          this.scene.remove(visual.label);
          visual.label.material.map?.dispose();
          visual.label.material.dispose();
          visual.label = null;
        }
        if (visual.line) {
          this.scene.remove(visual.line);
          visual.line.geometry.dispose();
          (visual.line.material as THREE.Material).dispose();
          visual.line = null;
        }
      }
    }
    const from = this.explodedAmount;
    this.addTween(1.3, (k) => {
      this.explodedAmount = from + (this.explodedTarget - from) * ease(k);
      this.updateExplodedPositions();
      if (this.selectedId) this.updateSelectionRing();
    });
  }

  isExploded(): boolean {
    return this.explodedTarget === 1;
  }

  private makeLabel(title: string, sub?: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(6, 14, 28, 0.85)';
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.8)';
    ctx.lineWidth = 4;
    const r = 24;
    ctx.beginPath();
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dbe7f5';
    ctx.font = 'bold 56px ui-monospace, monospace';
    ctx.fillText(title, 40, 78);
    if (sub) {
      ctx.fillStyle = '#00d9ff';
      ctx.font = '44px ui-monospace, monospace';
      ctx.fillText(sub, 40, 132);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.6, 1.125, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // ------------------------------------------------------------- selection
  private pick(instanceIds?: Set<string>): string | null {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const groups = [...this.visuals.entries()]
      .filter(([id]) => !instanceIds || instanceIds.has(id))
      .map(([, v]) => v.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.componentId) obj = obj.parent;
      return (obj?.userData.componentId as string) ?? null;
    }
    return null;
  }

  private onPointerMove(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    if (this.handControlActive) return;
    const id = this.pick();
    if (id !== this.hovered?.id) {
      this.clearHover();
      if (id && id !== this.selectedId) this.applyHover(id, true);
    }
  }

  private applyHover(id: string, on: boolean): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    const orig: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }[] = [];
    visual.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m && 'emissive' in m && m.emissive) {
          orig.push({ mat: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 });
          m.emissive.setHex(on ? CYAN : orig[orig.length - 1].emissive.getHex());
          if (on) m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.9);
        }
      }
    });
    this.hovered = on ? { id, orig: orig.length ? orig : [] } : null;
    if (!on) return;
    // store for clear — keep even empty list to block repeat work
    this.hovered = { id, orig };
  }

  private clearHover(): void {
    if (!this.hovered) return;
    for (const h of this.hovered.orig) {
      h.mat.emissive.copy(h.emissive);
      h.mat.emissiveIntensity = h.intensity;
    }
    this.hovered = null;
  }

  selectComponent(id: string | null, flyTo = false): void {
    if (this.hovered && this.hovered.id !== id) this.clearHover();
    this.selectedId = id;
    this.updateSelectionRing();
    if (id && flyTo) this.flyToComponent(id);
    if (!id) this.cbSelect?.(null);
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  private updateSelectionRing(): void {
    if (this.selectionRing) {
      this.scene.remove(this.selectionRing);
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
      this.selectionRing = null;
    }
    if (!this.selectedId) return;
    const visual = this.visuals.get(this.selectedId);
    if (!visual) return;
    const box = new THREE.Box3().setFromObject(visual.group);
    if (box.isEmpty()) return;
    box.expandByScalar(0.18);
    this.selectionRing = new THREE.Box3Helper(box, new THREE.Color(CYAN));
    const mat = this.selectionRing.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = 0.85;
    this.scene.add(this.selectionRing);
  }

  private onClick(e: MouseEvent): void {
    // Click treatments: if clicking empty space → deselect
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const id = this.pick();
    this.selectComponent(id, false);
    this.cbSelect?.(id);
  }

  // Click-and-hold (500 ms, no move) triggers the inspect camera move.
  private holdTimer: number | null = null;
  private holdStart = new THREE.Vector2();

  private onPointerDown(e: PointerEvent): void {
    this.holdStart.set(e.clientX, e.clientY);
    if (this.holdTimer) window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => {
      const id = this.pick();
      if (id) this.cbInspect?.(id);
      this.holdTimer = null;
    }, 500);
  }

  private onPointerUp(): void {
    if (this.holdTimer) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  // ------------------------------------------------------------- camera
  flyToComponent(id: string): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    const center = visual.group.position.clone();
    const distance = 5.2;
    const dir = new THREE.Vector3(0.55, 0.35, 0.8).normalize();
    this.flyCamera(center.clone().add(dir.multiplyScalar(distance)), center);
  }

  resetCamera(): void {
    this.flyCamera(new THREE.Vector3(9.5, 6.5, 12.5), new THREE.Vector3(0, 4.5, 0));
  }

  private cameraTweening = false;

  private flyCamera(pos: THREE.Vector3, target: THREE.Vector3): void {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.controls.enabled = false;
    this.cameraTweening = true;
    this.addTween(1.1, (k) => {
      const e = ease(k);
      this.camera.position.lerpVectors(fromPos, pos, e);
      this.controls.target.lerpVectors(fromTarget, target, e);
    }, () => {
      this.controls.enabled = true;
      this.cameraTweening = false;
    });
  }

  // ------------------------------------------------------------- demos
  setEngineActive(on: boolean): void {
    this.engineActive = on;
    if (on && !this.engineFlame) {
      const visual = [...this.visuals.values()].find((v) => v.def.id === 'main_engine');
      if (!visual) return;
      const flame = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 2.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xffb64a, transparent: true, opacity: 0.85 })
      );
      core.rotation.x = Math.PI;
      core.position.y = -1.9;
      flame.add(core);
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 3.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.35 })
      );
      plume.rotation.x = Math.PI;
      plume.position.y = -2.6;
      flame.add(plume);
      flame.position.copy(visual.group.position);
      this.scene.add(flame);
      this.engineFlame = flame;
    } else if (!on && this.engineFlame) {
      const flame = this.engineFlame;
      this.addTween(0.6, (k) => {
        flame.scale.setScalar(1 - k);
      }, () => {
        this.scene.remove(flame);
        flame.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
      });
      this.engineFlame = null;
    }
  }

  setMissionOps(on: boolean): void {
    this.missionView.visible = on;
    if (on) {
      // pull back to show the orbital map around the vehicle
      this.flyCamera(new THREE.Vector3(20, 8, 30), new THREE.Vector3(0, 4, 0));
    }
  }

  // ------------------------------------------------------------- intro scan
  startIntroScan(onDone: (() => void) | null): void {
    if (this.reducedMotion) {
      this.scanRig.visible = false;
      onDone?.();
      return;
    }
    this.scanRig.visible = true;
    const ring = this.scanRig.getObjectByName('scanRing') as THREE.Mesh;
    const plane = this.scanRig.getObjectByName('scanPlane') as THREE.Mesh;
    this.addTween(2.6, (k) => {
      const y = 0.2 + ease(k) * 9.2;
      ring.position.y = y;
      plane.position.y = y;
      ring.rotation.z = k * Math.PI * 2;
    }, () => {
      this.scanRig.visible = false;
      onDone?.();
    });
  }

  // ------------------------------------------------------------- hand tracking
  setHandControl(active: boolean): void {
    this.handControlActive = active;
    if (!active) {
      this.handCursor.visible = false;
      this.setHandGrab(null);
    }
  }

  handleHandFrame(frame: HandFrame): void {
    if (!this.handControlActive) return;
    // mirrored webcam image: flip x back
    this.handNdc.set((0.5 - frame.palm.x) * 2, -(frame.palm.y - 0.5) * 2);
    if (this.handGrabbedId) return; // ghost follows the grabbed part instead
    // project onto plane at controls target distance
    this.raycaster.setFromCamera(this.handNdc, this.camera);
    const target = this.controls.target;
    const camDir = this.raycaster.ray.direction.clone();
    const dist = target.distanceTo(this.camera.position);
    const pos = this.camera.position.clone().add(camDir.multiplyScalar(dist));
    this.handCursor.visible = true;
    this.handCursor.position.copy(pos);
  }

  handleHandCommand(cmd: GestureCommand): void {
    if (!this.handControlActive) return;
    switch (cmd.type) {
      case 'select': {
        this.raycaster.setFromCamera(new THREE.Vector2(cmd.ndc.x, cmd.ndc.y), this.camera);
        const groups = [...this.visuals.values()].map((v) => v.group);
        const hits = this.raycaster.intersectObjects(groups, true);
        if (hits.length > 0) {
          let obj: THREE.Object3D | null = hits[0].object;
          while (obj && !obj.userData.componentId) obj = obj.parent;
          const id = (obj?.userData.componentId as string) ?? null;
          if (id) this.setHandGrab(id);
        }
        break;
      }
      case 'move': {
        if (!this.handGrabbedId) break;
        const visual = this.visuals.get(this.handGrabbedId);
        if (!visual) break;
        this.raycaster.setFromCamera(new THREE.Vector2(cmd.ndc.x, cmd.ndc.y), this.camera);
        // drag on the vehicle plane: vertical plane through the part, facing camera
        const plane = new THREE.Plane();
        const camDir = this.camera.getWorldDirection(new THREE.Vector3());
        plane.setFromNormalAndCoplanarPoint(camDir.negate(), visual.anchor);
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, hit)) {
          // ghost cursor rides the component; group position eases to the hand point
          visual.group.position.lerp(hit, 0.35);
          this.handCursor.visible = false;
        }
        break;
      }
      case 'release': {
        if (!this.handGrabbedId) break;
        const visual = this.visuals.get(this.handGrabbedId);
        this.setHandGrab(null);
        if (!visual) break;
        // snap back to its installation anchor
        const snapped = visual.group.position.distanceTo(
          this.explodeTarget(visual)
        ) < 2.5;
        const from = visual.group.position.clone();
        this.addTween(0.8, (k) => {
          visual.group.position.lerpVectors(from, this.explodeTarget(visual), ease(k));
        });
        if (snapped) this.snapFlash(visual.anchor);
        break;
      }
    }
  }

  private setHandGrab(id: string | null): void {
    this.handGrabbedId = id;
    this.cbHandGrab?.(id);
    if (id) {
      const visual = this.visuals.get(id);
      if (visual) {
        this.handCursor.visible = true;
        this.handCursor.position.copy(visual.group.position);
      }
    }
  }

  isHandGrabbing(): boolean {
    return this.handGrabbedId !== null;
  }

  // ------------------------------------------------------------- lifecycle
  private disposeObject(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        o.geometry?.dispose();
        const mat = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }

  private onResize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private pulse = Math.sin(0) / 2 + 0.5;

  private animate = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.animate);

    const dt = 1 / 60;
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / Math.max(tw.dur, 0.0001));
      tw.update(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }

    // damping update is suppressed while a camera tween owns the controls
    if (!this.cameraTweening) {
      this.controls.update();
    }

    // hover raycast is event-driven; keep selection ring pulsing
    this.pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    if (this.selectionRing) {
      const mat = this.selectionRing.material as THREE.LineBasicMaterial;
      mat.opacity = 0.5 + 0.4 * this.pulse;
    }

    // hand ghost idle spin
    this.handCursor.rotation.y += 0.05;
    if (this.handGrabbedId) {
      const v = this.visuals.get(this.handGrabbedId);
      if (v) this.handCursor.position.copy(v.group.position);
    }

    // mission ops satellite
    if (this.missionView.visible) {
      this.satelliteAngle += 0.008;
      const r = 26;
      this.satelliteDot.position.set(
        Math.cos(this.satelliteAngle) * r,
        -30 + Math.sin(this.satelliteAngle * 2) * 1.2 + 4,
        Math.sin(this.satelliteAngle) * r * Math.sin(0.35)
      );
      this.satelliteDot.rotation.y += 0.1;
    }

    // engine flame flicker (scaled by ignition state)
    if (this.engineFlame) {
      this.flamePulse += this.engineActive ? 0.02 : -0.06; // fade in/out with ignition
      this.flamePulse = Math.max(0, Math.min(1, this.flamePulse));
      const f = (0.85 + 0.15 * Math.sin(performance.now() * 0.02) * Math.random()) * (0.25 + 0.75 * this.flamePulse);
      this.engineFlame.scale.set(f, 0.9 + 0.2 * f, f);
      this.engineFlame.rotation.y += 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    this.resizeObs.disconnect();
    this.clearAll();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
