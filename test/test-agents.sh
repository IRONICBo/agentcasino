#!/bin/bash
# Spawn N test agents that play poker on localhost.
# Smart polling: only acts when it's your turn, auto-rejoins on bust.
# Usage: bash test/test-agents.sh [room_id] [num_agents]

BASE="http://localhost:3000/api/casino"
ROOM="${1:-casino_high_1}"
NUM="${2:-8}"
# Auto-detect buy-in from room category
case "$ROOM" in
  *high*) BUYIN=200000 ;;
  *mid*)  BUYIN=100000 ;;
  *)      BUYIN=20000  ;;
esac
# Use unique IDs per run to avoid "already registered" errors
RUN_ID=$(date +%s | tail -c 6)
ALL_NAMES=("AlphaBot" "BetaBot" "GammaBot" "DeltaBot" "EpsilonBot" "ZetaBot" "EtaBot" "ThetaBot" "IotaBot" "KappaBot")
AGENTS=("${ALL_NAMES[@]:0:$NUM}")
AGENT_IDS=()
KEYS=()

for i in "${!AGENTS[@]}"; do
  AGENT_IDS+=("bot_${RUN_ID}_$i")
done

echo "=== Registering $NUM agents (run=$RUN_ID, room=$ROOM, buyin=$BUYIN) ==="
for i in "${!AGENTS[@]}"; do
  NAME="${AGENTS[$i]}"
  AID="${AGENT_IDS[$i]}"
  RESP=$(curl -s -X POST "$BASE" \
    -H 'Content-Type: application/json' \
    -d "{\"action\":\"register\",\"agent_id\":\"$AID\",\"name\":\"$NAME\"}")
  SK=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('secretKey',''))" 2>/dev/null)
  if [ -z "$SK" ]; then
    echo "  [$NAME] register failed: $RESP"
    exit 1
  fi
  KEYS+=("$SK")
  echo "  [$NAME] → $AID"
done

echo ""
echo "=== Claiming chips ==="
for i in "${!AGENTS[@]}"; do
  curl -s -X POST "$BASE" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${KEYS[$i]}" \
    -d '{"action":"claim"}' > /dev/null
done
echo "  Done"

echo ""
echo "=== Joining $ROOM ==="
for i in "${!AGENTS[@]}"; do
  curl -s -X POST "$BASE" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${KEYS[$i]}" \
    -d "{\"action\":\"join\",\"room_id\":\"$ROOM\",\"buy_in\":$BUYIN}" > /dev/null
  echo "  [${AGENTS[$i]}] joined"
  sleep 0.2
done

echo ""
echo "=== Playing (Ctrl+C to stop) ==="

run_agent() {
  local IDX=$1
  local NAME="${AGENTS[$IDX]}"
  local AID="${AGENT_IDS[$IDX]}"
  local SK="${KEYS[$IDX]}"

  while true; do
    # Get game state
    STATE=$(curl -s "$BASE?action=game_state&room_id=$ROOM" \
      -H "Authorization: Bearer $SK" 2>/dev/null)

    PHASE=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)

    # Waiting — maybe rejoin
    if [ "$PHASE" = "waiting" ] || [ -z "$PHASE" ]; then
      # Try claim + rejoin
      curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $SK" -d '{"action":"claim"}' > /dev/null 2>&1
      RESP=$(curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $SK" \
        -d "{\"action\":\"join\",\"room_id\":\"$ROOM\",\"buy_in\":$BUYIN}" 2>/dev/null)
      MSG=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',d.get('error','')))" 2>/dev/null)
      if [[ "$MSG" == *"Joined"* ]] || [[ "$MSG" == *"Already"* ]]; then
        : # good
      fi
      sleep 2
      continue
    fi

    # Check if it's my turn
    TURN_INFO=$(echo "$STATE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
players=d.get('players',[])
ci=d.get('currentPlayerIndex',-1)
me=[p for p in players if p.get('name')=='$NAME']
if not me:
    print('NOT_SEATED')
elif 0<=ci<len(players) and players[ci].get('agentId')==me[0].get('agentId'):
    bet=me[0].get('currentBet',0)
    highest=max((p.get('currentBet',0) for p in players),default=0)
    chips=me[0].get('chips',0)
    print(f'MY_TURN {highest-bet} {chips}')
else:
    print('WAIT')
" 2>/dev/null)

    if [ "$TURN_INFO" = "NOT_SEATED" ]; then
      # Rejoin
      curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $SK" -d '{"action":"claim"}' > /dev/null 2>&1
      curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $SK" \
        -d "{\"action\":\"join\",\"room_id\":\"$ROOM\",\"buy_in\":$BUYIN}" > /dev/null 2>&1
      echo "  [$NAME] rejoined"
      sleep 2
      continue
    fi

    if [[ "$TURN_INFO" != MY_TURN* ]]; then
      sleep 1
      continue
    fi

    # My turn — parse
    TO_CALL=$(echo "$TURN_INFO" | awk '{print $2}')
    MY_CHIPS=$(echo "$TURN_INFO" | awk '{print $3}')

    # Strategy
    ROLL=$((RANDOM % 100))
    if [ "$TO_CALL" = "0" ]; then
      if [ $ROLL -lt 55 ]; then MOVE="check"
      elif [ $ROLL -lt 88 ]; then MOVE="raise"
      else MOVE="all_in"; fi
    else
      if [ $ROLL -lt 8 ]; then MOVE="fold"
      elif [ $ROLL -lt 65 ]; then MOVE="call"
      elif [ $ROLL -lt 90 ]; then MOVE="raise"
      else MOVE="all_in"; fi
    fi

    # Build request
    if [ "$MOVE" = "raise" ]; then
      MULT=$(( (RANDOM % 3) + 2 ))
      AMT=$(( 5000 * MULT ))
      [ $AMT -gt $MY_CHIPS ] && MOVE="all_in"
    fi

    if [ "$MOVE" = "raise" ]; then
      BODY="{\"action\":\"play\",\"room_id\":\"$ROOM\",\"move\":\"raise\",\"amount\":$AMT}"
    else
      BODY="{\"action\":\"play\",\"room_id\":\"$ROOM\",\"move\":\"$MOVE\"}"
    fi

    RESP=$(curl -s -X POST "$BASE" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $SK" \
      -d "$BODY" 2>/dev/null)

    RESULT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('move', d.get('error','?')))" 2>/dev/null)
    echo "  [$NAME] $MOVE → $RESULT"

    # Chat — say something about the move
    CHAT_LINES_FOLD=("Nah, I'm out." "Not worth it." "Too rich for me." "I'll pass." "Living to fight another day.")
    CHAT_LINES_CHECK=("Let's see what comes." "I'll take a free card." "Checking..." "No bet from me." "Patience pays.")
    CHAT_LINES_CALL=("I'll see that." "Alright, I'm in." "Let's go." "Staying in." "Can't fold now.")
    CHAT_LINES_RAISE=("Let's make this interesting." "Raise it up!" "Who's brave enough?" "Pay to play." "Putting pressure on.")
    CHAT_LINES_ALLIN=("ALL IN! Let's go!" "Yolo!" "Everything on the line!" "Ship it!" "No guts no glory!")
    case "$MOVE" in
      fold)   LINES=("${CHAT_LINES_FOLD[@]}") ;;
      check)  LINES=("${CHAT_LINES_CHECK[@]}") ;;
      call)   LINES=("${CHAT_LINES_CALL[@]}") ;;
      raise)  LINES=("${CHAT_LINES_RAISE[@]}") ;;
      all_in) LINES=("${CHAT_LINES_ALLIN[@]}") ;;
      *)      LINES=("gl") ;;
    esac
    CHAT_MSG="${LINES[$((RANDOM % ${#LINES[@]}))]}"
    curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $SK" \
      -d "{\"action\":\"chat\",\"room_id\":\"$ROOM\",\"message\":\"$CHAT_MSG\"}" > /dev/null 2>&1

    # Heartbeat
    curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $SK" \
      -d "{\"action\":\"heartbeat\",\"room_id\":\"$ROOM\"}" > /dev/null 2>&1

    # Simulate AI thinking time
    sleep 5
  done
}

cleanup() {
  echo ""
  echo "=== Stopping ==="
  for i in "${!AGENTS[@]}"; do
    curl -s -X POST "$BASE" -H 'Content-Type: application/json' \
      -H "Authorization: Bearer ${KEYS[$i]}" \
      -d "{\"action\":\"leave\",\"room_id\":\"$ROOM\"}" > /dev/null 2>&1
  done
  kill $(jobs -p) 2>/dev/null
  wait 2>/dev/null
  echo "  All agents left"
  exit 0
}
trap cleanup INT TERM

for i in "${!AGENTS[@]}"; do
  run_agent $i &
done

wait
