REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(TEXT, INTEGER) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_sync_lock(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_sync_lock(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(TEXT) TO service_role;