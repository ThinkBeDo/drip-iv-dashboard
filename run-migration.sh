#!/bin/bash

# Script to run database migration on Railway deployment
# Wait for deployment to complete, then run the migration

echo "🚀 Running database migration on Railway..."
echo "This will add the missing membership columns to the database."
echo ""

# The production URL for your Railway app
RAILWAY_URL="https://drip-iv-dashboard-production.up.railway.app"

echo "Triggering migration at: $RAILWAY_URL/api/migrate"
echo ""

# Run the migration
response=$(curl -X POST "$RAILWAY_URL/api/migrate" \
  -H "Content-Type: application/json" \
  -s)

echo "Migration Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

# Test the dashboard endpoint to verify it's working
echo "Testing dashboard endpoint..."
dashboard_response=$(curl -s "$RAILWAY_URL/api/dashboard" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"Success: {data.get('success')}\"); print(f\"Has membership data: {'individual_memberships' in data.get('data', {})}\")" 2>/dev/null)

echo "$dashboard_response"
echo ""
echo "✅ Migration script complete. Check the dashboard to verify membership data is displaying correctly."