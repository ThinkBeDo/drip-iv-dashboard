-- Drip IV Dashboard Database Schema
-- PostgreSQL Schema for Railway Deployment

-- Create database (run manually on Railway)
-- CREATE DATABASE drip_iv_dashboard;

-- Main analytics data table
CREATE TABLE IF NOT EXISTS analytics_data (
    id SERIAL PRIMARY KEY,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    
    -- Volume metrics
    drip_iv_weekday_weekly INTEGER DEFAULT 0,
    drip_iv_weekend_weekly INTEGER DEFAULT 0,
    semaglutide_consults_weekly INTEGER DEFAULT 0,
    semaglutide_injections_weekly INTEGER DEFAULT 0,
    hormone_followup_female_weekly INTEGER DEFAULT 0,
    hormone_initial_male_weekly INTEGER DEFAULT 0,
    
    -- Monthly cumulative data
    drip_iv_weekday_monthly INTEGER DEFAULT 0,
    drip_iv_weekend_monthly INTEGER DEFAULT 0,
    semaglutide_consults_monthly INTEGER DEFAULT 0,
    semaglutide_injections_monthly INTEGER DEFAULT 0,
    hormone_followup_female_monthly INTEGER DEFAULT 0,
    hormone_initial_male_monthly INTEGER DEFAULT 0,
    
    -- Revenue data
    actual_weekly_revenue DECIMAL(10,2) DEFAULT 0,
    weekly_revenue_goal DECIMAL(10,2) DEFAULT 0,
    actual_monthly_revenue DECIMAL(10,2) DEFAULT 0,
    monthly_revenue_goal DECIMAL(10,2) DEFAULT 0,
    
    -- Revenue breakdown
    drip_iv_revenue_weekly DECIMAL(10,2) DEFAULT 0,
    semaglutide_revenue_weekly DECIMAL(10,2) DEFAULT 0,
    drip_iv_revenue_monthly DECIMAL(10,2) DEFAULT 0,
    semaglutide_revenue_monthly DECIMAL(10,2) DEFAULT 0,
    
    -- Membership data
    total_drip_iv_members INTEGER DEFAULT 0,
    individual_memberships INTEGER DEFAULT 0,
    family_memberships INTEGER DEFAULT 0,
    family_concierge_memberships INTEGER DEFAULT 0,
    drip_concierge_memberships INTEGER DEFAULT 0,
    marketing_initiatives INTEGER DEFAULT 0,
    concierge_memberships INTEGER DEFAULT 0,
    corporate_memberships INTEGER DEFAULT 0,
    
    -- Additional metrics
    days_left_in_month INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_analytics_week_start ON analytics_data(week_start_date);
CREATE INDEX IF NOT EXISTS idx_analytics_upload_date ON analytics_data(upload_date);

-- Create unique constraint to prevent duplicate date ranges
ALTER TABLE analytics_data ADD CONSTRAINT unique_week_range UNIQUE (week_start_date, week_end_date);

-- File upload tracking
CREATE TABLE IF NOT EXISTS file_uploads (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    analytics_data_id INTEGER REFERENCES analytics_data(id),
    error_message TEXT
);

-- Goals and targets table for flexible goal management
CREATE TABLE IF NOT EXISTS revenue_goals (
    id SERIAL PRIMARY KEY,
    goal_type VARCHAR(50) NOT NULL, -- 'weekly' or 'monthly'
    service_category VARCHAR(100) NOT NULL, -- 'drip_iv', 'semaglutide', 'total'
    goal_amount DECIMAL(10,2) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default goals
INSERT INTO revenue_goals (goal_type, service_category, goal_amount, effective_date) VALUES
('weekly', 'total', 32125.00, '2025-01-01'),
('monthly', 'total', 128500.00, '2025-01-01'),
('weekly', 'drip_iv', 15875.00, '2025-01-01'),
('weekly', 'semaglutide', 8750.00, '2025-01-01'),
('monthly', 'drip_iv', 63500.00, '2025-01-01'),
('monthly', 'semaglutide', 35000.00, '2025-01-01');

-- User sessions for basic tracking (no auth for now)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Performance metrics for monitoring
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_date DATE NOT NULL,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Functions for data analysis
CREATE OR REPLACE FUNCTION get_revenue_performance(target_date DATE)
RETURNS TABLE(
    service_category TEXT,
    actual_weekly DECIMAL(10,2),
    goal_weekly DECIMAL(10,2),
    actual_monthly DECIMAL(10,2),
    goal_monthly DECIMAL(10,2),
    weekly_percentage DECIMAL(5,2),
    monthly_percentage DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'Drip IV'::TEXT as service_category,
        COALESCE(a.drip_iv_revenue_weekly, 0) as actual_weekly,
        COALESCE(wg.goal_amount, 0) as goal_weekly,
        COALESCE(a.drip_iv_revenue_monthly, 0) as actual_monthly,
        COALESCE(mg.goal_amount, 0) as goal_monthly,
        CASE WHEN wg.goal_amount > 0 THEN (a.drip_iv_revenue_weekly / wg.goal_amount * 100) ELSE 0 END as weekly_percentage,
        CASE WHEN mg.goal_amount > 0 THEN (a.drip_iv_revenue_monthly / mg.goal_amount * 100) ELSE 0 END as monthly_percentage
    FROM analytics_data a
    LEFT JOIN revenue_goals wg ON wg.goal_type = 'weekly' AND wg.service_category = 'drip_iv'
    LEFT JOIN revenue_goals mg ON mg.goal_type = 'monthly' AND mg.service_category = 'drip_iv'
    WHERE a.week_start_date <= target_date AND a.week_end_date >= target_date
    ORDER BY a.upload_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_analytics_data_updated_at 
    BEFORE UPDATE ON analytics_data 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
