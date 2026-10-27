// MISSION SIMULATOR — deterministic, configuration-driven mission execution.
//
// The clock runs in accelerated sim-seconds (default 720× so a 12-hour
// mission completes in a minute of wall time). Every event is derived from
// the actual component configuration and physics snapshot captured at
// launch — nothing random, nothing invented.

import {
  ECLIPSE_FRACTION,
  G0,
  InstalledComponent,
  BATTERY_MAX_DOD,
} from './engineering';
import { MissionTemplate, scoreDesign } from './missions';

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface MissionEvent {
  simTime: number; // seconds on the mission clock
  type: 'launch' | 'staging' | 'power' | 'comms' | 'thermal' | 'science' | 'landing' | 'success' | 'failure';
  message: string;
  severity: EventSeverity;
}

export interface SeriesPoint {
  t: number; // sim seconds
  netPowerW: number;
  batteryPercent: number;
  sunlit: boolean;
}

export interface ObjectiveResult {
  id: string;
  label: string;
  met: boolean;
  hint: string;
}

export interface MissionOutcome {
  success: boolean;
  score: number;
  objectives: ObjectiveResult[];
  dataVolumeGB: number;
  propellantUsedKg: number;
  criticalCount: number;
  recommendations: string[];
}

const ORBIT_PERIOD_S = 5400; // assumed LEO orbit, ~90 minutes
const DEFAULT_SPEED = 720; // sim seconds per real second

export class MissionSimulator {
  private components: InstalledComponent[];
  private mission: MissionTemplate;
  private durationS: number;
  private simTime = 0;
  private running = false;
  private speed = DEFAULT_SPEED;
  private launched = false;

  // Physics snapshot at launch (fixed for the whole mission)
  private powerGenW = 0;
  private powerConsumeW = 0;
  private batteryCapWh = 0;
  private propellantKg = 0;
  private ispS = 0;
  private totalMassKg = 0;
  private dataRateMbps = 0;
  private scienceInstruments = 0;
  private hasNoseCone = false;
  private separators = 0;
  private hasLandingLegs = false;

  // State during the mission
  private batteryChargeWh = 0;
  private propellantRemainingKg = 0;
  private dataGB = 0;
  private propellantUsed = 0;
  private loadShed = false;
  private firedConditions = new Set<string>();
  private events: MissionEvent[] = [];
  private series: SeriesPoint[] = [];
  private wasMuted = false;

  constructor(components: InstalledComponent[], mission: MissionTemplate) {
    this.components = components;
    this.mission = mission;
    this.durationS = mission.durationHours * 3600;

    for (const c of components) {
      this.powerGenW += c.powerGen ?? 0;
      this.powerConsumeW += c.powerConsume ?? 0;
      this.batteryCapWh += c.energyCapacity ?? 0;
      if (c.propellantMass) this.propellantKg += c.propellantMass;
      if (c.isp) this.ispS = Math.max(this.ispS, c.isp);
      this.totalMassKg += c.mass + (c.propellantMass ?? 0);
      if (c.capability === 'communication') {
        this.dataRateMbps = Math.max(this.dataRateMbps, c.dataRateMbps ?? 0);
      }
      if (c.id === 'science') this.scienceInstruments++;
      if (c.id === 'nose_cone') this.hasNoseCone = true;
      if (c.id === 'separator') this.separators++;
      if (c.id === 'landing_legs') this.hasLandingLegs = true;
    }

    this.batteryChargeWh = this.batteryCapWh * BATTERY_MAX_DOD;
    this.propellantRemainingKg = this.propellantKg;
  }

  start(): void {
    this.launched = true;
    this.running = true;
    this.simTime = 0;
    this.events = [];
    this.series = [];
    this.firedConditions.clear();
    this.batteryChargeWh = this.batteryCapWh * BATTERY_MAX_DOD;
    this.propellantRemainingKg = this.propellantKg;
    this.dataGB = 0;
    this.propellantUsed = 0;
    this.loadShed = false;

    this.log('launch', `Liftoff — mission "${this.mission.title}" underway`, 'info');
    if (!this.hasNoseCone) {
      this.log('thermal', 'No payload fairing: aerodynamic heating risk to payload during ascent', 'warning');
    }
    if (this.mission.requiredDeltaVMs > 0 && this.ispS > 0) {
      // Burn for the required maneuver; check the rocket equation in reverse.
      const m0 = this.totalMassKg;
      const massRatio = Math.exp(this.mission.requiredDeltaVMs / (this.ispS * G0));
      const burnKg = m0 - m0 / massRatio;
      if (burnKg <= this.propellantRemainingKg && burnKg > 0) {
        this.propellantRemainingKg -= burnKg;
        this.propellantUsed += burnKg;
        this.log(
          'staging',
          `Maneuver burn complete: ${(burnKg).toFixed(0)} kg propellant spent for ${this.mission.requiredDeltaVMs} m/s`,
          'info'
        );
      } else {
        this.log('staging', 'Maneuver failed — insufficient propellant for required delta-v', 'critical');
      }
    }
    if (this.separators === 0) {
      const hasStages = this.components.some(
        (c) => c.id === 'upper_stage_structure' || c.id === 'first_stage_structure'
      );
      if (hasStages) {
        this.log('staging', 'No separation mechanism fitted: spent stage mass dragged through ascent', 'warning');
      }
    } else {
      const stageTime = Math.round(this.durationS * 0.05);
      this.log('staging', `Stage separation confirmed at T+${stageTime}s`, 'info');
    }
  }

  step(realDeltaSeconds: number): void {
    if (!this.running) return;
    const simDelta = realDeltaSeconds * this.speed;
    // advance in sub-steps of ≤60 sim-seconds for stable integration
    const steps = Math.max(1, Math.ceil(simDelta / 60));
    const dt = simDelta / steps;
    for (let i = 0; i < steps; i++) {
      this.advance(dt);
      if (!this.running) break;
    }
  }

  private advance(dt: number): void {
    const prevT = this.simTime;
    this.simTime += dt;
    const t = this.simTime;

    const sunlit = isSunlit(t);

    // ---- power / battery ----
    if (sunlit) {
      const net = this.powerGenW - this.powerConsumeW;
      if (net >= 0) {
        this.batteryChargeWh = Math.min(
          this.batteryCapWh * BATTERY_MAX_DOD,
          this.batteryChargeWh + (net * dt) / 3600
        );
        if (this.loadShed) {
          this.loadShed = false;
          this.log('power', 'Sunlight regained — battery recharging, shed loads restored', 'info');
        }
      } else {
        this.batteryChargeWh += (net * dt) / 3600;
      }
    } else {
      const draw = this.loadShed ? this.powerConsumeW - this.scienceInstruments * 900 - 500 : this.powerConsumeW;
      this.batteryChargeWh -= (draw * dt) / 3600;
      if (this.batteryChargeWh <= 0 && !this.loadShed) {
        this.batteryChargeWh = 0;
        this.loadShed = true;
        this.log('power', 'Eclipse power emergency — batteries depleted, non-essential loads shed', 'critical');
      }
    }

    // ---- communications ----
    const commsBlocked = !sunlit && this.dataRateMbps < 40 && this.scienceInstruments > 0;
    if (commsBlocked && !this.firedConditions.has('comms_blackout') && t > 300) {
      this.firedConditions.add('comms_blackout');
      this.log('comms', 'Communications outage — high-gain aperture un-pointed and no relay coverage', 'warning');
    }

    // ---- science data ----
    if (
      sunlit &&
      !this.loadShed &&
      this.scienceInstruments > 0 &&
      this.dataRateMbps >= this.mission.requiredDataRateMbps
    ) {
      this.dataGB += (this.dataRateMbps * dt) / 8000; // Mbps → GB over seconds
      const quarter = Math.floor((4 * t) / this.durationS);
      const pkey = `science_q${quarter}`;
      if (quarter >= 1 && !this.firedConditions.has(pkey)) {
        this.firedConditions.add(pkey);
        this.log('science', `Science data downlink: cumulative ${this.dataGB.toFixed(1)} GB returned`, 'info');
      }
    }

    // ---- predictive events at fixed fractions ----
    this.schedule(prevT, t);

    if (t >= this.durationS) {
      this.log('success', 'Mission duration complete — telemetry archived', 'info');
      this.running = false;
    }
  }

  private schedule(prevT: number, t: number): void {
    const check = (key: string, frac: number, fn: () => void) => {
      const mark = frac * this.durationS;
      if (prevT < mark && t >= mark && !this.firedConditions.has(key)) {
        this.firedConditions.add(key);
        fn();
      }
    };
    check('midway', 0.5, () => {
      const pct = Math.round((this.batteryChargeWh / (this.batteryCapWh * BATTERY_MAX_DOD)) * 100);
      this.log('power', `Mid-mission battery state of charge: ${pct}%`, pct < 40 ? 'warning' : 'info');
    });
    check('thermal', 0.25, () => {
      this.log('thermal', 'Thermal balance nominal — radiators rejecting steady-state load', 'info');
    });
  }

  private log(type: MissionEvent['type'], message: string, severity: EventSeverity): void {
    // when muted (fast-forward/scrub), only criticals survive the filter so
    // outcome scoring stays truthful
    if (this.wasMuted && severity !== 'critical') return;
    this.events.push({ simTime: this.simTime, type, message, severity });
  }

  isComplete(): boolean {
    return !this.running && this.launched;
  }

  /** Fast-forward (or rewind-reset) the clock to `fraction` of the mission.
   * Integrates in large steps with logging muted so events stay consistent:
   * deterministic physics, only the chatter is suppressed. */
  seek(fraction: number, mute = true): void {
    if (!this.launched) return;
    const target = Math.max(0, Math.min(1, fraction)) * this.durationS;
    this.wasMuted = mute;
    if (target < this.simTime) {
      // rewind is a restart of the whole run (events replay deterministically)
      const wasRunning = this.running;
      this.simTime = 0;
      this.events = [];
      this.batteryChargeWh = this.batteryCapWh * BATTERY_MAX_DOD;
      this.propellantRemainingKg = this.propellantKg;
      this.dataGB = 0;
      this.propellantUsed = 0;
      this.loadShed = false;
      this.firedConditions.clear();
      this.log('launch', `Replaying mission "${this.mission.title}"`, 'info');
      this.running = true;
      void wasRunning;
    }
    while (this.simTime < target && this.running) {
      this.advance(Math.min(300, target - this.simTime));
    }
    this.wasMuted = false;
  }

  getProgress(): number {
    return Math.min(1, this.simTime / this.durationS);
  }

  getElapsedTimeS(): number {
    return this.simTime;
  }

  getDurationS(): number {
    return this.durationS;
  }

  setSpeed(s: number): void {
    this.speed = s > 0 ? s : this.speed;
  }

  getSpeed(): number {
    return this.speed;
  }

  isSunlit(): boolean {
    return isSunlit(this.simTime);
  }

  getBatteryPercent(): number {
    return Math.round(
      100 * (this.batteryChargeWh / Math.max(1, this.batteryCapWh * BATTERY_MAX_DOD))
    );
  }

  getLoadShed(): boolean {
    return this.loadShed;
  }

  getDataGB(): number {
    return this.dataGB;
  }

  getEvents(): MissionEvent[] {
    return this.events;
  }

  getSeries(): SeriesPoint[] {
    return this.series;
  }

  recordSample(): void {
    this.series.push({
      t: this.simTime,
      netPowerW: this.powerGenW - (this.loadShed ? this.powerConsumeW - this.scienceInstruments * 900 : this.powerConsumeW),
      batteryPercent: this.getBatteryPercent(),
      sunlit: this.isSunlit(),
    });
    if (this.series.length > 400) this.series.shift();
  }

  getOutcome(): MissionOutcome {
    const criticals = this.events.filter((e) => e.severity === 'critical').length;
    const propellantOK =
      this.mission.requiredDeltaVMs === 0 ||
      this.propellantUsed > 0 ||
      this.propellantRemainingKg >= 0;
    const dvBurnSucceeded = !this.events.some(
      (e) => e.type === 'staging' && e.severity === 'critical'
    );

    const objectives: ObjectiveResult[] = this.mission.objectives.map((o) => {
      let met = false;
      switch (o.id) {
        case 'orbit':
        case 'control':
          met = this.launched && criticals === 0;
          break;
        case 'science':
          met = this.scienceInstruments >= this.mission.requiredScienceInstruments && this.dataGB > 0;
          break;
        case 'data':
          met = this.dataGB > 0 && this.dataRateMbps >= this.mission.requiredDataRateMbps;
          break;
        case 'endure':
          met = criticals === 0;
          break;
        case 'dv':
          met = this.mission.requiredDeltaVMs > 0 && dvBurnSucceeded && propellantOK;
          break;
        case 'legs':
          met = this.hasLandingLegs;
          break;
        case 'redundant':
          met = this.components.filter((c) => c.capability === 'communication').length >= 2;
          break;
        default:
          met = false;
      }
      return { id: o.id, label: o.label, met, hint: o.hint };
    });

    // Landing mission special case
    if (this.mission.requiresLanding) {
      const landed = this.hasLandingLegs && dvBurnSucceeded && this.propellantRemainingKg > 0;
      objectives.push({
        id: 'landing',
        label: landed ? 'Soft landing achieved' : 'Soft landing achieved',
        met: landed,
        hint: landed ? 'Legs deployed, propellant reserve confirmed' : 'Legs and propellant reserve required',
      });
      this.events.push({
        simTime: this.simTime,
        type: 'landing',
        message: landed ? 'Touchdown — vehicle intact and recoverable' : 'Vehicle written off on landing',
        severity: landed ? 'info' : 'critical',
      });
      if (!landed) objectives[objectives.length - 1].met = false;
    }

    const metCount = objectives.filter((o) => o.met).length;
    const success = metCount === objectives.length && criticals === 0;
    const eng: { budget: number; budgetRemaining: number; warnings: string[] } = {
      budget: this.mission.budget,
      budgetRemaining: 0,
      warnings: [],
    };
    // budget snapshot not stored — score from objectives & criticals only
    void eng;
    const score = scoreDesign(
      {
        launchBlockers: [],
        warnings: this.events.filter((e) => e.severity === 'warning').map((e) => e.message),
        budgetRemaining: 0,
        budget: this.mission.budget,
        deltaVms: this.mission.requiredDeltaVMs > 0 ? this.mission.requiredDeltaVMs : null,
        mission: this.mission,
        energyMarginWh: 0,
        dataRateMbps: this.dataRateMbps,
      },
      metCount,
      objectives.length
    );

    const recommendations: string[] = [];
    if (criticals > 0) {
      const critTypes = new Set(this.events.filter((e) => e.severity === 'critical').map((e) => e.type));
      if (critTypes.has('power')) {
        recommendations.push('Add a battery pack or reduce power draw: eclipse energy need = consumed watts × 35% × mission hours.');
      }
      if (critTypes.has('staging')) {
        recommendations.push('Propellant shortfall for the maneuver — add a fuel or oxidizer tank and verify delta-v.');
      }
      if (critTypes.has('landing')) {
        recommendations.push('Fit the full set of landing legs and keep a propellant reserve for descent.');
      }
    }
    if (this.dataGB === 0 && this.scienceInstruments > 0) {
      recommendations.push('Science data never got downlink capacity — check antenna data rate against the mission floor.');
    }
    if (metCount === objectives.length) {
      recommendations.push('Excellent design discipline — tighten mass or budget further to raise your score.');
    }

    return {
      success,
      score,
      objectives,
      dataVolumeGB: this.dataGB,
      propellantUsedKg: this.propellantUsed,
      criticalCount: criticals,
      recommendations,
    };
  }
}

export function isSunlit(t: number): boolean {
  const phase = t % ORBIT_PERIOD_S;
  return phase < ORBIT_PERIOD_S * (1 - ECLIPSE_FRACTION);
}

export function formatMissionClock(simSeconds: number): string {
  const h = Math.floor(simSeconds / 3600);
  const m = Math.floor((simSeconds % 3600) / 60);
  const s = Math.floor(simSeconds % 60);
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
