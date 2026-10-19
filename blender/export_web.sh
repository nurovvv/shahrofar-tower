#!/usr/bin/env bash
# Rebuild the 3D model of the complex and copy it into the web viewer.
#
#   blender/plans/make_plans.sh SET.pdf   # (only when the drawings change) -> blender/plans/plans.json
#   blender/export_web.sh                 # -> public/models/shahrofar.glb, src/model/complex.json and plans.json
#
# Needs Blender 4.2+ (on PATH, in /Applications, or BLENDER=/path/to/blender) with shapely >= 2.1 for its
# Python: `"$BLENDER" -b --python-expr "import shapely"` must work, or point SHAPELY_PATH at a folder
# made with `<blender python> -m pip install --target DIR --no-deps shapely`.
#
# Also leaves build/shahrofar.blend (open it in Blender) and, with RENDER=1, build/shahrofar.png:
# a still from the camera that matches the aerial marketing render.
set -euo pipefail
cd "$(dirname "$0")/.."

BLENDER=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
OUT=build/shahrofar
mkdir -p build public/models src/model

args=(--out "$OUT")
if [[ "${RENDER:-0}" == "1" ]]; then args+=(--render "$OUT.png" --scale 1 --samples 64); fi

PYTHONPATH="${SHAPELY_PATH:-}" "$BLENDER" -b --factory-startup --python-use-system-env \
  -P blender/build_complex.py -- "${args[@]}"

# meshopt compression (geometry only: the textures are separate files the viewer picks per device)
GT=(npx --yes @gltf-transform/cli@4.1.1)
"${GT[@]}" dedup "$OUT.glb" "$OUT.dedup.glb"
"${GT[@]}" weld "$OUT.dedup.glb" "$OUT.weld.glb"
"${GT[@]}" meshopt "$OUT.weld.glb" public/models/shahrofar.glb
rm -f "$OUT.dedup.glb" "$OUT.weld.glb"
# cars for the streets (blender/props/build_cars.py)
"$BLENDER" -b --factory-startup -P blender/props/build_cars.py -- --out build/cars.glb
"${GT[@]}" weld build/cars.glb build/cars.weld.glb
"${GT[@]}" meshopt build/cars.weld.glb public/models/cars.glb
rm -f build/cars.weld.glb
cp "$OUT.json" src/model/complex.json
cp "$OUT.plans.json" src/model/plans.json
ls -la public/models/shahrofar.glb src/model/complex.json src/model/plans.json
