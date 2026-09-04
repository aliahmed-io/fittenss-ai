import os
import sys
import bpy

def create_and_export_model(gender_type: str, output_path: str):
    print(f"\n=======================================================")
    print(f"Generating Anatomical Model: {gender_type.upper()}")
    print(f"Output Target: {output_path}")
    print(f"=======================================================")

    # 1. Clear scene and enable MPFB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.mpfb')

    import bl_ext.blender_org.mpfb as mpfb
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    mpfb_root = os.path.dirname(mpfb.__file__)
    targets_root = os.path.join(mpfb_root, 'data', 'targets')

    # 2. Create Base Human Mesh
    bpy.ops.mpfb.create_human()
    human = bpy.data.objects.get('Human')
    if not human:
        raise RuntimeError("Failed to create Human object via MPFB")

    def load_t(subpath, name=None):
        p = os.path.join(targets_root, subpath)
        if not os.path.exists(p):
            raise FileNotFoundError(f"Target not found: {p}")
        return TargetService.load_target(human, p, name=name)

    is_male = (gender_type.lower() == 'male')

    # 3. Configure Phenotype to match athletic reference proportions using authentic MakeHuman macro targets
    if is_male:
        sk_gender = load_t('macrodetails/universal-male-young-averagemuscle-averageweight.target.gz', 'Male_Base')
        sk_race = load_t('macrodetails/caucasian-male-young.target.gz', 'Male_Race')
        sk_vshape = load_t('torso/torso-vshape-incr.target.gz', 'Male_Vshape')
        sk_pecs = load_t('torso/torso-muscle-pectoral-incr.target.gz', 'Male_Pecs')

        sk_gender.value = 1.0
        sk_race.value = 0.50
        sk_vshape.value = 0.35
        sk_pecs.value = 0.35
    else:
        sk_gender = load_t('macrodetails/universal-female-young-averagemuscle-averageweight.target.gz', 'Female_Base')
        sk_race = load_t('macrodetails/caucasian-female-young.target.gz', 'Female_Race')
        sk_breast = load_t('breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target.gz', 'Female_Breast')

        sk_gender.value = 1.0
        sk_race.value = 0.50
        sk_breast.value = 0.55

    # Bake phenotype shape keys directly into the base mesh vertex coordinates
    TargetService.bake_targets(human)
    print(f"BAKED {gender_type} phenotype targets into base mesh vertices.")

    # Remove MPFB helper geometry
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    bpy.ops.mpfb.delete_helpers()

    # Ground feet strictly at Z = 0
    min_z = min(v.co.z for v in human.data.vertices)
    if abs(min_z) > 0.0001:
        offset_z = -min_z
        for v in human.data.vertices:
            v.co.z += offset_z
        print(f"Grounded model feet: offset Z by {offset_z:.4f}m (lowest point now at Z=0.0000m)")

    zs = [v.co.z for v in human.data.vertices]
    z_min, z_max = min(zs), max(zs)
    print(f"Standing height: {z_max - z_min:.3f}m ({(z_max - z_min)*100:.1f}cm)")

    # 4. Bake Basis Shape Key
    human.shape_key_add(name='Basis', from_mix=False)

    # 5. Load Real Scientific Anatomical Shape Keys from MakeHuman library
    load_t('legs/measure-thigh-circ-incr.target.gz', 'Thighs_Muscular')
    load_t('legs/measure-thigh-circ-decr.target.gz', 'Thighs_Slim')
    load_t('legs/measure-calf-circ-incr.target.gz', 'Calves_Muscular')
    load_t('legs/measure-calf-circ-decr.target.gz', 'Calves_Slim')
    load_t('buttocks/buttocks-volume-incr.target.gz', 'Glutes_Full')
    load_t('buttocks/buttocks-volume-decr.target.gz', 'Glutes_Slim')
    load_t('torso/measure-waist-circ-decr.target.gz', 'Waist_Cinch')
    load_t('torso/measure-waist-circ-incr.target.gz', 'Waist_Expand')

    if is_male:
        load_t('torso/torso-muscle-pectoral-incr.target.gz', 'Chest_Expand')
        load_t('torso/torso-muscle-pectoral-decr.target.gz', 'Chest_Reduce')
    else:
        load_t('breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target.gz', 'Bust_Expand')
        load_t('breast/female-young-averagemuscle-averageweight-mincup-maxfirmness.target.gz', 'Bust_Reduce')
        load_t('torso/measure-bust-circ-incr.target.gz', 'Chest_Expand')
        load_t('torso/measure-bust-circ-decr.target.gz', 'Chest_Reduce')

    load_t('torso/measure-bust-circ-incr.target.gz', 'Bust_Girth')
    load_t('torso/measure-shoulder-dist-incr.target.gz', 'Shoulders_Wide')
    load_t('torso/measure-shoulder-dist-decr.target.gz', 'Shoulders_Narrow')
    load_t('arms/measure-upperarm-circ-incr.target.gz', 'Arms_Muscular')
    load_t('arms/measure-upperarm-circ-decr.target.gz', 'Arms_Slim')
    load_t('neck/measure-neck-circ-incr.target.gz', 'Neck_Muscular')
    load_t('neck/measure-neck-circ-decr.target.gz', 'Neck_Slim')
    load_t('stomach/stomach-tone-incr.target.gz', 'Stomach_Tone')
    load_t('stomach/stomach-tone-decr.target.gz', 'Stomach_Full')

    if is_male:
        load_t('macrodetails/universal-male-young-maxmuscle-averageweight.target.gz', 'Muscle')
        load_t('macrodetails/universal-male-young-averagemuscle-maxweight.target.gz', 'Weight_More')
        load_t('macrodetails/universal-male-young-averagemuscle-minweight.target.gz', 'Weight_Less')
    else:
        load_t('macrodetails/universal-female-young-maxmuscle-averageweight.target.gz', 'Muscle')
        load_t('macrodetails/universal-female-young-averagemuscle-maxweight.target.gz', 'Weight_More')
        load_t('macrodetails/universal-female-young-averagemuscle-minweight.target.gz', 'Weight_Less')

    # 6. Ensure smooth normals & ZERO initial weights for all shape keys
    for poly in human.data.polygons:
        poly.use_smooth = True

    if human.data.shape_keys:
        for block in human.data.shape_keys.key_blocks:
            block.value = 0.0
            print(f"  + Shape Key ready: '{block.name}' (weight: {block.value})")

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
        export_apply=False,
        export_morph=True,
        export_morph_normal=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
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
