// Mission templates — objectives, constraints and scoring criteria.
// Plain data records; the simulator and UI read them directly.

import { MissionContext } from './engineering';

export interface MissionObjective {
  id: string;
  label: string;
  hint: string;
}

export interface MissionTemplate extends MissionContext {
  id: string;
  title: string;
  tagline: string;
  description: string;
  objectives: MissionObjective[];
  requiredScienceInstruments: number;
  requiredDeltaVMs: number;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'earth_observation',
    name: 'Earth Observation',
    maxMass: 4000,
    budget: 500000,
    requiredDeltaVMs: 0,
    requiredDataRateMbps: 50,
    durationHours: 12,
    requiredCapabilities: ['communication', 'navigation', 'avionics', 'science'],
    requiredScienceInstruments: 1,
    title: 'Earth Observation',
    tagline: 'LEO imaging pass network',
    description:
      'Fly an imaging satellite in low Earth orbit. The ground team needs crisp imaging data returned fast during daylight passes.',
    objectives: [
      { id: 'orbit', label: 'Reach stable low Earth orbit', hint: 'Vehicle must be flight-ready at launch' },
      { id: 'science', label: 'Operate the science payload', hint: 'Install science instruments' },
      { id: 'data', label: 'Return ≥50 Mbps imaging data', hint: 'High-gain antenna required' },
      { id: 'endure', label: 'Survive eclipse on batteries', hint: 'Battery capacity must cover the dark pass' },
    ],
  },
  {
    id: 'weather',
    name: 'Weather Monitoring',
    maxMass: 4600,
    budget: 560000,
    requiredDeltaVMs: 0,
    requiredDataRateMbps: 60,
    durationHours: 18,
    requiredCapabilities: ['communication', 'navigation', 'avionics', 'science'],
    requiredScienceInstruments: 2,
    title: 'Weather Monitoring',
    tagline: 'Continuous multi-spectral coverage',
    description:
      'Watch storm systems around the clock. Longer duration in shadow demands bigger batteries and a strong downlink.',
    objectives: [
      { id: 'orbit', label: 'Reach stable orbit', hint: 'Flight-ready design at launch' },
      { id: 'science', label: 'Carry two science instruments', hint: 'Multi-spectral coverage needs both' },
      { id: 'data', label: 'Return ≥60 Mbps of sensor feeds', hint: 'High-data-rate comms required' },
      { id: 'endure', label: 'Endure an 18 h mission', hint: 'Power and thermal must stay in margin' },
    ],
  },
  {
    id: 'comms_relay',
    name: 'Communications Satellite',
    maxMass: 4400,
    budget: 600000,
    requiredDeltaVMs: 0,
    requiredDataRateMbps: 90,
    durationHours: 24,
    requiredCapabilities: ['communication', 'navigation', 'avionics'],
    requiredScienceInstruments: 0,
    title: 'Communications Satellite',
    tagline: 'Geostationary data pipe',
    description:
      'Deploy a commercial relay. Payload here is communications itself: maximize downlink rate and redundancy within mass and budget.',
    objectives: [
      { id: 'orbit', label: 'Reach transfer orbit', hint: 'Flight-ready design at launch' },
      { id: 'data', label: 'Deliver ≥90 Mbps relay throughput', hint: 'Antenna + relay antennas raise capacity' },
      { id: 'redundant', label: 'Fit backup comms path', hint: 'A relay antenna avoids single-point-of-failure' },
      { id: 'endure', label: 'Hold 24 h of station power', hint: 'Power generation must cover all loads' },
    ],
  },
  {
    id: 'lunar',
    name: 'Lunar Science Mission',
    maxMass: 7500,
    budget: 780000,
    requiredDeltaVMs: 3000,
    requiredDataRateMbps: 40,
    durationHours: 20,
    requiredCapabilities: ['communication', 'propulsion', 'navigation', 'avionics', 'science'],
    requiredScienceInstruments: 1,
    title: 'Lunar Science Mission',
    tagline: 'Trans-lunar injection and survey',
    description:
      'Break Earth orbit and survey the Moon. The rocket equation now bites: engine plus enough propellant for 3 km/s of delta-v.',
    objectives: [
      { id: 'dv', label: 'Provide ≥3000 m/s delta-v', hint: 'Engine + enough tank propellant mass' },
      { id: 'science', label: 'Operate the lunar survey payload', hint: 'Science instrument required' },
      { id: 'data', label: 'Return ≥40 Mbps from lunar distance', hint: 'Comms floor supported by dish' },
      { id: 'endure', label: 'Manage 20 h cruise power', hint: 'Long eclipse margin needed' },
    ],
  },
  {
    id: 'deep_space',
    name: 'Deep-Space Science Probe',
    maxMass: 18000,
    budget: 900000,
    requiredDeltaVMs: 4500,
    requiredDataRateMbps: 40,
    durationHours: 24,
    requiredCapabilities: ['communication', 'propulsion', 'navigation', 'avionics', 'science'],
    requiredScienceInstruments: 2,
    title: 'Deep-Space Science Probe',
    tagline: 'Escape trajectory science platform',
    description:
      'The hardest profile: escape velocity, two instruments, and a long cruise on limited power. Design discipline decides success.',
    objectives: [
      { id: 'dv', label: 'Provide ≥4500 m/s delta-v', hint: 'Multiple tanks pay off here' },
      { id: 'science', label: 'Carry two science instruments', hint: 'Dual payloads for crossing science' },
      { id: 'data', label: 'Return ≥40 Mbps at distance', hint: 'Dish comms floor' },
      { id: 'endure', label: 'Survive a 24 h cruise', hint: 'Energy margin decided at design time' },
    ],
  },
  {
    id: 'lander',
    name: 'Recovery/Lander Test',
    maxMass: 7500,
    budget: 720000,
    requiredDeltaVMs: 1200,
    requiredDataRateMbps: 30,
    durationHours: 10,
    requiredCapabilities: ['propulsion', 'navigation', 'avionics'],
    requiresLanding: true,
    requiredScienceInstruments: 0,
    title: 'Recovery/Lander Test',
    tagline: 'Fly it, land it, refly it',
    description:
      'A reusability demonstration: ascend, maneuver, and land back on the pad. Landing legs are mandatory or the vehicle is written off.',
    objectives: [
      { id: 'dv', label: 'Reserve ≥1200 m/s for landing', hint: 'Propellant remaining after ascent' },
      { id: 'legs', label: 'Equip landing legs', hint: 'Three legs complete a stable base' },
      { id: 'control', label: 'Navigate the descent', hint: 'Star tracker + flight computer' },
      { id: 'endure', label: 'Keep comms through descent', hint: 'Telemetry blackout detection' },
    ],
  },
];

export function getMission(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((m) => m.id === id);
}

// Scoring: 0..100 based on design discipline and mission completion.
export function scoreDesign(
  engineering: {
    launchBlockers: string[];
    warnings: string[];
    budgetRemaining: number;
    budget: number;
    deltaVms: number | null;
    mission: MissionContext;
    energyMarginWh: number;
    dataRateMbps: number;
  },
  objectivesMet: number,
  totalObjectives: number
): number {
  const budgetFraction = Math.max(0, engineering.budgetRemaining) / engineering.budget; // 0..1
  let score = 55 * (totalObjectives > 0 ? objectivesMet / totalObjectives : 0) + 20 * budgetFraction;
  if (engineering.launchBlockers.length === 0) score += 10;
  score -= engineering.warnings.length * 2;
  return Math.max(0, Math.min(100, Math.round(score)));
}
