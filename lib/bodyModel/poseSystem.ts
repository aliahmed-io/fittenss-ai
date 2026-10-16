import * as THREE from 'three';

export interface BoneTransform {
  rotation: [number, number, number]; // Euler angles in radians [x, y, z]
  position?: [number, number, number]; // Optional local translation [x, y, z]
}

export type PoseKeyframe = Record<string, BoneTransform>;

export const POSES: Record<string, PoseKeyframe> = {
  neutral: {
    Root: { rotation: [0, 0, 0] },
    pelvis: { rotation: [0, 0, 0], position: [0, 0, 0] },
    spine_01: { rotation: [0, 0, 0] },
    spine_02: { rotation: [0, 0, 0] },
    spine_03: { rotation: [0, 0, 0] },
    neck_01: { rotation: [0, 0, 0] },
    head: { rotation: [0, 0, 0] },
    clavicle_l: { rotation: [0, 0, 0] },
    clavicle_r: { rotation: [0, 0, 0] },
    upperarm_l: { rotation: [0, 0, 0] },
    upperarm_r: { rotation: [0, 0, 0] },
    lowerarm_l: { rotation: [0, 0, 0] },
    lowerarm_r: { rotation: [0, 0, 0] },
    thigh_l: { rotation: [0, 0, 0] },
    thigh_r: { rotation: [0, 0, 0] },
    calf_l: { rotation: [0, 0, 0] },
    calf_r: { rotation: [0, 0, 0] },
    foot_l: { rotation: [0, 0, 0] },
    foot_r: { rotation: [0, 0, 0] },
  },

  double_biceps: {
    clavicle_l: { rotation: [0.0, 0.0, 0.08] },
    clavicle_r: { rotation: [0.0, 0.0, -0.08] },
    upperarm_l: { rotation: [0.0, 0.0, 0.80] },
    upperarm_r: { rotation: [0.0, 0.0, -0.80] },
    lowerarm_l: { rotation: [0.0, 0.0, 1.70] },
    lowerarm_r: { rotation: [0.0, 0.0, -1.70] },
    spine_02: { rotation: [-0.05, 0.0, 0.0] },
  },

  lat_spread: {
    clavicle_l: { rotation: [0.0, 0.0, 0.06] },
    clavicle_r: { rotation: [0.0, 0.0, -0.06] },
    upperarm_l: { rotation: [0.35, 0.0, 0.45] },
    upperarm_r: { rotation: [0.35, 0.0, -0.45] },
    lowerarm_l: { rotation: [-0.30, 0.0, 0.90] },
    lowerarm_r: { rotation: [-0.30, 0.0, -0.90] },
    spine_02: { rotation: [-0.06, 0.0, 0.0] },
  },

  squat_deep: {
    pelvis: { position: [0.0, -0.18, 0.0], rotation: [0.15, 0.0, 0.0] },
    spine_01: { rotation: [-0.15, 0.0, 0.0] },
    thigh_l: { rotation: [0.40, 0.0, -0.40] },
    thigh_r: { rotation: [0.40, 0.0, 0.40] },
    calf_l: { rotation: [-0.80, 0.0, 0.20] },
    calf_r: { rotation: [-0.80, 0.0, -0.20] },
    upperarm_l: { rotation: [-0.40, 0.0, 0.15] },
    upperarm_r: { rotation: [-0.40, 0.0, -0.15] },
  },

  deadlift_hinge: {
    pelvis: { position: [0.0, -0.14, -0.10], rotation: [0.40, 0.0, 0.0] },
    spine_01: { rotation: [-0.30, 0.0, 0.0] },
    thigh_l: { rotation: [0.35, 0.0, -0.20] },
    thigh_r: { rotation: [0.35, 0.0, 0.20] },
    calf_l: { rotation: [-0.40, 0.0, 0.10] },
    calf_r: { rotation: [-0.40, 0.0, -0.10] },
    upperarm_l: { rotation: [-0.20, 0.0, -0.15] },
    upperarm_r: { rotation: [-0.20, 0.0, 0.15] },
  },
};

const ARM_SCALED_BONES: ReadonlySet<string> = new Set([
  'lowerarm_l',
  'lowerarm_r',
  'hand_l',
  'hand_r',
]);
const LOWER_LEG_SCALED_BONES: ReadonlySet<string> = new Set(['foot_l', 'foot_r']);

export class PoseController {
  private skeleton: THREE.Skeleton | null = null;
  private boneInitialQuaternions: Map<string, THREE.Quaternion> = new Map();
  private boneInitialPositions: Map<string, THREE.Vector3> = new Map();
  private currentPoseName: string = 'neutral';
  private targetPoseName: string = 'neutral';
  private transitionAlpha: number = 1.0;
  private transitionSpeed: number = 4.0;
  private armRatio: number = 1;
  private lowerLegRatio: number = 1;
  private dirty: boolean = true;

  public setSkeleton(skeleton: THREE.Skeleton) {
    if (this.skeleton === skeleton && this.boneInitialQuaternions.size > 0) {
      return;
    }
    this.skeleton = skeleton;
    this.boneInitialQuaternions.clear();
    this.boneInitialPositions.clear();

    for (const bone of skeleton.bones) {
      this.boneInitialQuaternions.set(bone.name, bone.quaternion.clone());
      this.boneInitialPositions.set(bone.name, bone.position.clone());
    }

    this.currentPoseName = 'neutral';
    this.targetPoseName = 'neutral';
    this.transitionAlpha = 1.0;
    this.dirty = true;
  }

  public setPose(poseName: string) {
    if (!POSES[poseName] || poseName === this.targetPoseName) return;
    this.currentPoseName = this.targetPoseName;
    this.targetPoseName = poseName;
    this.transitionAlpha = 0.0;
  }

  /** Sets limb-length ratios (1 = anatomical default). */
  public setLimbRatios(arm: number, lowerLeg: number) {
    if (Math.abs(arm - this.armRatio) < 1e-4 && Math.abs(lowerLeg - this.lowerLegRatio) < 1e-4) {
      return;
    }
    this.armRatio = arm;
    this.lowerLegRatio = lowerLeg;
    this.dirty = true;
  }

  public getPoseName(): string {
    return this.targetPoseName;
  }

  /**
   * Vertical correction (scene units) that keeps the feet planted on the floor
   * after the lower leg has been lengthened or shortened.
   */
  public getGroundOffset(): number {
    const foot = this.boneInitialPositions.get('foot_l');
    if (!foot) return 0;
    return (this.lowerLegRatio - 1) * foot.length();
  }

  public update(delta: number) {
    if (!this.skeleton || this.boneInitialQuaternions.size === 0) return;
    const settled = this.transitionAlpha >= 1.0 && this.currentPoseName === this.targetPoseName;
    if (settled && !this.dirty) return;

    this.transitionAlpha = Math.min(1.0, this.transitionAlpha + delta * this.transitionSpeed);
    const t = this.transitionAlpha < 0.5
      ? 4 * this.transitionAlpha * this.transitionAlpha * this.transitionAlpha
      : 1 - Math.pow(-2 * this.transitionAlpha + 2, 3) / 2;

    const fromPose = POSES[this.currentPoseName] ?? POSES['neutral']!;
    const toPose = POSES[this.targetPoseName] ?? POSES['neutral']!;

    for (const bone of this.skeleton.bones) {
      const qInit = this.boneInitialQuaternions.get(bone.name);
      const initPos = this.boneInitialPositions.get(bone.name);
      if (!qInit || !initPos) continue;

      const rotDeltaFrom = fromPose[bone.name]?.rotation ?? [0, 0, 0];
      const rotDeltaTo = toPose[bone.name]?.rotation ?? [0, 0, 0];

      const qDeltaFrom = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotDeltaFrom));
      const qDeltaTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotDeltaTo));

      const qFrom = qInit.clone().multiply(qDeltaFrom);
      const qTo = qInit.clone().multiply(qDeltaTo);

      bone.quaternion.copy(qFrom).slerp(qTo, t);

      const posFrom = fromPose[bone.name]?.position ?? [0, 0, 0];
      const posTo = toPose[bone.name]?.position ?? [0, 0, 0];

      const pFrom = initPos.clone().add(new THREE.Vector3(...posFrom));
      const pTo = initPos.clone().add(new THREE.Vector3(...posTo));
      bone.position.copy(pFrom).lerp(pTo, t);

      if (ARM_SCALED_BONES.has(bone.name)) {
        bone.position.multiplyScalar(this.armRatio);
      } else if (LOWER_LEG_SCALED_BONES.has(bone.name)) {
        bone.position.multiplyScalar(this.lowerLegRatio);
      }
    }

    this.skeleton.update();
    this.dirty = false;
    if (this.transitionAlpha >= 1.0) {
      this.currentPoseName = this.targetPoseName;
    }
  }
}
