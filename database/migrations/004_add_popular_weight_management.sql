-- Add popular_weight_management column as TEXT ARRAY to match popular_injections type
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_weight_management TEXT[];

-- Update existing records to set weight management popular services
UPDATE analytics_data
SET popular_weight_management = ARRAY['Tirzepatide', 'Semaglutide']
WHERE week_start_date >= '2025-09-01';

-- Remove weight loss meds from popular_injections array
UPDATE analytics_data
SET popular_injections = ARRAY(
  SELECT elem FROM unnest(popular_injections) AS elem
  WHERE elem NOT IN ('Tirzepatide', 'Semaglutide')
)
WHERE week_start_date >= '2025-09-01'
AND popular_injections && ARRAY['Tirzepatide', 'Semaglutide'];

-- If popular_injections is now empty, set default
UPDATE analytics_data
SET popular_injections = ARRAY['B12 Injection', 'Vitamin D', 'Metabolism Boost']
WHERE week_start_date >= '2025-09-01'
AND (popular_injections IS NULL OR array_length(popular_injections, 1) IS NULL OR array_length(popular_injections, 1) = 0);
