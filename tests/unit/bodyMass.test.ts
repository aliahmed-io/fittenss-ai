import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { buildMassGeometry, meshVolume } from '@/lib/bodyModel/bodyMass';
import { computeGLBMorphInfluences } from '@/lib/bodyModel/glbModelLoader';
import { generateSmartMeasurements } from '@/lib/bodyModel/anthropometry';
vi.stubGlobal('ProgressEvent', class { constructor(public type: string) {} });
const models = {} as Record<'male'|'female',THREE.SkinnedMesh>;
beforeAll(async () => {
  for (const gender of ['male','female'] as const) {
    const bytes = readFileSync(`public/models/${gender}_v2.glb`);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) models[gender]=node as THREE.SkinnedMesh; });
  }
});
function render(gender: 'male'|'female',weightKg:number,bodyFatPct:number,heightCm=178) {
  const mesh=models[gender], source=mesh.geometry;
  const morphs=generateSmartMeasurements(gender,heightCm,weightKg,bodyFatPct);
  const map=new Map(Object.entries(mesh.morphTargetDictionary??{}));
  return buildMassGeometry(mesh,source,computeGLBMorphInfluences(gender,map,morphs,bodyFatPct,weightKg),{gender,weightKg,bodyFatPct,heightCm});
}
describe('mass-driven anatomical models using the actual GLB assets',()=>{
  for(const gender of ['male','female'] as const) {
    it(`${gender}: calibrates volume across the supported weight range`,()=>{
      for(const weight of [40,60,80,100,120,160,200,250]){
        const geometry=render(gender,weight,30);
        expect(geometry.userData.massCalibration.relativeError).toBeLessThan(.005);
        expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
        geometry.dispose();
      }
    });
    it(`${gender}: 120 kg has 50% more volume than 80 kg at the same stature`,()=>{
      const light=render(gender,80,25),heavy=render(gender,120,25);
      const volume=(g:THREE.BufferGeometry)=>meshVolume(g.getAttribute('position').array,g.index!.array);
      expect(volume(heavy)/volume(light)).toBeCloseTo(1.5,2);
      const waist=(g:THREE.BufferGeometry)=>{
        const p=g.getAttribute('position');let span=0;
        for(let i=0;i<p.count;i++)if(p.getY(i)>.9&&p.getY(i)<1.1)span=Math.max(span,Math.abs(p.getX(i)));
        return span;
      };
      expect(waist(heavy)).toBeGreaterThan(waist(light));
    });
  }
  it('keeps composition and height meaningful instead of assigning one look to kilograms',()=>{
    const lean=render('male',120,15),fat=render('male',120,40),tall=render('male',120,25,195),short=render('male',120,25,160);
    const abdomenFront = (g: THREE.BufferGeometry) => {
      const p = g.getAttribute('position'); let maximum = -Infinity;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > .95 && p.getY(i) < 1.15 && Math.abs(p.getX(i)) < .2) maximum = Math.max(maximum, p.getZ(i));
      return maximum;
    };
    expect(abdomenFront(fat)).toBeGreaterThan(abdomenFront(lean) + .03);
    for (const geometry of [lean, fat, tall, short]) {
      const p = geometry.getAttribute('position');
      const baseline = models.male.geometry.getAttribute('position');
      let actualHeight = 0, baselineHeight = 0;
      for (let i = 0; i < p.count; i++) { actualHeight = Math.max(actualHeight, p.getY(i)); baselineHeight = Math.max(baselineHeight, baseline.getY(i)); }
      expect(actualHeight).toBeCloseTo(baselineHeight, 3);
    }
    expect(tall.userData.massCalibration.targetVolume).toBeLessThan(short.userData.massCalibration.targetVolume);
  });
});
