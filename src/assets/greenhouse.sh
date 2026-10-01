#!/usr/bin/env bash
# greenhouse — plant and harvest things through GET-chunked requests.
#
# Requires: bash, curl, jq. Optional: the `file` command, for a nicer
# Content-Type guess when planting.
#
# Usage:
#   greenhouse plant <path>              Plant something, print its tag
#   greenhouse harvest <id> [output]     Harvest by tag
#   greenhouse growth <id>               Show which rows have taken root
#   greenhouse to-js [output.js|-]       Write a browser-console planting script
#
# Target server is baked in below; override per-call with GREENHOUSE_URL.
set -euo pipefail

BASE_URL="${GREENHOUSE_URL:-__BASE_URL__}"

for bin in curl jq base64 dd; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "error: this script needs '$bin' on PATH" >&2
    exit 1
  }
done

usage() {
  cat <<EOF
greenhouse — plant and harvest things through GET-chunked requests.

Usage:
  greenhouse plant <path>              Plant something, print its tag
  greenhouse harvest <id> [output]     Harvest by tag
  greenhouse growth <id>               Show which rows have taken root
  greenhouse to-js [output.js|-]       Write a browser-console planting script

Target server: ${BASE_URL} (override with GREENHOUSE_URL)
EOF
}

urlencode() {
  jq -rn --arg v "$1" '$v | @uri'
}

detect_mime() {
  if command -v file >/dev/null 2>&1; then
    file --brief --mime-type "$1" 2>/dev/null || true
  fi
}

# GET $1, print the response body on success. On a non-2xx status, print the
# server's error message and exit.
api_get() {
  local response status body
  response="$(curl -sS -w $'\n%{http_code}' "$1")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"

  if (( status < 200 || status >= 300 )); then
    echo "error: GET $1 -> HTTP $status" >&2
    jq -r '.error // .' <<<"$body" >&2 2>/dev/null || echo "$body" >&2
    exit 1
  fi
  printf '%s' "$body"
}

cmd_plant() {
  local path="${1:-}"
  [[ -n "$path" && -f "$path" ]] || {
    echo "usage: greenhouse plant <path>" >&2
    exit 1
  }

  local name size type sown id row_size rows
  name="$(basename -- "$path")"
  size="$(wc -c < "$path" | tr -d '[:space:]')"
  type="$(detect_mime "$path")"

  sown="$(api_get "$BASE_URL/api/garden/sow?name=$(urlencode "$name")&size=$size&type=$(urlencode "$type")")"
  id="$(jq -r '.id' <<<"$sown")"
  row_size="$(jq -r '.chunkSize' <<<"$sown")"
  rows="$(jq -r '.chunks' <<<"$sown")"

  echo "Planting $name ($size bytes, $rows row(s)) as $id" >&2

  local i data
  for (( i = 0; i < rows; i++ )); do
    data="$(dd if="$path" bs="$row_size" skip="$i" count=1 2>/dev/null \
      | base64 | tr '+/' '-_' | tr -d '=\n')"
    api_get "$BASE_URL/api/garden/seed?id=$id&index=$i&data=$data" >/dev/null
    printf '\r  %d / %d rows' "$((i + 1))" "$rows" >&2
  done
  [[ "$rows" -gt 0 ]] && echo >&2

  api_get "$BASE_URL/api/garden/ripen?id=$id" >/dev/null
  echo "$BASE_URL/api/harvest/$id"
}

cmd_harvest() {
  local id="${1:-}" output="${2:-}"
  [[ -n "$id" ]] || {
    echo "usage: greenhouse harvest <id> [output]" >&2
    exit 1
  }

  if [[ -z "$output" ]]; then
    output="$(jq -r '.name' <<<"$(api_get "$BASE_URL/api/garden/$id")")"
  fi

  echo "Harvesting $id -> $output" >&2
  local status
  status="$(curl -sS -w '%{http_code}' -o "$output" "$BASE_URL/api/harvest/$id")"
  if (( status < 200 || status >= 300 )); then
    rm -f "$output"
    echo "error: harvest failed (HTTP $status)" >&2
    exit 1
  fi
  echo "Saved $output"
}

cmd_growth() {
  local id="${1:-}"
  [[ -n "$id" ]] || {
    echo "usage: greenhouse growth <id>" >&2
    exit 1
  }
  api_get "$BASE_URL/api/garden/growth?id=$id" | jq .
}

js_source() {
  cat <<'JSEOF'
__BROWSER_PLANT_JS__
JSEOF
}

cmd_to_js() {
  local output="${1:-greenhouse-plant.js}"
  if [[ "$output" == "-" ]]; then
    js_source
    return
  fi
  js_source > "$output"
  echo "Wrote $output" >&2
  echo "Paste its contents into the browser console on the page you want to plant from." >&2
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    plant)    shift; cmd_plant "$@" ;;
    harvest)  shift; cmd_harvest "$@" ;;
    growth)   shift; cmd_growth "$@" ;;
    to-js)    shift; cmd_to_js "$@" ;;
    -h|--help|help|'') usage ;;
    *)
      echo "unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
