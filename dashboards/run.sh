#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "📦 Installing dependencies..."

# List of dashboard folders
folders=(
  "workspace"
  "platform-console"
)

# Install npm dependencies for each dashboard
for folder in "${folders[@]}"
do
  echo "➡ Installing in $folder ..."
  cd "$folder"
  npm install
  cd ..
done

echo "🚀 Starting PM2 ecosystem..."
pm2 start ecosystem.config.json

echo "🔄 Showing PM2 logs..."
pm2 logs
