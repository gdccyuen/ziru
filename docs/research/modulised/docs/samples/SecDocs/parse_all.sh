#!/usr/bin/env bash
set -u
DIR="/Users/gordon/Documents/repos/ziru.1/docs/samples/SecDocs"
mkdir -p "$DIR/parsed"
cd "$DIR" || exit 1
: > "$DIR/parsed/_progress.log"
echo "[start] $(date +%T)" >> "$DIR/parsed/_progress.log"
for f in *.pdf; do
  base="${f%.pdf}"
  out="parsed/${base}.json"
  if [ -s "$out" ]; then
    echo "[skip] $f (already parsed)" >> "$DIR/parsed/_progress.log"
    continue
  fi
  echo "[parse] $f $(date +%T)" >> "$DIR/parsed/_progress.log"
  curl -sS --max-time 1800 -X POST "http://127.0.0.1:8000/file_parse" \
    -F "files=@${f}" \
    -F "backend=pipeline" \
    -F "parse_method=auto" \
    -F "formula_enable=false" \
    -F "table_enable=true" \
    -F "return_md=true" \
    -F "return_content_list=true" \
    -F "return_middle_json=false" \
    -F "return_model_output=false" \
    -F "return_images=false" \
    -F "response_format_zip=false" \
    -o "$out"
  rc=$?
  echo "[done] $f rc=$rc bytes=$(wc -c < "$out" 2>/dev/null || echo 0) $(date +%T)" >> "$DIR/parsed/_progress.log"
done
echo "[finish] ALL_DONE $(date +%T)" >> "$DIR/parsed/_progress.log"
