import type { DetectionBridge } from '../../lib/detection-bridge';

let _bridge: DetectionBridge | null = null;

export function setBridge(b: DetectionBridge | null) {
  _bridge = b;
}

export function getBridge(): DetectionBridge | null {
  return _bridge;
}
