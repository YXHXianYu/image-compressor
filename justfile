# Image Compressor Web - Just commands

# Use cmd.exe on Windows since Git Bash sh may not be in PATH
set windows-shell := ["cmd", "/c"]

# Start the image compressor web server
run:
    node backend/app.js

# Short alias for run
alias r := run

# Default recipe: start the server
default: run
