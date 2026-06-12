#!/bin/zsh

# AZ Tamer Launcher for macOS
echo "========================================================"
echo "                 AZ Tamer Launcher                     "
echo "========================================================"
echo

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Load nvm if node is not found in PATH
if ! command -v node &> /dev/null; then
    echo "[1/3] Node.js not found in PATH. Checking for NVM..."
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        echo "[INFO] Loading NVM from $HOME/.nvm/nvm.sh..."
        export NVM_DIR="$HOME/.nvm"
        source "$NVM_DIR/nvm.sh"
    fi
fi

# Check if Node.js is installed
echo "[1/3] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in your PATH."
    echo "Please install Node.js (e.g., via NVM or from https://nodejs.org/)"
    echo "Press Enter to exit."
    read
    exit 1
fi

echo "[OK] Node.js is installed ($(node -v))."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed or not in your PATH."
    echo "Press Enter to exit."
    read
    exit 1
fi

# Check if node_modules exists, if not run npm install
echo "[2/3] Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules folder is missing. Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] npm install failed. Please check your internet connection."
        read
        exit 1
    fi
else
    echo "[OK] Dependencies are already installed."
fi

# Run the dev server and open in browser
echo "[3/3] Starting the local game server..."
echo
echo "The game should automatically open in your active browser."
echo "Leave this window open while playing the game."
echo "Press Ctrl+C to stop the server when you are done."
echo "--------------------------------------------------------"
echo

# Run Vite in the background
PORT=${PORT:-5180}
npm run dev &
VITE_PID=$!

# Wait a moment for Vite to spin up
sleep 1.5

# Attempt to open the page in the currently active browser
osascript -e '
tell application "System Events"
    set activeApp to name of first application process whose frontmost is true
    if activeApp is in {"Google Chrome", "Brave Browser", "Safari", "Firefox", "Arc"} then
        tell application activeApp to open location "http://localhost:'"$PORT"'"
    else
        do shell script "open http://localhost:'"$PORT"'"
    end if
end tell
' 2>/dev/null

# Trap SIGINT/SIGTERM/EXIT to clean up the background Vite process
trap "kill $VITE_PID 2>/dev/null" EXIT INT TERM
wait $VITE_PID
