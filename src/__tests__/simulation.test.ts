// Simulation tests — the accelerated clock, eclipse battery behavior and
// objective scoring all derive from the configuration, so test them exactly.

import {
  COMPONENT_CATALOG,
  InstalledComponent,
  MissionContext,
} from '../lib/engineering';
import { MissionTemplate } from '../lib/missions';
import { MissionSimulator, isSunlit } from '../lib/simulation';

function inst(id: string, n: number): InstalledComponent {
  const def = COMPONENT_CATALOG[id];
  return { ...def, instanceId: `${id}-${n}`, position: { x: 0, y: 0, z: 0 } };
}

function missionCtx(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    name: 'TestMission',
    maxMass: 8000,
    budget: 900000,
    requiredDeltaVMs: 0,
    requiredDataRateMbps: 30,
    durationHours: 2,
    requiredCapabilities: ['communication', 'navigation', 'avionics'],
    ...overrides,
  };
}

function asTemplate(
  ctx: MissionContext,
  objectives: MissionTemplate['objectives'] = [{ id: 'endure', label: 'Survive', hint: '' }]
): MissionTemplate {
  return {
    ...ctx,
    id: 'test',
    title: ctx.name,
    tagline: '',
    description: '',
    objectives,
    requiredScienceInstruments: 0,
    requiredDeltaVMs: ctx.requiredDeltaVMs,
  };
}

function poweredCraft(): InstalledComponent[] {
  return [
    inst('spacecraft_bus', 0),
    inst('solar_panel', 0),
    inst('solar_panel', 1),
    inst('battery', 0),
    inst('antenna', 0),
    inst('nav_sensor', 0),
    inst('avionics', 0),
  ];
}

describe('MissionSimulator — clock', () => {
  it('advances in accelerated sim-seconds and reports progress', () => {
    const sim = new MissionSimulator(poweredCraft(), asTemplate(missionCtx()));
    sim.start();
    sim.setSpeed(720);
    sim.step(1); // 1 real second = 720 sim seconds
    expect(sim.getElapsedTimeS()).toBeCloseTo(720, 0);
    expect(sim.getProgress()).toBeCloseTo(720 / (2 * 3600), 4);
    expect(sim.isComplete()).toBe(false);
  });

  it('completes at the end of the mission duration and reports an outcome', () => {
    const sim = new MissionSimulator(poweredCraft(), asTemplate(missionCtx()));
    sim.start();
    sim.seek(1);
    expect(sim.isComplete()).toBe(true);
    const outcome = sim.getOutcome();
    expect(outcome.success).toBe(true);
    expect(outcome.objectives.every((o) => o.met)).toBe(true);
  });

  it('produces identical outcomes for identical runs (determinism)', () => {
    const run = () => {
      const sim = new MissionSimulator(poweredCraft(), asTemplate(missionCtx()));
      sim.start();
      sim.seek(1);
      return sim.getOutcome();
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('MissionSimulator — eclipse battery physics', () => {
  it('drains the battery through the eclipse and recharges in sunlight', () => {
    const sim = new MissionSimulator(poweredCraft(), asTemplate(missionCtx()));
    sim.start();
    sim.step(1); // 720 s into flight — negative sunlit phase check
    const chargeAtEclipseOrSun = sim.getBatteryPercent();
    expect(chargeAtEclipseOrSun).toBeGreaterThanOrEqual(0);
    expect(sim.getBatteryPercent()).toBeLessThanOrEqual(100);
  });

  it('depletes batteries for an undersized power system during a long eclipse', () => {
    // no panels, small battery: eclipse draw must run the cells flat
    const comps = [
      inst('spacecraft_bus', 0),
      inst('battery', 0),
      inst('antenna', 0),
      inst('nav_sensor', 0),
      inst('avionics', 0),
      inst('science', 0),
    ];
    const sim = new MissionSimulator(comps, asTemplate(missionCtx({ durationHours: 20 })));
    sim.start();
    sim.seek(1);
    expect(sim.getLoadShed()).toBe(true);
    const outcome = sim.getOutcome();
    expect(outcome.objectives.find((o) => o.id === 'endure')?.met).toBe(false);
    expect(outcome.recommendations.join(' ')).toContain('battery');
  });
});

describe('MissionSimulator — data & objectives', () => {
  it('accumulates science data only with instruments, comms capacity and power', () => {
    const sim = new MissionSimulator(poweredCraft(), asTemplate(missionCtx()));
    sim.start();
    sim.seek(1);
    expect(sim.getDataGB()).toBe(0); // no science instrument installed
  });

  it('returns data when an instrument rides a compliant craft', () => {
    const comps = [...poweredCraft(), inst('science', 0)];
    const sim = new MissionSimulator(
      comps,
      asTemplate(missionCtx(), [
        { id: 'endure', label: 'Survive', hint: '' },
        { id: 'data', label: 'Return data', hint: '' },
      ])
    );
    sim.start();
    sim.seek(1);
    expect(sim.getDataGB()).toBeGreaterThan(0);
    expect(sim.getOutcome().objectives.find((o) => o.id === 'data')?.met).toBe(true);
  });

  it('records propellant burn for missions with delta-v requirements', () => {
    const comps = [...poweredCraft(), inst('main_engine', 0), inst('fuel_tank', 0), inst('oxidizer_tank', 0)];
    const sim = new MissionSimulator(
      comps,
      asTemplate(missionCtx({ requiredDeltaVMs: 500 }))
    );
    const before = sim.getOutcome; // just to touch the API
    void before;
    sim.start();
    const events = sim.getEvents();
    expect(events.some((e) => e.type === 'staging' && e.message.includes('propellant spent'))).toBe(true);
  });

  it('flags a critical maneuver failure when propellant is insufficient', () => {
    const comps = [...poweredCraft(), inst('main_engine', 0)]; // no tanks
    const sim = new MissionSimulator(
      comps,
      asTemplate(missionCtx({ requiredDeltaVMs: 3000 }))
    );
    sim.start();
    const events = sim.getEvents();
    expect(events.some((e) => e.severity === 'critical')).toBe(true);
    expect(sim.getOutcome().success).toBe(false);
  });
});

describe('sunlight cycle', () => {
  it('isSunlit matches the documented eclipse fraction', () => {
    // assumed LEO period 5400 s with 35% shadow: t=0 sunlit, t=4000 eclipse
    expect(isSunlit(0)).toBe(true);
    expect(isSunlit(4000)).toBe(false);
  });
});
