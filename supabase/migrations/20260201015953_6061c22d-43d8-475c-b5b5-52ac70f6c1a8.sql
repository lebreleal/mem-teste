-- Update the handle_new_user function to include email from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    document_type,
    document_number,
    company_name,
    full_name,
    phone,
    email
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'document_type', 'cnpj'),
    COALESCE(NEW.raw_user_meta_data->>'document_number', ''),
    NEW.raw_user_meta_data->>'company_name',
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.email
  );
  RETURN NEW;
END;
$function$;