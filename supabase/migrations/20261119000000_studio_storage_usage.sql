-- How close the studio is to the Supabase free plan's limits (Lionel's #778).
--
-- The daily cron /api/cron/storage-check (lib/storage-usage.ts) emails the
-- studio inbox when the database passes 80% of 500 MB or Storage files pass
-- 80% of 1 GB. It needs pg_database_size() and the sizes in storage.objects,
-- neither of which PostgREST can reach, so this one function returns them,
-- plus the five biggest tables and Storage buckets for the "what to do" part
-- of the email.
--
-- security definer, so it can read storage.objects whatever its RLS says.
-- Execute is for service_role only: Supabase's default privileges grant every
-- new function in public to anon and authenticated, so those grants are
-- revoked explicitly below (nobody signed in or not should see these numbers).

CREATE OR REPLACE FUNCTION "public"."studio_storage_usage"()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
        'storage_bytes', coalesce((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o), 0),
        'storage_files', (SELECT count(*) FROM storage.objects),
        'tables', coalesce((
            SELECT jsonb_agg(jsonb_build_object('name', t.name, 'bytes', t.bytes) ORDER BY t.bytes DESC)
            FROM (
                SELECT n.nspname || '.' || c.relname AS name, pg_catalog.pg_total_relation_size(c.oid) AS bytes
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'm')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY 2 DESC
                LIMIT 5
            ) t
        ), '[]'::jsonb),
        'buckets', coalesce((
            SELECT jsonb_agg(jsonb_build_object('name', b.bucket_id, 'bytes', b.bytes, 'files', b.files) ORDER BY b.bytes DESC)
            FROM (
                SELECT o.bucket_id, coalesce(sum((o.metadata->>'size')::bigint), 0) AS bytes, count(*) AS files
                FROM storage.objects o
                GROUP BY o.bucket_id
                ORDER BY 2 DESC
                LIMIT 5
            ) b
        ), '[]'::jsonb)
    )
$$;

REVOKE ALL ON FUNCTION "public"."studio_storage_usage"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."studio_storage_usage"() TO service_role;

COMMENT ON FUNCTION "public"."studio_storage_usage"() IS
    'Database and Storage sizes for the daily storage check (lib/storage-usage.ts). service_role only.';
