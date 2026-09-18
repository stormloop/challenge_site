#!/usr/bin/env bash
set -e

echo "Pulling latest code..."
git pull --ff-only

echo "Building application images..."
docker compose build

echo "Starting application..."
docker compose up -d

echo
echo "Deployment complete."
echo
docker compose ps