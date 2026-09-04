import os
import sys
import math
import bpy
from mathutils import Vector

def create_and_export_model(gender_type: str, output_path: str):
    print(f"\n=======================================================")
    print(f"Generating Anatomical Model: {gender_type.upper()}")
    print(f"Output Target: {output_path}")
    print(f"=======================================================")

    # 1. Clear scene and enable MPFB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.mpfb')

    from bl_ext.blender_org.mpfb.services.targetservice import HumanObjectProperties, TargetService

    # 2. Create Base Human Mesh
    bpy.ops.mpfb.create_human()
    human = bpy.data.objects.get('Human')
    if not human:
        raise RuntimeError("Failed to create Human object via MPFB")

    # 3. Configure Phenotype to match athletic reference proportions
    is_male = (gender_type.lower() == 'male')

    if is_male:
        HumanObjectProperties.set_value('gender', 1.0, entity_reference=human)       # 100% Male
        HumanObjectProperties.set_value('muscle', 0.85, entity_reference=human)      # Muscular athletic density
        HumanObjectProperties.set_value('weight', 0.35, entity_reference=human)      # Lean athletic waist
        HumanObjectProperties.set_value('proportions', 0.72, entity_reference=human) # Broad athletic clavicles
        HumanObjectProperties.set_value('height', 0.60, entity_reference=human)      # Tall athletic stature (1.80m)
        HumanObjectProperties.set_value('cupsize', 0.0, entity_reference=human)      # ZERO breast tissue (flat chest)
        HumanObjectProperties.set_value('firmness', 0.85, entity_reference=human)    # Firm pectoral plate
        HumanObjectProperties.set_value('age', 0.50, entity_reference=human)         # Young adult peak
    else:
        HumanObjectProperties.set_value('gender', 0.0, entity_reference=human)       # 100% Female
        HumanObjectProperties.set_value('muscle', 0.58, entity_reference=human)      # Toned, athletic
        HumanObjectProperties.set_value('weight', 0.35, entity_reference=human)      # Lean athletic body fat
        HumanObjectProperties.set_value('proportions', 0.58, entity_reference=human) # Balanced proportions
        HumanObjectProperties.set_value('height', 0.52, entity_reference=human)      # Standard athletic stature
        HumanObjectProperties.set_value('cupsize', 0.52, entity_reference=human)      # Natural athletic breast contour
        HumanObjectProperties.set_value('firmness', 0.72, entity_reference=human)    # Toned muscle firmness
        HumanObjectProperties.set_value('age', 0.50, entity_reference=human)         # Young adult

    TargetService.reapply_macro_details(human)
    print(f"Applied {gender_type} phenotype details via HumanObjectProperties.")

    # Bake phenotype shape keys directly into the base mesh vertex coordinates
    TargetService.bake_targets(human)
    print(f"BAKED {gender_type} phenotype targets into base mesh vertices.")

    # Remove MPFB helper geometry (joint cubes, helper skirt/pants, genital flaps)
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    bpy.ops.mpfb.delete_helpers()
    print(f"Deleted helper geometry. Remaining pure anatomical vertices: {len(human.data.vertices)}")

    # Ground feet strictly at Z = 0
    min_z = min(v.co.z for v in human.data.vertices)
    if abs(min_z) > 0.0001:
        offset_z = -min_z
        for v in human.data.vertices:
            v.co.z += offset_z
        print(f"Grounded model feet: offset Z by {offset_z:.4f}m (lowest point now at Z=0.0000m)")

    # 4. Bake Basis Shape Key
    human.shape_key_add(name='Basis', from_mix=False)
    basis_blocks = human.data.shape_keys.key_blocks['Basis']

    # Compute bounding ranges for anatomical zoning
    zs = [v.co.z for v in human.data.vertices]
    z_min = min(zs)
    z_max = max(zs)
    height = z_max - z_min
    print(f"Model height: {height:.3f}m ({height*100:.1f}cm)")

    # 5. Define shape keys to bake into the GLB
    # Every shape key deforms specific anatomical vertex groups smoothly
    def add_morph(name: str, deformation_fn):
        sk = human.shape_key_add(name=name, from_mix=False)
        for i, v in enumerate(human.data.vertices):
            co = v.co.copy()
            t = (co.z - z_min) / height
            dx, dy, dz = deformation_fn(co.x, co.y, co.z, t)
            sk.data[i].co = Vector((co.x + dx, co.y + dy, co.z + dz))
        print(f"  + Baked Morph Target: '{name}'")

    # Helper Gaussian falloff
    def gaussian(val, center, sigma):
        return math.exp(-0.5 * ((val - center) / sigma) ** 2)

    # --- Shape Key 1: Muscle Hypertrophy & Definition ---
    def morph_muscle(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        # Pectorals forward and lateral expansion
        if 0.64 < t < 0.79 and y > 0.0 and abs(x) < 0.22:
            w = gaussian(t, 0.72, 0.05) * gaussian(abs(x), 0.10, 0.06)
            dy += 0.032 * w
            dx += 0.012 * math.copysign(w, x)
        # Latissimus Dorsi back expansion
        if 0.58 < t < 0.76 and y < -0.01 and 0.08 < abs(x) < 0.24:
            w = gaussian(t, 0.68, 0.06) * gaussian(abs(x), 0.16, 0.05)
            dx += 0.024 * math.copysign(w, x)
            dy -= 0.018 * w
        # Deltoids lateral cap
        if 0.74 < t < 0.84 and abs(x) > 0.16:
            w = gaussian(t, 0.79, 0.04) * gaussian(abs(x), 0.22, 0.05)
            dx += 0.026 * math.copysign(w, x)
            dy += 0.010 * w
        # Biceps & Triceps
        if 0.54 < t < 0.74 and abs(x) > 0.22:
            w = gaussian(t, 0.64, 0.06)
            dx += 0.016 * math.copysign(w, x)
            dy += 0.012 * math.copysign(w, y)
        # Quadriceps flare
        if 0.26 < t < 0.48 and 0.05 < abs(x) < 0.20:
            w = gaussian(t, 0.38, 0.06)
            dx += 0.018 * math.copysign(w, x)
            if y > 0.0:
                dy += 0.022 * w
        return dx, dy, dz

    # --- Shape Key 2: Weight Increase (Adipose Storage) ---
    def morph_weight_more(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        # Abdominal & visceral belly expansion
        if 0.48 < t < 0.66:
            w = gaussian(t, 0.56, 0.06)
            # Men store more belly fat; women store more hip/glute fat
            if is_male:
                if y > 0:
                    dy += 0.045 * w
                dx += 0.028 * math.copysign(w, x)
            else:
                if y > 0:
                    dy += 0.030 * w
                dx += 0.040 * math.copysign(w, x)
        # Hips & Thighs fat
        if 0.28 < t < 0.54:
            w = gaussian(t, 0.44, 0.07)
            dx += (0.042 if not is_male else 0.022) * math.copysign(w, x)
            dy += 0.020 * w
        return dx, dy, dz

    # --- Shape Key 3: Weight Decrease (Lean / Shredded) ---
    def morph_weight_less(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        # Waist and belly cinching inward
        if 0.48 < t < 0.66:
            w = gaussian(t, 0.56, 0.05)
            dx -= 0.024 * math.copysign(w, x)
            if y > 0:
                dy -= 0.028 * w
        # Thighs trimming
        if 0.28 < t < 0.50:
            w = gaussian(t, 0.40, 0.06)
            dx -= 0.018 * math.copysign(w, x)
        return dx, dy, dz

    # --- Shape Key 4: Waist Cinch (V-Taper / Hourglass WHR) ---
    def morph_waist(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.50 < t < 0.64:
            w = gaussian(t, 0.57, 0.045)
            dx -= 0.032 * math.copysign(w, x)
            dy -= 0.016 * math.copysign(w, y)
        return dx, dy, dz

    # --- Shape Key 5: Chest / Pectoral / Breast Volume ---
    def morph_chest(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.65 < t < 0.79 and y > 0.0 and abs(x) < 0.22:
            w = gaussian(t, 0.72, 0.045) * gaussian(abs(x), 0.09, 0.055)
            dy += (0.048 if not is_male else 0.036) * w
            dx += 0.012 * math.copysign(w, x)
        return dx, dy, dz

    # --- Shape Key 6: Shoulder Breadth (Deltoid Span) ---
    def morph_shoulders(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.73 < t < 0.85 and abs(x) > 0.14:
            w = gaussian(t, 0.79, 0.04)
            dx += 0.040 * math.copysign(w, x)
        return dx, dy, dz

    # --- Shape Key 7: Glute Volume ---
    def morph_glutes(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.44 < t < 0.56 and y < -0.02 and abs(x) < 0.20:
            w = gaussian(t, 0.50, 0.04) * gaussian(abs(x), 0.10, 0.05)
            dy -= 0.038 * w
            dx += 0.010 * math.copysign(w, x)
        return dx, dy, dz

    # --- Shape Key 8: Quad Flare (Vastus Lateralis) ---
    def morph_quads(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.28 < t < 0.48 and 0.06 < abs(x) < 0.18:
            w = gaussian(t, 0.38, 0.06)
            dx += 0.028 * math.copysign(w, x)
            if y > 0.0:
                dy += 0.018 * w
        return dx, dy, dz

    # --- Shape Key 9: Arm Girth ---
    def morph_arms(x, y, z, t):
        dx, dy, dz = 0.0, 0.0, 0.0
        if 0.52 < t < 0.74 and abs(x) > 0.22:
            w = gaussian(t, 0.63, 0.06)
            dx += 0.022 * math.copysign(w, x)
            dy += 0.018 * math.copysign(w, y)
        return dx, dy, dz

    # Bake each shape key
    add_morph('Muscle', morph_muscle)
    add_morph('Weight_More', morph_weight_more)
    add_morph('Weight_Less', morph_weight_less)
    add_morph('Waist_Cinch', morph_waist)
    add_morph('Chest', morph_chest)
    add_morph('Shoulders', morph_shoulders)
    add_morph('Glutes', morph_glutes)
    add_morph('Quads', morph_quads)
    add_morph('Arms', morph_arms)

    # 6. Ensure smooth normals
    for poly in human.data.polygons:
        poly.use_smooth = True

    # 7. Select Human mesh and export to glTF
    bpy.ops.object.select_all(action='DESELECT')
    human.select_set(True)
    bpy.context.view_layer.objects.active = human

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    print(f"Exporting Draco-compressed GLB to: {output_path}...")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,                 # Must be False to preserve shape keys
        export_morph=True,                  # Export shape keys / morph targets
        export_morph_normal=False,          # Normal morphs can inflate size
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )

    size_bytes = os.path.getsize(output_path)
    print(f"SUCCESS: Exported {output_path} ({size_bytes / 1024:.1f} KB)")


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, 'public', 'models')

    male_out = os.path.join(models_dir, 'male_v2.glb')
    female_out = os.path.join(models_dir, 'female_v2.glb')

    create_and_export_model('male', male_out)
    create_and_export_model('female', female_out)

    print("\n=======================================================")
    print("ALL ANATOMICAL PRODUCTION MODELS GENERATED SUCCESSFULLY!")
    print("=======================================================\n")
