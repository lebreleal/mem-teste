-- Insert category settings for panel types
INSERT INTO public.site_settings (key, value)
VALUES ('category_settings', '{
  "outdoor": {
    "image_url": "",
    "visible": true,
    "is_main": true,
    "order": 1
  },
  "rental": {
    "image_url": "",
    "visible": true,
    "is_main": true,
    "order": 2
  },
  "indoor": {
    "image_url": "",
    "visible": true,
    "is_main": false,
    "order": 3
  }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;