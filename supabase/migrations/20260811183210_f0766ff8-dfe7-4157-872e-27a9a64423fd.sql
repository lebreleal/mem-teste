UPDATE public.folders
SET is_archived = false, updated_at = now()
WHERE id IN (
  '0674de33-96f9-4ece-b7b8-0ffb1cac8d2d',
  '55f07048-a118-45cc-80f0-4cec00eb7e18',
  '2c5e3e9d-e5db-483c-9bde-85f4eb530dbe',
  'f04f9b2b-c040-4f76-808b-cd9d66c23239'
);