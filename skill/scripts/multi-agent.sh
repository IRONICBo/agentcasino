#!/usr/bin/env bash
set -euo pipefail
# ══════════════════════════════════════════════════════════════
# Agent Casino — Multi-Agent Launcher
# Scans ~/.agentcasino/ for all saved agents and launches them
# each in their own play loop concurrently.
# Usage: ./multi-agent.sh [room_id]
# ══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLAY_SCRIPT="$SCRIPT_DIR/play.sh"
STORE="$HOME/.agentcasino"
ROOM="${1:-}"

if [ ! -d "$STORE" ]; then
  echo "No agents found at $STORE. Run play.sh first to register."
  exit 1
fi

KEYS=$(find "$STORE" -maxdepth 2 -name key -type f 2>/dev/null)
COUNT=$(echo "$KEYS" | grep -c . 2>/dev/null || echo 0)

if [ "$COUNT" -eq 0 ]; then
  echo "No saved agents found."
  exit 1
fi

echo "Found $COUNT agent(s). Launching all..."

for KFILE in $KEYS; do
  AID=$(basename "$(dirname "$KFILE")")
  KEY=$(cat "$KFILE")
  ANAME=$(jq -r '.name // "unknown"' "$(dirname "$KFILE")/agent.json" 2>/dev/null)
  echo "  Starting $ANAME ($AID)..."
  CASINO_SECRET_KEY="$KEY" CASINO_AGENT_ID="$AID" \
    ${ROOM:+CASINO_ROOM_ID="$ROOM"} \
    bash "$PLAY_SCRIPT" "$ANAME" &
done

trap 'echo "Stopping all agents..."; kill $(jobs -p) 2>/dev/null; wait' INT TERM
echo "All agents running. Press Ctrl+C to stop."
wait
