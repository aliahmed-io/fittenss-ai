import os
import sys
import bpy
import importlib
import gzip

def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mpfb_mod = importlib.import_module(amod)
            if not hasattr(mpfb_mod, key):
                raise AttributeError(f"Module {amod} does not have attribute {key}")
            return getattr(mpfb_mod, key)
    raise ValueError(f"No module found with name ending in {absolute_package_str}")

def create_and_export_model(gender_type: str, output_path: str):
    print(f"\n=======================================================")
    print(f"Generating Rigged Anatomical Model: {gender_type.upper()}")
    print(f"Output Target: {output_path}")
    print(f"=======================================================")

    # 1. Reset scene & enable MPFB extension
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.mpfb')

    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")

    targets_root = LocationService.get_mpfb_data("targets")
    is_male = (gender_type.lower() == 'male')

    # 2. Build neutral phenotype macro configuration (anatomical 50th percentile)
    macro_info = TargetService.get_default_macro_info_dict()
    if is_male:
        macro_info["gender"] = 1.0
        macro_info["cupsize"] = 0.0
        macro_info["firmness"] = 0.0
        macro_info["age"] = 0.50          # Young adult
        macro_info["muscle"] = 0.50       # Athletic baseline
        macro_info["weight"] = 0.50       # Neutral weight
        macro_info["proportions"] = 0.50  # Golden anthropometric proportions
        macro_info["height"] = 0.50       # Average standing height
    else:
        macro_info["gender"] = 0.0
        macro_info["cupsize"] = 0.45      # Natural athletic female bust
        macro_info["firmness"] = 0.60
        macro_info["age"] = 0.50
        macro_info["muscle"] = 0.45
        macro_info["weight"] = 0.48
        macro_info["proportions"] = 0.50
        macro_info["height"] = 0.48

    # 3. Create clean Human basemesh with feet grounded at Z = 0
    basemesh = HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=True,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro_info
    )
    print(f"Created neutral basemesh: '{basemesh.name}' with {len(basemesh.data.vertices)} vertices.")

    # 4. Bake macro details directly into basemesh topology so Basis is the genuine masculine/feminine body
    TargetService.bake_targets(basemesh)
    print("Baked macro phenotype into basemesh Basis vertices.")

    # 5. Attach standard game_engine skeletal armature with vertex weights fitted to baked phenotype
    armature = HumanService.add_builtin_rig(basemesh, "game_engine", import_weights=True)
    print(f"Attached Rig: '{armature.name}' ({len(armature.data.bones)} bones, {len(basemesh.vertex_groups)} vertex groups).")

    # 6. Remove MPFB helper geometry to leave pure body topology
    bpy.context.view_layer.objects.active = basemesh
    basemesh.select_set(True)
    bpy.ops.mpfb.delete_helpers()
    print("Deleted helper geometry. Pure body mesh ready.")

    # 7. Helper to load unilateral and bilateral targets
    def load_sk(rel_path, name):
        full_path = os.path.join(targets_root, rel_path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Target file missing: {full_path}")
        TargetService.load_target(basemesh, full_path, weight=0.0, name=name)

    def load_bilateral_sk(l_rel_path, r_rel_path, name):
        l_path = os.path.join(targets_root, l_rel_path)
        r_path = os.path.join(targets_root, r_rel_path)
        if not os.path.exists(l_path) or not os.path.exists(r_path):
            raise FileNotFoundError(f"Missing bilateral targets: {l_path} or {r_path}")
        with gzip.open(l_path, 'rb') as gz:
            l_str = gz.read().decode('utf-8')
        with gzip.open(r_path, 'rb') as gz:
            r_str = gz.read().decode('utf-8')
        sk = TargetService.create_shape_key(basemesh, name)
        info_l = TargetService._target_string_to_shape_key_info(l_str, name)
        info_r = TargetService._target_string_to_shape_key_info(r_str, name)
        combined = {'name': name, 'vertices': info_l['vertices'] + info_r['vertices']}
        TargetService._set_shape_key_coords_from_dict(basemesh, sk, combined)

    print("Loading 40+ non-destructive anatomical target deltas...")

    # A. Torso & Back
    load_sk('torso/torso-muscle-pectoral-incr.target.gz', 'Chest_Expand')
    load_sk('torso/torso-muscle-pectoral-decr.target.gz', 'Chest_Reduce')
    load_sk('torso/measure-underbust-circ-incr.target.gz', 'Ribcage_Expand')
    load_sk('torso/measure-underbust-circ-decr.target.gz', 'Ribcage_Reduce')
    load_sk('torso/torso-muscle-dorsi-incr.target.gz', 'Lats_Expand')
    load_sk('torso/torso-muscle-dorsi-decr.target.gz', 'Lats_Reduce')
    load_sk('torso/torso-vshape-incr.target.gz', 'Vshape_Expand')
    load_sk('torso/torso-vshape-decr.target.gz', 'Vshape_Reduce')
    load_sk('torso/measure-waist-circ-incr.target.gz', 'Waist_Expand')
    load_sk('torso/measure-waist-circ-decr.target.gz', 'Waist_Cinch')
    load_sk('stomach/stomach-tone-incr.target.gz', 'Stomach_Tone')
    load_sk('stomach/stomach-tone-decr.target.gz', 'Stomach_Full')
    load_sk('torso/measure-bust-circ-incr.target.gz', 'Bust_Girth_Expand')
    load_sk('torso/measure-bust-circ-decr.target.gz', 'Bust_Girth_Reduce')

    # B. Arms & Shoulders
    load_sk('torso/measure-shoulder-dist-incr.target.gz', 'Shoulders_Wide')
    load_sk('torso/measure-shoulder-dist-decr.target.gz', 'Shoulders_Narrow')
    load_bilateral_sk('arms/l-upperarm-shoulder-muscle-incr.target.gz', 'arms/r-upperarm-shoulder-muscle-incr.target.gz', 'Deltoids_Muscular')
    load_bilateral_sk('arms/l-upperarm-shoulder-muscle-decr.target.gz', 'arms/r-upperarm-shoulder-muscle-decr.target.gz', 'Deltoids_Slim')
    load_sk('arms/measure-upperarm-circ-incr.target.gz', 'Arms_Muscular')
    load_sk('arms/measure-upperarm-circ-decr.target.gz', 'Arms_Slim')
    load_bilateral_sk('arms/l-lowerarm-muscle-incr.target.gz', 'arms/r-lowerarm-muscle-incr.target.gz', 'Forearms_Muscular')
    load_bilateral_sk('arms/l-lowerarm-muscle-decr.target.gz', 'arms/r-lowerarm-muscle-decr.target.gz', 'Forearms_Slim')
    load_bilateral_sk('arms/l-lowerarm-scale-horiz-incr.target.gz', 'arms/r-lowerarm-scale-horiz-incr.target.gz', 'Forearms_Wide')
    load_bilateral_sk('arms/l-lowerarm-scale-horiz-decr.target.gz', 'arms/r-lowerarm-scale-horiz-decr.target.gz', 'Forearms_Narrow')

    # C. Glutes & Hips
    load_sk('buttocks/buttocks-volume-incr.target.gz', 'Glutes_Full')
    load_sk('buttocks/buttocks-volume-decr.target.gz', 'Glutes_Slim')
    load_sk('torso/measure-hips-circ-incr.target.gz', 'Hips_Expand')
    load_sk('torso/measure-hips-circ-decr.target.gz', 'Hips_Reduce')

    # D. Legs
    load_sk('legs/measure-thigh-circ-incr.target.gz', 'Thighs_Muscular')
    load_sk('legs/measure-thigh-circ-decr.target.gz', 'Thighs_Slim')
    load_bilateral_sk('legs/l-upperleg-muscle-incr.target.gz', 'legs/r-upperleg-muscle-incr.target.gz', 'Quads_Muscular')
    load_bilateral_sk('legs/l-upperleg-muscle-decr.target.gz', 'legs/r-upperleg-muscle-decr.target.gz', 'Quads_Slim')
    load_sk('legs/measure-calf-circ-incr.target.gz', 'Calves_Muscular')
    load_sk('legs/measure-calf-circ-decr.target.gz', 'Calves_Slim')
    load_bilateral_sk('legs/l-lowerleg-muscle-incr.target.gz', 'legs/r-lowerleg-muscle-incr.target.gz', 'Gastrocnemius_Muscular')
    load_bilateral_sk('legs/l-lowerleg-muscle-decr.target.gz', 'legs/r-lowerleg-muscle-decr.target.gz', 'Gastrocnemius_Slim')
    load_sk('legs/measure-knee-circ-incr.target.gz', 'Knee_Wide')
    load_sk('legs/measure-knee-circ-decr.target.gz', 'Knee_Slim')

    # E. Neck
    load_sk('neck/measure-neck-circ-incr.target.gz', 'Neck_Muscular')
    load_sk('neck/measure-neck-circ-decr.target.gz', 'Neck_Slim')

    # F. Gender-specific & Macro Details
    if is_male:
        load_sk('macrodetails/universal-male-young-maxmuscle-averageweight.target.gz', 'Muscle')
        load_sk('macrodetails/universal-male-young-averagemuscle-maxweight.target.gz', 'Weight_More')
        load_sk('macrodetails/universal-male-young-averagemuscle-minweight.target.gz', 'Weight_Less')
    else:
        load_sk('macrodetails/universal-female-young-maxmuscle-averageweight.target.gz', 'Muscle')
        load_sk('macrodetails/universal-female-young-averagemuscle-maxweight.target.gz', 'Weight_More')
        load_sk('macrodetails/universal-female-young-averagemuscle-minweight.target.gz', 'Weight_Less')
        load_sk('breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target.gz', 'Bust_Expand')
        load_sk('breast/female-young-averagemuscle-averageweight-mincup-maxfirmness.target.gz', 'Bust_Reduce')

    # 7. Ensure smooth normals & initial weights = 0.0
    for poly in basemesh.data.polygons:
        poly.use_smooth = True

    if basemesh.data.shape_keys:
        for block in basemesh.data.shape_keys.key_blocks:
            block.value = 0.0

    # 8. Export standard uncompressed GLB with skinning, tangents, morph normals
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    bpy.ops.object.select_all(action='DESELECT')
    armature.select_set(True)
    basemesh.select_set(True)
    bpy.context.view_layer.objects.active = armature

    print(f"Exporting standard uncompressed GLB with tangents & skinning to: {output_path}...")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_morph=True,
        export_morph_normal=True,
        export_tangents=True,
        export_skins=True,
        export_all_influences=True,
        export_draco_mesh_compression_enable=False,
    )

    size_bytes = os.path.getsize(output_path)
    print(f"SUCCESS: Exported {output_path} ({size_bytes / (1024*1024):.2f} MB)")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, 'public', 'models')

    male_out = os.path.join(models_dir, 'male_v2.glb')
    female_out = os.path.join(models_dir, 'female_v2.glb')

    create_and_export_model('male', male_out)
    create_and_export_model('female', female_out)

    print("\n=======================================================")
    print("ALL RIGGED ANATOMICAL MODELS GENERATED SUCCESSFULLY!")
    print("=======================================================\n")
