// UI — full-screen HUD over the 3D lab. Vanilla DOM, no framework.
// Every visible control is wired through callbacks registered by main.ts.

import {
  COMPONENT_CATALOG,
  ComponentDef,
  EngineeringResult,
  InstalledComponent,
} from '../lib/engineering';
import { MISSION_TEMPLATES, MissionTemplate } from '../lib/missions';
import {
  HandFrame,
  HandTrackingState,
} from '../lib/handTracking';
import { MissionEvent, MissionOutcome, formatMissionClock } from '../lib/simulation';

export type UIKind = 'info' | 'warning' | 'error' | 'success';

export interface UICallbacks {
  onAddComponent?: (id: string) => void;
  onRemoveComponent?: () => void;
  onToggleExploded?: (on: boolean) => void;
  onInspectSelected?: () => void;
  onResetView?: () => void;
  onUndo?: () => void;
  onResetDesign?: () => void;
  onLaunch?: () => void;
  onPauseSim?: (paused: boolean) => void;
  onSimSpeed?: (speed: number) => void;
  onSelectMission?: (id: string) => void;
  onMissionOps?: (on: boolean) => void;
  onEnableHandTracking?: () => void;
  onDisableHandTracking?: () => void;
  onSetSimTime?: (fraction: number) => void;
}

const CYAN = '#00d9ff';
const AMBER = '#ffb350';
const RED = '#ff6b6b';
const GREEN = '#3ddc86';
const PANEL = 'rgba(11, 18, 32, 0.94)';
const BORDER = 'rgba(0, 180, 230, 0.25)';
const FONT = "'Segoe UI', system-ui, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, monospace";

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  parent?: HTMLElement
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el.style, style);
  parent?.appendChild(el);
  return el;
}

function btn(label: string, onClick: () => void, style: Partial<CSSStyleDeclaration> = {}): HTMLButtonElement {
  const b = h('button', {
    background: 'rgba(0, 217, 255, 0.08)',
    border: `1px solid ${BORDER}`,
    color: CYAN,
    borderRadius: '6px',
    padding: '7px 12px',
    font: `12.5px ${MONO}`,
    cursor: 'pointer',
    letterSpacing: '0.4px',
    ...style,
  });
  b.textContent = label;
  b.onmouseenter = () => (b.style.background = 'rgba(0, 217, 255, 0.16)');
  b.onmouseleave = () => (b.style.background = 'rgba(0, 217, 255, 0.08)');
  b.onclick = onClick;
  return b;
}

export interface AppUI {
  // lifecycle
  showIntro: () => void;
  onBeginMission: (cb: () => void) => void;
  hideIntro: () => void;

  // hand tracking
  attachHandPreview: (video: HTMLVideoElement) => void;
  updateHandTracking: (state: HandTrackingState) => void;
  drawHandFrame: (frame: HandFrame | null) => void;

  // library / config
  refreshLibrary: (counts: Record<string, number>) => void;
  setSelected: (def: ComponentDef | null, inst?: InstalledComponent | null) => void;
  showComparison: (a: ComponentDef, b: ComponentDef) => void;
  assemblyProgress: (installed: number, total: number) => void;

  // telemetry
  updateTelemetry: (eng: EngineeringResult) => void;
  drawPowerSample: (point: { netPowerW: number; batteryPercent: number; sunlit: boolean }) => void;
  toast: (msg: string, kind?: UIKind) => void;

  // mission flow
  openMissionSelect: () => void;
  setMission: (mission: MissionTemplate) => void;
  launchAvailability: (eng: EngineeringResult) => void;
  simControls: (visible: boolean) => void;
  updateMissionProgress: (p: {
    fraction: number;
    simSeconds: number;
    batteryPercent: number;
    sunlit: boolean;
    loadShed: boolean;
    dataGB: number;
    speed: number;
  }) => void;
  pushEvent: (e: MissionEvent) => void;
  showDebrief: (mission: MissionTemplate, outcome: MissionOutcome, events: MissionEvent[]) => void;
  setExplodedMode: (on: boolean) => void;
  setMissionOpsMode: (on: boolean) => void;
  setTrackingBadge: (state: HandTrackingState) => void;
  showShortcuts: () => void;
}

export function createUI(container: HTMLElement, cbs: UICallbacks): AppUI {
  // ---------------------------------------------------------------- overlays
  const root = h('div', {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    fontFamily: FONT,
    zIndex: '50',
  }, container);
  root.style.pointerEvents = 'none';

  const interactive = (el: HTMLElement): void => {
    el.style.pointerEvents = 'auto';
  };

  // ---------------------------------------------------------------- toasts
  const toastStack = h('div', {
    position: 'fixed',
    top: '64px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'center',
    zIndex: '200',
  }, root);
  interactive(toastStack);

  function toast(msg: string, kind: UIKind = 'info'): void {
    const color = kind === 'error' ? RED : kind === 'warning' ? AMBER : kind === 'success' ? GREEN : CYAN;
    const t = h('div', {
      background: PANEL,
      border: `1px solid ${color}55`,
      color,
      padding: '9px 16px',
      borderRadius: '8px',
      font: `12.5px ${MONO}`,
      maxWidth: '560px',
      opacity: '0',
      transition: 'opacity 0.25s, transform 0.25s',
      transform: 'translateY(-6px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    }, toastStack);
    t.textContent = msg;
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 4200);
  }

  // ---------------------------------------------------------------- top bar
  const top = h('div', {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: '52px',
    background: 'linear-gradient(180deg, rgba(10,16,28,0.97), rgba(10,16,28,0.85))',
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 16px',
    zIndex: '110',
    backdropFilter: 'blur(6px)',
  }, root);
  interactive(top);

  const logo = h('div', {
    font: `600 15px ${FONT}`,
    color: '#eaf2fb',
    letterSpacing: '2.5px',
    whiteSpace: 'nowrap',
  }, top);
  logo.innerHTML = `<span style="color:${CYAN}">◆</span> MISSIONFORGE`;

  const missionChip = h('div', {
    font: `12px ${MONO}`,
    color: '#9fb4cc',
    padding: '4px 12px',
    border: `1px solid ${BORDER}`,
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  }, top);
  missionChip.textContent = 'No mission selected';

  h('div', { flex: '1' }, top);

  const clockLabel = h('div', {
    font: `600 13px ${MONO}`,
    color: '#eaf2fb',
    minWidth: '140px',
    textAlign: 'right',
    display: 'none',
  }, top);

  const sunChip = h('div', {
    font: `11px ${MONO}`,
    padding: '3px 9px',
    borderRadius: '4px',
    border: `1px solid ${BORDER}`,
    color: '#9fb4cc',
    display: 'none',
  }, top);
  sunChip.textContent = '☐ SUNLIGHT';

  const trackingBadge = h('div', {
    font: `11px ${MONO}`,
    padding: '4px 10px',
    borderRadius: '999px',
    border: `1px solid ${BORDER}`,
    color: '#9fb4cc',
    cursor: 'pointer',
  }, top);
  trackingBadge.textContent = '✋ HAND TRACKING OFF';
  trackingBadge.title = 'Toggle hand tracking';

  const helpBtn = btn('?', () => shortsModal(), { padding: '4px 10px' });
  top.appendChild(helpBtn);

  // ---------------------------------------------------------------- left library
  const left = h('div', {
    position: 'fixed',
    top: '52px',
    left: '0',
    bottom: '58px',
    width: '238px',
    background: PANEL,
    borderRight: `1px solid ${BORDER}`,
    overflowY: 'auto',
    padding: '12px',
    zIndex: '100',
  }, root);
  interactive(left);

  const libTitle = h('div', {
    font: `600 12px ${MONO}`,
    color: CYAN,
    letterSpacing: '1.5px',
    marginBottom: '4px',
  }, left);
  libTitle.textContent = 'COMPONENT LIBRARY';
  const libHint = h('div', {
    font: `10.5px ${FONT}`,
    color: '#71839c',
    marginBottom: '10px',
    lineHeight: '1.5',
  }, left);
  libHint.textContent = 'Click to install at its mounting anchor. Drag onto the stage works too.';

  const libCategoryEls = new Map<string, HTMLElement>();
  const library: Record<string, { btn: HTMLButtonElement; add: HTMLElement }> = {};

  const CATS: { name: ComponentDef['category']; order: string[] }[] = [
    { name: 'Structure', order: ['spacecraft_bus', 'nose_cone', 'payload_bay', 'first_stage_structure', 'upper_stage_structure', 'separator', 'landing_legs'] },
    { name: 'Propulsion', order: ['main_engine', 'fuel_tank', 'oxidizer_tank'] },
    { name: 'Power', order: ['solar_panel', 'battery'] },
    { name: 'Communications', order: ['antenna', 'relay'] },
    { name: 'Navigation', order: ['avionics', 'nav_sensor'] },
    { name: 'Science', order: ['science'] },
    { name: 'Thermal', order: ['radiator'] },
  ];

  for (const cat of CATS) {
    const catEl = h('div', { marginBottom: '10px' }, left);
    libCategoryEls.set(cat.name, catEl);
    const catHead = h('div', {
      font: `10px ${MONO}`,
      color: '#71839c',
      letterSpacing: '1.5px',
      margin: '10px 0 6px',
      textTransform: 'uppercase',
    }, catEl);
    catHead.textContent = cat.name;
    for (const id of cat.order) {
      const def = COMPONENT_CATALOG[id];
      if (!def) continue;
      const b = btn(def.name, () => cbs.onAddComponent?.(id), {
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
        padding: '7px 9px',
      });
      const add = h('span', { font: `10px ${MONO}`, color: '#71839c' }, b);
      add.textContent = `${def.mass}kg`;
      b.draggable = true;
      b.ondragstart = (ev) => {
        ev.dataTransfer?.setData('text/mf-component', id);
      };
      library[id] = { btn: b, add };
    }
  }

  // drag & drop install onto canvas

  // ---------------------------------------------------------------- right panel
  const right = h('div', {
    position: 'fixed',
    top: '52px',
    right: '0',
    bottom: '58px',
    width: '300px',
    background: PANEL,
    borderLeft: `1px solid ${BORDER}`,
    overflowY: 'auto',
    padding: '12px',
    zIndex: '100',
  }, root);
  interactive(right);

  const telTitle = h('div', {
    font: `600 12px ${MONO}`,
    color: CYAN,
    letterSpacing: '1.5px',
    marginBottom: '8px',
  }, right);
  telTitle.textContent = 'ENGINEERING TELEMETRY';

  const telBody = h('div', { font: `12px ${MONO}`, lineHeight: '1.7', color: '#cfe0f2' }, right);

  const warnBox = h('div', {
    marginTop: '10px',
    font: `11px ${MONO}`,
    lineHeight: '1.5',
    display: 'none',
  }, right);

  // bar + line charts
  const powerCanvas = h('canvas', { width: '264px', height: '74px', margin: '10px 0', display: 'block' });
  const batCanvas = h('canvas', { width: '264px', height: '64px', margin: '4px 0 10px', display: 'block', border: `1px solid ${BORDER}`, borderRadius: '6px' });
  const batLabel = h('div', { font: `10px ${MONO}`, color: '#71839c', marginTop: '8px' }, right);
  batLabel.textContent = 'BATTERY CHARGE (simulation live trace) — press LAUNCH to run';

  right.appendChild(powerCanvas);
  right.appendChild(batLabel);
  right.appendChild(batCanvas);

  const objectivesBox = h('div', { marginTop: '10px' }, right);
  const objTitle = h('div', { font: `600 11px ${MONO}`, color: '#9fb4cc', letterSpacing: '1px', marginBottom: '6px' }, objectivesBox);
  objTitle.textContent = 'MISSION OBJECTIVES';
  const objList = h('div', { font: `11px ${MONO}`, lineHeight: '1.6', color: '#cfe0f2' }, objectivesBox);

  // ---------------------------------------------------------------- inspector drawer
  const inspector = h('div', {
    position: 'fixed',
    top: '52px',
    right: '-360px',
    width: '348px',
    bottom: '58px',
    background: 'rgba(9, 15, 27, 0.97)',
    borderLeft: `1px solid ${BORDER}`,
    transition: 'right 0.35s cubic-bezier(0.2,0.8,0.2,1)',
    overflowY: 'auto',
    padding: '14px',
    zIndex: '120',
  }, root);
  interactive(inspector);

  const inspHeader = h('div', { display: 'flex', alignItems: 'center', gap: '8px' }, inspector);
  const inspTitle = h('div', { font: `600 15px ${FONT}`, color: '#eaf2fb', flex: '1' }, inspHeader);
  const inspClose = btn('✕', () => inspector.style.right = '-360px', { padding: '3px 9px' });
  inspHeader.appendChild(inspClose);

  const inspCat = h('div', { font: `10.5px ${MONO}`, color: AMBER, letterSpacing: '1.5px', margin: '4px 0 10px' }, inspector);

  // view toggle
  const toggleRow = h('div', { display: 'flex', gap: '6px', marginBottom: '10px' }, inspector);
  let studentMode = true;
  const studentBtn = btn("Explain like I'm a student", () => setInfoMode(true), { fontSize: '11px', padding: '5px 9px' });
  studentBtn.style.flex = '1';
  toggleRow.appendChild(studentBtn);
  const techBtn = btn('Technical details', () => setInfoMode(false), { fontSize: '11px', padding: '5px 9px' });
  techBtn.style.flex = '1';
  toggleRow.appendChild(techBtn);

  function setInfoMode(student: boolean): void {
    studentMode = student;
    studentBtn.style.borderColor = student ? CYAN : BORDER;
    studentBtn.style.background = student ? 'rgba(0,217,255,0.2)' : 'rgba(0,217,255,0.08)';
    techBtn.style.borderColor = student ? BORDER : CYAN;
    techBtn.style.background = student ? 'rgba(0,217,255,0.08)' : 'rgba(0,217,255,0.2)';
    renderInspector();
  }

  const inspBody = h('div', { font: `12.5px ${FONT}`, lineHeight: '1.65', color: '#cddaea' }, inspector);
  const quizBox = h('div', { marginTop: '12px', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '10px' }, inspector);
  const glossaryBox = h('details', { marginTop: '10px', color: '#9fb4cc' }, inspector);
  const glossaryHead = h('summary', { font: `11px ${MONO}`, cursor: 'pointer' }, glossaryBox);
  glossaryHead.textContent = 'GLOSSARY';
  const glossaryBody = h('div', { font: `11.5px ${FONT}`, lineHeight: '1.55', padding: '8px 2px' }, glossaryBox);

  const inspFooter = h('div', { display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }, inspector);
  const removeBtn = btn('Remove component', () => {
    cbs.onRemoveComponent?.();
    inspector.style.right = '-360px';
  }, { color: RED, borderColor: `${RED}44` });
  inspFooter.appendChild(removeBtn);
  const compareBtn = btn('Compare with library set', () => {
    const def = currentDef();
    if (def) showComparison(def, COMPONENT_CATALOG[def.id === 'solar_panel' ? 'battery' : 'solar_panel']);
  });
  inspFooter.appendChild(compareBtn);

  const GLOSSARY: [string, string][] = [
    ['Isp', 'Specific impulse: seconds of thrust per unit of propellant weight flow. Higher Isp = more velocity change per kg of propellant.'],
    ['Delta-v (Δv)', 'Velocity change a spacecraft can achieve. Budgets for maneuvers are expressed in m/s using the rocket equation.'],
    ['DoD', 'Depth of discharge: fraction of battery capacity used before recharging. Keeping DoD low extends cell life.'],
    ['Eclipse', 'The portion of each orbit spent in Earth\u2019s shadow, where solar arrays produce nothing.'],
    ['LEO', 'Low Earth orbit, roughly 200–2000 km altitude; ISS-class orbits take ~90 minutes per revolution.'],
    ['Mass ratio', 'Vehicle mass including propellant ÷ mass without it. Drives delta-v via Δv = Isp·g0·ln(mass ratio).'],
  ];
  for (const [term, defn] of GLOSSARY) {
    const row = h('div', { marginBottom: '6px' }, glossaryBody);
    row.innerHTML = `<b style="color:${CYAN}">${term}</b> — ${defn}`;
  }

  function currentDef(): ComponentDef | null {
    return inspectorRecord.def;
  }

  const inspectorRecord: { def: ComponentDef | null; inst: InstalledComponent | null } = { def: null, inst: null };

  function renderInspector(): void {
    const def = inspectorRecord.def;
    const inst = inspectorRecord.inst;
    if (!def) {
      inspector.style.right = '-360px';
      return;
    }
    inspector.style.right = '306px';
    inspTitle.textContent = def.name;
    inspCat.textContent = `${def.category.toUpperCase()}${def.required ? ' · REQUIRED SUBSYSTEM' : ''}`;
    const e = def.edu;
    if (studentMode) {
      inspBody.innerHTML = `
        <p><b style="color:${CYAN}">What it is.</b><br>${e.what}</p>
        <p><b style="color:${CYAN}">What it does & why it matters.</b><br>${e.why} ${e.how}</p>
        <p><b style="color:${CYAN}">Where it lives.</b><br>${e.where}</p>
        <p><b style="color:${AMBER}">If it fails or is missing:</b><br>${e.failure}</p>
        <p><b style="color:#9fb4cc">Real-world example:</b> ${e.example}</p>
        <p><b style="color:#9fb4cc">Fun fact:</b> ${e.funFact}</p>`;
    } else {
      const specRows = e.specs
        .map((s) => `<tr><td style="color:#9fb4cc;padding:2px 8px 2px 0">${s.label}</td><td style="color:#eaf2fb">${s.value} ${s.unit}</td></tr>`)
        .join('');
      inspBody.innerHTML = `
        <table style="font:12px ${MONO};margin-bottom:10px;border-collapse:collapse">${specRows}</table>
        <p><b style="color:${CYAN}">Function.</b><br>${e.how}</p>
        <p><b style="color:${CYAN}">System connections.</b><br>${e.connections}</p>
        <p><b style="color:${AMBER}">Design impact & trade-off.</b><br>${e.impact}</p>
        <p><b style="color:${AMBER}">Simulated-mission consequence.</b><br>${e.failure}</p>
        <p style="color:#71839c"><b>Configuration note:</b> ${inst ? `installed as ${inst.instanceId}` : 'currently not installed'}</p>`;
    }
    renderQuiz(def);
  }

  function renderQuiz(def: ComponentDef): void {
    quizBox.innerHTML = '';
    const qHead = h('div', { font: `600 11px ${MONO}`, color: '#9fb4cc', letterSpacing: '1px', marginBottom: '6px' }, quizBox);
    qHead.textContent = 'KNOWLEDGE CHECK';
    const q = h('div', { font: `12.5px ${FONT}`, lineHeight: '1.5', marginBottom: '8px', color: '#eaf2fb' }, quizBox);
    q.textContent = def.quiz.question;
    def.quiz.options.forEach((opt, i) => {
      const ob = btn(opt, () => {
        const correct = i === def.quiz.answerIndex;
        ob.style.borderColor = correct ? GREEN : RED;
        ob.style.color = correct ? GREEN : RED;
        result.textContent = correct
          ? `✓ Correct — ${def.quiz.explanation}`
          : `✗ Not quite — ${def.quiz.explanation}`;
        result.style.color = correct ? GREEN : AMBER;
      }, { display: 'block', width: '100%', textAlign: 'left', marginBottom: '4px', font: `12px ${FONT}`, padding: '6px 9px' });
      quizBox.appendChild(ob);
    });
    const result = h('div', { font: `11.5px ${FONT}`, lineHeight: '1.5', marginTop: '6px', color: '#9fb4cc' }, quizBox);
    result.textContent = 'Pick an answer to reveal the explanation.';
  }

  // ---------------------------------------------------------------- bottom bar
  const bottom = h('div', {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    height: '58px',
    background: 'linear-gradient(0deg, rgba(10,16,28,0.97), rgba(10,16,28,0.85))',
    borderTop: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 14px',
    zIndex: '110',
    backdropFilter: 'blur(6px)',
  }, root);
  interactive(bottom);

  const assembleLabel = h('div', { font: `11px ${MONO}`, color: '#9fb4cc', minWidth: '132px' }, bottom);
  assembleLabel.textContent = 'ASSEMBLY 0/12';

  bottom.appendChild(btn('↩ Undo', () => cbs.onUndo?.()));
  bottom.appendChild(btn('⟲ Reset design', () => cbs.onResetDesign?.()));
  bottom.appendChild(btn('⇤ Full spacecraft', () => cbs.onResetView?.()));

  const explodeBtn = btn('❋ Exploded view', () => cbs.onToggleExploded?.(!currentExploded));
  bottom.appendChild(explodeBtn);
  let currentExploded = false;

  const inspectBtn = btn('🔎 Inspect selected', () => cbs.onInspectSelected?.());
  bottom.appendChild(inspectBtn);

  const opsBtn = btn('🛰 Mission ops', () => cbs.onMissionOps?.(!currentOps));
  bottom.appendChild(opsBtn);
  let currentOps = false;

  const handBtn = btn('✋ Enable hand tracking', () => cbs.onEnableHandTracking?.());
  bottom.appendChild(handBtn);

  bottom.appendChild(h('div', { width: '1px', height: '30px', background: BORDER, margin: '0 4px' }));

  // sim controls (hidden until launch)
  let paused = false;
  let speed = 720;
  const simBox = h('div', { display: 'none', alignItems: 'center', gap: '6px' }, bottom);
  const pauseBtn = btn('⏸ Pause', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    cbs.onPauseSim?.(paused);
  });
  simBox.appendChild(pauseBtn);
  const speedBtn = btn('720× speed', () => {
    speed = speed === 720 ? 240 : speed === 240 ? 60 : 720;
    speedBtn.textContent = `${speed}× speed`;
    cbs.onSimSpeed?.(speed);
  });
  simBox.appendChild(speedBtn);
  const scrub = h('input', {
    width: '110px',
    accentColor: CYAN,
  }) as HTMLInputElement;
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.value = '0';
  scrub.oninput = () => cbs.onSetSimTime?.(Number(scrub.value) / 1000);
  simBox.appendChild(scrub);

  const missionBtn = btn('📋 Choose mission', () => openMissionSelect());
  bottom.appendChild(missionBtn);

  const launchBtn = btn('⚡ LAUNCH MISSION', () => cbs.onLaunch?.(), {
    background: 'linear-gradient(180deg, rgba(0,217,255,0.25), rgba(0,120,180,0.2))',
    color: '#eaffff',
    font: `600 13px ${MONO}`,
    padding: '10px 18px',
    letterSpacing: '1px',
  });
  bottom.appendChild(launchBtn);

  const setLaunchEnabled = (ready: boolean, reasons: string): void => {
    launchBtn.style.opacity = ready ? '1' : '0.45';
    launchBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
    launchBtn.title = ready ? 'Configuration satisfies this mission\u2019s constraints' : reasons;
  };

  // drag & drop from library onto the stage (positioned center → install)
  const dropOverlay = h('div', {
    position: 'fixed',
    inset: '0',
    display: 'none',
    border: `2px dashed ${CYAN}66`,
    background: 'rgba(0,217,255,0.05)',
    zIndex: '90',
  }, root);
  interactive(dropOverlay);
  dropOverlay.ondragover = (e) => e.preventDefault();
  dropOverlay.ondrop = (e) => {
    e.preventDefault();
    dropOverlay.style.display = 'none';
    const id = e.dataTransfer?.getData('text/mf-component') ?? '';
    if (id) cbs.onAddComponent?.(id);
  };
  left.addEventListener('dragstart', () => (dropOverlay.style.display = 'block'));
  left.addEventListener('dragend', () => (dropOverlay.style.display = 'none'));

  // ---------------------------------------------------------------- mission select modal
  let missionSelectEl: HTMLElement | null = null;
  function openMissionSelect(): void {
    if (missionSelectEl) return;
    const modal = h('div', {
      position: 'fixed',
      inset: '0',
      background: 'rgba(4, 8, 16, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '300',
      overflowY: 'auto',
    }, root);
    interactive(modal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    function closeModal(): void {
      modal.remove();
      missionSelectEl = null;
    }

    const card = h('div', {
      background: PANEL,
      border: `1px solid ${BORDER}`,
      borderRadius: '12px',
      padding: '22px',
      width: 'min(880px, 92vw)',
      maxHeight: '86vh',
      overflowY: 'auto',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    }, modal);
    const title = h('div', { font: `600 18px ${FONT}`, color: '#eaf2fb', marginBottom: '4px' }, card);
    title.textContent = 'Choose a mission template';
    const sub = h('div', { font: `12.5px ${FONT}`, color: '#9fb4cc', marginBottom: '16px' }, card);
    sub.textContent = 'Each mission defines its own objectives, constraints and scoring. The same spacecraft will not fit all of them.';

    const grid = h('div', { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }, card);
    for (const m of MISSION_TEMPLATES) {
      const cardEl = h('div', {
        border: `1px solid ${BORDER}`,
        borderRadius: '10px',
        padding: '14px',
        cursor: 'pointer',
        background: 'rgba(0,217,255,0.04)',
        transition: 'border-color 0.2s, background 0.2s',
      }, grid);
      cardEl.onmouseenter = () => {
        cardEl.style.borderColor = CYAN;
        cardEl.style.background = 'rgba(0,217,255,0.09)';
      };
      cardEl.onmouseleave = () => {
        cardEl.style.borderColor = BORDER;
        cardEl.style.background = 'rgba(0,217,255,0.04)';
      };
      cardEl.onclick = () => {
        cbs.onSelectMission?.(m.id);
        closeModal();
      };
      cardEl.innerHTML = `
        <div style="font:600 14px ${FONT};color:${CYAN};margin-bottom:2px">${m.title}</div>
        <div style="font:10.5px ${MONO};color:#9fb4cc;margin-bottom:8px">${m.tagline} · ≤${m.maxMass}kg · $${m.budget.toLocaleString()}${m.requiresLanding ? ' · landing' : ''}</div>
        <div style="font:12px ${FONT};color:#cddaea;line-height:1.5">${m.description}</div>`;
    }
    missionSelectEl = modal;
  }

  // ---------------------------------------------------------------- comparison modal
  function showComparison(a: ComponentDef, b: ComponentDef): void {
    const modal = h('div', {
      position: 'fixed',
      inset: '0',
      background: 'rgba(4, 8, 16, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '300',
      overflowY: 'auto',
    }, root);
    interactive(modal);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    const card = h('div', {
      background: PANEL,
      border: `1px solid ${BORDER}`,
      borderRadius: '12px',
      padding: '20px',
      width: 'min(680px, 92vw)',
      maxHeight: '86vh',
      overflowY: 'auto',
    }, modal);

    const title = h('div', { font: `600 15px ${FONT}`, color: CYAN, marginBottom: '10px' }, card);
    title.textContent = `COMPONENT COMPARISON — ${a.name} vs ${b.name}`;

    const rows: [string, (d: ComponentDef) => string][] = [
      ['Role', (d) => `${d.category} · capability: ${d.capability ?? '—'}`],
      ['Mass', (d) => `${d.mass} kg`],
      ['Cost', (d) => `$${d.cost.toLocaleString()}`],
      ['Power generation', (d) => (d.powerGen ? `${d.powerGen} W` : '—')],
      ['Power consumption', (d) => (d.powerConsume ? `${d.powerConsume} W` : '—')],
      ['Energy capacity', (d) => (d.energyCapacity ? `${d.energyCapacity} Wh` : '—')],
      ['Data rate', (d) => (d.dataRateMbps ? `${d.dataRateMbps} Mbps` : '—')],
      ['Specific impulse', (d) => (d.isp ? `${d.isp} s` : '—')],
      ['Propellant mass', (d) => (d.propellantMass ? `${d.propellantMass} kg` : '—')],
      ['Max instances', (d) => (d.maxInstances ? `${d.maxInstances}` : 'unlimited')],
    ];
    for (const [label, get] of rows) {
      const row = h('div', {
        font: `12px ${MONO}`,
        color: '#cddaea',
        display: 'flex',
        gap: '10px',
        padding: '5px 0',
        borderBottom: `1px solid ${BORDER}44`,
      }, card);
      const lab = h('span', { color: '#71839c', width: '150px', flex: 'none' }, row);
      lab.textContent = label;
      const va = h('span', { width: '200px' }, row);
      va.textContent = get(a);
      const vb = h('span', {}, row);
      vb.textContent = get(b);
    }

    const note = h('div', { font: `11.5px ${FONT}`, color: '#9fb4cc', lineHeight: '1.55', marginTop: '10px' }, card);
    note.textContent = `Swapping ${a.name} for ${b.name} changes exactly the numbers above — the live telemetry responds the moment you change the design.`;
  }

  // ---------------------------------------------------------------- debrief modal
  function showDebrief(mission: MissionTemplate, outcome: MissionOutcome, events: MissionEvent[]): void {
    const modal = h('div', {
      position: 'fixed',
      inset: '0',
      background: 'rgba(4, 8, 16, 0.78)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '300',
      padding: '20px',
    }, root);
    interactive(modal);
    const card = h('div', {
      background: PANEL,
      border: `1px solid ${outcome.success ? GREEN : RED}66`,
      borderRadius: '12px',
      padding: '20px',
      width: 'min(760px, 94vw)',
      maxHeight: '88vh',
      overflowY: 'auto',
      boxShadow: `0 24px 90px rgba(0,0,0,0.65), 0 0 0 1px ${outcome.success ? GREEN : RED}22`,
    }, modal);

    const verdict = h('div', {
      font: `700 20px ${FONT}`,
      color: outcome.success ? GREEN : RED,
      marginBottom: '2px',
    }, card);
    verdict.textContent = outcome.success ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';

    const missionSub = h('div', { font: `11.5px ${MONO}`, color: '#9fb4cc', marginBottom: '10px' }, card);
    missionSub.textContent = `${mission.title} — final mission report`;

    const score = h('div', { font: `12px ${MONO}`, color: '#9fb4cc', marginBottom: '12px' }, card);
    score.textContent = `Score ${outcome.score}/100 · data returned ${outcome.dataVolumeGB.toFixed(1)} GB · propellant spent ${Math.round(outcome.propellantUsedKg)} kg`;

    const objTitle = h('div', { font: `600 12px ${MONO}`, color: CYAN, letterSpacing: '1px', margin: '8px 0 6px' }, card);
    objTitle.textContent = 'OBJECTIVES';
    for (const o of outcome.objectives) {
      const row = h('div', { font: `12.5px ${FONT}`, lineHeight: '1.6', color: o.met ? GREEN : RED }, card);
      row.innerHTML = `${o.met ? '✓' : '✗'} ${o.label}${o.met ? '' : ` — <span style="color:#9fb4cc">${o.hint}</span>`}`;
    }

    const recTitle = h('div', { font: `600 12px ${MONO}`, color: AMBER, letterSpacing: '1px', margin: '12px 0 4px' }, card);
    recTitle.textContent = 'ENGINEERING FEEDBACK';
    for (const r of outcome.recommendations) {
      const row = h('div', { font: `12.5px ${FONT}`, color: '#cddaea', lineHeight: '1.55', marginBottom: '4px' }, card);
      row.textContent = `• ${r}`;
    }

    const tlTitle = h('div', { font: `600 12px ${MONO}`, color: '#9fb4cc', letterSpacing: '1px', margin: '12px 0 4px' }, card);
    tlTitle.textContent = 'EVENT TIMELINE';
    const tl = h('div', {
      font: `11px ${MONO}`,
      color: '#9fb4cc',
      border: `1px solid ${BORDER}`,
      borderRadius: '8px',
      padding: '10px',
      maxHeight: '180px',
      overflowY: 'auto',
      lineHeight: '1.7',
    }, card);
    for (const e of events) {
      const color = e.severity === 'critical' ? RED : e.severity === 'warning' ? AMBER : '#9fb4cc';
      const rowEl = h('div', {}, tl);
      rowEl.innerHTML = `<span style="color:${CYAN}">${formatMissionClock(e.simTime)}</span> <span style="color:${color}">${e.message}</span>`;
    }

    const foot = h('div', { display: 'flex', gap: '8px', marginTop: '14px' }, card);
    foot.appendChild(btn('⟲ Design again', () => {
      modal.remove();
      cbs.onResetView?.();
    }));
    foot.appendChild(btn('Back to lab', () => modal.remove()));
  }

  // ---------------------------------------------------------------- intro
  let introEl: HTMLElement | null = null;
  const introBeginCb: { cb: (() => void) | null } = { cb: null };
  function showIntro(): void {
    if (introEl) return;
    const ov = h('div', {
      position: 'fixed',
      inset: '0',
      background: 'radial-gradient(ellipse at 50% 40%, rgba(8,18,38,0.55), rgba(5,10,20,0.9))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '400',
      transition: 'opacity 0.6s',
    }, root);
    interactive(ov);
    const box = h('div', { textAlign: 'center' }, ov);
    const title = h('div', {
      font: `700 34px ${FONT}`,
      color: '#eaf2fb',
      letterSpacing: '6px',
      textShadow: `0 0 28px ${CYAN}55`,
    }, box);
    title.innerHTML = `MISSION<span style="color:${CYAN}">FORGE</span>`;
    const tag = h('div', { font: `13px ${MONO}`, color: '#9fb4cc', letterSpacing: '2px', margin: '10px 0 26px' }, box);
    tag.textContent = 'AEROSPACE ENGINEERING LABORATORY — BUILD IT. TEST IT. FLY IT.';
    box.appendChild(btn('▶  BEGIN MISSION DESIGN', () => {
      ov.style.opacity = '0';
      introBeginCb.cb?.();
      setTimeout(() => ov.remove(), 650);
      introEl = null;
    }, { font: `600 14px ${MONO}`, padding: '12px 26px' }));
    introEl = ov;
  }

  function hideIntro(): void {
    if (introEl) {
      introEl.remove();
      introEl = null;
    }
  }

  // ---------------------------------------------------------------- shortcuts modal
  function shortsModal(): void {
    const modal = h('div', {
      position: 'fixed', inset: '0', background: 'rgba(4,8,16,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '300',
    }, root);
    interactive(modal);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    const card = h('div', {
      background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '12px',
      padding: '18px 22px', width: 'min(460px, 92vw)', font: `12.5px ${MONO}`, lineHeight: '2', color: '#cfe0f2',
    }, modal);
    card.innerHTML = `
      <div style="font-weight:600;color:${CYAN};letter-spacing:1px;margin-bottom:8px">KEYBOARD SHORTCUTS</div>
      <div><b>E</b> — toggle exploded view</div>
      <div><b>I</b> — inspect selected component</div>
      <div><b>Del</b> — remove selected component</div>
      <div><b>Esc</b> — clear selection</div>
      <div><b>U</b> — undo last configuration change</div>
      <div><b>R</b> — reset camera</div>
      <div><b>M</b> — open mission selector</div>
      <div><b>Space</b> — pause / resume simulation</div>
      <div style="color:#71839c;margin-top:8px">Mouse: drag = orbit · scroll = zoom · click = select · click-hold = inspect · drag library item = install</div>`;
  }

  // ---------------------------------------------------------------- hand tracking panel
  const handPanel = h('div', {
    position: 'fixed',
    left: '12px',
    bottom: '70px',
    width: '250px',
    background: PANEL,
    border: `1px solid ${BORDER}`,
    borderRadius: '10px',
    padding: '10px',
    display: 'none',
    zIndex: '130',
  }, root);
  interactive(handPanel);

  const handTitle = h('div', { font: `600 11px ${MONO}`, color: CYAN, letterSpacing: '1px', marginBottom: '6px' }, handPanel);
  handTitle.textContent = 'HAND TRACKING';
  const handStatus = h('div', { font: `11px ${MONO}`, color: '#9fb4cc', marginBottom: '6px', minHeight: '16px' }, handPanel);
  const handVideoWrap = h('div', { position: 'relative', borderRadius: '6px', overflow: 'hidden', background: '#05080f' }, handPanel);
  const handVideo = h('video', {
    width: '100%',
    display: 'block',
    transform: 'scaleX(-1)',
    height: '150px',
    objectFit: 'cover',
  }) as HTMLVideoElement;
  handVideo.autoplay = true;
  handVideo.muted = true;
  handVideoWrap.appendChild(handVideo);
  const handCanvas = h('canvas', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  }) as HTMLCanvasElement;
  handVideoWrap.appendChild(handCanvas);
  const handLegend = h('div', { font: `10px ${FONT}`, color: '#71839c', marginTop: '6px', lineHeight: '1.5' }, handPanel);
  handLegend.innerHTML = `<b style="color:${CYAN}">Pinch</b> = grab &amp; move a part · <b style="color:${AMBER}">Open palm</b> = release`;
  const handOff = h('div', { marginTop: '8px', display: 'none' }, handPanel);
  handOff.appendChild(btn('Disable tracking', () => cbs.onDisableHandTracking?.()));

  // ---------------------------------------------------------------- return API
  const ctx2d = handCanvas.getContext('2d')!;
  function drawHandFrame(frame: HandFrame | null): void {
    const w = handCanvas.width = handVideo.videoWidth || 640;
    const hgt = handCanvas.height = handVideo.videoHeight || 480;
    ctx2d.clearRect(0, 0, w, hgt);
    if (!frame) return;
    ctx2d.save();
    ctx2d.translate(w, 0);
    ctx2d.scale(-1, 1); // mirror to match displayed video
    const chains = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
    ];
    ctx2d.strokeStyle = frame.gesture === 'pinch' ? AMBER : CYAN;
    ctx2d.lineWidth = 2.2;
    for (const [a, b] of chains) {
      ctx2d.beginPath();
      ctx2d.moveTo(frame.landmarks[a].x * w, frame.landmarks[a].y * hgt);
      ctx2d.lineTo(frame.landmarks[b].x * w, frame.landmarks[b].y * hgt);
      ctx2d.stroke();
    }
    ctx2d.fillStyle = frame.gesture === 'pinch' ? AMBER : '#eaf2fb';
    for (const p of frame.landmarks) {
      ctx2d.beginPath();
      ctx2d.arc(p.x * w, p.y * hgt, 3, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.restore();
  }

  const batteryHist: { batteryPercent: number; sunlit: boolean }[] = [];
  const powerHist: { netPowerW: number; batteryPercent: number; sunlit: boolean }[] = [];
  let engine: EngineeringResult | null = null;
  let currentMission: MissionTemplate | null = null;

  function drawPowerChart(): void {
    if (!engine) return;
    const ctx = powerCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, powerCanvas.width, powerCanvas.height);
    const total = Math.max(engine.powerGenerationW, engine.powerConsumptionW, 1);

    // live net-power trace (samples arrive via drawPowerSample while a mission runs)
    const bandH = 20;
    if (powerHist.length > 1) {
      const stepX = powerCanvas.width / 240;
      powerHist.forEach((s, i) => {
        const x = powerCanvas.width - (powerHist.length - 1 - i) * stepX;
        if (!s.sunlit) {
          ctx.fillStyle = 'rgba(10, 16, 30, 0.6)';
          ctx.fillRect(x, 0, stepX, bandH);
        }
      });
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      powerHist.forEach((s, i) => {
        const x = powerCanvas.width - (powerHist.length - 1 - i) * stepX;
        const norm = Math.max(-1, Math.min(1, s.netPowerW / (total * 1.5)));
        ctx.lineTo(x, bandH / 2 - norm * (bandH / 2 - 2));
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = '#39485e';
      ctx.font = '10px monospace';
      ctx.fillText('— live net-power trace begins at launch —', 0, 12);
    }
    const barY = powerCanvas.height - 22;
    const wGen = (engine.powerGenerationW / total) * powerCanvas.width;
    const wUse = (engine.powerConsumptionW / total) * powerCanvas.width;
    ctx.fillStyle = 'rgba(61,220,134,0.8)';
    ctx.fillRect(0, barY - 14, wGen, 10);
    ctx.fillStyle = 'rgba(255,107,107,0.8)';
    ctx.fillRect(0, barY, wUse, 10);
    ctx.fillStyle = '#71839c';
    ctx.font = '10px monospace';
    ctx.fillText(`GENERATION ${Math.round(engine.powerGenerationW)} W`, 0, barY - 18);
    ctx.fillText(`CONSUMPTION ${Math.round(engine.powerConsumptionW)} W`, 0, barY + 10);
  }

  function drawBatteryChart(): void {
    const ctx = batCanvas.getContext('2d')!;
    const w = batCanvas.width;
    const hgt = batCanvas.height;
    ctx.clearRect(0, 0, w, hgt);
    if (batteryHist.length < 2) {
      ctx.fillStyle = '#39485e';
      ctx.font = '11px monospace';
      ctx.fillText('— live trace begins at launch —', 12, hgt / 2 + 4);
      return;
    }
    const stepX = w / Math.max(batteryHist.length - 1, 1);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    batteryHist.forEach((p, i) => {
      const x = i * stepX;
      const y = hgt - (p.batteryPercent / 100) * (hgt - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // eclipse shading
    ctx.fillStyle = 'rgba(10, 16, 30, 0.55)';
    batteryHist.forEach((p, i) => {
      if (!p.sunlit) {
        ctx.fillRect(i * stepX, 0, stepX, hgt);
      }
    });
  }

  const api: AppUI = {
    showIntro,
    hideIntro,
    onBeginMission: (cb) => {
      introBeginCb.cb = cb;
    },
    attachHandPreview: (video) => {
      handVideo.srcObject = video.srcObject;
      handVideo.play().catch(() => {});
    },
    toast,
    drawPowerSample: (point) => {
      powerHist.push(point);
      if (powerHist.length > 240) powerHist.shift();
      drawPowerChart();
    },
    updateHandTracking: (state) => {
      handBtn.textContent = state.status === 'tracking' || state.status === 'no_hands'
        ? '✋ Disable hand tracking'
        : '✋ Enable hand tracking';
      handBtn.onclick = () =>
        (state.status === 'tracking' || state.status === 'no_hands'
          ? cbs.onDisableHandTracking?.()
          : cbs.onEnableHandTracking?.());
      const color =
        state.status === 'tracking' ? GREEN :
        state.status === 'denied' || state.status === 'error' ? RED :
        state.status === 'no_hands' ? AMBER : '#9fb4cc';
      handStatus.style.color = color;
      handStatus.textContent = state.message;
      handPanel.style.display = state.status === 'idle' ? 'none' : 'block';
      handOff.style.display = state.status === 'tracking' || state.status === 'no_hands' ? 'block' : 'none';
      trackingBadge.textContent = `✋ ${state.status.toUpperCase()}`;
      trackingBadge.style.color = color;
    },
    drawHandFrame,
    refreshLibrary: (counts) => {
      for (const [id, rec] of Object.entries(library)) {
        const def = COMPONENT_CATALOG[id];
        const n = counts[id] ?? 0;
        const max = def?.maxInstances ?? 99;
        const full = def?.maxInstances ? n >= max : false;
        rec.btn.disabled = full;
        rec.btn.style.opacity = full ? '0.4' : '1';
        rec.btn.title = full ? `${def.name}: maximum ${max} installed` : def.description;
        rec.add.textContent = `${def.mass}kg ${full ? '· MAX' : `· ${n}/${max}`}`;
      }
    },
    setSelected: (def, inst) => {
      inspectorRecord.def = def;
      inspectorRecord.inst = inst ?? null;
      if (def) renderInspector();
      else inspector.style.right = '-360px';
    },
    showComparison: (a, b) => {
      const modal = h('div', {
        position: 'fixed', inset: '0', background: 'rgba(4,8,16,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '300',
      }, root);
      interactive(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
      const card = h('div', {
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '12px',
        padding: '20px', width: 'min(520px, 92vw)', font: `12.5px ${MONO}`,
      }, modal);
      const rows = [
        ['Mass', `${a.mass} kg`, `${b.mass} kg`],
        ['Cost', `$${a.cost.toLocaleString()}`, `$${b.cost.toLocaleString()}`],
        ['Net power (W)', `${(a.powerGen ?? 0) - (a.powerConsume ?? 0)}`, `${(b.powerGen ?? 0) - (b.powerConsume ?? 0)}`],
        ['Capability', a.capability ?? '—', b.capability ?? '—'],
        ['Max units', String(a.maxInstances ?? '—'), String(b.maxInstances ?? '—')],
      ];
      card.innerHTML = `
        <div style="font:600 15px ${FONT};color:${CYAN};margin-bottom:10px">COMPONENT COMPARISON</div>
        <table style="width:100%;border-collapse:collapse;line-height:2">
          <tr><th></th><th style="color:#eaf2fb;text-align:left;color:${CYAN}">${a.name}</th><th style="color:${CYAN};text-align:left">${b.name}</th></tr>
          ${rows.map((r) => `<tr><td style="color:#71839c">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
        </table>
        <div style="font:11px ${FONT};color:#9fb4cc;margin-top:10px">Tip: shift-click a second component in the library or on the stage to open this comparison at any time.</div>`;
    },
    assemblyProgress: (installed, total) => {
      assembleLabel.textContent = `ASSEMBLY ${installed}/${total}`;
    },
    updateTelemetry: (eng) => {
      engine = eng;
      const dv = eng.deltaVms === null
        ? '<span style="color:#71839c">not enough data</span>'
        : `<span style="color:${CYAN}">${Math.round(eng.deltaVms)} m/s</span>`;
      telBody.innerHTML = `
        <div>MASS <span style="color:#eaf2fb">${eng.totalMassKg.toFixed(0)} / ${eng.maxMassKg} kg</span></div>
        <div style="padding-left:14px;color:#9fb4cc">payload ${eng.payloadMassKg} kg · propellant ${eng.propellantMassKg} kg · margin ${eng.massMarginKg.toFixed(0)} kg</div>
        <div>ΔV (Tsiolkovsky) ${dv}</div>
        <div>COMMS <span style="color:${CYAN}">${eng.dataRateMbps} Mbps</span></div>
        <div>BATTERY ${eng.batteryUsableWh.toFixed(0)} Wh usable · eclipse need ${eng.eclipseEnergyNeedWh.toFixed(0)} Wh
          <span style="color:${eng.energyMarginWh >= 0 ? GREEN : RED}">margin ${eng.energyMarginWh >= 0 ? '+' : ''}${eng.energyMarginWh.toFixed(0)} Wh</span></div>
        <div>BUDGET $${eng.totalCost.toLocaleString()} / $${eng.mission.budget.toLocaleString()}
          <span style="color:${eng.budgetExceeded ? RED : GREEN}">${eng.budgetExceeded ? 'OVER' : `$${eng.budgetRemaining.toLocaleString()} left`}</span></div>
        <div style="color:${eng.isLaunchReady ? GREEN : RED}">${eng.isLaunchReady ? '✓ LAUNCH READY' : `✗ ${eng.launchBlockers.length} BLOCKER(S)`}</div>
        <div style="color:#71839c;font-size:10.5px;margin-top:6px">Assumptions: 35% eclipse duty, 80% battery DoD, Isp·g₀·ln(m₀/m_dry); no staging mass drops.</div>`;
      drawPowerChart();
      drawBatteryChart();
      warnBox.style.display = eng.warnings.length || eng.launchBlockers.length ? 'block' : 'none';
      warnBox.innerHTML =
        eng.launchBlockers.map((w) => `<div style="color:${RED};margin:2px 0">❌ ${w}</div>`).join('') +
        eng.warnings.map((w) => `<div style="color:${AMBER};margin:2px 0">⚠ ${w}</div>`).join('');
      setLaunchEnabled(
        eng.isLaunchReady,
        eng.launchBlockers.length ? eng.launchBlockers.join('\n• ') : ''
      );
      const m = eng.mission;
      const capRows = m.requiredCapabilities
        .map((c) => `<span style="color:${eng.capabilities.has(c) ? GREEN : '#71839c'}">${eng.capabilities.has(c) ? '✓' : '○'} ${c}</span>`)
        .join(' · ');
      const hintRows = (currentMission?.objectives ?? [])
        .map((o) => `<div style="color:#9fb4cc">○ ${o.label} — <i>${o.hint}</i></div>`)
        .join('');
      objList.innerHTML = `<div style="margin-bottom:6px">${capRows}</div>${hintRows}`;
    },
    launchAvailability: (eng) => {
      setLaunchEnabled(eng.isLaunchReady, eng.launchBlockers.join('\n• '));
    },
    openMissionSelect,
    setMission: (mission) => {
      currentMission = mission;
      missionChip.textContent = `${mission.name} · ≤${mission.maxMass}kg · $${mission.budget.toLocaleString()}`;
      missionBtn.textContent = `📋 ${mission.name}`;
      objTitle.textContent = `OBJECTIVES — ${mission.name.toUpperCase()}`;
    },
    simControls: (visible) => {
      simBox.style.display = visible ? 'flex' : 'none';
      clockLabel.style.display = visible ? 'block' : 'none';
      sunChip.style.display = visible ? 'block' : 'none';
      if (!visible) {
        batteryHist.length = 0;
        drawBatteryChart();
      }
    },
    updateMissionProgress: (p) => {
      clockLabel.textContent = formatMissionClock(p.simSeconds);
      const s = p.sunlit ? '☀' : '🌑';
      sunChip.textContent = `${s} ${p.sunlit ? 'SUNLIT' : 'ECLIPSE'} · 🔋${p.batteryPercent}%${p.loadShed ? ' · LOAD SHED' : ''} · ${p.dataGB.toFixed(1)}GB`;
      sunChip.style.color = p.loadShed ? RED : p.sunlit ? GREEN : '#9fb4cc';
      scrub.value = String(Math.round(p.fraction * 1000));
      batteryHist.push({ batteryPercent: p.batteryPercent, sunlit: p.sunlit });
      if (batteryHist.length > 400) batteryHist.shift();
      drawBatteryChart();
    },
    pushEvent: (e) => {
      toast(`[${formatMissionClock(e.simTime)}] ${e.message}`, e.severity === 'critical' ? 'error' : 'info');
    },
    showDebrief,
    setExplodedMode: (on) => {
      currentExploded = on;
      explodeBtn.textContent = on ? '❋ Assemble view' : '❋ Exploded view';
    },
    setMissionOpsMode: (on) => {
      currentOps = on;
      opsBtn.textContent = on ? '🛒 Back to lab' : '🛰 Mission ops';
    },
    setTrackingBadge: () => undefined,
    showShortcuts: shortsModal,
  };

  return api;
}
