import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { softenPectoralSurface } from '@/lib/bodyModel/pectoralSurface';
describe('pectoral surface correction', () => {
  it('softens a chest dent while preserving the outline and morph correspondence', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([.1,1.25,.05, .08,1.23,.10, .12,1.23,.10, .12,1.27,.10, .08,1.27,.10, .3,1.25,.10],3));
    g.setIndex([0,1,2,0,2,3,0,3,4,0,4,1]);
    g.morphTargetsRelative = true;
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(18),3)];
    softenPectoralSurface(g);
    const p = g.getAttribute('position');
    expect(p.getZ(0)).toBeGreaterThan(.05);
    expect(p.getX(0)).toBeCloseTo(.1);
    expect(p.getY(0)).toBeCloseTo(1.25);
    expect(p.getZ(5)).toBeCloseTo(.1);
    expect(Array.from(g.morphAttributes.position[0]!.array).every(v=>v===0)).toBe(true);
    expect(Array.from(g.morphAttributes.normal![0]!.array).every(Number.isFinite)).toBe(true);
  });
});

