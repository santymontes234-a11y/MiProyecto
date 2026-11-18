#!/usr/bin/env bash
# Genera Informe_EcoMove.docx y .pdf en dos pasadas (la segunda escribe los números de página de los índices).
# Uso: docs/report/generador/build.sh <python_con_python-docx> <carpeta_temporal>
set -euo pipefail
PY=$1; T=$2; G=docs/report/generador; OUT=docs/report
mkdir -p "$T"
"$PY" $G/figuras.py "$T/fig" 2>/dev/null
"$PY" $G/informe.py "$T/fig" "$T/pass1.docx"
soffice --headless --convert-to pdf --outdir "$T" "$T/pass1.docx" >/dev/null
"$PY" $G/paginas.py "$T/pass1.pdf" "$T/pass1.docx.entries.json" "$T/paginas.json"
"$PY" $G/informe.py "$T/fig" "$OUT/Informe_EcoMove.docx" "$T/paginas.json"
soffice --headless --convert-to pdf --outdir "$OUT" "$OUT/Informe_EcoMove.docx" >/dev/null
"$PY" $G/paginas.py "$OUT/Informe_EcoMove.pdf" "$OUT/Informe_EcoMove.docx.entries.json" "$T/check.json"
cmp -s <(python3 -c "import json,sys;print(sorted(json.load(open('$T/paginas.json')).items()))") \
       <(python3 -c "import json,sys;print(sorted(json.load(open('$T/check.json')).items()))") \
  && echo "índices consistentes" || echo "AVISO: los números de página cambiaron entre pasadas"
rm -f "$OUT/Informe_EcoMove.docx.entries.json"
