#!/bin/sh
set -eu
mount -t proc proc /proc
mount -t sysfs sysfs /sys
if ! awk '$2 == "/dev" && $3 == "devtmpfs" {found=1} END {exit !found}' /proc/mounts; then mount -t devtmpfs devtmpfs /dev; fi
mount -t tmpfs -o size=32m,nosuid,nodev,noexec,mode=1777 tmpfs /tmp
mount -t tmpfs -o size=64m,nosuid,nodev,uid=65534,gid=65534,mode=0700 tmpfs /workspace
mount -t tmpfs -o size=8m,nosuid,nodev,noexec,mode=0755 tmpfs /channel
exec /usr/local/bin/python3 -I -B /opt/phaseone/broker.py
