#!/usr/bin/env bash
# Rebuild blender/plans/plans.json from the architectural drawings (Shahrofar set, 1:200).
#
#   pip install pymupdf shapely
#   blender/plans/make_plans.sh path/to/plans-set.pdf
#
# Positions below are PDF points on the sheets: the region around each tower, its centre
# (middle axes) and the direction of its lettered axes, read off the axis bubbles.
set -euo pipefail
cd "$(dirname "$0")/../.."
PDF=$1
PY=${PYTHON:-python3}
RAW=build/plans
mkdir -p "$RAW"

# sheet 7 "Тарҳи ошёнаи такроршаванда" (typical floor): blocks В-24, Б-20 and the А-16 hotel
$PY blender/plans/extract_pdf.py "$PDF" 7 1005 510 1535 930   1269.3 721.1   1 0         "$RAW/V.json"
$PY blender/plans/extract_pdf.py "$PDF" 7 925 1150 1525 1660  1222.0 1432.6  406.3 181.2 "$RAW/B.json"
$PY blender/plans/extract_pdf.py "$PDF" 7 300 1440 780 2010   540 1720       476.4 89.2  "$RAW/A.json"
# sheet 8: floors 23 and 24 of block В (terraces)
$PY blender/plans/extract_pdf.py "$PDF" 8 780 385 1310 815    1044.45 598.8  1 0         "$RAW/V23.json"
$PY blender/plans/extract_pdf.py "$PDF" 8 780 1390 1310 1820  1044.45 1602.9 1 0         "$RAW/V24.json"

# placement on sheet 7 (metres, y up) and floor levels from section 1-1 (sheet 13)
cat > "$RAW/sheet.json" <<'JSON'
{
  "source": "Shahrofar drawing set: typical floor (sheet 7), floors 23-24 (sheet 8), section 1-1 (sheet 13)",
  "levels": {
    "residential": [0.0, 6.0, 10.2, 14.4, 18.6, 22.2, 25.5, 28.8, 32.1, 35.4, 38.7, 42.0, 45.3, 48.6, 51.9, 55.2,
                    58.5, 61.8, 65.1, 68.4, 71.7, 75.0, 78.3, 81.6, 84.9, 88.2],
    "hotel": [0.0, 6.0, 10.2, 14.4, 18.6, 22.2, 25.8, 29.4, 33.0, 36.6, 40.2, 43.8, 47.4, 51.0, 54.6, 58.2, 61.8, 65.4]
  },
  "towers": {
    "V": {"label": "Block V", "floors": 24, "first_residential": 5, "sheet_centre": [94.08, -53.45], "sheet_rot": 0.0},
    "B": {"label": "Block B", "floors": 20, "first_residential": 5, "sheet_centre": [90.58, -106.19], "sheet_rot": -24.03},
    "A": {"label": "Block A (hotel)", "floors": 16, "hotel": true, "sheet_centre": [40.03, -127.50], "sheet_rot": -10.61},
    "V23": {"label": "Block V floor 23", "plan_of": "V", "floor": 23},
    "V24": {"label": "Block V floor 24", "plan_of": "V", "floor": 24}
  }
}
JSON
$PY blender/plans/build_plans.py "$RAW" blender/plans/plans.json
