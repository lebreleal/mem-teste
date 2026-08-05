REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(integer) TO authenticated;