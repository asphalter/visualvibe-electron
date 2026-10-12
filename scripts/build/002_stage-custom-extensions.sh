#!/bin/bash
# 002_stage-custom-extensions.sh — build — rename the custom VisualVibe extensions
# (copied by the Containerfile) to the code-server "publisher.name-version" layout
# so they are recognized as installed extensions.
set -e

if [ -d /opt/visualvibe/extensions/vv-nav-button ]; then
    mv /opt/visualvibe/extensions/vv-nav-button /opt/visualvibe/extensions/visualvibe.vv-nav-button-1.0.0
fi
if [ -d /opt/visualvibe/extensions/vv-project-picker ]; then
    mv /opt/visualvibe/extensions/vv-project-picker /opt/visualvibe/extensions/visualvibe.vv-project-picker-1.0.0
fi
if [ -d /opt/visualvibe/extensions/vv-update-checker ]; then
    mv /opt/visualvibe/extensions/vv-update-checker /opt/visualvibe/extensions/visualvibe.vv-update-checker-1.0.0
fi
