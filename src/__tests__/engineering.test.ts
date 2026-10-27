// Engineering calculation tests — the rocket equation and constraint checks
// must match the documented assumptions exactly.

import {
  BATTERY_MAX_DOD,
  COMPONENT_CATALOG,
  ECLIPSE_FRACTION,
  G0,
  InstalledComponent,
  MissionContext,
  computeEngineering,
} from '../lib/engineering';

function inst(id: string, n: number): InstalledComponent {
  const def = COMPONENT_CATALOG[id];
  return { ...def, instanceId: `${id}-${n}`, position: { x: 0, y: 0, z: 0 } };
}

const ctx: MissionContext = {
  name: 'Test',
  maxMass: 8000,
  budget: 1000000,
  requiredDeltaVMs: 2000,
  requiredDataRateMbps: 30,
  durationHours: 10,
  requiredCapabilities: ['communication', 'propulsion', 'navigation', 'avionics'],
};

function fullDeepSpaceConfig(): InstalledComponent[] {
  return [
    inst('main_engine', 0),
    inst('fuel_tank', 0),
    inst('oxidizer_tank', 0),
    inst('first_stage_structure', 0),
    inst('upper_stage_structure', 0),
    inst('spacecraft_bus', 0),
    inst('solar_panel', 0),
    inst('solar_panel', 1),
    inst('battery', 0),
    inst('antenna', 0),
    inst('nav_sensor', 0),
    inst('avionics', 0),
    inst('science', 0),
  ];
}

describe('computeEngineering — conservation sums', () => {
  it('sums mass exactly — dry mass plus on-board propellant', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), ctx);
    const expected = fullDeepSpaceConfig().reduce((a, c) => a + c.mass + (c.propellantMass ?? 0), 0);
    expect(eng.totalMassKg).toBeCloseTo(expected, 5);
    expect(eng.propellantMassKg).toBe(2600 + 1900);
  });

  it('sums power generation and consumption from component definitions', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), ctx);
    expect(eng.powerGenerationW).toBe(2 * 2600);
    expect(eng.powerConsumptionW).toBeGreaterThan(0);
    expect(eng.netPowerW).toBe(eng.powerGenerationW - eng.powerConsumptionW);
  });

  it('counts payload mass as science instruments only', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), ctx);
    expect(eng.payloadMassKg).toBe(75);
  });
});

describe('computeEngineering — rocket equation', () => {
  it('computes delta-v via Tsiolkovsky with g0 from the constant', () => {
    const comps = fullDeepSpaceConfig();
    const eng = computeEngineering(comps, ctx);
    const dry = comps.reduce((a, c) => a + c.mass, 0);
    const propellant = 2600 + 1900; // fuel_tank + oxidizer_tank
    const expected = 350 * G0 * Math.log((dry + propellant) / dry);
    expect(eng.deltaVms).not.toBeNull();
    expect(eng.deltaVms!).toBeCloseTo(expected, 4);
  });

  it('reports "not enough data" (null) when there is no propellant', () => {
    const eng = computeEngineering([inst('spacecraft_bus', 0), inst('main_engine', 0)], ctx);
    expect(eng.deltaVms).toBeNull();
    expect(eng.launchBlockers.some((b) => b.toLowerCase().includes('delta'))).toBe(true);
  });

  it('blocks launch when delta-v is below the mission requirement', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), {
      ...ctx,
      requiredDeltaVMs: 99999,
    });
    expect(eng.isLaunchReady).toBe(false);
    expect(eng.launchBlockers.some((b) => b.includes('Insufficient delta-v'))).toBe(true);
  });
});

describe('computeEngineering — power and eclipse energy', () => {
  it('flags a power deficit when generation is below consumption', () => {
    const comps = [
      inst('spacecraft_bus', 0),
      inst('main_engine', 0),
      inst('science', 0), // 900 W consumer, no panels
    ];
    const eng = computeEngineering(comps, ctx);
    expect(eng.netPowerW).toBeLessThan(0);
    expect(eng.launchBlockers.some((b) => b.includes('Power deficit'))).toBe(true);
  });

  it('computes eclipse energy need as consumption × duration × eclipse fraction', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), ctx);
    const consume = eng.powerConsumptionW;
    expect(eng.eclipseEnergyNeedWh).toBeCloseTo(consume * 10 * ECLIPSE_FRACTION, 5);
    expect(eng.batteryUsableWh).toBe(15000 * BATTERY_MAX_DOD);
  });

  it('blocks launch when the battery cannot cover the eclipse', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), {
      ...ctx,
      durationHours: 400,
    });
    expect(eng.launchBlockers.some((b) => b.includes('Eclipse battery shortfall'))).toBe(true);
  });
});

describe('computeEngineering — budget, data rate, essentials', () => {
  it('tracks budget and flags overruns', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), { ...ctx, budget: 1000 });
    expect(eng.budgetExceeded).toBe(true);
    expect(eng.budgetRemaining).toBeLessThan(0);
    expect(eng.launchBlockers.some((b) => b.includes('Budget over-run'))).toBe(true);
  });

  it('flags comms below the mission data-rate floor', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), { ...ctx, requiredDataRateMbps: 500 });
    expect(eng.launchBlockers.some((b) => b.includes('Comms below mission floor'))).toBe(true);
  });

  it('blocks launch without the essential subsystems', () => {
    const eng = computeEngineering([inst('solar_panel', 0)], ctx);
    const blockers = eng.launchBlockers.join('\n');
    expect(blockers).toContain('Missing main bus');
    expect(blockers).toContain('Missing flight computer');
    expect(blockers).toContain('Missing navigation sensor');
    expect(eng.isLaunchReady).toBe(false);
  });

  it('enforces max instances per component type', () => {
    const comps = fullDeepSpaceConfig();
    comps.push(inst('main_engine', 1)); // second engine (max 1)
    const eng = computeEngineering(comps, ctx);
    expect(eng.launchBlockers.some((b) => b.includes('Main Propulsion Engine') && b.includes('max 1'))).toBe(true);
  });

  it('requires landing legs for landing missions', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), { ...ctx, requiresLanding: true });
    expect(eng.launchBlockers.some((b) => b.includes('landing legs required'))).toBe(true);
  });
});

describe('computeEngineering — happy path', () => {
  it('a fully provisioned stack is launch-ready with advisories only', () => {
    const eng = computeEngineering(fullDeepSpaceConfig(), { ...ctx, requiredDeltaVMs: 1000 });
    expect(eng.deltaVms!).toBeGreaterThan(3000);
    expect(eng.isLaunchReady).toBe(true);
    expect(eng.massMarginKg).toBeGreaterThan(0);
  });
});
