import * as THREE from 'three';

const ARM_BONES = new Set(['lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']);
const LEG_BONES = new Set(['foot_l', 'foot_r']);

/** Applies measurement changes while retaining the exported neutral stance. */
export class LimbController {
  private skeleton: THREE.Skeleton | null = null;
  private positions = new Map<string, THREE.Vector3>();
  private arm = 1;
  private leg = 1;
  private dirty = true;
  setSkeleton(skeleton: THREE.Skeleton) {
    if (this.skeleton === skeleton) return;
    this.skeleton = skeleton;
    this.positions.clear();
    for (const bone of skeleton.bones) this.positions.set(bone.name, bone.position.clone());
    this.dirty = true;
  }
  setLimbRatios(arm: number, leg: number) {
    if (this.arm === arm && this.leg === leg) return;
    this.arm = arm; this.leg = leg; this.dirty = true;
  }
  getGroundOffset() { return (this.leg - 1) * (this.positions.get('foot_l')?.length() ?? 0); }
  update() {
    if (!this.dirty || !this.skeleton) return;
    for (const bone of this.skeleton.bones) {
      const initial = this.positions.get(bone.name);
      if (!initial) continue;
      bone.position.copy(initial);
      if (ARM_BONES.has(bone.name)) bone.position.multiplyScalar(this.arm);
      else if (LEG_BONES.has(bone.name)) bone.position.multiplyScalar(this.leg);
    }
    this.skeleton.update();
    this.dirty = false;
  }
}
