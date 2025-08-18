#!/bin/bash

# pgweb startup script for Railway deployment
# This script maps Railway's DATABASE_URL to pgweb's expected PGWEB_DATABASE_URL

echo "Starting pgweb database viewer..."
echo "pgweb version: $(pgweb --version 2>&1 | head -n 1)"

# Map DATABASE_URL to PGWEB_DATABASE_URL if not already set
if [ -z "$PGWEB_DATABASE_URL" ] && [ -n "$DATABASE_URL" ]; then
    export PGWEB_DATABASE_URL="$DATABASE_URL"
    echo "Mapped DATABASE_URL to PGWEB_DATABASE_URL"
fi

# Set default port if not provided by Railway
PORT="${PORT:-8081}"
echo "Using port: $PORT"

# Check if database URL is available
if [ -z "$PGWEB_DATABASE_URL" ]; then
    echo "ERROR: No database URL found. Please set DATABASE_URL or PGWEB_DATABASE_URL"
    exit 1
fi

# Parse and log connection info (without password)
DB_URL_WITHOUT_PASSWORD=$(echo "$PGWEB_DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/[hidden]:[hidden]@/')
echo "Connecting to: $DB_URL_WITHOUT_PASSWORD"

# Configure pgweb options
PGWEB_OPTIONS=""

# Add read-only mode for safety
PGWEB_OPTIONS="$PGWEB_OPTIONS --readonly"

# Bind to all interfaces (required for Railway)
PGWEB_OPTIONS="$PGWEB_OPTIONS --bind=0.0.0.0"

# Set the port
PGWEB_OPTIONS="$PGWEB_OPTIONS --listen=$PORT"

# Disable SSL for internal connections (Railway handles SSL at edge)
PGWEB_OPTIONS="$PGWEB_OPTIONS --ssl=disable"

# Enable bookmarks
PGWEB_OPTIONS="$PGWEB_OPTIONS --bookmarks"

# Set session timeout to 12 hours
PGWEB_OPTIONS="$PGWEB_OPTIONS --sessions"

echo "Starting pgweb with options: $PGWEB_OPTIONS"

# Start pgweb with the configured options
exec pgweb $PGWEB_OPTIONS --url="$PGWEB_DATABASE_URL"