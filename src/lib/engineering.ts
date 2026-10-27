// ENGINEERING MODULE — component catalog, educational data, layout, calculations
//
// UNITS / ASSUMPTIONS (all surfaced in the UI so no number is unexplained):
//  - Mass in kilograms, power in watts, energy in watt-hours, money in USD.
//  - Solar generation is the array output in sunlit flight; eclipse (Earth's
//    shadow) is assumed to cover 35% of mission time and must be covered by
//    batteries alone.
//  - Delta-v uses the Tsiolkovsky rocket equation:
//        Δv = Isp · g0 · ln(m0 / m_dry),   g0 = 9.80665 m/s²
//    If no engine or no propellant tank is installed we report
//    "not enough data" (deltaVms = null) rather than inventing a value.
//  - Staging is simplified: the whole vehicle flies as one stack; separators
//    are modelled as structural/educational components, not mass drops.
//  - Costs are relative game-economy constants, not real pricing.

export const G0 = 9.80665; // standard gravity, m/s²
export const ECLIPSE_FRACTION = 0.35; // assumed fraction of time in shadow
export const BATTERY_MAX_DOD = 0.8; // depth-of-discharge limit for cell life

export interface ComponentSpec {
  label: string;
  value: string;
  unit: string;
}

export interface Quiz {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface EducationalContent {
  what: string;
  why: string;
  how: string;
  where: string;
  specs: ComponentSpec[];
  connections: string;
  impact: string;
  failure: string;
  example: string;
  funFact: string;
}

export type ComponentCategory =
  | 'Structure'
  | 'Propulsion'
  | 'Power'
  | 'Communications'
  | 'Navigation'
  | 'Science'
  | 'Thermal';

export interface ComponentDef {
  id: string;
  name: string;
  category: ComponentCategory;
  stackRole: 'engine' | 'tank' | 'stack' | 'separator' | 'satellite' | 'side' | 'top';
  height: number; // meters, used by the stack layout
  mass: number;   // kg
  cost: number;   // USD (game economy)
  powerGen?: number;       // W
  powerConsume?: number;   // W
  propellantMass?: number; // usable propellant, kg (tanks)
  isp?: number;            // seconds (engines)
  energyCapacity?: number; // Wh (batteries)
  dataRateMbps?: number;   // comms
  capability?: 'communication' | 'propulsion' | 'navigation' | 'science' | 'avionics';
  maxInstances?: number;
  required?: boolean; // essential for any mission
  description: string;
  edu: EducationalContent;
  quiz: Quiz;
}

export type InstalledComponent = ComponentDef & {
  instanceId: string;
  position: { x: number; y: number; z: number };
};

export const COMPONENT_CATALOG: Record<string, ComponentDef> = {
  spacecraft_bus: {
    id: 'spacecraft_bus',
    name: 'Main Bus',
    category: 'Structure',
    stackRole: 'satellite',
    height: 3.6,
    mass: 520,
    cost: 60000,
    powerConsume: 300,
    maxInstances: 1,
    required: true,
    description: 'Primary structural module that every other subsystem bolts onto.',
    edu: {
      what: 'The bus is the backbone of the vehicle: a rigid frame with wiring and data pathways that every other subsystem is attached to.',
      why: 'Without a strong, stiff structure, engine thrust and launch acceleration would break the spacecraft apart. It gives every subsystem a standard mounting point.',
      how: 'Aluminium honeycomb panels carry load paths from the engine up to the payload, channeling forces so stiff structure carries the stress instead of delicate electronics.',
      where: 'On the satellite deck at the top of the vehicle stack, under the payload bay.',
      specs: [
        { label: 'Mass', value: '520', unit: 'kg' },
        { label: 'Height', value: '3.6', unit: 'm' },
        { label: 'Housekeeping power', value: '300', unit: 'W' },
      ],
      connections: 'Distributes power and data to mounted subsystems; connects to the upper stage through a separation ring below it.',
      impact: 'Its mass sets how much payload the vehicle can carry — a heavier bus means less room for instruments.',
      failure: 'With no bus, nothing else can be mounted: the design is invalid and launch is blocked.',
      example: 'Lockheed\u2019s A2100 bus family has flown on more than 60 commercial communications satellites.',
      funFact: 'On a typical comsat, the payload is only about a third of the mass — the rest is "the bus".',
    },
    quiz: {
      question: 'What is the primary role of a spacecraft bus?',
      options: ['Generating thrust', 'Structural backbone plus power and data for all subsystems', 'Encrypting telemetry'],
      answerIndex: 1,
      explanation: 'The bus exists to support and interconnect every subsystem; thrust is the propulsion subsystem\u2019s job.',
    },
  },
  nose_cone: {
    id: 'nose_cone',
    name: 'Payload Fairing (Nose Cone)',
    category: 'Structure',
    stackRole: 'stack',
    height: 2.2,
    mass: 180,
    cost: 40000,
    maxInstances: 1,
    description: 'Aerodynamic shroud protecting the payload during atmospheric ascent.',
    edu: {
      what: 'A payload fairing is a hollow, rounded shroud on the very top of the rocket that gives the vehicle a smooth aerodynamic shape through the lower atmosphere.',
      why: 'Without it, drag increases sharply, airflow shakes the vehicle, and rain or debris can strike the payload itself.',
      how: 'The curved profile lets air flow smoothly around the vehicle as speed builds toward supersonic flight, spreading the shock loads across the shell.',
      where: 'Very top of the stack; jettisoned a few minutes after launch once the air is thin.',
      specs: [
        { label: 'Mass', value: '180', unit: 'kg' },
        { label: 'Height', value: '2.2', unit: 'm' },
      ],
      connections: 'Caps the payload bay; its separation event is one of the earliest milestones of ascent.',
      impact: 'Pure dead weight through the densest part of the atmosphere — every fairing kilogram costs payload capacity.',
      failure: 'No fairing: the simulated ascent logs aerodynamic-heating risk to the payload.',
      example: 'SpaceX made fairings recoverable and reusable — each one is a multi-million-dollar composite structure.',
      funFact: 'Fairings are jettisoned around Mach 3, when dynamic pressure has dropped enough that the payload no longer needs protection.',
    },
    quiz: {
      question: 'Why is the fairing jettisoned early in flight?',
      options: ['To carry more fuel', 'It is dead weight once the air is thin enough', 'To cool the payload'],
      answerIndex: 1,
      explanation: 'Above roughly 100 km drag is negligible, so the fairing becomes pure payload penalty and is shed.',
    },
  },
  payload_bay: {
    id: 'payload_bay',
    name: 'Payload Bay',
    category: 'Structure',
    stackRole: 'stack',
    height: 2.4,
    mass: 240,
    cost: 35000,
    maxInstances: 1,
    description: 'Housing module for science instruments and the mission payload.',
    edu: {
      what: 'The payload bay is the compartment that holds the instruments the mission exists to fly.',
      why: 'Instruments must be fixed rigidly to the vehicle and fed power and data, while being protected from launch vibration.',
      how: 'Iso-static struts isolate instruments from the vibrating launch structure; the bay routes power and data connectors to each instrument slot.',
      where: 'On the satellite deck, directly under the fairing.',
      specs: [
        { label: 'Mass', value: '240', unit: 'kg' },
        { label: 'Height', value: '2.4', unit: 'm' },
        { label: 'Instrument capacity', value: '3', unit: 'units' },
      ],
      connections: 'Provides mounting, power and data interfaces for science instruments.',
      impact: 'Adds structural mass; a bay is only worth carrying if instruments ride inside it.',
      failure: 'No bay means instruments have no proper mounting: science capability stays unready.',
      example: 'The Space Shuttle\u2019s payload bay measured 4.6 m across and 18 m long.',
      funFact: 'Payload bays are usually not pressurized — instruments must survive vacuum directly.',
    },
    quiz: {
      question: 'What does the payload bay mainly provide for instruments?',
      options: ['Thrust', 'Mounting, vibration isolation, power and data routing', 'Heat rejection'],
      answerIndex: 1,
      explanation: 'The bay hosts instruments and routes utilities; heat rejection is the radiator\u2019s job.',
    },
  },
  separator: {
    id: 'separator',
    name: 'Separation Mechanism',
    category: 'Structure',
    stackRole: 'separator',
    height: 0.3,
    mass: 60,
    cost: 26000,
    maxInstances: 2,
    description: 'Pyrotechnic clamp band that detaches a finished stage.',
    edu: {
      what: 'A separation mechanism is an engineered break — usually explosive bolts or a clamp band — plus springs that push the parts apart cleanly.',
      why: 'Spent stages are dead weight; releasing them lets the rest of the vehicle accelerate far more efficiently.',
      how: 'An electrical signal fires small charges that cut the structural pins; springs then give a gentle push (about 0.5 m/s) so the pieces separate without re-contacting.',
      where: 'Thin rings between stack sections: booster/upper stage, and upper stage/satellite.',
      specs: [
        { label: 'Mass', value: '60', unit: 'kg' },
        { label: 'Separation push', value: '0.5', unit: 'm/s' },
      ],
      connections: 'Bridges two adjacent stack sections and carries their full structural load until release.',
      impact: 'A two-stage rocket with a satellite needs two; each adds 60 kg.',
      failure: 'Missing separators: the simulated vehicle drags every spent section, wasting propellant.',
      example: 'Ariane 5 uses a clamp band releasing 12 pyrotechnic tension rods simultaneously.',
      funFact: 'After separation, spent stages float apart slowly — the upper stage fires its engine only seconds later, far away.',
    },
    quiz: {
      question: 'Why do separation mechanisms push stages apart slowly?',
      options: ['To save fuel', 'To avoid re-contact between separated objects', 'To reduce G-forces'],
      answerIndex: 1,
      explanation: 'A gentle, symmetric push prevents the spent stage from tumbling back into the live one.',
    },
  },
  main_engine: {
    id: 'main_engine',
    name: 'Main Propulsion Engine',
    category: 'Propulsion',
    stackRole: 'engine',
    height: 1.7,
    mass: 420,
    cost: 90000,
    isp: 350,
    powerConsume: 400,
    capability: 'propulsion',
    maxInstances: 1,
    required: true,
    description: 'Bi-propellant engine for launch, orbital injection and maneuvers.',
    edu: {
      what: 'The main engine is the largest motor on the vehicle: it burns fuel and oxidizer from the tanks to produce tens of kilonewtons of thrust.',
      why: 'Only the main engine can change the vehicle\u2019s velocity enough to reach or change orbits — small thrusters only trim attitude.',
      how: 'Pumps push fuel and oxidizer into a combustion chamber that burns at ~3,300 °C. The hot gas races through a de Laval nozzle — narrow at the throat, widening outward — which converts pressure into exhaust speed, and exhaust speed into thrust.',
      where: 'Very bottom of the stack, under the propellant tanks.',
      specs: [
        { label: 'Mass', value: '420', unit: 'kg' },
        { label: 'Isp (vacuum)', value: '350', unit: 's' },
        { label: 'Thrust', value: '45', unit: 'kN' },
        { label: 'Feed power', value: '400', unit: 'W' },
      ],
      connections: 'Draws propellant from the fuel and oxidizer tanks; needs electrical power for pumps and valves.',
      impact: 'Specific impulse (Isp, in seconds) decides how much delta-v each kilogram of propellant buys. Higher Isp is better.',
      failure: 'No engine: the vehicle cannot maneuver and any mission needing maneuvers fails immediately.',
      example: 'The RS-25 engines on the Space Shuttle routinely ran at 109% of their rated thrust.',
      funFact: 'Combustion at 3,300 °C would melt many chamber materials — regenerative cooling runs fuel through channels in the chamber wall first.',
    },
    quiz: {
      question: 'What does a rocket nozzle\u2019s widening shape actually do?',
      options: [
        'Converts chamber pressure into exhaust speed',
        'Slows the exhaust for stability',
        'Redirects thrust upward',
      ],
      answerIndex: 0,
      explanation: 'A de Laval nozzle accelerates high-pressure gas into a fast directed jet; speed becomes thrust.',
    },
  },
  fuel_tank: {
    id: 'fuel_tank',
    name: 'Fuel Tank',
    category: 'Propulsion',
    stackRole: 'tank',
    height: 1.9,
    mass: 300,
    cost: 70000,
    propellantMass: 2600,
    maxInstances: 3,
    description: 'Pressurized tank storing the fuel side of the propellant.',
    edu: {
      what: 'The fuel tank stores the fuel under pressure and feeds it to the engine through lines and pumps.',
      why: 'Propellant is the single largest mass on a rocket — most of the vehicle is tank, and payload is only a small fraction.',
      how: 'Pressurized gas pushes fuel toward the pumps and keeps the ultra-thin walls from buckling, like a soda can that only holds its shape while sealed and pressurized.',
      where: 'Middle of the stack, just above the engine.',
      specs: [
        { label: 'Dry mass', value: '300', unit: 'kg' },
        { label: 'Usable propellant', value: '2,600', unit: 'kg' },
        { label: 'Height', value: '1.9', unit: 'm' },
      ],
      connections: 'Feeds the main engine; both fuel and oxidizer mass count together in the rocket-equation mass ratio.',
      impact: 'More usable propellant buys more delta-v, but the extra tank is also mass you must carry before it pays off.',
      failure: 'Engine with no tank: nothing to burn, delta-v reports "not enough data" and maneuvers cannot be executed.',
      example: 'Falcon 9\u2019s first-stage walls are only a few millimetres thick over a 3.7 m diameter — held stiff purely by pressure.',
      funFact: 'Tanks are helium-pressurized: the helium does not burn, it just pushes the fuel forward.',
    },
    quiz: {
      question: 'Why are rocket propellant tanks pressurized?',
      options: [
        'To keep fuel liquid',
        'To stop thin walls buckling and to feed the pumps',
        'To cool the engine',
      ],
      answerIndex: 1,
      explanation: 'Pressure keeps thin tank walls rigid and gives pump feed a helpful pressure head.',
    },
  },
  oxidizer_tank: {
    id: 'oxidizer_tank',
    name: 'Oxidizer Tank',
    category: 'Propulsion',
    stackRole: 'tank',
    height: 1.6,
    mass: 260,
    cost: 62000,
    propellantMass: 1900,
    maxInstances: 3,
    description: 'Pressurized tank storing the oxidizer side of the propellant.',
    edu: {
      what: 'The oxidizer tank holds the oxygen-rich reactant — liquid oxygen (LOX) or nitrogen tetroxide — that combines with fuel in the combustion chamber.',
      why: 'Rockets carry their own oxidizer because there is no air in space; without an oxidizer the fuel cannot burn.',
      how: 'Chemistry fixes the burn ratio: for kerosene/LOX it is about 2.5 kg of oxidizer per 1 kg of fuel, so the two tanks are sized to match.',
      where: 'Stacked beside/above the fuel tank in the middle of the vehicle.',
      specs: [
        { label: 'Dry mass', value: '260', unit: 'kg' },
        { label: 'Usable oxidizer', value: '1,900', unit: 'kg' },
        { label: 'Height', value: '1.6', unit: 'm' },
      ],
      connections: 'Feeds the engine\u2019s oxidizer side; its plumbing is strictly separated from fuel lines to prevent accidental mixing.',
      impact: 'Oxidizer mass counts just like fuel mass in the delta-v calculation.',
      failure: 'Skimping on oxidizer leaves fuel unburned: far less delta-v than the tank size suggests.',
      example: 'The Saturn V burned kerosene and LOX at a 2.5:1 mass ratio.',
      funFact: 'LOX boils at −183 °C and constantly boils off, so tanks are topped up until seconds before liftoff.',
    },
    quiz: {
      question: 'Why do rockets carry their own oxidizer?',
      options: [
        'Combustion needs it and there is no air in space',
        'It makes fuel cheaper',
        'It cools the engine',
      ],
      answerIndex: 0,
      explanation: 'Jet engines breathe atmospheric air; rockets must bring both reactants along.',
    },
  },
  first_stage_structure: {
    id: 'first_stage_structure',
    name: 'First-Stage Structure',
    category: 'Structure',
    stackRole: 'stack',
    height: 2.2,
    mass: 380,
    cost: 55000,
    maxInstances: 1,
    description: 'Lower structural section tying engine thrust to the tanks.',
    edu: {
      what: 'The first-stage structure is the booster\u2019s skeleton: the load-carrying cylinder connecting the engine thrust structure to the tank section.',
      why: 'Launch loads — acceleration, wind shear, engine vibration — all flow through it. Without it the pressurized tank column would collapse.',
      how: 'Machined isogrid panels and vertical stringers spread loads in all directions like a rib cage, resisting bending and buckling.',
      where: 'Base section of the stack, around and above the tanks near the engine.',
      specs: [
        { label: 'Mass', value: '380', unit: 'kg' },
        { label: 'Design axial load', value: '4.5', unit: 'g' },
      ],
      connections: 'Anchors the engine thrust structure below and the tank/interstage section above.',
      impact: 'Heavy structure shrinks the propellant fraction of the vehicle, lowering delta-v.',
      failure: 'Missing lower structure: the simulated ascent logs a structural failure.',
      example: 'The Saturn V first-stage thrust structure carried five F-1 engines producing 33 MN combined.',
      funFact: 'On reusable rockets, this stage is the part that flies home and lands.',
    },
    quiz: {
      question: 'What flows through the first-stage structure at liftoff?',
      options: ['Coolant', 'Engine thrust loads', 'Telemetry data'],
      answerIndex: 1,
      explanation: 'Engine thrust flows upward through the thrust structure into the tank section, measured in g\u2019s of axial load.',
    },
  },
  upper_stage_structure: {
    id: 'upper_stage_structure',
    name: 'Upper-Stage Structure',
    category: 'Structure',
    stackRole: 'stack',
    height: 2.0,
    mass: 290,
    cost: 48000,
    maxInstances: 1,
    description: 'Second structural section carrying the satellite above the booster.',
    edu: {
      what: 'The upper-stage structure (interstage/second stage) is the cylinder that carries the satellite bus on top of the propulsion stack.',
      why: 'It shields the satellite during atmospheric flight and provides the mounting point for the separation ring on top.',
      how: 'Aluminium-lithium or carbon-composite shells give high stiffness at minimum mass; load paths route around the upper engine bay.',
      where: 'Between the first stage below and the satellite bus above.',
      specs: [
        { label: 'Mass', value: '290', unit: 'kg' },
        { label: 'Height', value: '2.0', unit: 'm' },
      ],
      connections: 'Releases from the first stage through the lower separator, and releases the satellite through the upper one.',
      impact: 'Every extra kilogram here eats delivered payload almost one-for-one.',
      failure: 'Without it, the satellite sees raw engine loads: the simulation reports structural and mass-budget errors.',
      example: 'Ariane 6\u2019s upper stage carries a Vinci engine that can relight for complex orbit insertions.',
      funFact: 'Because empty stages are dropped, the satellite is often ~50× lighter than the rocket at liftoff.',
    },
    quiz: {
      question: 'What is an "interstage"?',
      options: [
        'The structure joining two vehicle stages',
        'An auxiliary engine',
        'The payload container',
      ],
      answerIndex: 0,
      explanation: 'The interstage connects first and second stage and is usually jettisoned with the booster.',
    },
  },
  solar_panel: {
    id: 'solar_panel',
    name: 'Solar Panel Array',
    category: 'Power',
    stackRole: 'side',
    height: 0.2,
    mass: 140,
    cost: 32000,
    powerGen: 2600,
    maxInstances: 4,
    description: 'Photovoltaic array converting sunlight into electrical power.',
    edu: {
      what: 'A solar array is a folded blanket of photovoltaic cells that converts sunlight directly into electricity.',
      why: 'Spacecraft electronics, radios, sensors and heaters all need a continuous energy source while flying.',
      how: 'Each cell makes ~0.5 V; cells are wired in series/parallel to build useful current and voltage. Pointing the panel squarely at the Sun maximizes output.',
      where: 'Mounted on the satellite bus sides, unfolded after separation.',
      specs: [
        { label: 'Mass', value: '140', unit: 'kg' },
        { label: 'Peak output', value: '2,600', unit: 'W' },
        { label: 'Efficiency', value: '≈30', unit: '%' },
      ],
      connections: 'Feeds the power bus and charges the batteries; waste heat goes to the radiators.',
      impact: 'Each panel adds 2.6 kW in sunlight; during eclipse output is zero and batteries must carry all loads.',
      failure: 'Too few arrays: the simulated spacecraft browns out during eclipse and logs power faults.',
      example: 'The International Space Station\u2019s arrays generate close to 120 kW combined.',
      funFact: 'Arrays degrade a few percent per year from radiation and micrometeoroids — missions are sized for "end of life" power.',
    },
    quiz: {
      question: 'What happens to solar power during eclipse?',
      options: [
        'It automatically doubles',
        'It drops to zero; batteries cover the loads',
        'The panels run backwards',
      ],
      answerIndex: 1,
      explanation: 'Photovoltaics need sunlight; in shadow, stored battery energy runs the spacecraft.',
    },
  },
  battery: {
    id: 'battery',
    name: 'Battery Pack',
    category: 'Power',
    stackRole: 'side',
    height: 0.5,
    mass: 90,
    cost: 22000,
    energyCapacity: 15000,
    maxInstances: 2,
    description: 'Rechargeable storage covering eclipse and peak loads.',
    edu: {
      what: 'The battery pack is a lithium-ion storage unit that banks solar power for use when the vehicle is in Earth\u2019s shadow.',
      why: 'Every low orbit includes a shadow pass; without storage the spacecraft would brown out every eclipse.',
      how: 'Cells store energy chemically and release it on demand; charging reverses the chemical reaction using solar input. Only part of the capacity is usable to protect cell life (we assume 80% depth of discharge).',
      where: 'On the satellite bus sides, near the avionics for short heavy-current paths.',
      specs: [
        { label: 'Mass', value: '90', unit: 'kg' },
        { label: 'Capacity', value: '15,000', unit: 'Wh' },
        { label: 'Max DoD', value: '80', unit: '%' },
      ],
      connections: 'Charged by the arrays; carries avionics, radios and instruments through eclipse.',
      impact: 'Each pack adds 11.25 kWh at the safe 80% DoD. Eclipse energy need = consumed watts × 35% of mission hours.',
      failure: 'Not enough storage: the simulation logs emergency load-shedding as cells drain past safe limits.',
      example: 'Hubble switched to lithium-ion packs during its final servicing mission.',
      funFact: 'Li-ion stores roughly 3× the energy per kilogram of the nickel-cadmium packs used on early satellites.',
    },
    quiz: {
      question: 'What does "depth of discharge" (DoD) mean?',
      options: [
        'How much capacity is used per cycle',
        'Battery mass',
        'Cell voltage',
      ],
      answerIndex: 0,
      explanation: 'DoD is the fraction of capacity used each cycle; deep cycles wear cells out, so spacecraft cap DoD.',
    },
  },
  antenna: {
    id: 'antenna',
    name: 'Communication Antenna',
    category: 'Communications',
    stackRole: 'side',
    height: 1.5,
    mass: 95,
    cost: 30000,
    powerConsume: 500,
    dataRateMbps: 150,
    capability: 'communication',
    maxInstances: 1,
    required: true,
    description: 'High-gain dish for the primary command and data link.',
    edu: {
      what: 'A parabolic dish antenna focuses weak radio waves into a narrow beam (or focuses incoming waves onto a small feed horn) using its curved reflective surface.',
      why: 'Signal power from far away is extraordinarily small; concentrating it is the only way to move real data volumes.',
      how: 'The transmitter drives the feed horn; the dish reflects the waves into a parallel beam. Bigger dish area relative to wavelength means higher gain and a tighter beam.',
      where: 'On top of the satellite bus, pointed at Earth after separation.',
      specs: [
        { label: 'Mass', value: '95', unit: 'kg' },
        { label: 'Dish diameter', value: '2.4', unit: 'm' },
        { label: 'Data rate', value: '150', unit: 'Mbps' },
        { label: 'Power', value: '500', unit: 'W' },
      ],
      connections: 'Carries instrument data to the ground; the small relay antenna covers contact when pointing is lost.',
      impact: 'High power draw and a strong pointing requirement, but unlocks fast data return from the science payload.',
      failure: 'No antenna: mission data cannot reach the ground — the simulated mission logs a permanent communications outage.',
      example: 'The Deep Space Network\u2019s 70 m dishes can hear signals just tenths of a billionth of a billionth of a watt strong.',
      funFact: 'A comsat dish routinely provides over 30 dB of gain — a 1000× boost achieved purely by geometry.',
    },
    quiz: {
      question: 'What drives a dish antenna\u2019s achievable data rate most?',
      options: ['Paint colour', 'Collecting area versus wavelength (aperture gain)', 'Tank pressure'],
      answerIndex: 1,
      explanation: 'Gain scales with dish area over wavelength squared; larger apertures hear more per transmitted watt.',
    },
  },
  relay: {
    id: 'relay',
    name: 'Relay Antenna',
    category: 'Communications',
    stackRole: 'side',
    height: 0.8,
    mass: 45,
    cost: 14000,
    powerConsume: 200,
    dataRateMbps: 40,
    capability: 'communication',
    maxInstances: 2,
    description: 'Near-omnidirectional backup link for safety and telemetry data.',
    edu: {
      what: 'A relay antenna is a small, nearly omnidirectional radio that keeps a health-and-safety link alive even when the main dish is mispointed.',
      why: 'The high-gain dish must be aimed precisely at Earth; if attitude is lost, only a wide-angle link still gets through.',
      how: 'Instead of concentrating energy into one narrow beam, a patch or helical antenna radiates in almost every direction — trading data rate for reliability.',
      where: 'On the satellite bus sides, kept clear of engine plumes and panel shadows.',
      specs: [
        { label: 'Mass', value: '45', unit: 'kg' },
        { label: 'Data rate', value: '40', unit: 'Mbps' },
        { label: 'Power', value: '200', unit: 'W' },
      ],
      connections: 'Shares the communication capability with the main dish; carries housekeeping data during faults.',
      impact: 'Cheap insurance: a second comms path lowers mission risk in scoring.',
      failure: 'No relay: a pointing fault equals an immediate total blackout in simulation.',
      example: 'Mars rovers relay through orbiters via UHF when their direct-to-Earth link is not available.',
      funFact: 'Almost every modern spacecraft keeps a low-gain "emergency broadcast" channel from launch to decommissioning.',
    },
    quiz: {
      question: 'Why is a low-gain relay kept on board?',
      options: [
        'It is lighter',
        'It works without precise pointing, even during faults',
        'It doubles the bandwidth',
      ],
      answerIndex: 1,
      explanation: 'Wide-angle links trade throughput for reliability, guaranteeing contact in emergencies.',
    },
  },
  nav_sensor: {
    id: 'nav_sensor',
    name: 'Navigation Sensor',
    category: 'Navigation',
    stackRole: 'side',
    height: 0.6,
    mass: 40,
    cost: 20000,
    powerConsume: 250,
    capability: 'navigation',
    maxInstances: 1,
    required: true,
    description: 'Star tracker and inertial measurement unit for attitude.',
    edu: {
      what: 'A star tracker is a small camera that photographs star fields and matches them against an on-board catalog to compute which way the vehicle is pointing; an IMU measures rotation rate in between fixes.',
      why: 'Engines, antennas, panels and instruments all need to point in precise directions — attitude knowledge is the foundation of everything.',
      how: 'The tracker identifies the star constellation pattern in its image, solves the vehicle\u2019s 3-axis attitude from the match, and hands the answer to the flight computer.',
      where: 'Top-front of the satellite bus, looking away from engine plume and panel reflections.',
      specs: [
        { label: 'Mass', value: '40', unit: 'kg' },
        { label: 'Attitude accuracy', value: '<0.01', unit: '°' },
        { label: 'Power', value: '250', unit: 'W' },
      ],
      connections: 'Feeds the flight computer, which steers dish pointing and instrument gazing.',
      impact: 'Required for any simulated maneuver; maneuvers without navigation are unguided.',
      failure: 'No star tracker: attitude knowledge drifts unbounded and pointing-dependent systems fail.',
      example: 'Precise observatories blend star trackers with gyroscopes to hold milliarcsecond-level pointing.',
      funFact: 'The Sun is the easiest reference in space — but for fine pointing, nothing beats matching known star patterns.',
    },
    quiz: {
      question: 'How does a star tracker find the vehicle\u2019s orientation?',
      options: [
        'By matching star patterns in its image with an on-board catalog',
        'By GPS ranging',
        'By air friction sensing',
      ],
      answerIndex: 0,
      explanation: 'The recognized star pattern is compared to a database to solve the 3-axis attitude quaternion.',
    },
  },
  avionics: {
    id: 'avionics',
    name: 'Flight Computer & Avionics',
    category: 'Navigation',
    stackRole: 'side',
    height: 0.5,
    mass: 55,
    cost: 45000,
    powerConsume: 350,
    capability: 'avionics',
    maxInstances: 1,
    required: true,
    description: 'Guidance computer, data bus and sequencing electronics.',
    edu: {
      what: 'The flight computer is the vehicle\u2019s brain: it reads sensors, runs guidance loops, sequences maneuvers, and commands every valve and radio.',
      why: 'Launch and orbital operations happen far too fast for humans; automated loops also react within milliseconds.',
      how: 'It polls the IMU, star tracker and propellant data, computes guidance corrections from vehicle state, and commands actuators hundreds of times per second.',
      where: 'Inside the satellite bus core, away from engine vibration.',
      specs: [
        { label: 'Mass', value: '55', unit: 'kg' },
        { label: 'Processor', value: 'radiation-hardened', unit: '' },
        { label: 'Power', value: '350', unit: 'W' },
      ],
      connections: 'Talks to navigation, propulsion, comms and instruments across the vehicle data bus.',
      impact: 'Nothing flies without it: every objective in the simulation runs through the flight computer.',
      failure: 'No flight computer: launch check fails outright.',
      example: 'Falcon 9 runs triple-redundant computers that vote on every command — two of three must agree.',
      funFact: 'The Apollo Guidance Computer weighed 32 kg with less memory than a modern greeting card, yet flew humans to the Moon.',
    },
    quiz: {
      question: 'Why do flight computers run redundantly?',
      options: [
        'To use more power',
        'A single radiation hit or bug must not kill the mission',
        'To simplify software',
      ],
      answerIndex: 1,
      explanation: 'Redundant computers vote, masking any single fault from radiation-induced bit flips or software errors.',
    },
  },
  science: {
    id: 'science',
    name: 'Science Instrument',
    category: 'Science',
    stackRole: 'side',
    height: 1.1,
    mass: 75,
    cost: 40000,
    powerConsume: 900,
    dataRateMbps: 60,
    capability: 'science',
    maxInstances: 3,
    description: 'Optical imaging / measurement instrument package.',
    edu: {
      what: 'The science instrument is the payload that produces the mission\u2019s primary data — here, an optical telescope and detector package.',
      why: 'The mission exists to collect this data; flying a vehicle with no payload serves no purpose.',
      how: 'Mirrors collect light and a detector turns photons into electrical charge; stray heat must be piped away to keep the detector quiet.',
      where: 'Inside the payload bay, looking Earthward or spaceward through its aperture.',
      specs: [
        { label: 'Mass', value: '75', unit: 'kg' },
        { label: 'Aperture', value: '0.6', unit: 'm' },
        { label: 'Data rate', value: '60', unit: 'Mbps' },
        { label: 'Power', value: '900', unit: 'W' },
      ],
      connections: 'Powered from the power bus, streams through the antennas, and dumps heat to the radiators.',
      impact: 'Each instrument adds mass and power draw — more instruments demand more arrays and comms.',
      failure: 'No instruments: the debrief reports zero scored science data.',
      example: 'JWST dedicates a large share of its mass to its sunshield — protection can outweigh the instruments themselves.',
      funFact: 'Telescope mirrors are polished to nanometer smoothness — thousands of times smoother than a billiard ball per scale.',
    },
    quiz: {
      question: 'What consumes the most power during science operations?',
      options: [
        'Instruments and the radios streaming their data',
        'Structural actuators',
        'Separation bolts',
      ],
      answerIndex: 0,
      explanation: 'Detector cooling plus high-rate transmitters dominate science-mode power budgets.',
    },
  },
  radiator: {
    id: 'radiator',
    name: 'Radiator Panel',
    category: 'Thermal',
    stackRole: 'side',
    height: 0.3,
    mass: 60,
    cost: 18000,
    maxInstances: 2,
    description: 'High-emissivity panel rejecting heat to deep space.',
    edu: {
      what: 'A radiator panel is a flat surface with a high-emissivity coating that dumps spacecraft heat as infrared radiation.',
      why: 'Vacuum is a perfect insulator — with no air for convection, radiation is the only way to cool down.',
      how: 'Heat pipes carry warmth from electronics to the panel; the coating radiates energy at a rate that grows with the fourth power of temperature.',
      where: 'Opposite side panels of the bus, held edge-on to the Sun.',
      specs: [
        { label: 'Mass', value: '60', unit: 'kg' },
        { label: 'Rejection capacity', value: '1.2', unit: 'kW' },
        { label: 'Emissivity', value: '0.85', unit: '' },
      ],
      connections: 'Sits at the end of the heat path: engine bay, avionics and instrument coolers feed it.',
      impact: 'Large power conversions and instrument loads need more radiator area or systems throttle.',
      failure: 'Insufficient rejection: the simulation logs thermal throttling and degraded instrument data.',
      example: 'The ISS sheds tens of kilowatts through large white-coated radiator wings.',
      funFact: 'Radiators must avoid seeing the Sun or warm Earth — every extra absorber cuts the watts they can shed.',
    },
    quiz: {
      question: 'How does a spacecraft mostly reject heat?',
      options: [
        'Convection to air',
        'Radiation to space',
        'Conduction into the solar panels',
      ],
      answerIndex: 1,
      explanation: 'No air means no convection: only infrared radiation leaving hot surfaces removes heat.',
    },
  },
  landing_legs: {
    id: 'landing_legs',
    name: 'Landing Legs',
    category: 'Structure',
    stackRole: 'side',
    height: 1.2,
    mass: 110,
    cost: 25000,
    maxInstances: 3,
    description: 'Deployable struts enabling propulsive vertical landings.',
    edu: {
      what: 'Landing legs are telescoping struts with crushable footpads that let a booster land vertically.',
      why: 'Only reusable stages need them: without legs, touchdown would crush the engine section.',
      how: 'Pneumatic struts lock into the extended position; honeycomb footpads absorb the landing shock before it reaches the tank walls.',
      where: 'Three struts around the engine section base, spaced 120° apart.',
      specs: [
        { label: 'Mass (each)', value: '110', unit: 'kg' },
        { label: 'Landing load', value: '35', unit: 'kN' },
      ],
      connections: 'Bolt to the first-stage base; fold flush during ascent to cut drag.',
      impact: 'Added mass that is dead weight all the way up — the honest price of reusability.',
      failure: 'Simulated landing without legs: the vehicle is recorded as lost regardless of the trajectories quality.',
      example: 'Falcon 9\u2019s four titanium legs deploy about ten seconds before touchdown.',
      funFact: 'Deploying legs early would be catastrophic — aerodynamic load would snap them wide open.',
    },
    quiz: {
      question: 'What trade do landing legs represent?',
      options: [
        'Added carry-mass versus reusability',
        'Cost versus data rate',
        'Power versus propellant',
      ],
      answerIndex: 0,
      explanation: 'Legs are dead mass during flight, spent in exchange for the ability to land and refly the stage.',
    },
  },
};

export function getComponent(id: string): ComponentDef | undefined {
  return COMPONENT_CATALOG[id];
}

// ---------------------------------------------------------------------------
// STACK LAYOUT — deterministic mounting anchors for the vertical vehicle stack
// ---------------------------------------------------------------------------

export interface Mount {
  position: { x: number; y: number; z: number };
  rotationY: number;
}

// bottom-up
export const STACK_ORDER = [
  'main_engine',
  'fuel_tank',
  'oxidizer_tank',
  'first_stage_structure',
  'separator',
  'upper_stage_structure',
  'separator',
  'spacecraft_bus',
  'payload_bay',
  'nose_cone',
];
const STACK_GAP = 0.05;
const SIDE_MOUNT_RADIUS = 2.25;

export function computeLayout(components: InstalledComponent[]): Map<string, Mount> {
  const mounts = new Map<string, Mount>();
  const pending = new Map<string, InstalledComponent[]>();
  for (const c of components) {
    const arr = pending.get(c.id) ?? [];
    arr.push(c);
    pending.set(c.id, arr);
  }
  const take = (id: string): InstalledComponent | undefined => pending.get(id)?.shift();

  // Stack parts, bottom-up following STACK_ORDER; leftovers stack above the nose.
  let cursorY = 0;
  for (const id of STACK_ORDER) {
    const comp = take(id);
    if (!comp) continue;
    const centerY = cursorY + comp.height / 2;
    mounts.set(comp.instanceId, { position: { x: 0, y: centerY, z: 0 }, rotationY: 0 });
    cursorY = centerY + comp.height / 2 + STACK_GAP;
  }
  for (const arr of pending.values()) {
    for (const comp of arr) {
      if (comp.stackRole === 'side') continue;
      const centerY = cursorY + comp.height / 2;
      mounts.set(comp.instanceId, { position: { x: 0, y: centerY, z: 0 }, rotationY: 0 });
      cursorY = centerY + comp.height / 2 + STACK_GAP;
    }
  }

  // Side / top components anchor around the bus center (or stack top without one).
  const bus = components.find((c) => c.id === 'spacecraft_bus');
  const upper = components.find((c) => c.id === 'upper_stage_structure');
  const anchorY: number =
    bus && mounts.has(bus.instanceId)
      ? mounts.get(bus.instanceId)!.position.y
      : upper && mounts.has(upper.instanceId)
        ? mounts.get(upper.instanceId)!.position.y
        : cursorY;

  const R = SIDE_MOUNT_RADIUS;
  const sideIndex: Record<string, number> = {};
  for (const comp of components) {
    if (comp.stackRole !== 'side') continue;
    const idx = sideIndex[comp.id] ?? 0;
    sideIndex[comp.id] = idx + 1;
    const angle = (idx * Math.PI) / 2;

    switch (comp.id) {
      case 'solar_panel': {
        const r = R + 1.7;
        mounts.set(comp.instanceId, {
          position: { x: Math.cos(angle) * r, y: anchorY + 0.3, z: Math.sin(angle) * r },
          rotationY: -angle + Math.PI / 2,
        });
        break;
      }
      case 'antenna':
        mounts.set(comp.instanceId, { position: { x: 0, y: anchorY + 2.4, z: 0 }, rotationY: 0 });
        break;
      case 'relay':
        mounts.set(comp.instanceId, {
          position: { x: Math.cos(angle) * R, y: anchorY + 1.6, z: Math.sin(angle) * R },
          rotationY: -angle,
        });
        break;
      case 'nav_sensor':
        mounts.set(comp.instanceId, {
          position: { x: 0, y: anchorY + 2.0, z: R - 0.55 },
          rotationY: 0,
        });
        break;
      case 'avionics':
        mounts.set(comp.instanceId, {
          position: { x: Math.cos(Math.PI / 2) * R, y: anchorY + 0.7, z: Math.sin(Math.PI / 2) * R },
          rotationY: -Math.PI / 2,
        });
        break;
      case 'battery':
        mounts.set(comp.instanceId, {
          position: {
            x: Math.cos((3 * Math.PI) / 2) * R,
            y: anchorY - 0.2,
            z: Math.sin((3 * Math.PI) / 2) * R,
          },
          rotationY: -(3 * Math.PI) / 2,
        });
        break;
      case 'science':
        mounts.set(comp.instanceId, {
          position: { x: 0, y: anchorY + 3.5, z: 2.7 },
          rotationY: 0,
        });
        break;
      case 'radiator': {
        const a = Math.PI + idx * Math.PI;
        const r = R + 0.6;
        mounts.set(comp.instanceId, {
          position: { x: Math.cos(a) * r, y: anchorY - 0.9, z: Math.sin(a) * r },
          rotationY: -a,
        });
        break;
      }
      case 'landing_legs': {
        const legAngle = (idx * Math.PI * 2) / 3;
        const engine = components.find((c) => c.id === 'main_engine');
        const legY = engine && mounts.has(engine.instanceId)
          ? mounts.get(engine.instanceId)!.position.y + 0.15
          : anchorY - 3.0;
        mounts.set(comp.instanceId, {
          position: { x: Math.cos(legAngle) * 2.0, y: legY, z: Math.sin(legAngle) * 2.0 },
          rotationY: legAngle,
        });
        break;
      }
    }
  }

  return mounts;
}

export function applyLayout(components: InstalledComponent[]): void {
  const mounts = computeLayout(components);
  for (const c of components) {
    const m = mounts.get(c.instanceId);
    if (m) c.position = { ...m.position };
  }
}

// ---------------------------------------------------------------------------
// MISSION CONTEXT + TELEMETRY / ENGINEERING CHECKS
// ---------------------------------------------------------------------------

export interface MissionContext {
  name: string;
  maxMass: number;          // kg
  budget: number;           // USD
  requiredDeltaVMs: number; // m/s; 0 = not applicable
  requiredDataRateMbps: number;
  durationHours: number;
  requiredCapabilities: string[];
  requiresLanding?: boolean;
}

export const GENERIC_MISSION: MissionContext = {
  name: 'Generic',
  maxMass: 3500,
  budget: 600000,
  requiredDeltaVMs: 0,
  requiredDataRateMbps: 30,
  durationHours: 12,
  requiredCapabilities: ['communication', 'propulsion', 'navigation', 'avionics'],
};

export interface EngineeringResult {
  mission: MissionContext;
  totalMassKg: number;
  propellantMassKg: number;
  payloadMassKg: number;
  maxMassKg: number;
  massMarginKg: number;
  massExceeded: boolean;
  powerGenerationW: number;
  powerConsumptionW: number;
  netPowerW: number;
  batteryCapacityWh: number;
  batteryUsableWh: number;
  eclipseEnergyNeedWh: number;
  energyMarginWh: number;
  deltaVms: number | null; // null = not enough data
  dataRateMbps: number;
  totalCost: number;
  budgetRemaining: number;
  budgetExceeded: boolean;
  capabilities: Set<string>;
  warnings: string[];
  launchBlockers: string[];
  isLaunchReady: boolean;
  readinessScore: number; // 0..1
}

export function computeEngineering(
  components: InstalledComponent[],
  mission: MissionContext = GENERIC_MISSION
): EngineeringResult {
  let totalMass = 0;
  let propellant = 0;
  let powerGen = 0;
  let powerConsume = 0;
  let batteryWh = 0;
  let cost = 0;
  let isp = 0;
  const capabilities = new Set<string>();
  const counts: Record<string, number> = {};

  for (const c of components) {
    // propellant mass rides on board, so it counts in the vehicle mass
    totalMass += c.mass + (c.propellantMass ?? 0);
    cost += c.cost;
    powerGen += c.powerGen ?? 0;
    powerConsume += c.powerConsume ?? 0;
    batteryWh += c.energyCapacity ?? 0;
    if (c.propellantMass) propellant += c.propellantMass;
    if (c.isp) isp = Math.max(isp, c.isp);
    if (c.capability) capabilities.add(c.capability);
    counts[c.id] = (counts[c.id] ?? 0) + 1;
  }

  const payloadMass = components
    .filter((c) => c.id === 'science')
    .reduce((a, c) => a + c.mass, 0);

  // Rocket equation — null when engine or propellant is missing.
  let deltaV: number | null = null;
  const hasEngine = (counts['main_engine'] ?? 0) > 0;
  if (hasEngine && isp > 0 && propellant > 0 && totalMass - propellant > 0) {
    deltaV = isp * G0 * Math.log(totalMass / (totalMass - propellant));
  }

  // Energy balance: eclipse consumption must fit in usable battery capacity.
  const eclipseHours = mission.durationHours * ECLIPSE_FRACTION;
  const eclipseNeed = powerConsume * eclipseHours;
  const usableBattery = batteryWh * BATTERY_MAX_DOD;
  const energyMargin = usableBattery - eclipseNeed;

  const netPower = powerGen - powerConsume;
  const massMargin = mission.maxMass - totalMass;

  const commComps = components.filter((c) => c.capability === 'communication');
  const dataRate = commComps.length ? Math.max(...commComps.map((c) => c.dataRateMbps ?? 0)) : 0;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (totalMass > mission.maxMass) {
    blockers.push(`Mass exceeded: ${Math.round(totalMass)} kg > ${mission.maxMass} kg limit`);
  }
  if (netPower < 0) {
    blockers.push(
      `Power deficit: ${Math.round(-netPower)} W short (${Math.round(powerConsume)} W consumed vs ${Math.round(powerGen)} W generated)`
    );
  }
  if (cost > mission.budget) {
    blockers.push(`Budget over-run: $${cost.toLocaleString()} > $${mission.budget.toLocaleString()}`);
  }
  if (energyMargin < 0) {
    blockers.push(
      `Eclipse battery shortfall: needs ${Math.round(eclipseNeed)} Wh, only ${Math.round(usableBattery)} Wh usable`
    );
  }
  if (deltaV === null && mission.requiredDeltaVMs > 0) {
    blockers.push('Delta-v unknown — main engine plus propellant required');
  } else if (deltaV !== null && deltaV < mission.requiredDeltaVMs) {
    blockers.push(
      `Insufficient delta-v: ${Math.round(deltaV)} m/s available < ${mission.requiredDeltaVMs} m/s required`
    );
  }
  if (dataRate < mission.requiredDataRateMbps) {
    blockers.push(
      `Comms below mission floor: ${dataRate} Mbps < ${mission.requiredDataRateMbps} Mbps required`
    );
  }
  if (mission.requiresLanding && (counts['landing_legs'] ?? 0) === 0) {
    blockers.push('This mission simulates landing — landing legs required');
  }

  if (!counts['spacecraft_bus']) blockers.push('Missing main bus — nothing can be mounted');
  if (!counts['avionics']) blockers.push('Missing flight computer / avionics');
  if (!capabilities.has('navigation')) blockers.push('Missing navigation sensor');

  for (const req of mission.requiredCapabilities) {
    if (!capabilities.has(req)) blockers.push(`Missing required capability: ${req}`);
  }

  for (const [id, n] of Object.entries(counts)) {
    const def = COMPONENT_CATALOG[id];
    if (def?.maxInstances && n > def.maxInstances) {
      blockers.push(`${def.name}: ${n} installed (max ${def.maxInstances})`);
    }
  }

  if (massMargin >= 0 && massMargin < mission.maxMass * 0.1) {
    warnings.push(`Mass margin tight: only ${Math.round(massMargin)} kg left`);
  }
  if (netPower > 0 && netPower < 400) {
    warnings.push('Power margin below 400 W — add a solar panel or shed a load');
  }
  if (
    mission.requiredDeltaVMs > 0 &&
    deltaV !== null &&
    deltaV >= mission.requiredDeltaVMs &&
    (counts['fuel_tank'] ?? 0) + (counts['oxidizer_tank'] ?? 0) === 1 &&
    (dataRate >= mission.requiredDataRateMbps || true)
  ) {
    warnings.push('Thin propellant margin — a second tank buys maneuver reserve');
  }
  if (dataRate >= mission.requiredDataRateMbps && !counts['relay']) {
    warnings.push('No backup relay antenna — a single comms failure means total blackout');
  }

  const isReady = blockers.length === 0;
  const readinessScore = Math.max(
    0,
    Math.min(1, 1 - blockers.length * 0.15 - warnings.length * 0.05)
  );

  return {
    mission,
    totalMassKg: totalMass,
    propellantMassKg: propellant,
    payloadMassKg: payloadMass,
    maxMassKg: mission.maxMass,
    massMarginKg: massMargin,
    massExceeded: totalMass > mission.maxMass,
    powerGenerationW: powerGen,
    powerConsumptionW: powerConsume,
    netPowerW: netPower,
    batteryCapacityWh: batteryWh,
    batteryUsableWh: usableBattery,
    eclipseEnergyNeedWh: eclipseNeed,
    energyMarginWh: energyMargin,
    deltaVms: deltaV,
    dataRateMbps: dataRate,
    totalCost: cost,
    budgetRemaining: mission.budget - cost,
    budgetExceeded: cost > mission.budget,
    capabilities,
    warnings,
    launchBlockers: blockers,
    isLaunchReady: isReady,
    readinessScore,
  };
}
