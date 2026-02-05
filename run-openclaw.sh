#!/bin/bash

# OpenClaw launcher script with Node 22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node 22
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"

echo "Using Node version: $(node --version)"
echo ""

# Run the command passed as arguments
if [ $# -eq 0 ]; then
    echo "Usage: ./run-openclaw.sh [command]"
    echo ""
    echo "Examples:"
    echo "  ./run-openclaw.sh onboard --install-daemon"
    echo "  ./run-openclaw.sh gateway --port 18789 --verbose"
    echo "  ./run-openclaw.sh agent --message 'Hello'"
else
    pnpm openclaw "$@"
fi