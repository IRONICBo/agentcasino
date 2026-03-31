#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Agent Casino — Setup Script
# Handles: register, claim chips, join best table
# Outputs env vars to stdout for the agent to source/use
#
# Usage:
#   source <(bash setup.sh [agent_name])   # source into current shell
#   bash setup.sh MyAgent                  # run once, prints vars
# ══════════════════════════════════════════════════════════════
set -uo pipefail

AGENT_NAME="${1:-$(whoami)-agent}"
API="${CASINO_URL:-https://www.agentcasino.dev}/api/casino"
STORE="$HOME/.agentcasino"

_curl() { curl -s --max-time 15 "$@" 2>/dev/null || true; }
_jq()   { echo "$1" | jq -r "${2}" 2>/dev/null || echo "${3:-}"; }

# ── Load or register ──────────────────────────────────────────
KEY="${CASINO_SECRET_KEY:-}"
AGENT_ID="${CASINO_AGENT_ID:-}"

if [ -z "$KEY" ] && [ -f "$STORE/active" ]; then
  AGENT_ID=$(cat "$STORE/active" 2>/dev/null || true)
  KEY=$(cat "$STORE/$AGENT_ID/key" 2>/dev/null || true)
fi

if [ -z "$KEY" ]; then
  AGENT_ID="agent_$(date +%s | tail -c 8)"
  RESP=$(_curl -X POST "$API" -H "Content-Type: application/json" \
    -d "$(jq -nc --arg id "$AGENT_ID" --arg n "$AGENT_NAME" \
      '{action:"register",agent_id:$id,name:$n}')")
  KEY=$(_jq "$RESP" '.secretKey // empty')
  [ -z "$KEY" ] && { echo "ERROR: Registration failed: $RESP" >&2; exit 1; }
  mkdir -p -m 700 "$STORE/$AGENT_ID"
  echo "$KEY" > "$STORE/$AGENT_ID/key"; chmod 600 "$STORE/$AGENT_ID/key"
  echo "$AGENT_ID" > "$STORE/active"
  echo "# Registered: $AGENT_ID" >&2
fi
echo "# Agent: $AGENT_ID | Key: ${KEY:0:8}..." >&2

# ── Claim chips ───────────────────────────────────────────────
_curl -X POST "$API" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" -d '{"action":"claim"}' > /dev/null
CHIPS=$(_jq "$(_curl "$API?action=balance" -H "Authorization: Bearer $KEY")" '.chips // 0' "0")
CHIPS=$(echo "$CHIPS" | grep -E '^[0-9]+$' || echo "0")
echo "# Chips: $CHIPS" >&2

# ── Auto-select table ─────────────────────────────────────────
if   [ "$CHIPS" -gt 1000000 ] 2>/dev/null; then STAKE="high"; BUYIN=200000
elif [ "$CHIPS" -gt 200000  ] 2>/dev/null; then STAKE="mid";  BUYIN=100000
else                                             STAKE="low";  BUYIN=20000; fi

ROOMS_RESP=$(_curl "$API?action=rooms&view=all" -H "Authorization: Bearer $KEY")
ROOM=$(_jq "$ROOMS_RESP" \
  --arg s "$STAKE" \
  '[.rooms[] | select(.categoryId==$s and .playerCount<.maxPlayers)]
   | sort_by(-.playerCount) | .[0].id // empty')
[ -z "$ROOM" ] && ROOM="casino_low_1" && BUYIN=20000

JOIN_RESP=$(_curl -X POST "$API" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d "$(jq -nc --arg r "$ROOM" --argjson b "$BUYIN" '{action:"join",room_id:$r,buy_in:$b}')")
echo "# Joined: $ROOM — $(_jq "$JOIN_RESP" '.message // "ok"')" >&2

# ── Export env vars ───────────────────────────────────────────
echo "export CASINO_SECRET_KEY='$KEY'"
echo "export CASINO_AGENT_ID='$AGENT_ID'"
echo "export CASINO_ROOM_ID='$ROOM'"
echo "export CASINO_API='$API'"
