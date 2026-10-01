#!/usr/bin/env bash
# shrill — upload and download files through GET-chunked requests.
#
# Requires: bash, curl, jq. Optional: the `file` command, for a nicer
# Content-Type guess on upload.
#
# Usage:
#   shrill upload <path>              Upload a file, print its share link
#   shrill download <id> [output]     Download a file by id
#   shrill status <id>                Show which chunks the server has
#   shrill to-js [output.js|-]        Write a browser-console upload script
#
# Target server is baked in below; override per-call with SHRILL_URL.
set -euo pipefail

BASE_URL="${SHRILL_URL:-__BASE_URL__}"

for bin in curl jq base64 dd; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "error: this script needs '$bin' on PATH" >&2
    exit 1
  }
done

usage() {
  cat <<EOF
shrill — upload and download files through GET-chunked requests.

Usage:
  shrill upload <path>              Upload a file, print its share link
  shrill download <id> [output]     Download a file by id
  shrill status <id>                Show which chunks the server has
  shrill to-js [output.js|-]        Write a browser-console upload script

Target server: ${BASE_URL} (override with SHRILL_URL)
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

cmd_upload() {
  local file="${1:-}"
  [[ -n "$file" && -f "$file" ]] || {
    echo "usage: shrill upload <path>" >&2
    exit 1
  }

  local name size type init id chunk_size chunks
  name="$(basename -- "$file")"
  size="$(wc -c < "$file" | tr -d '[:space:]')"
  type="$(detect_mime "$file")"

  init="$(api_get "$BASE_URL/api/upload/init?name=$(urlencode "$name")&size=$size&type=$(urlencode "$type")")"
  id="$(jq -r '.id' <<<"$init")"
  chunk_size="$(jq -r '.chunkSize' <<<"$init")"
  chunks="$(jq -r '.chunks' <<<"$init")"

  echo "Uploading $name ($size bytes, $chunks chunk(s)) as $id" >&2

  local i data
  for (( i = 0; i < chunks; i++ )); do
    data="$(dd if="$file" bs="$chunk_size" skip="$i" count=1 2>/dev/null \
      | base64 | tr '+/' '-_' | tr -d '=\n')"
    api_get "$BASE_URL/api/upload/chunk?id=$id&index=$i&data=$data" >/dev/null
    printf '\r  %d / %d chunks' "$((i + 1))" "$chunks" >&2
  done
  [[ "$chunks" -gt 0 ]] && echo >&2

  api_get "$BASE_URL/api/upload/complete?id=$id" >/dev/null
  echo "$BASE_URL/api/download/$id"
}

cmd_download() {
  local id="${1:-}" output="${2:-}"
  [[ -n "$id" ]] || {
    echo "usage: shrill download <id> [output]" >&2
    exit 1
  }

  if [[ -z "$output" ]]; then
    output="$(jq -r '.name' <<<"$(api_get "$BASE_URL/api/files/$id")")"
  fi

  echo "Downloading $id -> $output" >&2
  local status
  status="$(curl -sS -w '%{http_code}' -o "$output" "$BASE_URL/api/download/$id")"
  if (( status < 200 || status >= 300 )); then
    rm -f "$output"
    echo "error: download failed (HTTP $status)" >&2
    exit 1
  fi
  echo "Saved $output"
}

cmd_status() {
  local id="${1:-}"
  [[ -n "$id" ]] || {
    echo "usage: shrill status <id>" >&2
    exit 1
  }
  api_get "$BASE_URL/api/upload/status?id=$id" | jq .
}

js_source() {
  cat <<'JSEOF'
__BROWSER_UPLOAD_JS__
JSEOF
}

cmd_to_js() {
  local output="${1:-shrill-upload.js}"
  if [[ "$output" == "-" ]]; then
    js_source
    return
  fi
  js_source > "$output"
  echo "Wrote $output" >&2
  echo "Paste its contents into the browser console on the page you want to upload from." >&2
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    upload)   shift; cmd_upload "$@" ;;
    download) shift; cmd_download "$@" ;;
    status)   shift; cmd_status "$@" ;;
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
