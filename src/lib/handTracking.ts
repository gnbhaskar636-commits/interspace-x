// HAND TRACKING — MediaPipe Hand Landmarker wrapper.
//
// Key behaviors:
//  - The WASM/model is fetched only when the user first enables tracking
//    (never on page load, and no camera is opened without the button).
//  - Gesture detection is debounced (needs N consecutive frames of the same
//    gesture) and positions are EMA-smoothed to avoid jitter selections.
//  - Landmarks are delivered to the controller every frame for overlay.
//  - stopTracking() releases the camera tracks and cancels the loop.

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export type GestureType = 'pinch' | 'open_palm' | 'none';

export type TrackingStatus =
  | 'idle'
  | 'initializing' // downloading MediaPipe model
  | 'requesting'   // asking camera permission
  | 'tracking'
  | 'no_hands'     // camera running, no hand in view
  | 'denied'       // camera permission refused
  | 'error';

export interface HandTrackingState {
  status: TrackingStatus;
  handsDetected: number;
  message: string;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandFrame {
  hand: 'Left' | 'Right';
  gesture: GestureType;
  // palm position normalized 0..1 (video space, already smoothed)
  palm: { x: number; y: number };
  landmarks: Landmark[];
}

// EMA smoothing factor: lower = smoother/slower
const SMOOTHING = 0.35;
// gesture must persist this many consecutive frames to latch (debounce)
const GESTURE_DEBOUNCE = 4;
// raw pinch distance threshold (normalized landmark space)
const PINCH_ON = 0.055;
const PINCH_OFF = 0.085; // hysteresis so touch doesn't flicker

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;

  private state: HandTrackingState = { status: 'idle', handsDetected: 0, message: 'Tracking off' };

  private smoothPalm = new Map<string, { x: number; y: number }>();
  private rawGesture = new Map<string, GestureType>();
  private gestureCount = new Map<string, { g: GestureType; n: number }>();
  private pinchLatched = new Map<string, boolean>();
  private lastGesture = new Map<string, GestureType>();

  private cbState?: (s: HandTrackingState) => void;
  private cbFrame?: (f: HandFrame) => void;

  onState(cb: (s: HandTrackingState) => void): void {
    this.cbState = cb;
  }

  onFrame(cb: (f: HandFrame) => void): void {
    this.cbFrame = cb;
  }

  getState(): HandTrackingState {
    return { ...this.state };
  }

  private setState(status: TrackingStatus, message: string, handsDetected?: number): void {
    this.state = {
      status,
      handsDetected: handsDetected ?? this.state.handsDetected,
      message,
    };
    this.cbState?.({ ...this.state });
  }

  private async ensureModel(): Promise<boolean> {
    if (this.landmarker) return true;
    this.setState('initializing', 'Loading hand-tracking model…', 0);
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/hand_landmarker.task',
          delegate: 'GPU',
        },
        numHands: 2,
        runningMode: 'VIDEO',
      });
      return true;
    } catch (err) {
      // Model download can fail offline: fall back to CPU delegate once.
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
        );
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/hand_landmarker.task',
            delegate: 'CPU',
          },
          numHands: 2,
          runningMode: 'VIDEO',
        });
        return true;
      } catch (err2) {
        this.setState('error', `Could not load hand-tracking model: ${String(err2)}`, 0);
        return false;
      }
    }
  }

  /** Ask for camera permission, start the pipeline. Only called from the enable button. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (this.state.status === 'tracking' || this.state.status === 'requesting') return;
    if (!(await this.ensureModel())) return;

    this.setState('requesting', 'Waiting for camera permission…', 0);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        this.setState('denied', 'Camera permission denied — mouse controls still work everywhere.', 0);
      } else if (name === 'NotFoundError') {
        this.setState('error', 'No camera device found — mouse controls still work everywhere.', 0);
      } else {
        this.setState('error', `Camera error: ${String(err)}`, 0);
      }
      return;
    }

    this.video = video;
    video.srcObject = this.stream;
    video.muted = true;
    try {
      await video.play();
    } catch {
      /* autoplay guard — video.play() may reject until metadata is ready */
    }

    this.setState('tracking', 'Tracking active — raise a hand into view', 0);
    this.loop();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.smoothPalm.clear();
    this.rawGesture.clear();
    this.gestureCount.clear();
    this.lastGesture.clear();
    this.lastVideoTime = -1;
    // keep landmarker loaded for fast re-enable, but report idle
    this.setState('idle', 'Tracking off', 0);
  }

  dispose(): void {
    this.stop();
    this.landmarker?.close?.();
    this.landmarker = null;
  }

  private loop = (): void => {
    const v = this.video;
    if (!v || !this.landmarker) return;

    if (v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const result = this.landmarker.detectForVideo(v, performance.now());

      const hands = result?.landmarks ?? [];
      const handednessList = result?.handedness ?? [];
      // emit only when the visible state actually changes
      if (hands.length === 0 && this.state.status !== 'no_hands') {
        this.setState('no_hands', 'No hand detected — raise a hand into view', 0);
      } else if (hands.length > 0 && this.state.status === 'no_hands') {
        this.setState('tracking', 'Tracking active — use pinch to grab, open palm to release', hands.length);
      }

      for (let i = 0; i < hands.length; i++) {
        const lm = hands[i] as Landmark[];
        const cat = handednessList[i]?.[0]?.categoryName;
        // MediaPipe mirrors handedness for selfie view; normalize to user-facing labels
        const hand = (cat === 'Left' ? 'Right' : 'Left') as 'Left' | 'Right';
        const gesture = this.debouncedGesture(hand, lm);
        const palm = this.smoothedPalm(hand, lm);
        this.cbFrame?.({ hand, gesture, palm, landmarks: lm });
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private smoothedPalm(hand: string, lm: Landmark[]): { x: number; y: number } {
    // palm = wrist + weighted finger bases
    const p = {
      x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
      y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
    };
    const prev = this.smoothPalm.get(hand) ?? p;
    const next = {
      x: prev.x + (p.x - prev.x) * SMOOTHING,
      y: prev.y + (p.y - prev.y) * SMOOTHING,
    };
    this.smoothPalm.set(hand, next);
    return { ...next };
  }

  private debouncedGesture(hand: string, lm: Landmark[]): GestureType {
    const raw = this.classifyGesture(hand, lm);
    const cur = this.gestureCount.get(hand);
    if (cur && cur.g === raw) {
      cur.n++;
    } else {
      this.gestureCount.set(hand, { g: raw, n: 1 });
    }
    const c = this.gestureCount.get(hand)!;
    let out = this.lastGesture.get(hand) ?? 'none';
    // pinch has hysteresis via classifyGesture; latch new gesture after debounce
    if (c.n >= GESTURE_DEBOUNCE && c.g !== out) {
      out = c.g;
      this.lastGesture.set(hand, out);
    }
    return out;
  }

  private classifyGesture(hand: string, lm: Landmark[]): GestureType {
    const thumb = lm[4];
    const index = lm[8];
    const d = Math.hypot(thumb.x - index.x, thumb.y - index.y, (thumb.z - index.z) * 0.5);
    // pinch hysteresis: latch below PINCH_ON, only release above PINCH_OFF
    if (d < PINCH_ON) {
      this.pinchLatched.set(hand, true);
      return 'pinch';
    }
    if (this.pinchLatched.get(hand)) {
      if (d < PINCH_OFF) return 'pinch';
      this.pinchLatched.set(hand, false);
    }
    // fingers extended?
    const extended =
      [8, 12, 16, 20].filter((i) => {
        const tip = lm[i];
        const pip = lm[i - 2];
        const wrist = lm[0];
        const wrist2tip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        return wrist2tip > 0.25 && tip.y < pip.y;
      }).length >= 3;
    return extended ? 'open_palm' : 'none';
  }
}
