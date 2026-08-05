REVOKE EXECUTE ON FUNCTION public.grant_daily_ai_credits() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hold_ai_credits(uuid, numeric, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_ai_credits(uuid, numeric, numeric, text, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_ai_credits(uuid, numeric, text, text) FROM anon, authenticated;