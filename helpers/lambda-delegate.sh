#!/usr/bin/env bash
# lambda-delegate — run a one-shot task through the lambda agent runtime
# (kimi-code, product: pens/olympus/products/lambda). Helper for omp/tau
# extensions and shell workflows; the canonical entry is ~/.local/bin/lambda.
#
# Usage: lambda-delegate "<prompt>" [cwd] [--model <alias>] [--timeout <sec>]
set -euo pipefail
LAMBDA_BIN="$HOME/.local/bin/lambda"
[ -x "$LAMBDA_BIN" ] || LAMBDA_BIN="/home/toxic/pens/olympus/products/lambda/bin/lambda"

PROMPT="${1:?usage: lambda-delegate \"<prompt>\" [cwd] [--model <alias>] [--timeout <sec>]}"
shift || true
CWD="${1:-$PWD}"
MODEL="lambda-local"
TMO=240
while [ $# -gt 0 ]; do
  case "$1" in
    --model)  MODEL="$2"; shift 2 ;;
    --timeout) TMO="$2"; shift 2 ;;
    *) shift ;;
  esac
done

exec "$LAMBDA_BIN" -m "$MODEL" --auto -p "$PROMPT" 2>&1 < /dev/null &
PID=$!
# bounded wait — kairos doctrine: never block past the cap
( timeout "$TMO" tail --pid="$PID" -f /dev/null ) || kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
