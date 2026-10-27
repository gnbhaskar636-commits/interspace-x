// GESTURE CONTROLLER — turns tracked hand frames into interaction commands.
//
// Pinch (thumb+index)   → grab / drag a component (or select on tap)
// Open palm             → release whatever is grabbed
// Palm position         → drives a screen-space cursor for targeting
//
// All thresholds/debounce live in handTracking.ts; this module only handles
// gesture *transitions* and screen mapping.

import { HandTracker, HandFrame, HandTrackingState } from './handTracking';

export interface GestureCommand {
  type: 'select' | 'move' | 'release';
  hand: string;
  gesture: string;
  /** normalized device coordinates for the Camera raycaster */
  ndc: { x: number; y: number };
}

export class HandController {
  private tracker: HandTracker;
  private video: HTMLVideoElement;
  private grabbing = new Map<string, boolean>();
  private cbCommand?: (cmd: GestureCommand) => void;
  private cbState?: (s: HandTrackingState) => void;

  constructor(tracker: HandTracker, video: HTMLVideoElement) {
    this.tracker = tracker;
    this.video = video;

    this.tracker.onState((s) => this.cbState?.(s));
    this.tracker.onFrame((f) => this.handleFrame(f));
  }

  /** Map a mirrored webcam palm position to normalized device coordinates. */
  private ndcOf(palm: { x: number; y: number }): { x: number; y: number } {
    // camera preview is mirrored, and hard mirror the x axis back
    const x = (0.5 - palm.x) * 2;
    const y = -(palm.y - 0.5) * 2;
    return { x: THREE_clamp(x, -1.2, 1.2), y: THREE_clamp(y, -1.2, 1.2) };
  }

  private handleFrame(f: HandFrame): void {
    const wasGrabbing = this.grabbing.get(f.hand) ?? false;
    const ndc = this.ndcOf(f.palm);

    if (f.gesture === 'pinch' && !wasGrabbing) {
      this.grabbing.set(f.hand, true);
      this.cbCommand?.({ type: 'select', hand: f.hand, gesture: f.gesture, ndc });
    } else if (f.gesture === 'pinch' && wasGrabbing) {
      this.cbCommand?.({ type: 'move', hand: f.hand, gesture: f.gesture, ndc });
    } else if (f.gesture === 'open_palm' && wasGrabbing) {
      this.grabbing.set(f.hand, false);
      this.cbCommand?.({ type: 'release', hand: f.hand, gesture: f.gesture, ndc });
    } else if (f.gesture === 'none' && wasGrabbing) {
      // stronger fallback: hand left shelf mid-grab
      this.grabbing.set(f.hand, false);
      this.cbCommand?.({ type: 'release', hand: f.hand, gesture: 'open_palm', ndc });
    }
  }

  onCommand(cb: (cmd: GestureCommand) => void): void {
    this.cbCommand = cb;
  }

  onState(cb: (s: HandTrackingState) => void): void {
    this.cbState = cb;
  }

  async startTracking(): Promise<void> {
    // state transitions are emitted by the tracker itself
    await this.tracker.start(this.video);
  }

  stopTracking(): void {
    this.grabbing.clear();
    this.tracker.stop();
  }

  getState(): HandTrackingState {
    return this.tracker.getState();
  }
}

function THREE_clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
