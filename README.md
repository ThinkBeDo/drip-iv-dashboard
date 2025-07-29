# Drip IV Analytics Dashboard

A comprehensive analytics dashboard for Drip IV wellness centers to track performance metrics, revenue, and service analytics.

## Features

- **📊 Real-time Analytics**: Upload CSV/PDF reports for instant dashboard updates
- **💰 Revenue Tracking**: Monitor weekly/monthly performance against goals  
- **🏥 Service Analytics**: Track volume across all service categories
- **👥 Membership Management**: Monitor membership types and growth
- **📈 Historical Data**: Compare performance over time
- **🎯 Goal Management**: Set and track revenue targets

## Quick Start

### Local Development

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd drip-iv-dashboard
   npm install
   ```

2. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb drip_iv_dashboard
   
   # Copy environment file
   cp .env.example .env
   
   # Edit .env with your database URL
   DATABASE_URL=postgresql://username:password@localhost:5432/drip_iv_dashboard
   ```

3. **Run Application**
   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000`

### Railway Deployment

1. **Create Railway Project**
   - Connect your GitHub repository
   - Add PostgreSQL database service

2. **Environment Variables**
   Railway will automatically set `DATABASE_URL` when PostgreSQL is provisioned.

3. **Deploy**
   Push to your connected GitHub repository - Railway will automatically deploy.

## Architecture

```
drip-iv-dashboard/
├── server.js              # Express server & API routes
├── database/
│   └── schema.sql         # PostgreSQL database schema
├── public/
│   └── index.html         # Frontend dashboard
├── package.json           # Dependencies & scripts
├── railway.toml          # Railway deployment config
└── .env.example          # Environment variables template
```

## API Endpoints

- `GET /` - Dashboard frontend
- `GET /api/dashboard` - Get latest analytics data
- `GET /api/historical` - Get historical data (3 months default)
- `POST /api/upload` - Upload and process CSV/PDF analytics files
- `GET /health` - Health check endpoint

## Data Processing

The application automatically processes:

### PDF Reports
- Extracts volume metrics for all services
- Parses revenue data and goals
- Identifies membership counts
- Calculates performance percentages

### CSV Files  
- Structured data import
- Flexible column mapping
- Data validation and cleanup

## Database Schema

Key tables:
- `analytics_data` - Main metrics and performance data
- `file_uploads` - Track uploaded files and processing status
- `revenue_goals` - Configurable revenue targets
- `performance_metrics` - Historical trend data

## Technology Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL  
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Deployment**: Railway
- **File Processing**: CSV Parser + PDF Parse

## Support

For technical support or feature requests, contact the development team.

## License

MIT License - see LICENSE file for details.
