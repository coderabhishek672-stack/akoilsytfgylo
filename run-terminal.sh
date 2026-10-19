#!/usr/bin/env bash
# Starts the AURUM terminal detached on port 12000.
# Detached with setsid so it survives the launching shell; log lives in the repo
# rather than /tmp because this sandbox clears /tmp between sessions.
set -u

PORT="${PORT:-12000}"
cd "$(dirname "$0")"
mkdir -p .agent_tmp

if curl -s -o /dev/null --max-time 3 "http://localhost:${PORT}/"; then
  echo "Already running on port ${PORT}."
  exit 0
fi

# Build only when there is no compiled output to serve.
if [ ! -d .next ]; then
  echo "No build found - running a production build first..."
  npm run build || exit 1
fi

setsid nohup env PORT="${PORT}" npm run start > .agent_tmp/aurum.log 2>&1 < /dev/null &

for _ in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null --max-time 3 "http://localhost:${PORT}/"; then
    echo "AURUM terminal ready at http://localhost:${PORT}/"
    exit 0
  fi
done

echo "Server did not come up. Last log lines:"
tail -20 .agent_tmp/aurum.log
exit 1
