
CREATE OR REPLACE FUNCTION public.delete_folder_cascade(p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM folders WHERE id = p_folder_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Move archived sub-folders to root instead of deleting
  UPDATE folders SET parent_id = NULL WHERE parent_id = p_folder_id AND is_archived = true;

  -- Recursively delete non-archived sub-folders
  FOR r IN SELECT id FROM folders WHERE parent_id = p_folder_id LOOP
    PERFORM delete_folder_cascade(r.id);
  END LOOP;

  -- Move archived decks to root instead of deleting
  UPDATE decks SET folder_id = NULL WHERE folder_id = p_folder_id AND is_archived = true;

  -- Delete non-archived decks (only non-archived remain after the UPDATE above)
  FOR r IN SELECT id FROM decks WHERE folder_id = p_folder_id LOOP
    PERFORM delete_deck_cascade(r.id);
  END LOOP;

  DELETE FROM folders WHERE id = p_folder_id;
END;
$function$;
