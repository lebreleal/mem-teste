/*
  # Clean Admin Data - Keep Only N8N Field Config

  Deletes all admin-related tables and data while preserving user data and n8n_field_config
*/

DELETE FROM quote_accessories;
DELETE FROM quote_spare_parts;
DELETE FROM quotes;
DELETE FROM products;
DELETE FROM spare_parts;
DELETE FROM banners;
DELETE FROM cabinet_models;
DELETE FROM admin_quote_settings;
DELETE FROM admin_quote_field_mappings;
DELETE FROM admin_settings;
DELETE FROM included_items;