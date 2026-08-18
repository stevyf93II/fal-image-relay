#!/usr/bin/env bash
# usage: RELAY_URL=https://your-site.netlify.app/generate RELAY_PASS=yourpass ./generate.sh "a prompt" [model]
# Submits, polls until COMPLETED, prints the image URL(s).
set -euo pipefail

PROMPT=${1:?usage: generate.sh "prompt" [model]}
MODEL=${2:-fal-ai/flux-2-pro}

submit=$(curl -s "$RELAY_URL" -H "x-relay-pass: $RELAY_PASS" -H "Content-Type: application/json" \
  -d "{\"action\":\"submit\",\"model\":\"$MODEL\",\"prompt\":$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$PROMPT")}")

status_url=$(echo "$submit" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status_url"])')
response_url=$(echo "$submit" | python3 -c 'import json,sys;print(json.load(sys.stdin)["response_url"])')

for _ in $(seq 1 90); do
  s=$(curl -s "$RELAY_URL" -H "x-relay-pass: $RELAY_PASS" -H "Content-Type: application/json" \
    -d "{\"action\":\"poll\",\"url\":\"$status_url\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("status",""))')
  [ "$s" = "COMPLETED" ] && break
  sleep 2
done

curl -s "$RELAY_URL" -H "x-relay-pass: $RELAY_PASS" -H "Content-Type: application/json" \
  -d "{\"action\":\"poll\",\"url\":\"$response_url\"}" | python3 -c '
import json,sys
out = json.load(sys.stdin)
for img in out.get("images") or [out.get("image")]:
    if img: print(img["url"])'
