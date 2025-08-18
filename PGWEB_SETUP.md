# pgweb Database Viewer Setup for Railway

This document explains how to deploy and configure pgweb as a database viewer for the Drip IV Dashboard PostgreSQL database on Railway.

## Overview

pgweb is a web-based PostgreSQL database browser that provides a clean interface for viewing and querying your database. This setup is configured to run in **read-only mode** for safety.

## Files Created

1. **Dockerfile.pgweb** - Docker configuration for pgweb service
2. **start-pgweb.sh** - Alternative startup script for non-Docker deployments
3. **railway.json** - Railway service configuration
4. **PGWEB_SETUP.md** - This documentation file

## Deployment Instructions

### Method 1: Using Dockerfile (Recommended)

1. **Push the new files to your repository:**
   ```bash
   git add Dockerfile.pgweb railway.json start-pgweb.sh PGWEB_SETUP.md
   git commit -m "Add pgweb database viewer configuration"
   git push origin main
   ```

2. **Configure the pgweb service in Railway:**
   - Go to your Railway project dashboard
   - Select the `pgweb` service
   - Go to Settings → General
   - Set **Root Directory** to `/` (if not already set)
   - Set **Dockerfile Path** to `Dockerfile.pgweb`

3. **Add/Update Environment Variables:**
   - In the pgweb service, go to Variables
   - Add `PGWEB_DATABASE_URL` with value `${{Postgres.DATABASE_URL}}`
   - This references your PostgreSQL database URL

4. **Redeploy the service:**
   - Click "Redeploy" in the Railway dashboard
   - Or push any change to trigger automatic deployment

### Method 2: Using Start Script (Alternative)

If Docker doesn't work, you can use the shell script:

1. **Update Railway settings:**
   - In pgweb service settings
   - Set **Start Command** to `./start-pgweb.sh`
   - Ensure the builder can find and execute the script

### Method 3: Manual Environment Variable Fix

If both methods above fail, you can manually fix the environment variables:

1. **In Railway Dashboard:**
   - Go to pgweb service → Variables
   - Add: `PGWEB_DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - Add: `PGWEB_READONLY` = `1`
   - Add: `PGWEB_BIND` = `0.0.0.0`
   - Add: `PGWEB_SSL_MODE` = `disable`

## Features Configured

- **Read-Only Mode**: Database is protected from accidental modifications
- **Session Management**: 12-hour session timeout
- **Bookmarks**: Enabled for saving frequently used queries
- **SSL**: Disabled for internal connections (Railway handles SSL at edge)
- **Port**: Automatically uses Railway's PORT environment variable

## Accessing pgweb

Once deployed successfully:

1. Find your pgweb URL in Railway dashboard
   - Usually: `pgweb-production-[hash].up.railway.app`
2. Open the URL in your browser
3. You should see the pgweb interface with your database tables

## Troubleshooting

### Authentication Failed Error

If you still see "authentication failed":

1. **Check DATABASE_URL format:**
   - Go to Railway → pgweb → Variables
   - Ensure DATABASE_URL or PGWEB_DATABASE_URL is properly set
   - Format should be: `postgresql://user:password@host:port/database`

2. **Try external URL:**
   - Instead of `postgres.railway.internal`, use the external PostgreSQL URL
   - Railway provides both internal and external URLs

3. **Check logs:**
   ```bash
   railway logs --service pgweb
   ```

### Container Restart Loop

If the container keeps restarting:

1. Check the deployment logs in Railway dashboard
2. Verify the Dockerfile path is correct
3. Ensure all environment variables are set

### Connection Timeout

If pgweb can't connect to the database:

1. Ensure both services are in the same Railway project
2. Check that the PostgreSQL service is running
3. Try using the external database URL instead of internal

## Security Notes

- pgweb is configured in **read-only mode** to prevent accidental data modification
- Consider adding authentication (`PGWEB_AUTH_USER` and `PGWEB_AUTH_PASS`) for production
- The database password is not exposed in the pgweb interface
- Railway handles SSL/TLS at the edge, so internal connections don't need SSL

## Additional Configuration

You can add more pgweb options by modifying:

1. **Dockerfile.pgweb**: Add more ENV variables
2. **start-pgweb.sh**: Add more command-line options
3. **Railway Variables**: Add environment variables directly in Railway

Common additional options:
- `PGWEB_AUTH_USER` and `PGWEB_AUTH_PASS` - Basic authentication
- `PGWEB_PREFIX` - URL prefix for reverse proxy setups
- `PGWEB_CORS` - Enable CORS headers
- `PGWEB_LOCK_SESSION` - Lock session to IP address

## Support

For pgweb-specific issues: https://github.com/sosedoff/pgweb
For Railway deployment issues: https://docs.railway.app/