// MAIN — application orchestrator for MISSIONFORGE.

import { SpacecraftScene } from './scenes/SpacecraftScene';
import {
  COMPONENT_CATALOG,
  GENERIC_MISSION,
  EngineeringResult,
  InstalledComponent,
  applyLayout,
  computeEngineering,
} from './lib/engineering';
import { MissionTemplate, getMission, scoreDesign } from './lib/missions';
import { MissionSimulator, MissionEvent } from './lib/simulation';
import { HandController } from './lib/handControl';
import { HandTracker, HandTrackingState } from './lib/handTracking';
import { createUI } from './ui/ui';

interface AppState {
  components: InstalledComponent[];
  selectedId: string | null;
  mission: MissionTemplate | null;
  sim: MissionSimulator | null;
  simRunning: boolean;
  simPaused: boolean;
  simSpeed: number;
}

const state: AppState = {
  components: [],
  selectedId: null,
  mission: null,
  sim: null,
  simRunning: false,
  simPaused: false,
  simSpeed: 720,
};

// Snapshot stack for undo (positions included)
const history: InstalledComponent[][] = [];

let scene: SpacecraftScene | null = null;
let ui: ReturnType<typeof createUI> | null = null;
const REQUIRED_CORE_IDS = Object.values(COMPONENT_CATALOG)
  .filter((d) => d.required)
  .map((d) => d.id);

function snapshot(): InstalledComponent[] {
  return state.components.map((c) => ({ ...c, position: { ...c.position } }));
}

function pushHistory(): void {
  history.push(snapshot());
  if (history.length > 40) history.shift();
}

function restore(snapshotList: InstalledComponent[]): void {
  state.components = snapshotList.map((c) => ({ ...c, position: { ...c.position } }));
  scene?.clearAll();
  for (const c of state.components) scene?.addComponent(c, false);
  state.selectedId = null;
  scene?.selectComponent(null);
  ui?.setSelected(null);
  refreshAll();
}

function makeInstance(id: string): InstalledComponent | null {
  const def = COMPONENT_CATALOG[id];
  if (!def) return null;
  const existing = state.components.filter((c) => c.id === id).length;
  if (def.maxInstances && existing >= def.maxInstances) {
    ui?.toast(`${def.name}: already at maximum ${def.maxInstances} of this component`, 'warning');
    return null;
  }
  return {
    ...def,
    instanceId: `${id}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    position: { x: 0, y: 0, z: 0 },
  };
}

function addComponent(id: string): void {
  if (state.simRunning) {
    ui?.toast('Mission running — let it finish or reset before changing the design', 'warning');
    return;
  }
  const inst = makeInstance(id);
  if (!inst) return;
  pushHistory();
  state.components.push(inst);
  applyLayout(state.components);
  scene?.syncLayout(state.components.filter((c) => c.instanceId !== inst.instanceId));
  const addedInst = state.components.find((c) => c.instanceId === inst.instanceId)!;
  scene?.addComponent(addedInst, true);
  refreshAll();
  ui?.toast(`${COMPONENT_CATALOG[id].name} installed at its mounting anchor`, 'success');
}

function removeSelected(): void {
  if (!state.selectedId) {
    ui?.toast('Select a component on the stage first', 'warning');
    return;
  }
  if (state.simRunning) {
    ui?.toast('Mission running — let it finish or reset before changing the design', 'warning');
    return;
  }
  pushHistory();
  const id = state.selectedId;
  state.components = state.components.filter((c) => c.instanceId !== id);
  state.selectedId = null;
  scene?.removeComponent(id);
  scene?.selectComponent(null);
  ui?.setSelected(null);
  applyLayout(state.components);
  scene?.syncLayout(state.components);
  refreshAll();
}

function resetDesign(): void {
  if (state.simRunning) stopSimLoop();
  restore([{ ...COMPONENT_CATALOG['spacecraft_bus'], instanceId: 'bus-1', position: { x: 0, y: 0, z: 0 } }]);
  history.length = 0;
  ui?.toast('Design reset — a main bus is the minimum viable vehicle', 'info');
}

function undo(): void {
  if (!history.length) {
    ui?.toast('Nothing left to undo', 'warning');
    return;
  }
  const snap = history.pop()!;
  state.simRunning = false;
  ui?.simControls(false);
  state.sim = null;
  scene?.setEngineActive(false);
  restore(snap);
}

function selectComponent(id: string | null): void {
  state.selectedId = id;
  scene?.selectComponent(id);
  const inst = state.components.find((c) => c.instanceId === id) ?? null;
  ui?.setSelected(inst ? COMPONENT_CATALOG[inst.id] : null, inst);
}

function refreshAll(): void {
  const counts: Record<string, number> = {};
  for (const c of state.components) counts[c.id] = (counts[c.id] ?? 0) + 1;
  ui?.refreshLibrary(counts);
  const installedRequired = state.components.filter((c) => REQUIRED_CORE_IDS.includes(c.id)).length;
  ui?.assemblyProgress(installedRequired, REQUIRED_CORE_IDS.length);
  updateTelemetry();
}

function updateTelemetry(): void {
  const ctx = state.mission ?? GENERIC_MISSION;
  cachedEngineering = computeEngineering(state.components, ctx);
  ui?.updateTelemetry(cachedEngineering);
}

let cachedEngineering: EngineeringResult | null = null;

// ------------------------------------------------------------------ mission loop
let missionRafId: number | null = null;
let lastFrameTime = 0;
let seenEventCount = 0;
let engineBurnUntilReal = 0;

function stopSimLoop(): void {
  if (missionRafId !== null) {
    cancelAnimationFrame(missionRafId);
    missionRafId = null;
  }
  state.simRunning = false;
  scene?.setEngineActive(false);
  ui?.simControls(false);
}

function launchMission(): void {
  if (!scene || !ui) return;
  const ctx = state.mission ?? null;
  if (!ctx) {
    ui.toast('Choose a mission template first (📋 Choose mission)', 'warning');
    return;
  }
  const eng = computeEngineering(state.components, ctx);
  if (!eng.isLaunchReady) {
    ui.toast(`Launch blocked — ${eng.launchBlockers[0]}`, 'error');
    return;
  }

  const sim = new MissionSimulator(state.components, ctx);
  sim.start();
  sim.setSpeed(state.simSpeed);
  state.sim = sim;
  state.simRunning = true;
  state.simPaused = false;
  seenEventCount = 0;
  ui.simControls(true);
  ui.toast(`⚡ Liftoff — ${ctx.title} underway`, 'success');

  scene.setEngineActive(true);
  engineBurnUntilReal = performance.now() + 3500; // ignition demo (visual only)

  lastFrameTime = performance.now();
  const loop = () => {
    if (!state.simRunning || !sim) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (!state.simPaused) {
      sim.step(dt);
      if (now > engineBurnUntilReal) scene?.setEngineActive(false);
      // surface new events
      const events = sim.getEvents();
      for (; seenEventCount < events.length; seenEventCount++) {
        ui?.pushEvent(events[seenEventCount]);
      }
      const p = sim.getProgress();
      ui?.updateMissionProgress({
        fraction: p,
        simSeconds: sim.getElapsedTimeS(),
        batteryPercent: sim.getBatteryPercent(),
        sunlit: sim.isSunlit(),
        loadShed: sim.getLoadShed(),
        dataGB: sim.getDataGB(),
        speed: sim.getSpeed(),
      });
    }
    if (sim.isComplete()) {
      state.simRunning = false;
      scene?.setEngineActive(false);
      ui?.simControls(false);
      const outcome = sim.getOutcome();
      // add a design-score note from the pre-launch engineering snapshot
      if (cachedEngineering) {
        const bonus = scoreDesign(
          {
            launchBlockers: [],
            warnings: cachedEngineering.warnings,
            budgetRemaining: cachedEngineering.budgetRemaining,
            budget: cachedEngineering.mission.budget,
            deltaVms: cachedEngineering.deltaVms,
            mission: cachedEngineering.mission,
            energyMarginWh: cachedEngineering.energyMarginWh,
            dataRateMbps: cachedEngineering.dataRateMbps,
          },
          outcome.objectives.filter((o) => o.met).length,
          outcome.objectives.length
        );
        outcome.score = Math.round((outcome.score + bonus) / 2);
      }
      ui?.showDebrief(ctx, outcome, sim.getEvents() as MissionEvent[]);
      state.sim = null;
      missionRafId = null;
      return;
    }
    missionRafId = requestAnimationFrame(loop);
  };
  missionRafId = requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ hand tracking
let handTracker: HandTracker | null = null;
let handController: HandController | null = null;
let handVideo: HTMLVideoElement | null = null;

async function enableHandTracking(): Promise<void> {
  if (!scene || !ui) return;
  if (!handTracker) handTracker = new HandTracker();
  if (!handController) {
    handVideo = document.createElement('video');
    handController = new HandController(handTracker, handVideo);
    handController.onCommand((cmd) => scene?.handleHandCommand(cmd));
    handController.onState((s: HandTrackingState) => ui?.updateHandTracking(s));
    handTracker.onFrame((f) => {
      ui?.drawHandFrame(f);
      scene?.handleHandFrame(f);
    });
  }
  await handController.startTracking();
  scene.setHandControl(true);
  if (handVideo) ui?.attachHandPreview(handVideo);
  ui?.toast('Hand tracking on — pinch to grab, open palm to release', 'success');
}

function disableHandTracking(): void {
  handController?.stopTracking();
  scene?.setHandControl(false);
  if (handTracker) ui?.updateHandTracking(handTracker.getState());
  ui?.toast('Hand tracking off — camera released', 'info');
}

// ------------------------------------------------------------------ boot
async function boot(): Promise<void> {
  const root = document.getElementById('root')!;
  root.innerHTML = '';

  const stage = document.createElement('div');
  stage.style.cssText = 'width:100vw; height:100vh; position:relative; overflow:hidden;';
  root.appendChild(stage);

  scene = new SpacecraftScene(stage);

  ui = createUI(stage, {
    onAddComponent: addComponent,
    onRemoveComponent: removeSelected,
    onToggleExploded: (on) => {
      scene?.setExploded(on);
      ui?.setExplodedMode(on && !!scene?.isExploded());
      ui?.toast(on ? 'Exploded view — click any part to learn about it' : 'Components reassembled', 'info');
    },
    onInspectSelected: () => {
      if (state.selectedId) {
        scene?.flyToComponent(state.selectedId);
        ui?.toast('Inspection mode — click “Full spacecraft” to return', 'info');
      } else {
        ui?.toast('Select a component first', 'warning');
      }
    },
    onResetView: () => {
      scene?.setExploded(false);
      ui?.setExplodedMode(false);
      scene?.resetCamera();
      selectComponent(null);
    },
    onUndo: undo,
    onResetDesign: resetDesign,
    onLaunch: launchMission,
    onPauseSim: (p) => (state.simPaused = p),
    onSimSpeed: (s) => {
      state.simSpeed = s;
      state.sim?.setSpeed(s);
    },
    onSetSimTime: (f) => state.sim?.seek(f),
    onSelectMission: (id) => {
      state.mission = getMission(id) ?? null;
      if (state.mission && ui) {
        ui.setMission(state.mission);
        updateTelemetry();
        ui.toast(`Mission: ${state.mission.title} — objectives listed on the right`, 'success');
      }
    },
    onMissionOps: (on) => {
      scene?.setMissionOps(on);
      ui?.setMissionOpsMode(on);
      ui?.toast(on ? 'Mission-operations view — orbital tracks active' : 'Back in the lab', 'info');
    },
    onEnableHandTracking: enableHandTracking,
    onDisableHandTracking: disableHandTracking,
  });

  ui.onBeginMission(() => {
    scene?.startIntroScan(null);
    scene?.resetCamera();
  });

  ui.showIntro();

  // Scene callbacks
  scene.onSelect((id) => selectComponent(id));
  scene.onInspect((id) => {
    selectComponent(id);
    scene?.flyToComponent(id);
    ui?.toast('Inspecting — spacebar-free: Esc or “Full spacecraft” to return', 'info');
  });
  scene.onHandGrab((id) => {
    if (id) {
      selectComponent(id);
      ui?.toast('Component grabbed — move your hand, open palm to drop', 'info');
    }
  });

  // Initial configuration: minimum viable satellite (bus only)
  restore([{ ...COMPONENT_CATALOG['spacecraft_bus'], instanceId: 'bus-1', position: { x: 0, y: 0, z: 0 } }]);
  scene.resetCamera();

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    switch (e.key) {
      case 'e':
      case 'E':
        scene && (scene.setExploded(!scene.isExploded()), ui?.setExplodedMode(scene.isExploded()));
        break;
      case 'i':
      case 'I':
        if (state.selectedId) scene?.flyToComponent(state.selectedId);
        break;
      case 'Escape':
        selectComponent(null);
        break;
      case 'Delete':
      case 'Backspace':
        removeSelected();
        break;
      case 'u':
      case 'U':
        undo();
        break;
      case 'r':
      case 'R':
        scene?.resetCamera();
        break;
      case 'm':
      case 'M':
        ui?.openMissionSelect();
        break;
      case ' ':
        if (state.simRunning) {
          state.simPaused = !state.simPaused;
          ui?.toast(state.simPaused ? 'Simulation paused' : 'Simulation resumed', 'info');
        } else if (state.mission) {
          launchMission();
        } else {
          ui?.openMissionSelect();
        }
        e.preventDefault();
        break;
      case '?':
        ui?.showShortcuts();
        break;
    }
  });
}

boot().catch((err) => console.error('MissionForge failed to start:', err, (err as Error)?.stack ?? ''));
