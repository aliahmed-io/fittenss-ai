export interface CameraFraming { pos: [number, number, number]; target: [number, number, number] }

/** Fit the neutral figure to both viewport axes, leaving room for touch controls. */
export function fitBodyCamera(height: number, widthPx: number, heightPx: number, view: 'full' | 'profile'): CameraFraming {
  const bodyHeight = Math.min(2.5, Math.max(1, height)) * 1.03;
  const aspect = Math.max(.2, widthPx / Math.max(1, heightPx));
  const verticalHalfFov = 18 * Math.PI / 180;
  const usableHeight = Math.min(.8, Math.max(.5, 1 - 160 / Math.max(1, heightPx)));
  const bodyWidth = bodyHeight * (view === 'profile' ? .32 : .67);
  const distance = Math.max(bodyHeight / (2 * Math.tan(verticalHalfFov) * usableHeight), bodyWidth / (2 * Math.tan(verticalHalfFov) * aspect * .88));
  // Aim slightly below the body's centre so feet clear the bottom toolbar.
  const centerY = bodyHeight * .42;
  return { pos: view === 'profile' ? [distance, centerY, 0] : [0, centerY, distance], target: [0, centerY, 0] };
}
