#!/bin/sh
set -eu
. "$(dirname "$0")/common.sh"

if owned_session_running; then
  read -r pid start < "$PID_FILE"
  echo "session=running supervisor_pid=$pid start_time=$start"
else
  echo "session=stopped"
fi
for name in xvfb x11vnc novnc launcher; do
  file="$RUNTIME_DIR/$name.pid"
  [ -f "$file" ] && printf '%s_pid=%s\n' "$name" "$(cat "$file")"
done
printf 'vnc_listener=%s port=%s\n' "$(port_is_listening "$VNC_PORT" && echo yes || echo no)" "$VNC_PORT"
printf 'novnc_listener=%s port=%s\n' "$(port_is_listening "$NOVNC_PORT" && echo yes || echo no)" "$NOVNC_PORT"
printf 'root=%s\n' "$APP_ROOT"
