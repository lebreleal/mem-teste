
-- Clear selected_plan_id from all profiles first (FK constraint)
UPDATE profiles SET selected_plan_id = NULL WHERE selected_plan_id IS NOT NULL;

-- Delete all study plans
DELETE FROM study_plans;
