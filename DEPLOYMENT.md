# Drip IV Dashboard - Railway Deployment Guide

## 🚀 Quick Railway Deployment

### Step 1: Connect to Railway
1. Go to [Railway.app](https://railway.app)
2. Click "Deploy from GitHub"
3. Connect your GitHub account
4. Select the `drip-iv-dashboard` repository

### Step 2: Configure Environment
Railway will automatically:
- ✅ Detect Node.js project
- ✅ Set up PostgreSQL database
- ✅ Configure DATABASE_URL environment variable
- ✅ Set PORT=8080 (Railway requirement)

### Step 3: Initialize Data
Once deployed, visit your Railway URL and add `/api/add-july-data` to initialize with July data:

```
https://your-app-name.up.railway.app/api/add-july-data
```

### Step 4: Access Dashboard
Your dashboard will be live at:
```
https://your-app-name.up.railway.app
```

## 🛠 Manual Railway Setup (if needed)

### Environment Variables in Railway:
```bash
NODE_ENV=production
PORT=8080
# DATABASE_URL is auto-configured by Railway PostgreSQL
```

### Database Setup:
Railway automatically provisions PostgreSQL and sets DATABASE_URL. The schema runs automatically on startup.

## 🧪 Testing Locally

### 1. Start Local Development:
```bash
# Install dependencies
npm install

# Set up local environment
cp .env.example .env
# Edit .env with your local DATABASE_URL

# Start server
npm start
```

### 2. Test July Data:
```bash
# Run test script
node test-july-data.js
```

### 3. Access Local Dashboard:
```
http://localhost:3000
```

## 📊 Features Implemented

### ✅ Smart Data Processing
- **Date-based deduplication**: Upload same week multiple times safely
- **Update vs Insert**: Automatically updates existing data or inserts new
- **PDF Parsing**: Extracts all metrics from your weekly reports
- **CSV Support**: Ready for CSV uploads too

### ✅ Real Revenue Tracking
- Weekly vs Monthly revenue comparison
- Goal vs Actual performance with progress bars
- Service-specific revenue breakdown (IV, Semaglutide)
- Revenue percentage calculations

### ✅ Service Volume Analytics
- IV therapy session counts (weekday/weekend split)
- Weight management program metrics
- Hormone therapy appointments

### ✅ Membership Management
- Total Drip IV members
- Concierge and corporate membership tracking
- Marketing initiative counting

## 🔧 API Endpoints

```bash
GET  /                          # Dashboard homepage
GET  /api/dashboard            # Get latest analytics data
POST /api/upload               # Upload PDF/CSV files
POST /api/add-july-data        # Initialize July data
GET  /api/historical           # Get historical data
GET  /health                   # Health check
```

## 📱 Dashboard Features

### Beautiful UI
- Drip IV branded design with blue gradients
- Responsive design for mobile/desktop
- Interactive hover effects and animations
- Professional medical practice aesthetic

### Real-time Metrics
- Live revenue progress bars
- Service volume counters
- Membership status displays
- Goal achievement percentages

### File Upload System
- Drag & drop PDF/CSV uploads
- Automatic data extraction and parsing
- Smart duplicate detection and updates
- Error handling and status feedback

## 🚨 Important Notes

### For Railway Deployment:
- PORT must be 8080 (set automatically)
- PostgreSQL is auto-provisioned
- HTTPS is automatic
- Zero-downtime deployments

### For Data Management:
- Same date range uploads will UPDATE existing data
- Different date ranges will INSERT new records
- All original PDF data is preserved in database
- Historical tracking for trend analysis

## 📞 Need Help?

If you see the dashboard showing template literals instead of data:
1. Check that /api/dashboard returns JSON data
2. Run /api/add-july-data to initialize 
3. Verify PostgreSQL connection is working
4. Check Railway logs for any errors

Your dashboard should show the beautiful Drip IV interface with all your July metrics populated!
