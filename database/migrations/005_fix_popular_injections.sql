-- Fix popular_injections by removing Tirzepatide and Semaglutide
-- These should only appear in popular_weight_management

-- Remove weight loss meds from popular_injections array (case-insensitive)
UPDATE analytics_data
SET popular_injections = ARRAY(
  SELECT elem FROM unnest(popular_injections) AS elem
  WHERE elem NOT ILIKE '%tirzepatide%' AND elem NOT ILIKE '%semaglutide%'
)
WHERE EXISTS (
  SELECT 1 FROM unnest(popular_injections) AS elem
  WHERE elem ILIKE '%tirzepatide%' OR elem ILIKE '%semaglutide%'
);

-- If popular_injections is now empty, set default
UPDATE analytics_data
SET popular_injections = ARRAY['B12 Injection', 'Vitamin D', 'Metabolism Boost']
WHERE (popular_injections IS NULL OR array_length(popular_injections, 1) IS NULL OR array_length(popular_injections, 1) = 0);

-- Verify the fix
SELECT 
  week_start_date, 
  popular_injections, 
  popular_weight_management 
FROM analytics_data 
ORDER BY week_start_date DESC 
LIMIT 5;
