-- Insert webhook_settings into site_settings if it doesn't exist
INSERT INTO public.site_settings (key, value)
VALUES ('webhook_settings', '{"url": "", "enabled": true}')
ON CONFLICT (key) DO NOTHING;