import { describe, expect, it } from 'vitest';
import { fitBodyCamera } from '@/lib/bodyModel/cameraFraming';
import { sanitizeState } from '@/lib/store/fitnessStore';

describe('responsive body viewer', () => {
  it('fits the body vertically and horizontally on small screens and desktop', () => {
    for (const [width, height] of [[320,440],[390,520],[820,620],[1100,680]]) {
      for (const bodyHeight of [1.5,1.78,2.1]) {
        const camera = fitBodyCamera(bodyHeight!, width!, height!, 'full');
        const halfHeight = camera.pos[2] * Math.tan(Math.PI / 10);
        expect(halfHeight * 2).toBeGreaterThan(bodyHeight! * 1.03);
        expect(halfHeight * 2 * width! / height!).toBeGreaterThan(bodyHeight! * 1.03 * .67);
        expect(camera.target[1] - halfHeight).toBeLessThan(0);
        expect(camera.target[1] + halfHeight).toBeGreaterThan(bodyHeight! * 1.03);
      }
    }
  });
  it('reframes for narrower viewports and retains the side-view axis', () => {
    expect(fitBodyCamera(1.78,320,620,'full').pos[2]).toBeGreaterThan(fitBodyCamera(1.78,1000,620,'full').pos[2]);
    expect(fitBodyCamera(1.78,390,520,'profile').pos[2]).toBe(0);
  });
  it('defaults to male without replacing a saved female selection', () => {
    expect(sanitizeState(null).profile.gender).toBe('male');
    expect(sanitizeState({profile:{}}).profile.gender).toBe('male');
    expect(sanitizeState({profile:{gender:'female'}}).profile.gender).toBe('female');
  });
});
