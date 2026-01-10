--
-- PostgreSQL database dump
--

\restrict qN1cw1WF0ZHNaAaq2LCrKOakDypK4l1EbpXraXwYUa9EZIKxPdoBY7iYBFKpPzV

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO supabase_admin;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql;


ALTER SCHEMA graphql OWNER TO supabase_admin;

--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql_public;


ALTER SCHEMA graphql_public OWNER TO supabase_admin;

--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--

CREATE SCHEMA pgbouncer;


ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA realtime;


ALTER SCHEMA realtime OWNER TO supabase_admin;

--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO supabase_admin;

--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO supabase_admin;

--
-- Name: moddatetime; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;


--
-- Name: EXTENSION moddatetime; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION moddatetime IS 'functions for tracking last modification time';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE auth.aal_level OWNER TO supabase_auth_admin;

--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


ALTER TYPE auth.code_challenge_method OWNER TO supabase_auth_admin;

--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE auth.factor_status OWNER TO supabase_auth_admin;

--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


ALTER TYPE auth.oauth_authorization_status OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


ALTER TYPE auth.oauth_client_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


ALTER TYPE auth.oauth_registration_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


ALTER TYPE auth.oauth_response_type OWNER TO supabase_auth_admin;

--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE auth.one_time_token_type OWNER TO supabase_auth_admin;

--
-- Name: action; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


ALTER TYPE realtime.action OWNER TO supabase_admin;

--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


ALTER TYPE realtime.equality_op OWNER TO supabase_admin;

--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


ALTER TYPE realtime.user_defined_filter OWNER TO supabase_admin;

--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


ALTER TYPE realtime.wal_column OWNER TO supabase_admin;

--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


ALTER TYPE realtime.wal_rls OWNER TO supabase_admin;

--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE storage.buckettype OWNER TO supabase_storage_admin;

--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


ALTER FUNCTION extensions.grant_pg_graphql_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO supabase_admin;

--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


ALTER FUNCTION extensions.set_graphql_placeholder() OWNER TO supabase_admin;

--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: supabase_admin
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO supabase_admin;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_updated_at() OWNER TO postgres;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION public.is_admin() OWNER TO postgres;

--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_;

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


ALTER FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) OWNER TO supabase_admin;

--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


ALTER FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) OWNER TO supabase_admin;

--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


ALTER FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) OWNER TO supabase_admin;

--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


ALTER FUNCTION realtime."cast"(val text, type_ regtype) OWNER TO supabase_admin;

--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) OWNER TO supabase_admin;

--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


ALTER FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) OWNER TO supabase_admin;

--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


ALTER FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) OWNER TO supabase_admin;

--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


ALTER FUNCTION realtime.quote_wal2json(entity regclass) OWNER TO supabase_admin;

--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) OWNER TO supabase_admin;

--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


ALTER FUNCTION realtime.subscription_check_filters() OWNER TO supabase_admin;

--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


ALTER FUNCTION realtime.to_regrole(role_name text) OWNER TO supabase_admin;

--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: postgres
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


ALTER FUNCTION realtime.topic() OWNER TO postgres;

--
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


ALTER FUNCTION storage.add_prefixes(_bucket_id text, _name text) OWNER TO supabase_storage_admin;

--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) OWNER TO supabase_storage_admin;

--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


ALTER FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) OWNER TO supabase_storage_admin;

--
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


ALTER FUNCTION storage.delete_prefix(_bucket_id text, _name text) OWNER TO supabase_storage_admin;

--
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


ALTER FUNCTION storage.delete_prefix_hierarchy_trigger() OWNER TO supabase_storage_admin;

--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION storage.enforce_bucket_name_length() OWNER TO supabase_storage_admin;

--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION storage.extension(name text) OWNER TO supabase_storage_admin;

--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION storage.filename(name text) OWNER TO supabase_storage_admin;

--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION storage.foldername(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


ALTER FUNCTION storage.get_level(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


ALTER FUNCTION storage.get_prefix(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


ALTER FUNCTION storage.get_prefixes(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION storage.get_size_by_bucket() OWNER TO supabase_storage_admin;

--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, next_key_token text, next_upload_token text) OWNER TO supabase_storage_admin;

--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


ALTER FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text) OWNER TO supabase_storage_admin;

--
-- Name: lock_top_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket text;
    v_top text;
BEGIN
    FOR v_bucket, v_top IN
        SELECT DISTINCT t.bucket_id,
            split_part(t.name, '/', 1) AS top
        FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        WHERE t.name <> ''
        ORDER BY 1, 2
        LOOP
            PERFORM pg_advisory_xact_lock(hashtextextended(v_bucket || '/' || v_top, 0));
        END LOOP;
END;
$$;


ALTER FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) OWNER TO supabase_storage_admin;

--
-- Name: objects_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.objects_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.objects_delete_cleanup() OWNER TO supabase_storage_admin;

--
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


ALTER FUNCTION storage.objects_insert_prefix_trigger() OWNER TO supabase_storage_admin;

--
-- Name: objects_update_cleanup(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.objects_update_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    -- NEW - OLD (destinations to create prefixes for)
    v_add_bucket_ids text[];
    v_add_names      text[];

    -- OLD - NEW (sources to prune)
    v_src_bucket_ids text[];
    v_src_names      text[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NULL;
    END IF;

    -- 1) Compute NEW−OLD (added paths) and OLD−NEW (moved-away paths)
    WITH added AS (
        SELECT n.bucket_id, n.name
        FROM new_rows n
        WHERE n.name <> '' AND position('/' in n.name) > 0
        EXCEPT
        SELECT o.bucket_id, o.name FROM old_rows o WHERE o.name <> ''
    ),
    moved AS (
         SELECT o.bucket_id, o.name
         FROM old_rows o
         WHERE o.name <> ''
         EXCEPT
         SELECT n.bucket_id, n.name FROM new_rows n WHERE n.name <> ''
    )
    SELECT
        -- arrays for ADDED (dest) in stable order
        COALESCE( (SELECT array_agg(a.bucket_id ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        COALESCE( (SELECT array_agg(a.name      ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        -- arrays for MOVED (src) in stable order
        COALESCE( (SELECT array_agg(m.bucket_id ORDER BY m.bucket_id, m.name) FROM moved m), '{}' ),
        COALESCE( (SELECT array_agg(m.name      ORDER BY m.bucket_id, m.name) FROM moved m), '{}' )
    INTO v_add_bucket_ids, v_add_names, v_src_bucket_ids, v_src_names;

    -- Nothing to do?
    IF (array_length(v_add_bucket_ids, 1) IS NULL) AND (array_length(v_src_bucket_ids, 1) IS NULL) THEN
        RETURN NULL;
    END IF;

    -- 2) Take per-(bucket, top) locks: ALL prefixes in consistent global order to prevent deadlocks
    DECLARE
        v_all_bucket_ids text[];
        v_all_names text[];
    BEGIN
        -- Combine source and destination arrays for consistent lock ordering
        v_all_bucket_ids := COALESCE(v_src_bucket_ids, '{}') || COALESCE(v_add_bucket_ids, '{}');
        v_all_names := COALESCE(v_src_names, '{}') || COALESCE(v_add_names, '{}');

        -- Single lock call ensures consistent global ordering across all transactions
        IF array_length(v_all_bucket_ids, 1) IS NOT NULL THEN
            PERFORM storage.lock_top_prefixes(v_all_bucket_ids, v_all_names);
        END IF;
    END;

    -- 3) Create destination prefixes (NEW−OLD) BEFORE pruning sources
    IF array_length(v_add_bucket_ids, 1) IS NOT NULL THEN
        WITH candidates AS (
            SELECT DISTINCT t.bucket_id, unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(v_add_bucket_ids, v_add_names) AS t(bucket_id, name)
            WHERE name <> ''
        )
        INSERT INTO storage.prefixes (bucket_id, name)
        SELECT c.bucket_id, c.name
        FROM candidates c
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4) Prune source prefixes bottom-up for OLD−NEW
    IF array_length(v_src_bucket_ids, 1) IS NOT NULL THEN
        -- re-entrancy guard so DELETE on prefixes won't recurse
        IF current_setting('storage.gc.prefixes', true) <> '1' THEN
            PERFORM set_config('storage.gc.prefixes', '1', true);
        END IF;

        PERFORM storage.delete_leaf_prefixes(v_src_bucket_ids, v_src_names);
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.objects_update_cleanup() OWNER TO supabase_storage_admin;

--
-- Name: objects_update_level_trigger(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.objects_update_level_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Set the new level
        NEW."level" := "storage"."get_level"(NEW."name");
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION storage.objects_update_level_trigger() OWNER TO supabase_storage_admin;

--
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


ALTER FUNCTION storage.objects_update_prefix_trigger() OWNER TO supabase_storage_admin;

--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION storage.operation() OWNER TO supabase_storage_admin;

--
-- Name: prefixes_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.prefixes_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.prefixes_delete_cleanup() OWNER TO supabase_storage_admin;

--
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


ALTER FUNCTION storage.prefixes_insert_trigger() OWNER TO supabase_storage_admin;

--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


ALTER FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


ALTER FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


ALTER FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    sort_col text;
    sort_ord text;
    cursor_op text;
    cursor_expr text;
    sort_expr text;
BEGIN
    -- Validate sort_order
    sort_ord := lower(sort_order);
    IF sort_ord NOT IN ('asc', 'desc') THEN
        sort_ord := 'asc';
    END IF;

    -- Determine cursor comparison operator
    IF sort_ord = 'asc' THEN
        cursor_op := '>';
    ELSE
        cursor_op := '<';
    END IF;
    
    sort_col := lower(sort_column);
    -- Validate sort column  
    IF sort_col IN ('updated_at', 'created_at') THEN
        cursor_expr := format(
            '($5 = '''' OR ROW(date_trunc(''milliseconds'', %I), name COLLATE "C") %s ROW(COALESCE(NULLIF($6, '''')::timestamptz, ''epoch''::timestamptz), $5))',
            sort_col, cursor_op
        );
        sort_expr := format(
            'COALESCE(date_trunc(''milliseconds'', %I), ''epoch''::timestamptz) %s, name COLLATE "C" %s',
            sort_col, sort_ord, sort_ord
        );
    ELSE
        cursor_expr := format('($5 = '''' OR name COLLATE "C" %s $5)', cursor_op);
        sort_expr := format('name COLLATE "C" %s', sort_ord);
    END IF;

    RETURN QUERY EXECUTE format(
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    NULL::uuid AS id,
                    updated_at,
                    created_at,
                    NULL::timestamptz AS last_accessed_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
            UNION ALL
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    id,
                    updated_at,
                    created_at,
                    last_accessed_at,
                    metadata
                FROM storage.objects
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
        ) obj
        ORDER BY %s
        LIMIT $3
        $sql$,
        cursor_expr,    -- prefixes WHERE
        sort_expr,      -- prefixes ORDER BY
        cursor_expr,    -- objects WHERE
        sort_expr,      -- objects ORDER BY
        sort_expr       -- final ORDER BY
    )
    USING prefix, bucket_name, limits, levels, start_after, sort_column_after;
END;
$_$;


ALTER FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text, sort_order text, sort_column text, sort_column_after text) OWNER TO supabase_storage_admin;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION storage.update_updated_at_column() OWNER TO supabase_storage_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin;

--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;

--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.flow_state IS 'stores metadata for pkce logins';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE auth.identities OWNER TO supabase_auth_admin;

--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.instances OWNER TO supabase_auth_admin;

--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


ALTER TABLE auth.mfa_amr_claims OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


ALTER TABLE auth.mfa_challenges OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


ALTER TABLE auth.mfa_factors OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


ALTER TABLE auth.oauth_authorizations OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE auth.oauth_client_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048))
);


ALTER TABLE auth.oauth_clients OWNER TO supabase_auth_admin;

--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


ALTER TABLE auth.oauth_consents OWNER TO supabase_auth_admin;

--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


ALTER TABLE auth.one_time_tokens OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;

--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: supabase_auth_admin
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.refresh_tokens_id_seq OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: supabase_auth_admin
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


ALTER TABLE auth.saml_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


ALTER TABLE auth.saml_relay_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;

--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


ALTER TABLE auth.sso_domains OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


ALTER TABLE auth.sso_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


ALTER TABLE auth.users OWNER TO supabase_auth_admin;

--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: auth_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_email text NOT NULL,
    event_type text NOT NULL,
    status text NOT NULL,
    details text,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.auth_audit_logs OWNER TO postgres;

--
-- Name: TABLE auth_audit_logs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.auth_audit_logs IS 'Logs of authentication attempts and password resets for troubleshooting.';


--
-- Name: classroom_annotations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classroom_annotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id text NOT NULL,
    song_id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ONLY public.classroom_annotations REPLICA IDENTITY FULL;


ALTER TABLE public.classroom_annotations OWNER TO postgres;

--
-- Name: classroom_presets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classroom_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    preset_type text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.classroom_presets OWNER TO postgres;

--
-- Name: classroom_recordings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classroom_recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id text NOT NULL,
    teacher_id text NOT NULL,
    filename text NOT NULL,
    url text NOT NULL,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.classroom_recordings OWNER TO postgres;

--
-- Name: classroom_rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classroom_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_name text NOT NULL,
    created_by text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.classroom_rooms OWNER TO postgres;

--
-- Name: event_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    student_id uuid,
    status text DEFAULT 'pending'::text,
    student_notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'going'::text, 'not_going'::text, 'declined'::text])))
);


ALTER TABLE public.event_invites OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 60,
    location_type text NOT NULL,
    location_details text,
    description text,
    rsvp_deadline timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    duration integer DEFAULT 60 NOT NULL,
    zoom_meeting_id text,
    CONSTRAINT events_location_type_check CHECK ((location_type = ANY (ARRAY['virtual'::text, 'physical'::text])))
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    experience text NOT NULL,
    goals text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inquiries_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'student'::text, 'archived'::text])))
);


ALTER TABLE public.inquiries OWNER TO postgres;

--
-- Name: lessons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lessons (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    student_id uuid NOT NULL,
    date date NOT NULL,
    "time" time without time zone NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    notes text,
    video_url text,
    sheet_music_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    duration integer DEFAULT 60 NOT NULL,
    zoom_link text,
    zoom_meeting_id text,
    credit_snapshot integer,
    reminder_24h_sent boolean DEFAULT false,
    reminder_2h_sent boolean DEFAULT false,
    reminder_15m_sent boolean DEFAULT false,
    is_confirmed boolean DEFAULT false,
    CONSTRAINT lessons_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);


ALTER TABLE public.lessons OWNER TO postgres;

--
-- Name: COLUMN lessons.zoom_meeting_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lessons.zoom_meeting_id IS 'Unique Zoom Meeting ID (used for deletion/updates)';


--
-- Name: makeup_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.makeup_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_time timestamp with time zone NOT NULL,
    is_taken boolean DEFAULT false,
    end_time timestamp with time zone
);


ALTER TABLE public.makeup_slots OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachments jsonb
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: COLUMN messages.attachments; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.messages.attachments IS 'JSON array of attachments: [{type: "image"|"file", url: string, name: string, size: number}]';


--
-- Name: pieces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    composer text,
    difficulty text,
    youtube_url text,
    xml_url text NOT NULL,
    mp3_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.pieces OWNER TO postgres;

--
-- Name: pricing_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pricing_tiers (
    duration integer NOT NULL,
    single_price integer NOT NULL,
    pack_price integer NOT NULL
);


ALTER TABLE public.pricing_tiers OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    email text,
    phone text,
    role text DEFAULT 'student'::text NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    credits_total integer DEFAULT 0 NOT NULL,
    balance_due numeric(10,2) DEFAULT 0.00 NOT NULL,
    zoom_link text,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lesson_duration integer DEFAULT 30,
    default_meeting_link text,
    lesson_day text,
    available_hours jsonb DEFAULT '[]'::jsonb,
    timezone text DEFAULT 'UTC'::text,
    studio_name text,
    parent_email text,
    public_id text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: COLUMN profiles.lesson_day; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.lesson_day IS 'Recurring lesson day for the student (e.g., "Monday")';


--
-- Name: COLUMN profiles.available_hours; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.available_hours IS 'Array of availability objects: [{ day: "Monday", enabled: boolean, start: "09:00", end: "17:00" }]';


--
-- Name: COLUMN profiles.studio_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.studio_name IS 'The display name for the teacher''s studio (e.g. "Lionel Yu Piano Studio")';


--
-- Name: COLUMN profiles.parent_email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.parent_email IS 'Secondary email for parents (CC on invites)';


--
-- Name: COLUMN profiles.public_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.public_id IS 'Public identifier for external integrations';


--
-- Name: resource_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    student_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.resource_assignments OWNER TO postgres;

--
-- Name: resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    file_url text NOT NULL,
    file_type text DEFAULT 'pdf'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT resources_category_check CHECK ((category = ANY (ARRAY['Sheet Music'::text, 'Theory'::text, 'Scales'::text, 'Exercises'::text, 'Recording'::text])))
);


ALTER TABLE public.resources OWNER TO postgres;

--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    name text NOT NULL,
    rating integer NOT NULL,
    text text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: site_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_pages (
    id text DEFAULT 'home'::text NOT NULL,
    html_template text,
    script_content text,
    variable_values jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


ALTER TABLE public.site_pages OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: postgres
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


ALTER TABLE realtime.messages OWNER TO postgres;

--
-- Name: messages_2026_01_01; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_01 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_01 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_02; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_02 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_02 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_03; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_03 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_03 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_04; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_04 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_04 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_05; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_05 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_06; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_06 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_06 OWNER TO supabase_admin;

--
-- Name: messages_2026_01_07; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_01_07 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE realtime.messages_2026_01_07 OWNER TO supabase_admin;

--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


ALTER TABLE realtime.schema_migrations OWNER TO supabase_admin;

--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE realtime.subscription OWNER TO supabase_admin;

--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;

--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE storage.buckets_analytics OWNER TO supabase_storage_admin;

--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.buckets_vectors OWNER TO supabase_storage_admin;

--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;

--
-- Name: objects; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


ALTER TABLE storage.objects OWNER TO supabase_storage_admin;

--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE storage.prefixes OWNER TO supabase_storage_admin;

--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


ALTER TABLE storage.s3_multipart_uploads OWNER TO supabase_storage_admin;

--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.s3_multipart_uploads_parts OWNER TO supabase_storage_admin;

--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.vector_indexes OWNER TO supabase_storage_admin;

--
-- Name: messages_2026_01_01; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_01 FOR VALUES FROM ('2026-01-01 00:00:00') TO ('2026-01-02 00:00:00');


--
-- Name: messages_2026_01_02; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_02 FOR VALUES FROM ('2026-01-02 00:00:00') TO ('2026-01-03 00:00:00');


--
-- Name: messages_2026_01_03; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_03 FOR VALUES FROM ('2026-01-03 00:00:00') TO ('2026-01-04 00:00:00');


--
-- Name: messages_2026_01_04; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_04 FOR VALUES FROM ('2026-01-04 00:00:00') TO ('2026-01-05 00:00:00');


--
-- Name: messages_2026_01_05; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_05 FOR VALUES FROM ('2026-01-05 00:00:00') TO ('2026-01-06 00:00:00');


--
-- Name: messages_2026_01_06; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_06 FOR VALUES FROM ('2026-01-06 00:00:00') TO ('2026-01-07 00:00:00');


--
-- Name: messages_2026_01_07; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_01_07 FOR VALUES FROM ('2026-01-07 00:00:00') TO ('2026-01-08 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, provider_access_token, provider_refresh_token, created_at, updated_at, authentication_method, auth_code_issued_at) FROM stdin;
7719c651-33eb-45f0-a77f-128b5e6ea76f	7664c5ce-4f36-4514-9a4f-2353c4e769fa	dfbe35ce-47dd-4b48-9fb1-952134e9d621	s256	bUqjol5hs6gwmYAnAmyJx002pMYqtU48yfCdoNL_KBQ	recovery			2025-12-23 00:01:20.897771+00	2025-12-23 00:01:20.897771+00	recovery	\N
574b5212-2153-4fc6-8f5e-f16bfe2002df	3a7b64a1-67bd-4d16-a921-9215046da9c5	d06b6096-8c05-42a9-bc3f-215c16a0bfdd	s256	mk1nl8BMLeN0zmdw8NZB11tZ67o3OsmqobuJtlWIFfI	recovery			2025-12-14 11:21:52.654493+00	2025-12-14 11:21:52.654493+00	recovery	\N
c8f53894-8785-4e09-a011-ba7e36c31550	ea536caa-89cf-4997-a649-577f6c64f990	dc462ebd-b6b8-4a84-9727-92bd5c9143dc	s256	Y7Bu8hYwPS-kIKZu-GsH1FZX3-YGMaFW1fz_uu-c7Kk	recovery			2025-12-15 00:05:08.777622+00	2025-12-15 00:05:08.777622+00	recovery	\N
414ac8b9-347f-4b30-8d6b-0d3847443182	ea536caa-89cf-4997-a649-577f6c64f990	df018cdf-4eb8-482f-80ee-0085e2fb9e61	s256	-sYscMS70fIKj1E9w25a2dOzMptudEqV8FPJ9J--Zmk	recovery			2025-12-15 00:07:52.06095+00	2025-12-15 00:07:52.06095+00	recovery	\N
eafd367a-4a7d-4084-9f13-7c1f612d5f14	ea536caa-89cf-4997-a649-577f6c64f990	234c4eb7-13ea-41d5-b395-dd4634986250	s256	-CbT5S62tSBSHk-CVUxrwvKdoHgtIpFLiAqMZ_OmPZI	recovery			2025-12-15 00:10:51.723637+00	2025-12-15 00:10:51.723637+00	recovery	\N
a4b4fdbc-2ade-4cb6-9433-9140d08c7e10	3a7b64a1-67bd-4d16-a921-9215046da9c5	2a9c2e8b-57db-4960-98e8-c190d4f243b7	s256	eYMKeBspLilh8rUzA84e4s_cQ7I-pIISWmfHkYLg03Y	recovery			2025-12-15 09:19:42.367043+00	2025-12-15 09:19:42.367043+00	recovery	\N
95016afe-e1a9-49ba-af37-652d66dab2b1	3a7b64a1-67bd-4d16-a921-9215046da9c5	7928f965-da57-4f58-bdab-fd803ec0618b	s256	UDYvUwWJEJfcdtIxU1NGnCj6N3nJ_1m3SGjtc-8Kmf0	recovery			2025-12-15 13:29:55.854548+00	2025-12-15 13:29:55.854548+00	recovery	\N
3d97c356-2a87-4dc3-ac68-7bc4591baccb	3a7b64a1-67bd-4d16-a921-9215046da9c5	af087d4d-b50e-4da9-a534-5477cec4be07	s256	VR2npNGfB9Iwdkj5ilHxIdXVmIdggbN98m_6BwSKRmU	recovery			2025-12-15 13:35:55.12348+00	2025-12-15 13:35:55.12348+00	recovery	\N
55af93b8-d22b-41d2-8307-9d88d0562977	3a7b64a1-67bd-4d16-a921-9215046da9c5	3d36791a-c46e-4b74-a8a8-8c0499fa6505	s256	4DjuOcJg7YGSgx6kBq1FBu8NhsQjFF2_TXvwPwog__I	recovery			2025-12-15 13:38:22.437368+00	2025-12-15 13:38:22.437368+00	recovery	\N
9e69f6f5-a1e8-4c1a-9195-14e994cde8e2	3a7b64a1-67bd-4d16-a921-9215046da9c5	b4e807bd-f901-43a2-87d7-ad4a5fc97795	s256	qqgZQdBuMo8mEscQ0Rx3SpAaHTqSloPFNG5PmL8zuOI	recovery			2025-12-15 22:33:32.297976+00	2025-12-15 22:33:32.297976+00	recovery	\N
03d5fba9-2229-4b4e-9612-2dfb140777ca	e8a5996d-484f-40f8-bd17-eb6cf8323baf	3275c3f0-a0fc-402b-af12-765c42b659fb	s256	fBsP31j1nWy58n4CtmCCjYvVi2BCHxTVBWzOzN8MGK8	recovery			2025-12-19 15:12:58.413103+00	2025-12-19 15:12:58.413103+00	recovery	\N
ecd33543-a6f6-4674-ba72-420f20127af8	e8a5996d-484f-40f8-bd17-eb6cf8323baf	cb759cf3-bbec-4010-b9a3-29e28b0a8aab	s256	tx3IqIAwkpGpaxVdLiTohV4bMMkXL5188CeMyec8pt8	recovery			2025-12-19 15:13:01.229759+00	2025-12-19 15:13:01.229759+00	recovery	\N
c30e2eeb-c6d3-40f8-ac23-25b219384f96	10128b61-f8e6-44cf-86af-7c7f4669705a	c8e5a90f-2723-4b61-bc28-5e226cae4b88	s256	B03UbaaV9JuyLlCpzhLJUF3WFglbzUHpf9ZaCBWXhhM	recovery			2025-12-20 06:48:02.098618+00	2025-12-20 06:48:02.098618+00	recovery	\N
4896f5e5-a1f4-4578-932c-4b8fda3034d1	ac966367-dc7b-4934-b668-847a84e4ee85	fa6078d0-5845-472c-9b02-59eff1be71c0	s256	RltHwqax3PXjFcQbouilBx93u_xS1EplG4Xh0a3F8l4	recovery			2025-12-20 15:03:18.815449+00	2025-12-20 15:03:30.112732+00	recovery	2025-12-20 15:03:30.112675+00
df244120-cc09-4c9f-993b-09da9178631b	ac966367-dc7b-4934-b668-847a84e4ee85	0db877dd-2466-418d-a76e-0461663449a8	s256	-xg1wlU0K3TfSVnN3lLBj6u3wTtJsyZWsu2w0qEx5sk	recovery			2025-12-20 15:05:38.17302+00	2025-12-20 15:06:00.326025+00	recovery	2025-12-20 15:06:00.325979+00
14d00d31-8fdd-4035-8a74-fc6834194357	0d15924c-5764-431d-ac1f-34a967c9285d	681058e5-c568-4ff7-a2b9-6fe9648e70cd	s256	uKuoXAxKPdhEQu9y9rYdvKP57ax8jU2o-gyniJgwHak	recovery			2025-12-20 16:31:58.595997+00	2025-12-20 16:31:58.595997+00	recovery	\N
0b539370-674c-4b70-b602-a0aa7d21e6fb	e8a5996d-484f-40f8-bd17-eb6cf8323baf	e8ac4f37-5e8e-4a04-af05-6c04aa349780	s256	axDk3001YgzxwpHIWfOHi9V6oLT0pJjCNz1ebxvWIqM	recovery			2025-12-21 20:44:52.568749+00	2025-12-21 20:44:52.568749+00	recovery	\N
2804ee08-5ac1-4efe-812b-6aa863bf55df	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	42640eb3-70b6-42df-8acd-c337551baa2d	s256	qdws1zTSjIO54kKEgpItZvrqc03CX117-zRVBRkv3dI	recovery			2025-12-28 22:38:19.707539+00	2025-12-28 22:38:31.488065+00	recovery	2025-12-28 22:38:31.488016+00
2753ff66-e3e8-49ab-80b0-7b3269d96f77	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	7ceeb821-ee57-4376-bc65-8852be85dda2	s256	atOIl-cOItJ488pbKwCLqsn1LHrzi4sSqaFj3Uc2eD4	recovery			2025-12-29 22:38:26.84903+00	2025-12-29 22:38:26.84903+00	recovery	\N
7881c090-5cc7-465d-b9cd-419a195a5a01	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	403a0098-f070-4591-a9c1-1aa05a11fe14	s256	OIp0i1Ewi6S2Fv6kZoRgk-ZLueB6yqxemiKLH2BXUuw	recovery			2025-12-29 22:38:50.361852+00	2025-12-29 22:38:50.361852+00	recovery	\N
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
615b4a9c-f8fc-42ca-bf23-b863a18d1788	615b4a9c-f8fc-42ca-bf23-b863a18d1788	{"sub": "615b4a9c-f8fc-42ca-bf23-b863a18d1788", "email": "hello@dreamplaypianos.com", "email_verified": false, "phone_verified": false}	email	2025-12-29 13:59:39.346176+00	2025-12-29 13:59:39.346239+00	2025-12-29 13:59:39.346239+00	7e11bc23-6114-46e3-bf48-e72ec4ba6639
3a7b64a1-67bd-4d16-a921-9215046da9c5	3a7b64a1-67bd-4d16-a921-9215046da9c5	{"sub": "3a7b64a1-67bd-4d16-a921-9215046da9c5", "email": "yulionel829@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-01-01 16:12:34.558088+00	2026-01-01 16:12:34.558669+00	2026-01-01 16:12:34.558669+00	1324a6dd-b4b6-4edb-9964-27f1f44c7518
356415aa-1051-4ed2-a29d-7d1c329f7e0f	356415aa-1051-4ed2-a29d-7d1c329f7e0f	{"sub": "356415aa-1051-4ed2-a29d-7d1c329f7e0f", "email": "djsputty@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-01-02 16:11:36.389345+00	2026-01-02 16:11:36.389404+00	2026-01-02 16:11:36.389404+00	a1d2660c-8b7f-4aca-b0b1-4c0e6a251080
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) FROM stdin;
45ea72cd-9672-405c-88df-ad6bf083fc58	2026-01-01 22:56:56.132385+00	2026-01-01 22:56:56.132385+00	password	73bb5587-34c9-4039-8ec6-3d4a9a4a1a46
7c92b800-01c7-4abe-b3b8-ae83b37c224d	2026-01-01 23:12:23.529241+00	2026-01-01 23:12:23.529241+00	password	83d4469f-cda3-4ead-9a1f-07fded736014
701a5e30-d3ad-40b5-b627-0e915e8fea15	2026-01-01 23:19:57.790553+00	2026-01-01 23:19:57.790553+00	password	27347413-7938-4a16-b2e0-b086b95c2963
f8c40e14-2e0a-40c8-8306-059a78b4aace	2026-01-01 23:22:23.876838+00	2026-01-01 23:22:23.876838+00	password	e30dca74-a66b-4593-aead-ce5dc23ab929
1f7e129c-655f-4179-b66f-30617cb0b6be	2026-01-02 00:03:10.185631+00	2026-01-02 00:03:10.185631+00	password	bdd1062c-f572-48ce-b729-a7369cd34280
30b2fefb-49df-417d-bab0-462f70938a73	2026-01-02 16:08:34.058232+00	2026-01-02 16:08:34.058232+00	password	9810810c-418f-46c8-b8a5-2d5abe2cc4d2
9a9e2ec1-b507-47f4-ad8a-e6c4499c2ef8	2026-01-02 17:15:18.000526+00	2026-01-02 17:15:18.000526+00	password	c8f9f87a-37b4-4725-b4c7-6c0dceb57176
f5c40668-7bf1-4a7e-af9e-4d87851499fd	2026-01-02 18:59:03.829543+00	2026-01-02 18:59:03.829543+00	password	66f71c00-bc1e-4511-924f-c7432dec4a92
14167463-302f-46f1-ae1d-98be0b0fe5c9	2026-01-02 19:01:30.172201+00	2026-01-02 19:01:30.172201+00	password	bd4e948d-27d3-49ef-a427-b67ede1536f4
3ee2b09a-fee0-418a-9368-131205f19441	2026-01-02 19:34:19.362663+00	2026-01-02 19:34:19.362663+00	password	5c33f6d4-2bad-4b4b-abd8-4962200f031b
b3d2b693-5b09-4bbf-a750-6a697d5b83fa	2026-01-02 20:59:41.452131+00	2026-01-02 20:59:41.452131+00	password	b75a88f8-948e-4ac1-87ad-9eed827f41ec
d93652a5-b928-47b5-b441-9383db0d50c4	2026-01-02 22:16:31.517739+00	2026-01-02 22:16:31.517739+00	password	c2fffed7-e83f-4292-b44c-81c720a68b76
7c046fc3-2b81-4e53-a3ac-50e8973c5aa3	2026-01-02 22:54:03.725137+00	2026-01-02 22:54:03.725137+00	password	31a0ccef-febe-479f-a22e-d29e9528c4a6
84c32559-370f-433b-a747-e5f006e4bfa0	2026-01-03 03:32:54.770502+00	2026-01-03 03:32:54.770502+00	password	d3f52846-068d-45e7-8314-b576c2251b99
0b331a89-222d-43c6-9f62-3ae76f9119dd	2026-01-03 10:12:01.781499+00	2026-01-03 10:12:01.781499+00	password	c6a2c6ca-5217-45f8-88a7-3385cd1c8604
46059b45-877e-4fe7-b9be-dcbf96c72736	2026-01-03 10:26:33.0347+00	2026-01-03 10:26:33.0347+00	password	1e2e41e2-aba5-43e5-9ab5-fd39c083c710
ba8b7f81-e8e9-41ee-8f87-03f02c8d57e5	2026-01-03 15:07:52.120856+00	2026-01-03 15:07:52.120856+00	password	27040140-8ea0-4119-ae5a-810f6f5d2800
3dc41a85-2f6f-49f9-82c8-6f60ea3f4231	2026-01-03 15:09:49.240691+00	2026-01-03 15:09:49.240691+00	password	d4c40624-bf0a-47c8-bb30-2fd85395ce96
efd3307e-02d2-45f4-a87d-765c17fb610e	2026-01-03 17:22:48.362901+00	2026-01-03 17:22:48.362901+00	password	d00ccf25-4eeb-40cb-9a9a-fbfebdb6298a
7d22a68b-9bfa-4918-a923-8a0d22ce0f2d	2026-01-03 22:28:29.45748+00	2026-01-03 22:28:29.45748+00	password	bfa47c77-2f34-456a-bd3b-71c901766b16
e0f96252-9bb9-4de9-9c05-7e70b83df10c	2025-12-27 14:19:25.118357+00	2025-12-27 14:19:25.118357+00	password	30abe070-3d29-4b8e-8b80-b7318d107d23
26858ed2-b7b0-4eba-9898-90986faa0ba3	2025-12-27 18:18:32.52187+00	2025-12-27 18:18:32.52187+00	password	df441886-b8ba-49be-b25b-252d916ff8c9
15d456a2-f336-4fde-8188-296d45feb193	2026-01-03 22:39:40.941338+00	2026-01-03 22:39:40.941338+00	password	ec531a33-7c5a-4497-9756-6a6f04ce4deb
bffcfe56-fa0e-4e8a-823e-7991699c46fc	2026-01-03 22:55:49.60588+00	2026-01-03 22:55:49.60588+00	password	c69a151a-ab4d-4aa8-86ed-e9d82bea99af
194f2742-a292-4bbc-b2d5-769c8949ed4b	2025-12-28 21:01:07.909321+00	2025-12-28 21:01:07.909321+00	password	b6ea76ab-f3f1-41d6-8de2-2f1586efa5d9
0dfaccd1-fb18-4db7-a65f-d8ca5db62c18	2025-12-28 21:28:50.206318+00	2025-12-28 21:28:50.206318+00	password	c1720ef7-4849-424d-9ee2-7be1d11cbc2a
8e894e53-c311-4da8-a10f-b177786c7862	2025-12-28 23:11:32.221127+00	2025-12-28 23:11:32.221127+00	password	7aa7ed5c-b7d2-427a-b65c-62e68a0e24ff
61269f00-2fc7-477d-b8c6-b19e9f088a20	2026-01-04 00:52:48.668986+00	2026-01-04 00:52:48.668986+00	password	3179086f-c8bc-48ad-98dc-3bc0d620727d
f04ac7b2-054b-4ca5-9d1e-26f12fa6baf7	2026-01-04 00:55:00.374234+00	2026-01-04 00:55:00.374234+00	password	fa22b491-aa78-467f-82ac-4dc67c14481f
b31959ee-133c-489b-9362-4068aa95ac7d	2026-01-04 01:24:19.716346+00	2026-01-04 01:24:19.716346+00	password	82b41cae-8a34-4870-8d0a-fcfa464620f1
9cf9b423-95c7-4a33-9304-ce9b2f71e5d5	2026-01-04 02:47:22.49896+00	2026-01-04 02:47:22.49896+00	password	0de04519-73c6-4b6d-978a-b0700dd791dc
448995fe-bb39-495b-a0e6-eee3344ad0f0	2026-01-04 02:48:18.944666+00	2026-01-04 02:48:18.944666+00	password	a78d9352-2eb0-4297-aa9b-2becd30ce102
0ca5c3f8-4cdf-4004-a2be-d3c5d5df0aa8	2025-12-29 22:04:47.295826+00	2025-12-29 22:04:47.295826+00	password	76f4c558-52f6-42cb-b1dc-57b36b03317e
200ab6f8-22fb-4f4c-8396-13cbb63b7b98	2025-12-29 22:39:05.390244+00	2025-12-29 22:39:05.390244+00	password	02ac13f9-7c25-40af-ad49-c189e2e44510
5c46e28f-cf6e-4f67-82d1-509f27d36a76	2025-12-29 22:44:38.473304+00	2025-12-29 22:44:38.473304+00	password	f9c7d1b0-926e-4f50-959e-718c9ae073b0
77f47c05-7f36-4397-af02-496f83af8eab	2026-01-04 02:57:25.957561+00	2026-01-04 02:57:25.957561+00	password	8684a08f-8575-44a4-9459-5d328de3afa0
c25bfd36-bf62-473f-8e76-c60a30914807	2026-01-04 02:59:24.753676+00	2026-01-04 02:59:24.753676+00	password	f7138c4a-d4df-45ad-8964-faf936fae24c
80ffd3aa-36f8-4560-ac72-97c79bef9443	2025-12-30 07:40:47.39129+00	2025-12-30 07:40:47.39129+00	password	c1622702-6750-43f0-89a1-d6b868df765b
49095f2a-9d3e-4c2b-99fa-aa588c768295	2025-12-30 07:51:02.947974+00	2025-12-30 07:51:02.947974+00	password	a40ea3f2-3823-4dfc-9c33-8d065aea5421
183516a7-86c7-43ce-b36e-b56e0fb998c3	2025-12-30 07:52:19.002397+00	2025-12-30 07:52:19.002397+00	password	e5e196f2-a890-4fd9-827a-ceecd6074648
129f488c-46ec-44d1-9642-12ebae97b584	2025-12-31 17:18:27.865107+00	2025-12-31 17:18:27.865107+00	password	6e770b3b-74ac-4037-97b0-5f742a42cc7f
fe4b6912-f5f3-4925-925f-577807570d97	2025-12-31 18:45:02.799561+00	2025-12-31 18:45:02.799561+00	password	3294d214-5aaf-477c-971f-750357aefcef
95408ca4-e9b4-478e-a308-37b330ff2a4d	2025-12-31 23:43:28.492313+00	2025-12-31 23:43:28.492313+00	password	33455259-ff51-46a3-932b-8be56669bd21
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_challenges (id, factor_id, created_at, verified_at, ip_address, otp_code, web_authn_session_data) FROM stdin;
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone, last_challenged_at, web_authn_credential, web_authn_aaguid, last_webauthn_challenge_data) FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, state, resource, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_client_states (id, provider_type, code_verifier, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_clients (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type) FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at) FROM stdin;
66e2602b-a5cb-4ff3-a5e5-a4576c3b2d93	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	recovery_token	pkce_00dbb49a7ea411f2c29a3a0d0c4c2a16fc4a2ad54b21a0072f3a98da	oceanna.chan@outlook.com	2025-12-29 22:38:27.155062	2025-12-29 22:38:27.155062
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) FROM stdin;
00000000-0000-0000-0000-000000000000	486	5yfxk6mnu3l6	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-04 02:47:22.471151+00	2026-01-04 02:47:22.471151+00	\N	9cf9b423-95c7-4a33-9304-ce9b2f71e5d5
00000000-0000-0000-0000-000000000000	487	gtp5xkysox3p	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-04 02:48:14.476406+00	2026-01-04 02:48:14.476406+00	w4wviwlf5d6p	f04ac7b2-054b-4ca5-9d1e-26f12fa6baf7
00000000-0000-0000-0000-000000000000	488	52xfienwqeus	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-04 02:48:18.943246+00	2026-01-04 02:48:18.943246+00	\N	448995fe-bb39-495b-a0e6-eee3344ad0f0
00000000-0000-0000-0000-000000000000	491	2ul5n54vaqyk	ea536caa-89cf-4997-a649-577f6c64f990	t	2026-01-04 03:22:47.961036+00	2026-01-04 04:32:03.521192+00	dmsdtprzwmob	b31959ee-133c-489b-9362-4068aa95ac7d
00000000-0000-0000-0000-000000000000	418	5wcvtwcmk54d	ac966367-dc7b-4934-b668-847a84e4ee85	f	2026-01-01 23:12:23.495878+00	2026-01-01 23:12:23.495878+00	\N	7c92b800-01c7-4abe-b3b8-ae83b37c224d
00000000-0000-0000-0000-000000000000	374	o5rj4cv4qber	a7be1876-00ae-4f6d-8818-be02c2a4bf45	t	2025-12-30 10:36:11.276128+00	2025-12-30 22:09:20.795098+00	5j2hz3ldibxa	183516a7-86c7-43ce-b36e-b56e0fb998c3
00000000-0000-0000-0000-000000000000	493	vzurizu2lesy	ea536caa-89cf-4997-a649-577f6c64f990	f	2026-01-04 04:32:03.535754+00	2026-01-04 04:32:03.535754+00	2ul5n54vaqyk	b31959ee-133c-489b-9362-4068aa95ac7d
00000000-0000-0000-0000-000000000000	421	alyak6ac2sdv	ac966367-dc7b-4934-b668-847a84e4ee85	f	2026-01-01 23:19:57.788612+00	2026-01-01 23:19:57.788612+00	\N	701a5e30-d3ad-40b5-b627-0e915e8fea15
00000000-0000-0000-0000-000000000000	422	7tjc5mmaffrd	ac966367-dc7b-4934-b668-847a84e4ee85	f	2026-01-01 23:22:23.874813+00	2026-01-01 23:22:23.874813+00	\N	f8c40e14-2e0a-40c8-8306-059a78b4aace
00000000-0000-0000-0000-000000000000	337	3mudvlg6rxik	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2025-12-27 14:19:25.078238+00	2025-12-27 14:19:25.078238+00	\N	e0f96252-9bb9-4de9-9c05-7e70b83df10c
00000000-0000-0000-0000-000000000000	344	gct2fke3y5xd	e8a5996d-484f-40f8-bd17-eb6cf8323baf	f	2025-12-28 21:01:07.884154+00	2025-12-28 21:01:07.884154+00	\N	194f2742-a292-4bbc-b2d5-769c8949ed4b
00000000-0000-0000-0000-000000000000	345	eeraoia5te67	e8a5996d-484f-40f8-bd17-eb6cf8323baf	f	2025-12-28 21:28:50.192439+00	2025-12-28 21:28:50.192439+00	\N	0dfaccd1-fb18-4db7-a65f-d8ca5db62c18
00000000-0000-0000-0000-000000000000	403	dcrdnfhp6uek	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2025-12-31 23:43:28.490819+00	2026-01-02 16:07:40.122766+00	\N	95408ca4-e9b4-478e-a308-37b330ff2a4d
00000000-0000-0000-0000-000000000000	442	uepbj5pktqeq	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 16:07:40.137526+00	2026-01-02 16:07:40.137526+00	dcrdnfhp6uek	95408ca4-e9b4-478e-a308-37b330ff2a4d
00000000-0000-0000-0000-000000000000	447	qe4vpjyh2545	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-02 17:15:17.999148+00	2026-01-02 18:19:40.343358+00	\N	9a9e2ec1-b507-47f4-ad8a-e6c4499c2ef8
00000000-0000-0000-0000-000000000000	449	rl5pqjsjpg4r	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 18:58:53.555906+00	2026-01-02 18:58:53.555906+00	sopxicm2j337	30b2fefb-49df-417d-bab0-462f70938a73
00000000-0000-0000-0000-000000000000	346	jiqnlp34ytv2	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2025-12-28 23:11:32.182862+00	2025-12-31 18:40:19.089315+00	\N	8e894e53-c311-4da8-a10f-b177786c7862
00000000-0000-0000-0000-000000000000	399	ghcdplt47z2x	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2025-12-31 18:40:19.116881+00	2025-12-31 18:40:19.116881+00	jiqnlp34ytv2	8e894e53-c311-4da8-a10f-b177786c7862
00000000-0000-0000-0000-000000000000	398	fbyxwzfkabub	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	t	2025-12-31 17:18:27.836035+00	2025-12-31 18:52:18.350971+00	\N	129f488c-46ec-44d1-9642-12ebae97b584
00000000-0000-0000-0000-000000000000	401	i343oxfiq6m3	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	f	2025-12-31 18:52:18.354868+00	2025-12-31 18:52:18.354868+00	fbyxwzfkabub	129f488c-46ec-44d1-9642-12ebae97b584
00000000-0000-0000-0000-000000000000	400	x3juz7mnny4u	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2025-12-31 18:45:02.786331+00	2025-12-31 23:42:59.63517+00	\N	fe4b6912-f5f3-4925-925f-577807570d97
00000000-0000-0000-0000-000000000000	402	zhbiojyw6ukp	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2025-12-31 23:42:59.655129+00	2025-12-31 23:42:59.655129+00	x3juz7mnny4u	fe4b6912-f5f3-4925-925f-577807570d97
00000000-0000-0000-0000-000000000000	385	pfpuctyrynou	a7be1876-00ae-4f6d-8818-be02c2a4bf45	t	2025-12-30 22:09:20.795937+00	2026-01-02 19:34:02.920014+00	o5rj4cv4qber	183516a7-86c7-43ce-b36e-b56e0fb998c3
00000000-0000-0000-0000-000000000000	452	rckejpq3jv5o	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2026-01-02 19:34:02.941121+00	2026-01-02 19:34:02.941121+00	pfpuctyrynou	183516a7-86c7-43ce-b36e-b56e0fb998c3
00000000-0000-0000-0000-000000000000	340	vacgn3im23wo	b1814878-5d12-4cb4-8a68-5d89213c698c	t	2025-12-27 18:18:32.487707+00	2025-12-29 22:04:41.388422+00	\N	26858ed2-b7b0-4eba-9898-90986faa0ba3
00000000-0000-0000-0000-000000000000	358	hfqflf2cyogt	b1814878-5d12-4cb4-8a68-5d89213c698c	f	2025-12-29 22:04:41.413114+00	2025-12-29 22:04:41.413114+00	vacgn3im23wo	26858ed2-b7b0-4eba-9898-90986faa0ba3
00000000-0000-0000-0000-000000000000	450	zi7dldj2hbab	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2026-01-02 18:59:03.827417+00	2026-01-02 21:27:06.811245+00	\N	f5c40668-7bf1-4a7e-af9e-4d87851499fd
00000000-0000-0000-0000-000000000000	456	dtlneieblorg	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 21:27:06.836535+00	2026-01-02 21:27:06.836535+00	zi7dldj2hbab	f5c40668-7bf1-4a7e-af9e-4d87851499fd
00000000-0000-0000-0000-000000000000	361	t5dfhou6fvgf	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	f	2025-12-29 22:39:05.385443+00	2025-12-29 22:39:05.385443+00	\N	200ab6f8-22fb-4f4c-8396-13cbb63b7b98
00000000-0000-0000-0000-000000000000	362	3myg3ptxxlhj	b1814878-5d12-4cb4-8a68-5d89213c698c	f	2025-12-29 22:44:38.459544+00	2025-12-29 22:44:38.459544+00	\N	5c46e28f-cf6e-4f67-82d1-509f27d36a76
00000000-0000-0000-0000-000000000000	453	4zajirkgjcsj	a7be1876-00ae-4f6d-8818-be02c2a4bf45	t	2026-01-02 19:34:19.360545+00	2026-01-02 21:41:51.87486+00	\N	3ee2b09a-fee0-418a-9368-131205f19441
00000000-0000-0000-0000-000000000000	458	ll7kzra7qbpe	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 22:16:31.488965+00	2026-01-02 22:16:31.488965+00	\N	d93652a5-b928-47b5-b441-9383db0d50c4
00000000-0000-0000-0000-000000000000	460	id3pebrur4yg	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2026-01-02 22:54:03.699317+00	2026-01-02 23:52:37.065081+00	\N	7c046fc3-2b81-4e53-a3ac-50e8973c5aa3
00000000-0000-0000-0000-000000000000	462	tftxutasxys2	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-02 23:56:16.576305+00	2026-01-03 03:32:48.11936+00	4s57rhd7aaxl	b3d2b693-5b09-4bbf-a750-6a697d5b83fa
00000000-0000-0000-0000-000000000000	468	uz47jm4s7365	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2026-01-03 15:07:35.533393+00	2026-01-03 15:07:35.533393+00	xgjq5iq3hfjd	3ee2b09a-fee0-418a-9368-131205f19441
00000000-0000-0000-0000-000000000000	469	ojf3jm53sk7f	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2026-01-03 15:07:52.118885+00	2026-01-03 15:07:52.118885+00	\N	ba8b7f81-e8e9-41ee-8f87-03f02c8d57e5
00000000-0000-0000-0000-000000000000	465	ikftz54owj57	3a7b64a1-67bd-4d16-a921-9215046da9c5	t	2026-01-03 10:12:01.750999+00	2026-01-03 17:10:17.017997+00	\N	0b331a89-222d-43c6-9f62-3ae76f9119dd
00000000-0000-0000-0000-000000000000	473	bcdee7oazc5f	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-03 17:22:48.339999+00	2026-01-03 17:22:48.339999+00	\N	efd3307e-02d2-45f4-a87d-765c17fb610e
00000000-0000-0000-0000-000000000000	471	ravgj4s5tu7a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-03 16:37:45.077771+00	2026-01-03 22:14:22.231635+00	jnarkqpbihgj	46059b45-877e-4fe7-b9be-dcbf96c72736
00000000-0000-0000-0000-000000000000	371	o6s3grrk33bo	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2025-12-30 07:40:47.368112+00	2025-12-30 07:40:47.368112+00	\N	80ffd3aa-36f8-4560-ac72-97c79bef9443
00000000-0000-0000-0000-000000000000	372	75tjfd7teopz	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2025-12-30 07:51:02.92783+00	2025-12-30 07:51:02.92783+00	\N	49095f2a-9d3e-4c2b-99fa-aa588c768295
00000000-0000-0000-0000-000000000000	373	5j2hz3ldibxa	a7be1876-00ae-4f6d-8818-be02c2a4bf45	t	2025-12-30 07:52:18.999266+00	2025-12-30 10:36:11.261371+00	\N	183516a7-86c7-43ce-b36e-b56e0fb998c3
00000000-0000-0000-0000-000000000000	477	to47euqiyxbi	3a7b64a1-67bd-4d16-a921-9215046da9c5	t	2026-01-03 22:55:49.576768+00	2026-01-03 23:55:05.010547+00	\N	bffcfe56-fa0e-4e8a-823e-7991699c46fc
00000000-0000-0000-0000-000000000000	475	wo3p5kdbcgqh	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-03 22:28:29.4466+00	2026-01-04 00:52:14.170569+00	\N	7d22a68b-9bfa-4918-a923-8a0d22ce0f2d
00000000-0000-0000-0000-000000000000	479	pyl3vm3f2pr5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-04 00:52:14.194002+00	2026-01-04 00:52:14.194002+00	wo3p5kdbcgqh	7d22a68b-9bfa-4918-a923-8a0d22ce0f2d
00000000-0000-0000-0000-000000000000	359	zv2yjoq32yvl	b1814878-5d12-4cb4-8a68-5d89213c698c	t	2025-12-29 22:04:47.292936+00	2025-12-30 14:52:39.424983+00	\N	0ca5c3f8-4cdf-4004-a2be-d3c5d5df0aa8
00000000-0000-0000-0000-000000000000	377	zkiivgz5qls2	b1814878-5d12-4cb4-8a68-5d89213c698c	f	2025-12-30 14:52:39.451907+00	2025-12-30 14:52:39.451907+00	zv2yjoq32yvl	0ca5c3f8-4cdf-4004-a2be-d3c5d5df0aa8
00000000-0000-0000-0000-000000000000	483	obqnot57zioy	ea536caa-89cf-4997-a649-577f6c64f990	t	2026-01-04 01:24:19.698145+00	2026-01-04 02:23:48.015324+00	\N	b31959ee-133c-489b-9362-4068aa95ac7d
00000000-0000-0000-0000-000000000000	480	qcm4uo3t5ah4	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-04 00:52:48.667361+00	2026-01-04 02:29:39.354994+00	\N	61269f00-2fc7-477d-b8c6-b19e9f088a20
00000000-0000-0000-0000-000000000000	482	w4wviwlf5d6p	3a7b64a1-67bd-4d16-a921-9215046da9c5	t	2026-01-04 00:55:00.372788+00	2026-01-04 02:48:14.473338+00	\N	f04ac7b2-054b-4ca5-9d1e-26f12fa6baf7
00000000-0000-0000-0000-000000000000	417	xeg5mdcwc6se	ac966367-dc7b-4934-b668-847a84e4ee85	f	2026-01-01 22:56:56.130267+00	2026-01-01 22:56:56.130267+00	\N	45ea72cd-9672-405c-88df-ad6bf083fc58
00000000-0000-0000-0000-000000000000	424	tig5z4udb5z3	ac966367-dc7b-4934-b668-847a84e4ee85	f	2026-01-02 00:03:10.145374+00	2026-01-02 00:03:10.145374+00	\N	1f7e129c-655f-4179-b66f-30617cb0b6be
00000000-0000-0000-0000-000000000000	484	dmsdtprzwmob	ea536caa-89cf-4997-a649-577f6c64f990	t	2026-01-04 02:23:48.036371+00	2026-01-04 03:22:47.94443+00	obqnot57zioy	b31959ee-133c-489b-9362-4068aa95ac7d
00000000-0000-0000-0000-000000000000	489	prflekhmpdqo	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-04 02:57:25.929581+00	2026-01-04 04:21:51.327702+00	\N	77f47c05-7f36-4397-af02-496f83af8eab
00000000-0000-0000-0000-000000000000	492	mixtef62sosv	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-04 04:21:51.340355+00	2026-01-04 04:21:51.340355+00	prflekhmpdqo	77f47c05-7f36-4397-af02-496f83af8eab
00000000-0000-0000-0000-000000000000	490	g5n7puxyosah	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-04 02:59:24.752303+00	2026-01-04 04:54:43.682308+00	\N	c25bfd36-bf62-473f-8e76-c60a30914807
00000000-0000-0000-0000-000000000000	494	cizdezdl6p7w	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-04 04:54:43.693211+00	2026-01-04 04:54:43.693211+00	g5n7puxyosah	c25bfd36-bf62-473f-8e76-c60a30914807
00000000-0000-0000-0000-000000000000	443	sopxicm2j337	bedceebb-fada-4354-9542-b9377ff9a4d3	t	2026-01-02 16:08:34.055863+00	2026-01-02 18:58:53.535435+00	\N	30b2fefb-49df-417d-bab0-462f70938a73
00000000-0000-0000-0000-000000000000	451	vnski6rvlsav	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 19:01:30.134153+00	2026-01-02 19:01:30.134153+00	\N	14167463-302f-46f1-ae1d-98be0b0fe5c9
00000000-0000-0000-0000-000000000000	448	rkbvkz4xol47	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-02 18:19:40.369049+00	2026-01-02 20:59:35.109642+00	qe4vpjyh2545	9a9e2ec1-b507-47f4-ad8a-e6c4499c2ef8
00000000-0000-0000-0000-000000000000	454	6p5mfroeiqu4	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-02 20:59:35.11965+00	2026-01-02 20:59:35.11965+00	rkbvkz4xol47	9a9e2ec1-b507-47f4-ad8a-e6c4499c2ef8
00000000-0000-0000-0000-000000000000	455	pz4ir2zpync7	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-02 20:59:41.450669+00	2026-01-02 22:44:02.122626+00	\N	b3d2b693-5b09-4bbf-a750-6a697d5b83fa
00000000-0000-0000-0000-000000000000	461	xviq54auvcc7	bedceebb-fada-4354-9542-b9377ff9a4d3	f	2026-01-02 23:52:37.105158+00	2026-01-02 23:52:37.105158+00	id3pebrur4yg	7c046fc3-2b81-4e53-a3ac-50e8973c5aa3
00000000-0000-0000-0000-000000000000	459	4s57rhd7aaxl	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-02 22:44:02.138662+00	2026-01-02 23:56:16.573049+00	pz4ir2zpync7	b3d2b693-5b09-4bbf-a750-6a697d5b83fa
00000000-0000-0000-0000-000000000000	463	imxtflaqsgmi	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-03 03:32:48.149007+00	2026-01-03 03:32:48.149007+00	tftxutasxys2	b3d2b693-5b09-4bbf-a750-6a697d5b83fa
00000000-0000-0000-0000-000000000000	464	q6mnuilkdnht	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-03 03:32:54.768096+00	2026-01-03 10:26:26.726097+00	\N	84c32559-370f-433b-a747-e5f006e4bfa0
00000000-0000-0000-0000-000000000000	466	bxy6zqwhjzb5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-03 10:26:26.738148+00	2026-01-03 10:26:26.738148+00	q6mnuilkdnht	84c32559-370f-433b-a747-e5f006e4bfa0
00000000-0000-0000-0000-000000000000	457	xgjq5iq3hfjd	a7be1876-00ae-4f6d-8818-be02c2a4bf45	t	2026-01-02 21:41:51.88854+00	2026-01-03 15:07:35.506199+00	4zajirkgjcsj	3ee2b09a-fee0-418a-9368-131205f19441
00000000-0000-0000-0000-000000000000	470	3oxsnx2djhkp	a7be1876-00ae-4f6d-8818-be02c2a4bf45	f	2026-01-03 15:09:49.237683+00	2026-01-03 15:09:49.237683+00	\N	3dc41a85-2f6f-49f9-82c8-6f60ea3f4231
00000000-0000-0000-0000-000000000000	467	jnarkqpbihgj	e96d34d9-5cc9-43a8-81c2-9545d1b11508	t	2026-01-03 10:26:33.03135+00	2026-01-03 16:37:45.056619+00	\N	46059b45-877e-4fe7-b9be-dcbf96c72736
00000000-0000-0000-0000-000000000000	472	6l7dufwtsvi2	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-03 17:10:17.02754+00	2026-01-03 17:10:17.02754+00	ikftz54owj57	0b331a89-222d-43c6-9f62-3ae76f9119dd
00000000-0000-0000-0000-000000000000	474	ns7p5da2frlb	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-03 22:14:22.257384+00	2026-01-03 22:14:22.257384+00	ravgj4s5tu7a	46059b45-877e-4fe7-b9be-dcbf96c72736
00000000-0000-0000-0000-000000000000	476	xqo4glin4par	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-03 22:39:40.929309+00	2026-01-03 22:39:40.929309+00	\N	15d456a2-f336-4fde-8188-296d45feb193
00000000-0000-0000-0000-000000000000	478	5pr7zkpym22a	3a7b64a1-67bd-4d16-a921-9215046da9c5	t	2026-01-03 23:55:05.037602+00	2026-01-04 00:54:55.538196+00	to47euqiyxbi	bffcfe56-fa0e-4e8a-823e-7991699c46fc
00000000-0000-0000-0000-000000000000	481	jq5qhcuaxsqz	3a7b64a1-67bd-4d16-a921-9215046da9c5	f	2026-01-04 00:54:55.540095+00	2026-01-04 00:54:55.540095+00	5pr7zkpym22a	bffcfe56-fa0e-4e8a-823e-7991699c46fc
00000000-0000-0000-0000-000000000000	485	7boyhv4sefsm	e96d34d9-5cc9-43a8-81c2-9545d1b11508	f	2026-01-04 02:29:39.35661+00	2026-01-04 02:29:39.35661+00	qcm4uo3t5ah4	61269f00-2fc7-477d-b8c6-b19e9f088a20
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_providers (id, sso_provider_id, entity_id, metadata_xml, metadata_url, attribute_mapping, created_at, updated_at, name_id_format) FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_relay_states (id, sso_provider_id, request_id, for_email, redirect_to, created_at, updated_at, flow_state_id) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) FROM stdin;
b3d2b693-5b09-4bbf-a750-6a697d5b83fa	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 20:59:41.442724+00	2026-01-03 03:32:48.185611+00	\N	aal1	\N	2026-01-03 03:32:48.18549	Vercel Edge Functions	13.57.246.147	\N	\N	\N	\N	\N
84c32559-370f-433b-a747-e5f006e4bfa0	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-03 03:32:54.749889+00	2026-01-03 10:26:26.767067+00	\N	aal1	\N	2026-01-03 10:26:26.766954	Vercel Edge Functions	52.53.172.129	\N	\N	\N	\N	\N
3ee2b09a-fee0-418a-9368-131205f19441	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2026-01-02 19:34:19.355183+00	2026-01-03 15:07:35.574868+00	\N	aal1	\N	2026-01-03 15:07:35.574104	Vercel Edge Functions	3.79.62.246	\N	\N	\N	\N	\N
ba8b7f81-e8e9-41ee-8f87-03f02c8d57e5	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2026-01-03 15:07:52.103039+00	2026-01-03 15:07:52.103039+00	\N	aal1	\N	\N	node	44.210.244.127	\N	\N	\N	\N	\N
3dc41a85-2f6f-49f9-82c8-6f60ea3f4231	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2026-01-03 15:09:49.235502+00	2026-01-03 15:09:49.235502+00	\N	aal1	\N	\N	node	44.210.244.127	\N	\N	\N	\N	\N
e0f96252-9bb9-4de9-9c05-7e70b83df10c	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-27 14:19:25.040298+00	2025-12-27 14:19:25.040298+00	\N	aal1	\N	\N	node	44.222.70.141	\N	\N	\N	\N	\N
0b331a89-222d-43c6-9f62-3ae76f9119dd	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-03 10:12:01.720707+00	2026-01-03 17:10:17.039599+00	\N	aal1	\N	2026-01-03 17:10:17.038882	Vercel Edge Functions	54.183.175.56	\N	\N	\N	\N	\N
efd3307e-02d2-45f4-a87d-765c17fb610e	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-03 17:22:48.317224+00	2026-01-03 17:22:48.317224+00	\N	aal1	\N	\N	node	34.239.160.106	\N	\N	\N	\N	\N
46059b45-877e-4fe7-b9be-dcbf96c72736	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-03 10:26:33.022774+00	2026-01-03 22:28:17.345727+00	\N	aal1	\N	2026-01-03 22:28:17.345593	Vercel Edge Functions	18.144.19.221	\N	\N	\N	\N	\N
194f2742-a292-4bbc-b2d5-769c8949ed4b	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-28 21:01:07.852618+00	2025-12-28 21:01:07.852618+00	\N	aal1	\N	\N	node	3.87.136.30	\N	\N	\N	\N	\N
0dfaccd1-fb18-4db7-a65f-d8ca5db62c18	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-28 21:28:50.167517+00	2025-12-28 21:28:50.167517+00	\N	aal1	\N	\N	node	35.175.212.55	\N	\N	\N	\N	\N
15d456a2-f336-4fde-8188-296d45feb193	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-03 22:39:40.901622+00	2026-01-03 22:39:40.901622+00	\N	aal1	\N	\N	node	44.192.123.202	\N	\N	\N	\N	\N
7d22a68b-9bfa-4918-a923-8a0d22ce0f2d	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-03 22:28:29.42929+00	2026-01-04 00:52:14.238305+00	\N	aal1	\N	2026-01-04 00:52:14.238178	Vercel Edge Functions	52.53.196.108	\N	\N	\N	\N	\N
bffcfe56-fa0e-4e8a-823e-7991699c46fc	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-03 22:55:49.559133+00	2026-01-04 00:54:55.543901+00	\N	aal1	\N	2026-01-04 00:54:55.543804	Vercel Edge Functions	13.56.159.234	\N	\N	\N	\N	\N
61269f00-2fc7-477d-b8c6-b19e9f088a20	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-04 00:52:48.649682+00	2026-01-04 02:29:39.361553+00	\N	aal1	\N	2026-01-04 02:29:39.361453	Vercel Edge Functions	54.67.44.25	\N	\N	\N	\N	\N
9cf9b423-95c7-4a33-9304-ce9b2f71e5d5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-04 02:47:22.445679+00	2026-01-04 02:47:22.445679+00	\N	aal1	\N	\N	node	3.91.213.204	\N	\N	\N	\N	\N
26858ed2-b7b0-4eba-9898-90986faa0ba3	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-27 18:18:32.44452+00	2025-12-29 22:04:41.450236+00	\N	aal1	\N	2025-12-29 22:04:41.449601	Vercel Edge Functions	184.169.226.122	\N	\N	\N	\N	\N
200ab6f8-22fb-4f4c-8396-13cbb63b7b98	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-29 22:39:05.379612+00	2025-12-29 22:39:05.379612+00	\N	aal1	\N	\N	node	44.193.201.205	\N	\N	\N	\N	\N
5c46e28f-cf6e-4f67-82d1-509f27d36a76	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-29 22:44:38.445058+00	2025-12-29 22:44:38.445058+00	\N	aal1	\N	\N	node	34.203.239.6	\N	\N	\N	\N	\N
f04ac7b2-054b-4ca5-9d1e-26f12fa6baf7	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-04 00:55:00.371449+00	2026-01-04 02:48:14.482238+00	\N	aal1	\N	2026-01-04 02:48:14.482132	Vercel Edge Functions	54.153.13.46	\N	\N	\N	\N	\N
8e894e53-c311-4da8-a10f-b177786c7862	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-28 23:11:32.149603+00	2025-12-31 18:40:19.16118+00	\N	aal1	\N	2025-12-31 18:40:19.160401	Vercel Edge Functions	52.90.108.151	\N	\N	\N	\N	\N
95408ca4-e9b4-478e-a308-37b330ff2a4d	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-31 23:43:28.48468+00	2026-01-02 16:07:40.161301+00	\N	aal1	\N	2026-01-02 16:07:40.161183	Vercel Edge Functions	3.83.119.190	\N	\N	\N	\N	\N
448995fe-bb39-495b-a0e6-eee3344ad0f0	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-04 02:48:18.942207+00	2026-01-04 02:48:18.942207+00	\N	aal1	\N	\N	node	54.162.245.38	\N	\N	\N	\N	\N
129f488c-46ec-44d1-9642-12ebae97b584	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-31 17:18:27.784154+00	2025-12-31 18:52:18.359335+00	\N	aal1	\N	2025-12-31 18:52:18.359233	Vercel Edge Functions	54.152.80.245	\N	\N	\N	\N	\N
80ffd3aa-36f8-4560-ac72-97c79bef9443	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-30 07:40:47.326868+00	2025-12-30 07:40:47.326868+00	\N	aal1	\N	\N	node	3.237.10.93	\N	\N	\N	\N	\N
49095f2a-9d3e-4c2b-99fa-aa588c768295	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-30 07:51:02.905777+00	2025-12-30 07:51:02.905777+00	\N	aal1	\N	\N	node	54.147.233.247	\N	\N	\N	\N	\N
fe4b6912-f5f3-4925-925f-577807570d97	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-31 18:45:02.753754+00	2025-12-31 23:42:59.684793+00	\N	aal1	\N	2025-12-31 23:42:59.684676	Vercel Edge Functions	98.80.125.212	\N	\N	\N	\N	\N
0ca5c3f8-4cdf-4004-a2be-d3c5d5df0aa8	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-29 22:04:47.281892+00	2025-12-30 14:52:39.487544+00	\N	aal1	\N	2025-12-30 14:52:39.486731	Vercel Edge Functions	13.57.206.41	\N	\N	\N	\N	\N
77f47c05-7f36-4397-af02-496f83af8eab	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-04 02:57:25.888899+00	2026-01-04 04:21:51.366302+00	\N	aal1	\N	2026-01-04 04:21:51.366161	Vercel Edge Functions	54.151.57.100	\N	\N	\N	\N	\N
b31959ee-133c-489b-9362-4068aa95ac7d	ea536caa-89cf-4997-a649-577f6c64f990	2026-01-04 01:24:19.661679+00	2026-01-04 04:32:03.562071+00	\N	aal1	\N	2026-01-04 04:32:03.561956	Vercel Edge Functions	3.101.66.208	\N	\N	\N	\N	\N
c25bfd36-bf62-473f-8e76-c60a30914807	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-04 02:59:24.751274+00	2026-01-04 04:54:43.715479+00	\N	aal1	\N	2026-01-04 04:54:43.715352	Next.js Middleware	71.38.79.10	\N	\N	\N	\N	\N
30b2fefb-49df-417d-bab0-462f70938a73	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02 16:08:34.038479+00	2026-01-02 18:58:53.58789+00	\N	aal1	\N	2026-01-02 18:58:53.587758	Vercel Edge Functions	54.198.140.144	\N	\N	\N	\N	\N
45ea72cd-9672-405c-88df-ad6bf083fc58	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-01 22:56:56.118298+00	2026-01-01 22:56:56.118298+00	\N	aal1	\N	\N	node	44.204.217.213	\N	\N	\N	\N	\N
7c92b800-01c7-4abe-b3b8-ae83b37c224d	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-01 23:12:23.462432+00	2026-01-01 23:12:23.462432+00	\N	aal1	\N	\N	node	3.238.95.153	\N	\N	\N	\N	\N
701a5e30-d3ad-40b5-b627-0e915e8fea15	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-01 23:19:57.786988+00	2026-01-01 23:19:57.786988+00	\N	aal1	\N	\N	node	54.226.29.135	\N	\N	\N	\N	\N
f8c40e14-2e0a-40c8-8306-059a78b4aace	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-01 23:22:23.873267+00	2026-01-01 23:22:23.873267+00	\N	aal1	\N	\N	node	44.223.46.244	\N	\N	\N	\N	\N
1f7e129c-655f-4179-b66f-30617cb0b6be	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-02 00:03:10.114463+00	2026-01-02 00:03:10.114463+00	\N	aal1	\N	\N	node	184.73.42.229	\N	\N	\N	\N	\N
14167463-302f-46f1-ae1d-98be0b0fe5c9	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02 19:01:30.081962+00	2026-01-02 19:01:30.081962+00	\N	aal1	\N	\N	node	44.200.7.162	\N	\N	\N	\N	\N
183516a7-86c7-43ce-b36e-b56e0fb998c3	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-30 07:52:18.997644+00	2026-01-02 19:34:02.970969+00	\N	aal1	\N	2026-01-02 19:34:02.970831	Vercel Edge Functions	3.72.1.121	\N	\N	\N	\N	\N
9a9e2ec1-b507-47f4-ad8a-e6c4499c2ef8	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 17:15:17.997443+00	2026-01-02 20:59:35.144353+00	\N	aal1	\N	2026-01-02 20:59:35.144178	Vercel Edge Functions	13.57.177.215	\N	\N	\N	\N	\N
f5c40668-7bf1-4a7e-af9e-4d87851499fd	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02 18:59:03.814788+00	2026-01-02 21:27:06.863296+00	\N	aal1	\N	2026-01-02 21:27:06.862487	Vercel Edge Functions	44.204.38.179	\N	\N	\N	\N	\N
d93652a5-b928-47b5-b441-9383db0d50c4	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02 22:16:31.458896+00	2026-01-02 22:16:31.458896+00	\N	aal1	\N	\N	node	3.237.44.242	\N	\N	\N	\N	\N
7c046fc3-2b81-4e53-a3ac-50e8973c5aa3	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02 22:54:03.668486+00	2026-01-02 23:52:37.148894+00	\N	aal1	\N	2026-01-02 23:52:37.148772	Vercel Edge Functions	13.219.203.244	\N	\N	\N	\N	\N
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_domains (id, sso_provider_id, domain, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_providers (id, resource_id, created_at, updated_at, disabled) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	authenticated	authenticated	student@demo.com	$2a$10$dFFvZzotYR/scBKNkHkl.eEybokF86MOpASTd6mUOV26iSYlnVXu.	2025-12-09 10:10:02.508232+00	\N		\N		\N			\N	2025-12-14 11:21:04.078927+00	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2025-12-09 10:10:02.493029+00	2025-12-14 13:27:55.177876+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	b8edc751-854a-4716-b520-7112d13f7b69	authenticated	authenticated	nate.mahon@icloud.com	$2a$10$.HOEfpqsn5JzEvGwjYEN4esoma54CRXHQD8jUCHsEEUbbmr0/l5Jq	2025-12-16 23:20:20.618631+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"name": "Nate Mahon", "email_verified": true}	\N	2025-12-16 23:20:20.606616+00	2025-12-16 23:20:20.619503+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	ebc039fd-8043-419f-97e0-77c2b902da75	authenticated	authenticated	josedvdrocha@gmail.com	$2a$10$Hnz1hc8PVpGXvq52gtUXKuJX7vOfI9E2MfmkLl.9V9KKewQ4H8WHu	2025-12-16 11:27:46.191556+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"name": "Jose Piano Teacher", "email_verified": true}	\N	2025-12-16 11:27:46.165413+00	2025-12-16 11:27:46.193078+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	458267a3-ffa8-4c1c-9969-e18ccc710695	authenticated	authenticated	eran.steinberg@gmail.com	$2a$10$ZFfQwSPY398ho20bbiLrd.1uF9SIygGeXvW9Pp4oIqH4VBCsulO26	2025-12-18 13:41:15.396099+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"name": "Kai Steinberg", "email_verified": true}	\N	2025-12-18 13:41:15.372062+00	2025-12-18 13:41:15.397693+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	0d15924c-5764-431d-ac1f-34a967c9285d	authenticated	authenticated	sarabjitmatharu@gmail.com	$2a$10$invNyJeBuiXw6ddWG1Ieo.YpEE1zdCVJEpStpYVhwpJ4lXpbhhRz2	2025-12-14 17:21:58.547068+00	\N		\N		\N			\N	2025-12-20 16:32:07.102725+00	{"provider": "email", "providers": ["email"]}	{"name": "Waris Matharu", "email_verified": true}	\N	2025-12-14 17:21:58.517669+00	2025-12-22 20:07:34.450769+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	7664c5ce-4f36-4514-9a4f-2353c4e769fa	authenticated	authenticated	ddmxuyang@gmail.com	$2a$10$vEtBKctkvLk72EcexOW01eyVzFKdguEQHqyS/XnOqrU0BJSeq10Ry	2025-12-15 22:37:28.483707+00	\N		\N		\N			\N	2025-12-23 00:01:34.390389+00	{"provider": "email", "providers": ["email"]}	{"name": "Yuelin and Yizhong", "email_verified": true}	\N	2025-12-15 22:37:28.470654+00	2025-12-26 01:30:53.450931+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	authenticated	authenticated	oceanna.chan@outlook.com	$2a$10$dPJkAyA4PatHSR3MgO53Cu3ONvgexOhkNSQpKN5Z4XeDlQU55vqWq	2025-12-14 16:19:49.346557+00	\N		\N	pkce_00dbb49a7ea411f2c29a3a0d0c4c2a16fc4a2ad54b21a0072f3a98da	2025-12-29 22:38:26.870199+00			\N	2025-12-31 17:18:27.783318+00	{"provider": "email", "providers": []}	{"name": "Oceanna Chan", "email_verified": true}	\N	2025-12-14 16:19:49.342227+00	2025-12-31 18:52:18.356948+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	a7be1876-00ae-4f6d-8818-be02c2a4bf45	authenticated	authenticated	yakir30g@gmail.com	$2a$10$vP0436ph2QGI65D6fk485ek6vnfdnsk7krko7L9enOryjiRrkvJgu	2025-12-16 22:49:30.705444+00	\N		\N		\N			\N	2026-01-03 15:09:49.235394+00	{"provider": "email", "providers": ["email"]}	{"name": "Yakir Shimon", "email_verified": true}	\N	2025-12-16 22:49:30.684255+00	2026-01-03 15:09:49.239971+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	e8a5996d-484f-40f8-bd17-eb6cf8323baf	authenticated	authenticated	kylie718@gmail.com	$2a$10$syNqgebGG29DDDjGnqpzkeKgHo4joJeTZ97rbJ0.azE6vT7aAZvj2	2025-12-14 16:45:43.361375+00	\N		\N		\N			\N	2025-12-28 21:28:50.166722+00	{"provider": "email", "providers": ["email"]}	{"name": "Roy Yin", "email_verified": true}	\N	2025-12-14 16:45:43.327939+00	2025-12-28 21:28:50.200609+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	615b4a9c-f8fc-42ca-bf23-b863a18d1788	authenticated	authenticated	hello@dreamplaypianos.com	$2a$10$u0T2p3y4pkQD19LCgRVwxOQeimZriaM2eP6LfflOJxoCr6hocoWz6	2025-12-29 13:59:39.352383+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"name": "Olga Piano Teacher", "email_verified": true}	\N	2025-12-29 13:59:39.333017+00	2025-12-29 13:59:39.355533+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	b1814878-5d12-4cb4-8a68-5d89213c698c	authenticated	authenticated	jayde.ireland@gmail.com	$2a$10$P5seW3p8ft9nhndy857YM.xZkPshrwfr4ICMZdFeVy/v7kPDWUavG	2025-12-14 16:26:50.316012+00	\N		\N		\N			\N	2025-12-29 22:44:38.444348+00	{"provider": "email", "providers": ["email"]}	{"name": "Padhma Berk", "email_verified": true}	\N	2025-12-14 16:26:50.274069+00	2025-12-30 14:52:39.47125+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	bedceebb-fada-4354-9542-b9377ff9a4d3	authenticated	authenticated	ubermichellita@hotmail.com	$2a$10$992IkdS/MFx/KZHPQf.yAOsCyVFNGbavTKwR0GvXiC83kZo5P1lzC	2025-12-17 03:50:49.072189+00	\N		\N		\N			\N	2026-01-02 22:54:03.667993+00	{"provider": "email", "providers": ["email"]}	{"name": "Caedmon Crosby", "email_verified": true}	\N	2025-12-17 03:50:49.019751+00	2026-01-02 23:52:37.126961+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	ea536caa-89cf-4997-a649-577f6c64f990	authenticated	authenticated	aldaigle@gmail.com	$2a$10$4yRVYR13fKzWY8Gg52mkp.q7EsN5LVHgRRsclRK8r9d7Da4NSVrOO	2025-12-14 08:49:53.131405+00	\N		\N		\N			\N	2026-01-04 01:24:19.659764+00	{"provider": "email", "providers": ["email"]}	{"name": "Ila and Cordelia Daigle", "email_verified": true}	\N	2025-12-14 08:49:53.113328+00	2026-01-04 04:32:03.552501+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	10128b61-f8e6-44cf-86af-7c7f4669705a	authenticated	authenticated	zouwu80@gmail.com	$2a$10$l6NSoPcHKvJpR7Iqt1.DE.Lhq3GbMpUorR9G.D69JJFgpFJ8LDAmi	2025-12-14 13:26:44.485759+00	\N		\N		\N			\N	2026-01-01 23:13:51.700966+00	{"provider": "email", "providers": ["email"]}	{"name": "Edwin Guo", "email_verified": true}	\N	2025-12-14 13:26:44.463284+00	2026-01-01 23:13:51.703018+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	3a7b64a1-67bd-4d16-a921-9215046da9c5	authenticated	authenticated	yulionel829@gmail.com	$2a$10$YDvI1ziVskOwUF2YhunHYuWibR34skFaRkKa1m0Es98J4pugr83VG	2025-12-09 15:33:12.687852+00	\N		\N	pkce_a45014736e80c3102fc1d131dabad77cb9929c4d200d85c74c8f25bc	2025-12-15 22:33:32.300514+00			\N	2026-01-04 02:48:18.941864+00	{"provider": "email", "providers": ["email"]}	{"name": "xcvxcv", "email_verified": true}	\N	2025-12-09 15:33:12.683418+00	2026-01-04 02:48:18.944353+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	ac966367-dc7b-4934-b668-847a84e4ee85	authenticated	authenticated	micahfinn1@gmail.com	$2a$10$KvQ.hruq98oPuPXaBHGtjOt7dP/4HRQDqSGcm87NO/zY5ViiFNY9y	2025-12-16 23:21:35.250617+00	\N		\N		2025-12-20 15:05:38.192306+00			\N	2026-01-02 00:03:10.112068+00	{"provider": "email", "providers": ["email"]}	{"name": "Micah Finn", "email_verified": true}	\N	2025-12-16 23:21:35.24423+00	2026-01-02 00:03:10.181649+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	356415aa-1051-4ed2-a29d-7d1c329f7e0f	authenticated	authenticated	djsputty@gmail.com	$2a$10$RLYNnmGzvxlm9AN5QbJ6G.WgNbn9ZS9fh7CU8Mzq136/4viLV/RDW	2026-01-02 16:11:36.39377+00	\N		\N		\N			\N	2026-01-02 17:14:56.903522+00	{"provider": "email", "providers": ["email"]}	{"name": "Best student", "email_verified": true}	\N	2026-01-02 16:11:36.380624+00	2026-01-02 17:14:56.920213+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	e96d34d9-5cc9-43a8-81c2-9545d1b11508	authenticated	authenticated	support@musicalbasics.com	$2a$10$oujt49tRPBTxgh.tWsHG3uCyLEX80BNszgrM6xvQ0Cwsz9L0jHXWu	2025-12-14 16:17:40.303973+00	\N		\N		\N			\N	2026-01-04 02:59:24.751164+00	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2025-12-14 16:17:40.279988+00	2026-01-04 04:54:43.703249+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: auth_audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auth_audit_logs (id, user_email, event_type, status, details, ip_address, created_at) FROM stdin;
be1b844d-477a-4992-a2a3-751b264c72ef	student@demo.com	login	success	\N	\N	2025-12-14 11:21:04.294554+00
f42226e2-21e0-4b4b-b50a-3fc571c26ee0	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 11:21:22.541105+00
c0441c1c-ac53-4105-8d52-7e48924c4598	admin@demo.com	login	success	\N	\N	2025-12-14 11:21:33.673134+00
fd816ebb-9cf4-4795-be8a-2e7c4cc517c1	yulionel829@gmail.com	reset_request	success	\N	\N	2025-12-14 11:21:54.115466+00
87153438-43b3-4e67-b338-1c5d9815670e	admin@demo.com	login	success	\N	\N	2025-12-14 11:22:03.098609+00
e24e6b8d-5128-4e5a-8426-8f924033ea40	zouwu80@gmail.com	login	success	\N	\N	2025-12-14 13:27:06.632457+00
4c3f99c0-a807-4982-bc0c-ece1ffff23de	admin@demo.com	login	success	\N	\N	2025-12-14 13:27:30.677369+00
7bb83869-15a3-4cdd-8d4d-be9ba7425eb1	admin@demo.com	login	success	\N	\N	2025-12-14 16:04:31.303169+00
8c0322ea-06c0-4baf-a589-31ae8a25214d	support@musicalbasics.com	failed_login	failure	Invalid login credentials	\N	2025-12-14 16:11:45.708447+00
1b1ed8fd-b6de-493d-97b4-81d2235db799	support@musicalbasics.com	reset_request	success	\N	\N	2025-12-14 16:11:53.080589+00
2b7b6ea5-1a55-493c-9f95-d6ee256a8037	admin@demo.com	login	success	\N	\N	2025-12-14 16:14:34.778253+00
4f843193-02d8-4c18-8f6c-410588b63942	support@musicalbasics.com	login	success	\N	\N	2025-12-14 16:18:08.724549+00
f702c21a-d335-4ad7-9cb9-62ce55295ba5	support@musicalbasics.com	login	success	\N	\N	2025-12-14 16:18:42.190629+00
ce74da37-d9f6-4e1c-b344-775a6f7dc9e3	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 18:30:06.9231+00
757d1b87-e6b6-4815-a212-7f5061ff2a1f	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-14 19:52:21.439229+00
f9912dd7-c7b0-4037-a9cb-2b4ddc1c99c4	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 19:54:49.774201+00
8ec07d86-a680-4d9c-9e1e-3148b16eb36e	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 20:07:20.111041+00
89efd773-ac4c-4a43-aee6-9f7693ca12a2	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 20:17:28.044186+00
efc9cacb-5ece-45eb-98f5-b2f282ffe159	support@musicalbasics.com	failed_login	failure	Invalid login credentials	\N	2025-12-14 20:33:02.6209+00
419cf4fd-83b7-4ec2-8025-4128b2802de9	support@musicalbasics.com	login	success	\N	\N	2025-12-14 20:33:06.494926+00
0b8cf043-f7f2-4d89-809b-d4901fea82e0	jaydeireland@gmail.com	reset_request	success	\N	\N	2025-12-14 21:03:47.522993+00
bf578bd4-7de4-4705-bf91-a57d35b145f2	support@musicalbasics.com	login	success	\N	\N	2025-12-14 21:23:58.90229+00
146c38ed-e38f-4d24-82f1-d069b48b1141	support@musicalbasics.com	login	success	\N	\N	2025-12-14 22:09:11.368066+00
2658d5a0-8572-4319-b332-4a807ddcdea5	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 22:10:20.333433+00
b2874794-0066-48d3-b145-5e87ce25e56d	support@musicalbasics.com	login	success	\N	\N	2025-12-14 22:10:48.119077+00
78d81aad-2ddd-4d09-97d3-1d74db2ffecb	support@musicalbasics.com	login	success	\N	\N	2025-12-14 22:15:29.948741+00
1acd59aa-7521-405f-b7c2-bc1c4686fade	yulionel829@gmail.com	login	success	\N	\N	2025-12-14 23:13:21.77163+00
11630ce0-9145-4810-a57e-f475c6d3499c	support@musicalbasics.com	login	success	\N	\N	2025-12-14 23:13:44.14745+00
e4b19d26-fa48-4353-b476-32058ecddf89	aldaigle@gmail.com	reset_request	success	\N	\N	2025-12-15 00:05:10.630589+00
5678c03c-7405-4e48-ac62-7338db1322e2	aldaigle@gmail.com	reset_request	success	\N	\N	2025-12-15 00:07:53.392275+00
cdd5470c-efb4-4e39-98cb-518198deb4d8	aldaigle@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-15 00:10:05.125906+00
5322ac3c-c14c-49d1-8046-edcc4b0aba15	aldaigle@gmail.com	reset_request	success	\N	\N	2025-12-15 00:10:53.278168+00
1a479c36-1983-41b2-9494-ba5c45600c87	aldaigle@gmail.com	reset_completed	success	\N	\N	2025-12-15 00:11:37.331647+00
883b8cb9-80f1-4fef-bab8-f1867f81eb67	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 09:19:32.787492+00
9344245b-5f65-4a8a-88d5-715a1e767f27	yulionel829@gmail.com	reset_request	success	\N	\N	2025-12-15 09:19:43.785322+00
303049ef-5cbc-4bb6-97e0-6606f88eeaae	yulionel829@gmail.com	reset_request	success	\N	\N	2025-12-15 13:35:57.258419+00
9cd00cd0-ca59-400b-9caa-b1301d76baab	yulionel829@gmail.com	reset_request	success	\N	\N	2025-12-15 13:38:23.590391+00
0d7f8ee3-801a-4da3-bb7b-e41188a0f2cd	support@musicalbasics.com	login	success	\N	\N	2025-12-15 13:58:00.816255+00
18afda0a-9fa7-4a92-8696-4ea7a6cac880	support@musicalbasics.com	login	success	\N	\N	2025-12-15 14:03:18.538998+00
d413ba88-11b3-40e6-9e28-c774dbfe70f6	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 14:05:39.655094+00
ce1cd74e-61fb-40b3-bdfc-4d508ec9eabe	yulionel829@gmail.com	payment_success	success	Purchased 4 credits ($165)	\N	2025-12-15 14:06:04.006341+00
3a72d4d1-0af0-4313-a28b-40a5c6caefc3	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 14:12:27.635871+00
33fe5489-83c5-4148-b841-9462f6dc039b	yulionel829@gmail.com	payment_success	success	Purchased 1 credits ($1)	\N	2025-12-15 14:44:02.750731+00
356b6fed-f172-40c3-b6d1-1349c8c4bb32	yulionel829@gmail.com	payment_success	success	Purchased 4 credits ($1)	\N	2025-12-15 14:44:43.554152+00
d947821b-2c18-432d-9ab0-1187dfd63eb9	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 14:53:18.067804+00
48d0c845-6026-474c-82d4-8b448867b614	support@musicalbasics.com	login	success	\N	\N	2025-12-15 14:53:26.91085+00
ddfb0f1d-7a96-4082-ac89-613b3afacba4	support@musicalbasics.com	login	success	\N	\N	2025-12-15 14:59:31.853054+00
d34c63b7-05a6-451d-a275-b8c53d111e74	yulionel829@gmail.com	payment_success	success	Purchased 1 credits ($1)	\N	2025-12-15 15:29:25.609347+00
884057c9-960e-4182-a1ec-dd9b7925c777	yulionel829@gmail.com	payment_success	success	Purchased 4 credits ($1)	\N	2025-12-15 15:38:32.437149+00
6954f6d9-3318-4589-bcd9-c6d5d74a7a5d	yulionel829@gmail.com	payment_success	success	Purchased 1 credits ($1)	\N	2025-12-15 15:39:33.007979+00
f60dfee0-61c6-4130-87ba-1cf6b5c67916	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 19:50:12.269424+00
956f4485-00d7-4c75-b598-89577446442f	support@musicalbasics.com	login	success	\N	\N	2025-12-15 19:51:07.38495+00
008312e1-0bfd-4727-b2c4-e14de6f2a0dd	yulionel829@gmail.com	login	success	\N	\N	2025-12-15 19:52:31.051836+00
6c37e831-f82f-4902-a8ff-94efe2ea6db0	jaydeireland@gmail.com	reset_request	success	\N	\N	2025-12-15 22:09:19.66465+00
d48692c8-343d-4652-9077-5243bcb31ada	jaydeireland@gmail.com	reset_request	success	\N	\N	2025-12-15 22:09:20.861026+00
0926d36d-c2bd-4d25-b64a-8b638fc7f83b	jaydeireland@gmail.com	reset_request	success	\N	\N	2025-12-15 22:14:29.148843+00
0412d537-3112-4267-9b2f-d020a38c1672	support@musicalbasics.com	login	success	\N	\N	2025-12-15 22:22:45.153258+00
dee8912a-ea1d-42d2-977d-973807cb00b8	jayde.ireland@gmail.com	reset_request	success	\N	\N	2025-12-15 22:31:45.40277+00
aeb6a335-a209-4aa0-8c02-e347c8e405b0	jayde.ireland@gmail.com	reset_completed	success	\N	\N	2025-12-15 22:32:16.06478+00
13b35aa3-5d93-4b9c-91a4-497eae200fef	yulionel829@gmail.com	reset_request	success	\N	\N	2025-12-15 22:33:33.38003+00
05d2acc2-0332-4e9b-9832-cef92cb9a76c	support@musicalbasics.com	login	success	\N	\N	2025-12-15 22:34:16.346167+00
a1aff3fd-3e5e-4964-a149-659ef8bfe8f2	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-15 22:38:58.032015+00
234441d2-e0aa-4d97-a30d-fdc1f8dd878b	aldaigle@gmail.com	login	success	\N	\N	2025-12-16 02:48:47.480509+00
ef343735-e848-4c6d-9549-2f3cc7dc7745	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 10:28:17.816727+00
a40c53da-dc41-4db1-874e-e4e5d2d98951	support@musicalbasics.com	login	success	\N	\N	2025-12-16 10:28:49.192601+00
29bbe6cb-7bad-4746-882c-1f07b7459ec2	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 10:29:09.09738+00
243f5a1e-87ce-459c-b053-e5900d58a8d9	support@musicalbasics.com	login	success	\N	\N	2025-12-16 10:29:21.484481+00
d49c5beb-e767-42c6-b1e5-477e3ef33042	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 10:30:06.295784+00
8243d633-c779-4e31-b321-d4c86f31d5a8	support@musicalbasics.com	login	success	\N	\N	2025-12-16 11:27:13.100418+00
97b43baf-ded1-432f-aa7d-29648c239f86	support@musicalbasics.com	login	success	\N	\N	2025-12-16 16:17:04.65434+00
56718859-78b2-403c-b0d1-1507dd3d9f6a	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 16:17:30.172498+00
1da3e409-1b91-498f-a4f8-6b8974795138	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 16:22:13.683052+00
5fc564e1-c115-4f42-9fbb-68ee18652790	support@musicalbasics.com	login	success	\N	\N	2025-12-16 16:23:15.076414+00
c9bed713-a4b2-46eb-bf6f-052a48c8e044	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 16:24:21.042764+00
cca1c910-7685-4604-8a80-4d363a49309f	support@musicalbasics.com	login	success	\N	\N	2025-12-16 16:49:51.848989+00
c34ee7ab-9722-4009-a29b-5c811c50f10f	yulionel829@gmail.com	login	success	\N	\N	2025-12-16 16:53:13.90731+00
d4bd91ed-ba6c-4722-979f-40fb16c673ec	support@musicalbasics.com	login	success	\N	\N	2025-12-16 16:53:48.08014+00
03b38e70-4d9f-4265-bd27-a1fbebfed6df	support@musicalbasics.com	login	success	\N	\N	2025-12-16 22:48:42.573267+00
53ea0165-5844-4e69-97eb-7282bfb8e35d	yakir30g@gmail.com	login	success	\N	\N	2025-12-16 22:49:40.384178+00
0f131e7f-7774-4946-9495-ecb6d192b7b9	support@musicalbasics.com	login	success	\N	\N	2025-12-16 22:54:52.012675+00
707d59cb-1876-481e-bc43-51523ef27180	support@musicalbasics.com	login	success	\N	\N	2025-12-16 23:17:16.416865+00
91a78bc8-243d-4a5b-a550-e7625474098f	aldaigle@gmail.com	login	success	\N	\N	2025-12-17 01:22:17.818607+00
73dd003a-1ca6-48d1-83a7-94faab27b225	support@musicalbasics.com	login	success	\N	\N	2025-12-17 02:20:22.569255+00
65486818-85bc-432b-9d2a-08ab6118238d	yulionel829@gmail.com	login	success	\N	\N	2025-12-17 02:21:15.389666+00
7aa465a2-7496-4766-806f-81ebcb761158	support@musicalbasics.com	login	success	\N	\N	2025-12-17 02:21:48.263225+00
03ec80b6-6fbb-47af-b49a-e4f027fb56ec	yulionel829@gmail.com	login	success	\N	\N	2025-12-17 02:22:19.922406+00
66f74e6e-767b-4053-9180-ce96ea3ca3fe	support@musicalbasics.com	login	success	\N	\N	2025-12-17 03:51:03.835723+00
a05b616e-069f-40d4-ac11-c75276235979	yakir30g@gmail.com	login	success	\N	\N	2025-12-17 06:36:31.646104+00
8cce46e7-1a80-4ad9-a4b9-8b7c7f9cb17e	yakir30g@gmail.com	login	success	\N	\N	2025-12-17 06:39:53.908925+00
df309c72-3148-4712-834e-d9c317477655	yakir30g@gmail.com	login	success	\N	\N	2025-12-17 06:41:01.02128+00
2931668a-8018-4ae5-a298-2ccb9ab53fde	yakir30g@gmail.com	login	success	\N	\N	2025-12-17 07:01:15.548478+00
44dc79ce-4ec7-4ee8-8ed7-c41ae58e0677	support@musicalbasics.com	login	success	\N	\N	2025-12-17 15:31:03.117566+00
f995b33c-2c42-464f-bb7e-e9048a737153	support@musicalbasics.com	login	success	\N	\N	2025-12-18 13:39:58.820752+00
c4123afe-b984-4fb7-bc57-2fc8e3730839	support@musicalbasics.com	login	success	\N	\N	2025-12-18 15:16:13.855954+00
2b1edc95-ef76-495d-a6b1-314338236890	support@musicalbasics.com	login	success	\N	\N	2025-12-19 01:57:56.793906+00
7959522e-b959-4241-87cb-31a507d0ec15	kylie718@gmail.com	reset_request	success	\N	\N	2025-12-19 15:13:00.419651+00
994b7b58-fb70-44f7-98ff-4c34561a75ea	kylie718@gmail.com	reset_completed	success	\N	\N	2025-12-19 15:13:23.370384+00
1d6f6fe7-058c-4ae7-9b1c-c373de8fe9af	support@musicalbasics.com	login	success	\N	\N	2025-12-19 22:46:28.093528+00
07a31127-7195-4414-bbc5-c941675c3eaa	yulionel829@gmail.com	login	success	\N	\N	2025-12-19 23:42:03.470339+00
163541f7-5315-4c80-b4f7-cd500dd1a3b3	yulionel829@gmail.com	login	success	\N	\N	2025-12-20 00:20:57.149896+00
f50d3457-89bf-425a-b131-bd876e31c05b	support@musicalbasics.com	login	success	\N	\N	2025-12-20 00:21:21.515341+00
d2b6186a-90b6-4023-9206-beef954ae9a1	yulionel829@gmail.com	login	success	\N	\N	2025-12-20 00:22:15.328116+00
1fad8a56-9711-4c3e-9375-ebfc2c534aa0	support@musicalbasics.com	login	success	\N	\N	2025-12-20 00:23:20.673635+00
11c7d645-6a4d-448f-a9e3-b87c04b5c5b4	yulionel829@gmail.com	login	success	\N	\N	2025-12-20 00:23:59.268976+00
344d41a3-e6d7-4e95-805c-f1e8cf20a28d	support@musicalbasics.com	login	success	\N	\N	2025-12-20 00:24:37.938402+00
a55a9ac9-9333-4ffb-91a2-3ba321bbcb55	yulionel829@gmail.com	login	success	\N	\N	2025-12-20 00:25:52.233836+00
bbba6e8d-3b04-40df-a946-b981c91cd2c3	support@musicalbasics.com	login	success	\N	\N	2025-12-20 03:41:18.414066+00
7d845411-aa51-4d43-9c1a-bf2fbf754d60	royxtz@gmail.com	reset_request	success	\N	\N	2025-12-20 03:58:14.401626+00
97700e26-76a0-45a9-bd97-7b0f0b88e16f	royxtz@gmail.com	reset_request	success	\N	\N	2025-12-20 04:00:25.581413+00
6fd13f2f-12fc-4f82-8e8e-6e422ac2e110	royxtz@gmail.com	reset_request	success	\N	\N	2025-12-20 04:00:26.404484+00
6116d2de-59c4-4ff3-92dd-6c621ab4f817	zouwu80@gmail.com	reset_request	success	\N	\N	2025-12-20 06:48:03.773083+00
56875271-3584-4fc0-b7ae-9a5b993ef1a1	zouwu80@gmail.com	reset_completed	success	\N	\N	2025-12-20 06:50:07.3014+00
78add2bf-6024-40dd-a98c-4086dd23ddd3	zouwu80@gmail.com	login	success	\N	\N	2025-12-20 07:24:41.701396+00
5d543bf0-80b0-4162-9ece-d92ffb0b469f	yakir30g@gmail.com	login	success	\N	\N	2025-12-20 13:10:18.45728+00
1b0084bf-8045-4d8d-95ea-e04fdb105fec	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:02:32.354865+00
0d94b74d-f012-4f5a-b79a-f7372766b133	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:03:02.671806+00
c3926503-6f68-4f3e-8502-4fc2a22abf56	micahfinn1@gmail.com	reset_request	success	\N	\N	2025-12-20 15:03:20.276795+00
378c19d3-4931-45d9-96a6-db8a65a22dbc	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:03:50.234285+00
116ca177-ca48-45e8-b0f1-15ac20ed903f	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:05:13.454847+00
d9ced973-bea6-4372-872e-db12c16dbeb7	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:05:22.338122+00
cdb54a44-547f-4822-9cf7-98e59262373c	micahfinn1@gmail.com	reset_request	success	\N	\N	2025-12-20 15:05:39.514675+00
12a5bb2e-0c34-4b3e-9d59-2d7f2048e69b	living4him76@yahoo.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:06:27.50058+00
3e681759-74a2-4040-b72b-a6430421b443	living4him76@yahoo.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:06:34.361832+00
8b348b49-a263-4641-845b-c409d57ddd1e	living4him76@yahoo.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:06:43.137156+00
9fb9d97f-ff0c-4153-85c7-55f2583a8f92	living4him76@yahoo.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 15:06:46.290029+00
019a78b2-96f2-4492-87f7-4cbb7a6f1974	living4him76@yahoo.con	reset_request	success	\N	\N	2025-12-20 15:07:03.781616+00
a55fe377-7d47-44dc-b1bd-1ac098e05f5a	support@musicalbasics.com	login	success	\N	\N	2025-12-20 15:43:55.188576+00
20d6a339-cf54-49bb-b955-787fdd3c0867	micahfinn1@gmail.com	login	success	\N	\N	2025-12-20 15:45:30.414691+00
fa0c734d-2ad0-4034-8e40-33c3c4ce3697	sarabjitmatharu@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 16:31:45.282055+00
ff0cbfc8-bcba-4bdc-a884-51ec6545f700	sarabjitmatharu@gmail.com	reset_request	success	\N	\N	2025-12-20 16:32:00.071553+00
56b6efc4-eca4-4f50-ae54-bd9a63dc6def	sarabjitmatharu@gmail.com	reset_completed	success	\N	\N	2025-12-20 16:32:20.036967+00
0318d70c-e707-41b5-92fb-7778cd30c011	sarabjitmatharu@gmail.com	payment_success	success	Purchased 4 credits ($165)	\N	2025-12-20 16:33:11.497053+00
09b5243f-5011-47bb-99c7-3c89acd654e2	jaydeireland@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 16:50:57.977115+00
ae7c6466-1015-4586-9750-1ba32c45add3	jaydeireland@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 16:51:10.963227+00
51bb7883-9efd-4757-9e82-a991b9f36b93	jaydeireland@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-20 16:51:56.625924+00
398b6203-52cd-429d-84b0-069b2f26c446	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-20 16:53:33.209558+00
fb70e269-43bb-4def-8762-d19fa96e3012	support@musicalbasics.com	login	success	\N	\N	2025-12-20 20:04:17.221392+00
0a4e9283-6e78-4b4e-afd2-fd8bebd9ba43	yulionel829@gmail.com	login	success	\N	\N	2025-12-20 23:41:03.199067+00
02b2f876-395a-455b-866e-21990f7adad9	kylie718@gmail.com	login	success	\N	\N	2025-12-21 00:31:53.430952+00
6f6ee6ef-46ac-4b11-b3e9-c9a5658bcbd9	micahfinn1@gmail.com	login	success	\N	\N	2025-12-21 04:42:46.758201+00
2e1e8eec-4c5e-4883-a372-2204a6ce8cce	micahfinn1@gmail.com	payment_success	success	Purchased 1 credits ($50)	\N	2025-12-21 04:45:51.417422+00
12cb184b-01d7-441b-abad-c86c99099fc9	support@musicalbasics.com	login	success	\N	\N	2025-12-21 19:51:45.096587+00
9cf1d730-afdd-421b-bb52-4c66c9de92bd	support@musicalbasics.com	login	success	\N	\N	2025-12-21 20:16:20.948196+00
e54d707a-6dca-4ad1-8360-02210eda2c54	klingx@gmail.com	reset_request	success	\N	\N	2025-12-21 20:30:35.326258+00
e563823a-c74f-48dd-aafc-f80b8e987506	klingx@gmail.com	reset_request	success	\N	\N	2025-12-21 20:30:35.981591+00
5fc54001-f890-4f4d-8903-99850e08a6a5	kylie718@gmail.com	login	success	\N	\N	2025-12-21 20:34:31.400604+00
ed78cef2-21e9-422b-bd9e-faa527196e0d	kylie718@gmail.com	reset_request	success	\N	\N	2025-12-21 20:44:54.033895+00
8296247c-1604-4461-9f80-2db5defb022c	kylie718@gmail.com	reset_completed	success	\N	\N	2025-12-21 20:45:40.404355+00
4e5a5490-5de8-4896-8590-cf1293d1975a	kylie718@gmail.com	login	success	\N	\N	2025-12-21 20:46:11.864823+00
9672dd8e-fa96-45a7-b641-dc5b852ba780	kylie718@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-21 20:50:14.149756+00
ea6cb3f8-e15f-4c4d-9894-ec52fdc5c9bf	kylie718@gmail.com	login	success	\N	\N	2025-12-21 20:50:34.025232+00
7ee01c5d-bead-43e4-9d70-e26075eb9969	support@musicalbasics.com	login	success	\N	\N	2025-12-21 20:54:06.647425+00
97a2b907-fe53-4581-9214-dc556eb48bda	yulionel829@gmail.com	login	success	\N	\N	2025-12-21 20:55:40.141615+00
ce7c6577-61c7-42b8-bada-b036dc69260d	support@musicalbasics.com	login	success	\N	\N	2025-12-21 21:00:24.19001+00
3ab40d22-e925-4b82-a5e0-88dbe0bb0669	support@musicalbasics.com	login	success	\N	\N	2025-12-21 21:30:44.218259+00
6a9cdc39-18e9-4988-b8ab-69877a947132	yulionel829@gmail.com	login	success	\N	\N	2025-12-21 23:28:09.264783+00
822b1c7f-0968-4506-b226-51b71a6799e9	support@musicalbasics.com	login	success	\N	\N	2025-12-21 23:28:44.072061+00
2983cc3e-8e88-4fb9-8386-8ca534434671	support@musicalbasics.com	login	success	\N	\N	2025-12-22 00:27:47.563634+00
a00165c2-2fbd-4d06-ad32-07c4d1f8c935	yulionel829@gmail.com	login	success	\N	\N	2025-12-22 03:12:51.25563+00
b220ccae-cc7e-432f-bbb5-222bced1d918	zouwu80@gmail.com	login	success	\N	\N	2025-12-22 03:24:35.923026+00
3b87a5db-09d2-40e0-8eac-fda8338fb3cb	yulionel829@gmail.com	login	success	\N	\N	2025-12-22 03:50:37.038743+00
3eaaa432-76e0-4454-8586-aeaad698b70a	support@musicalbasics.com	login	success	\N	\N	2025-12-22 04:25:15.938554+00
08f72f2d-14f6-4990-b3a0-869f4e4233f8	yulionel829@gmail.com	login	success	\N	\N	2025-12-22 04:27:43.570878+00
4cfd2b29-c6fd-4b23-a8d9-0a2bd7cc57e6	support@musicalbasics.com	login	success	\N	\N	2025-12-22 04:28:18.258435+00
74b7c3e2-b8fa-42d9-bc38-76131db0e243	yulionel829@gmail.com	login	success	\N	\N	2025-12-22 04:45:32.489623+00
57e29521-1027-44ac-8805-58c5243fc37d	support@musicalbasics.com	login	success	\N	\N	2025-12-22 04:51:48.739872+00
c6d61097-b73e-49df-b4e0-8cc6d34d6e50	support@musicalbasics.com	login	success	\N	\N	2025-12-22 14:31:05.366069+00
d4ecdc30-23c1-4251-be3b-6d23b5b2a113	support@musicalbasics.com	login	success	\N	\N	2025-12-22 16:42:06.47045+00
01aad768-7765-44f3-97cd-1c2c15dd31b1	ddmxuyang@gmail.com	reset_request	success	\N	\N	2025-12-23 00:01:22.53112+00
6402bbb5-35b9-404e-9297-7b36c54d2511	ddmxuyang@gmail.com	reset_completed	success	\N	\N	2025-12-23 00:02:03.30341+00
5b839135-d78d-4b7d-9907-2c8a0e2b21ef	support@musicalbasics.com	login	success	\N	\N	2025-12-23 00:33:30.273915+00
05340bc7-89f2-496a-8e21-b1b50a59ce11	support@musicalbasics.com	login	success	\N	\N	2025-12-23 00:49:22.788773+00
7828153f-7bb9-46cc-a69d-7987575b5b85	support@musicalbasics.com	login	success	\N	\N	2025-12-23 01:00:08.240988+00
2eeb38a8-fdd7-455d-8517-97984c2c1068	support@musicalbasics.com	login	success	\N	\N	2025-12-23 02:57:51.157514+00
f1fd256e-7039-4f69-9123-7387dc053fdc	ubermichellita@hotmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-24 03:03:50.814957+00
1aceca6e-3e2a-4c74-9de5-7cfc29a42eb8	ubermichellita@hotmail.com	reset_request	success	\N	\N	2025-12-24 03:04:06.70608+00
255ee600-548f-4f74-9230-e82091c8144c	ubermichellita@hotmail.com	reset_completed	success	\N	\N	2025-12-24 03:06:21.10968+00
1a588dae-035c-449b-ac19-c33f56c2bfd1	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-25 14:47:02.524587+00
37c06d14-0e7f-46b1-8994-d3c594ee83a7	support@musicalbasics.com	login	success	\N	\N	2025-12-25 16:38:21.427093+00
5bcb874c-8238-4622-b4ba-4fda0d89869e	support@musicalbasics.com	login	success	\N	\N	2025-12-25 21:29:00.226357+00
fbd8a4c7-2f02-4fb1-98ea-2a64b09b9e31	ddmxuyang@gmail.com	payment_success	success	Purchased 4 credits ($275)	\N	2025-12-26 00:27:00.847261+00
e924a1e8-bc59-418d-820f-e4c8cc46981a	kylie718@gmail.com	login	success	\N	\N	2025-12-26 01:41:10.59284+00
e551b69a-921d-4802-864e-0dcf2de0866b	kylie718@gmail.com	payment_success	success	Purchased 4 credits ($225)	\N	2025-12-26 01:41:45.146447+00
db80ec40-9ae2-4e37-b620-5d5e53cc994d	ubermichellita@hotmail.com	login	success	\N	\N	2025-12-26 02:21:33.262148+00
9f338b21-e00d-4624-bcab-95a0b58b6aa6	zouwu80@gmail.com	login	success	\N	\N	2025-12-26 04:05:00.541159+00
2f6cb7c2-7e84-44cf-8516-b64005fc759d	support@musicalbasics.com	login	success	\N	\N	2025-12-26 05:22:30.803618+00
8c2f312b-7084-429d-98de-809a9e465234	yulionel829@gmail.com	login	success	\N	\N	2025-12-26 05:22:56.326721+00
c595f97a-5cdc-49e6-9bd6-461aa05cff23	support@musicalbasics.com	login	success	\N	\N	2025-12-26 05:23:14.669018+00
ef2ebe05-e1d1-4eba-a615-24b69d795128	support@musicalbasics.com	login	success	\N	\N	2025-12-26 14:18:09.550718+00
dd75858a-5f95-474d-bd7d-4751dcbae5ec	caedcros@gmail.com	reset_request	success	\N	\N	2025-12-26 15:28:42.00868+00
365c7f33-4a32-4631-8acf-44b722846787	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-26 16:37:23.905495+00
4375eabc-2c7b-407e-800b-ff70506911b9	support@musicalbasics.com	login	success	\N	\N	2025-12-27 11:50:39.449018+00
019839e9-b8da-43cd-b6e8-f23a5930d677	ubermichellita@hotmail.com	login	success	\N	\N	2025-12-27 14:19:25.482019+00
f6f313e2-5803-42db-9bbe-86e412c3b412	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-27 18:18:33.153193+00
83b9e405-ac43-40b6-86f5-7a5e4d01bae8	zouwu80@gmail.com	login	success	\N	\N	2025-12-28 02:48:51.066636+00
b23e53c2-3691-4a99-b04b-2ab62538666f	zouwu80@gmail.com	payment_success	success	Purchased 4 credits ($225)	\N	2025-12-28 02:52:07.825137+00
0613d150-0ac9-42f9-bedd-6aba67d8d405	support@musicalbasics.com	login	success	\N	\N	2025-12-28 18:33:50.835523+00
04907e61-065a-4075-b932-cdb670f15598	kylie718@gmail.com	login	success	\N	\N	2025-12-28 21:01:08.675604+00
7433113d-e42d-48f5-9828-cdeed584f3d1	kylie718@gmail.com	login	success	\N	\N	2025-12-28 21:28:50.633016+00
88523f65-69a7-4b79-ae86-01b112e268b6	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:37:58.583058+00
3262d759-46bf-40a2-b3bd-2ecb8df8527e	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:38:03.035159+00
82ba7c01-61cf-4f21-ab62-f505834926d7	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:38:08.463838+00
6d7a41c6-7187-4bf2-82b2-82c8fd343924	oceanna.chan@outlook.com	reset_request	success	\N	\N	2025-12-28 22:38:20.224981+00
9c82eb4d-3fc2-459e-97fb-4b47b32ccf8f	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:40:57.31007+00
e6be9c5f-3acd-4966-8d78-7d3f323c9abe	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:41:02.048019+00
574c65fe-5a85-46ac-a2df-3f7baae75230	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-28 22:41:07.588739+00
5e64bd38-06f9-4e89-9131-bdc19722ef7a	ubermichellita@hotmail.com	login	success	\N	\N	2025-12-28 23:11:32.6123+00
1d433c78-4890-4df4-97eb-aefefe8bbadb	support@musicalbasics.com	login	success	\N	\N	2025-12-29 03:29:05.686567+00
0940f6c2-4bb8-4aaa-a820-6a248fb71491	support@musicalbasics.com	login	success	\N	\N	2025-12-29 13:56:45.674471+00
a2391a3a-e10b-4fbd-b9d9-3d094ff20a10	support@musicalbasics.com	login	success	\N	\N	2025-12-29 16:06:59.24594+00
64c7b163-81ca-43f6-97c4-94feeb2f0cec	support@musicalbasics.com	login	success	\N	\N	2025-12-29 18:21:57.821602+00
1b517c58-d5dd-4890-b015-11c8f8452d68	support@musicalbasics.com	login	success	\N	\N	2025-12-29 20:50:21.267635+00
ca274686-052a-4eb3-b0b2-d4f016b7aaba	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-29 22:04:47.688696+00
fdd647a6-d208-4c84-a1f0-d3270de20017	oceanna.chan@outlook.com	reset_request	success	\N	\N	2025-12-29 22:38:27.387808+00
6bb3d495-1385-4bd1-acd2-fe2bad03b81a	oceanna.chan@outlook.com	failed_login	failure	Invalid login credentials	\N	2025-12-29 22:38:40.812694+00
2415f7ec-0d44-4cf3-b288-bd4ace6fce70	oceanna.chan@outlook.com	login	success	\N	\N	2025-12-29 22:39:05.446742+00
be4f4119-8c67-431d-9d5e-a9dd32ba41f7	jayde.ireland@gmail.com	login	success	\N	\N	2025-12-29 22:44:38.597536+00
81a1674a-d402-437c-9a3f-3ff31f026eec	support@musicalbasics.com	login	success	\N	\N	2025-12-29 23:22:39.030258+00
1bfd7b80-2be9-446e-bb1a-88af9951c9c3	support@musicalbasics.com	login	success	\N	\N	2025-12-30 01:50:24.876522+00
aef4a6a5-6a0e-4ebd-87e7-a79d22292301	support@musicalbasics.com	login	success	\N	\N	2025-12-30 02:49:30.059474+00
2137d89b-ae5c-492b-ae3e-3fc30784692a	yakir30g@gmail.com	login	success	\N	\N	2025-12-30 07:40:47.602437+00
0137377e-0929-43ea-a1e5-bf92f83ed5dc	yakir30g@gmail.com	login	success	\N	\N	2025-12-30 07:51:03.135016+00
1295fd46-c31d-45e8-afcc-4d4b7d1875fb	yakir30g@gmail.com	login	success	\N	\N	2025-12-30 07:52:19.053361+00
98fb91b3-fa39-4b00-b666-0e7c7ed13dc4	support@musicalbasics.com	login	success	\N	\N	2025-12-30 17:11:17.807515+00
5d2cfc38-4a6d-46b7-9be4-830cb3b19c62	support@musicalbasics.com	login	success	\N	\N	2025-12-31 03:29:38.595902+00
38c92c19-c0a3-4b0d-a950-6969e04e4666	oceanna.chan@outlook.com	login	success	\N	\N	2025-12-31 17:18:28.098333+00
4e06a9fd-9b0d-4ea9-87dc-8839c4a3932e	ubermichellita@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-31 18:43:46.363586+00
dd8149d8-ae16-4eb2-ad2e-2852b46bfb45	ubermichellita@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-31 18:44:03.440275+00
a2bcb4f4-2efa-41f3-9990-217352e3a6db	ubermichellita@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-31 18:44:18.626237+00
61448dbc-e2aa-459e-8ac4-f4ac8441a3b9	ubermichellita@gmail.com	failed_login	failure	Invalid login credentials	\N	2025-12-31 18:44:54.074405+00
dba1f4ba-2eac-44d7-93d9-4eca8fbf71b7	ubermichellita@hotmail.com	login	success	\N	\N	2025-12-31 18:45:02.965814+00
bb62fabd-2bab-40de-91a7-a4c0b30d408f	ubermichellita@hotmail.com	login	success	\N	\N	2025-12-31 23:43:28.579252+00
091b814c-85eb-499a-b5f7-8faf4819d8a8	support@musicalbasics.com	login	success	\N	\N	2026-01-01 15:18:36.006743+00
2d8ec9a8-f832-4522-938d-3c95122954e3	support@musicalbasics.com	login	success	\N	\N	2026-01-01 15:40:40.762252+00
1bee6b00-5c24-47b2-b577-521c7fca98d3	yulionel829@gmail.com	login	success	\N	\N	2026-01-01 19:24:26.566682+00
e55faee6-3ab5-4b96-a900-140c0a7af9c3	support@musicalbasics.com	login	success	\N	\N	2026-01-01 19:40:29.512879+00
032ab8fd-047a-4481-95dd-ad08d906de58	yulionel829@gmail.com	login	success	\N	\N	2026-01-01 19:42:13.688062+00
d496733c-3fb3-4e22-b01c-a04f17cd8238	support@musicalbasics.com	login	success	\N	\N	2026-01-01 20:07:19.369896+00
578826d9-e5d7-4f60-854a-9fe9abece5c7	yulionel829@gmail.com	login	success	\N	\N	2026-01-01 20:07:45.508717+00
4179971d-b9d1-46cb-aa0f-1c18d9348b7e	support@musicalbasics.com	login	success	\N	\N	2026-01-01 20:32:04.677418+00
02b583bd-3eb4-40ed-bb5b-3875941d4e74	support@musicalbasics.com	login	success	\N	\N	2026-01-01 21:36:50.154796+00
bdc018a6-edb9-4833-b8c7-4cf18fbeacc1	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2026-01-01 22:56:46.22374+00
4e010e85-06a1-440d-bbc0-070b139c4f40	micahfinn1@gmail.com	failed_login	failure	Invalid login credentials	\N	2026-01-01 22:56:50.545884+00
725ced5a-4149-48df-936f-10666291c490	micahfinn1@gmail.com	login	success	\N	\N	2026-01-01 22:56:56.211104+00
ec53b6e4-890b-4e1f-9f1f-16ac7ced7758	micahfinn1@gmail.com	login	success	\N	\N	2026-01-01 23:12:23.784629+00
813163dd-5b1b-4ca6-9944-bd2c97cc00c4	zouwu80@gmail.com	login	success	\N	\N	2026-01-01 23:12:59.477212+00
a05e199a-e48c-4d35-a096-b7faa8912f02	zouwu80@gmail.com	login	success	\N	\N	2026-01-01 23:13:51.764117+00
89a6cab8-24f4-45e5-9185-a02bc406085a	micahfinn1@gmail.com	login	success	\N	\N	2026-01-01 23:19:57.943076+00
aeabbfdb-5c10-4702-9e4a-160a2119104d	micahfinn1@gmail.com	login	success	\N	\N	2026-01-01 23:22:23.938903+00
2c59b295-540b-4bee-b787-d9946bd934ca	support@musicalbasics.com	login	success	\N	\N	2026-01-01 23:35:26.528454+00
9814f4f8-bf08-44cb-8a37-23d6f3b5d368	micahfinn1@gmail.com	login	success	\N	\N	2026-01-02 00:03:10.519469+00
4e83abf2-dfd9-4dc0-bfcf-d26606d5dc94	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 03:32:02.26474+00
7bd8868d-6d20-4336-a63c-11b1c70c3075	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 04:18:33.739536+00
bdd1b5f6-f3fb-4966-89ee-050134e6e14b	support@musicalbasics.com	login	success	\N	\N	2026-01-02 05:01:15.77272+00
8f41cbfa-b703-493b-bed4-0264dd12e230	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 05:01:21.72641+00
fc1a2c1f-32ab-4ad2-ad51-cc53ace30de2	support@musicalbasics.com	login	success	\N	\N	2026-01-02 05:01:27.978251+00
23e5001f-8017-43b4-8d24-57877c4abb5e	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 05:03:06.975288+00
f59320df-9053-436d-94ed-824149a513ea	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 14:42:07.445638+00
e074e1a4-2a7d-42a1-b1d0-004822f25831	support@musicalbasics.com	login	success	\N	\N	2026-01-02 14:58:36.850642+00
8058c502-e5fe-42a7-a241-a4e051fd920b	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 14:59:22.372992+00
1a3a28f0-c037-4ebb-811a-df0fa677bcb2	support@musicalbasics.com	login	success	\N	\N	2026-01-02 15:00:02.482198+00
1da34c20-0b34-4386-909f-fbe52c7de6b2	yulionel829@gmail.com	login	success	\N	\N	2026-01-02 15:03:00.399188+00
12c76b64-187c-4449-ac86-77734d6dc4b0	ubermichellita@hotmail.com	login	success	\N	\N	2026-01-02 16:08:34.306678+00
e34e4242-4cd2-43fb-b2dd-ad2ba32b3858	support@musicalbasics.com	login	success	\N	\N	2026-01-02 16:11:14.8281+00
19ddc30e-03c2-4c78-a8dd-16cceff65ad2	djsputty@gmail.com	login	success	\N	\N	2026-01-02 17:14:57.149174+00
b252b874-3d8f-4269-a544-1fbfa1712893	support@musicalbasics.com	login	success	\N	\N	2026-01-02 17:15:18.073513+00
dbd0f58b-951a-4f6b-972a-96b67f61cdeb	ubermichellita@hotmail.com	login	success	\N	\N	2026-01-02 18:59:04.022868+00
94a954e4-1a5a-441f-aa29-740ee6b18026	ubermichellita@hotmail.com	login	success	\N	\N	2026-01-02 19:01:30.522751+00
9ee1deaa-cc90-4fc5-b907-fec4a2e06e2a	yakir30g@gmail.com	login	success	\N	\N	2026-01-02 19:34:19.530298+00
362e94ab-c2aa-47ab-b103-ab903a61f4db	support@musicalbasics.com	login	success	\N	\N	2026-01-02 20:59:41.590055+00
b73794c7-16c5-44d7-b7f7-fc62467e1eeb	ubermichellita@hotmail.com	login	success	\N	\N	2026-01-02 22:16:31.808735+00
f1052922-adc9-4d67-b483-b9302b427516	ubermichellita@hotmail.com	login	success	\N	\N	2026-01-02 22:54:03.989267+00
a37f6c51-b9f3-4ab2-952d-7d204106b9f1	support@musicalbasics.com	login	success	\N	\N	2026-01-03 03:32:54.964362+00
d4dae68c-5d39-458d-b35b-90274581b8b4	yulionel829@gmail.com	login	success	\N	\N	2026-01-03 10:12:01.925572+00
145208aa-98a1-49a1-88aa-d4c224a0aaef	support@musicalbasics.com	login	success	\N	\N	2026-01-03 10:26:33.1153+00
1d4e90dc-005d-4299-98cc-0f8dcc2dcc19	yakir30g@gmail.com	login	success	\N	\N	2026-01-03 15:07:52.285421+00
f6bcdf94-fa7c-45b2-9d66-0620d4ff5ab7	yakir30g@gmail.com	login	success	\N	\N	2026-01-03 15:09:49.309859+00
c2ff1268-49c2-4c82-a914-32c942d79d7b	yulionel829@gmail.com	login	success	\N	\N	2026-01-03 17:22:48.436257+00
f59ac6fc-3707-45d9-a99c-7416a92d2469	support@musicalbasics.com	login	success	\N	\N	2026-01-03 22:28:29.575993+00
ba13f492-dd4c-42f1-af1a-5d154eb58305	yulionel829@gmail.com	login	success	\N	\N	2026-01-03 22:39:41.103563+00
649bf965-06b1-46a2-ae1d-b4991cb5529c	yulionel829@gmail.com	login	success	\N	\N	2026-01-03 22:55:49.92516+00
2746a432-1aa9-4407-9748-77f4c8d5631f	nate.mahon@icloud.com	failed_login	failure	Invalid login credentials	\N	2026-01-03 23:39:27.907767+00
7f7c3387-743f-4c85-a764-2310bd2f81c3	support@musicalbasics.com	login	success	\N	\N	2026-01-04 00:52:48.870303+00
331fa6f3-1c4d-48b3-bd6b-6c1de1855e04	yulionel829@gmail.com	login	success	\N	\N	2026-01-04 00:55:00.429053+00
3c2f9dfd-4830-41d1-977e-7ce0256e68ca	aldaigle@gmail.com	login	success	\N	\N	2026-01-04 01:24:20.024849+00
7b324450-5ff9-4c38-9076-70d4efe61b1a	support@musicalbasics.com	login	success	\N	\N	2026-01-04 02:47:22.633173+00
62d5be7c-00a9-4c4b-ab13-a08c487ed1a1	yulionel829@gmail.com	login	success	\N	\N	2026-01-04 02:48:19.017094+00
7f919835-295a-40e4-8784-6c617c127c24	support@musicalbasics.com	login	success	\N	\N	2026-01-04 02:57:26.146846+00
ac06c709-f578-417c-b0c7-b6030aed2947	support@musicalbasics.com	login	success	\N	\N	2026-01-04 02:59:25.046664+00
\.


--
-- Data for Name: classroom_annotations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classroom_annotations (id, student_id, song_id, data, updated_at) FROM stdin;
9b7c74ba-a089-4475-bdd3-ee2e6981572d	edwin_guo	la-campanella	{"0": {"objects": [{"top": 215.5, "fill": null, "left": 563.9355, "path": [["M", 445, 91.996], ["Q", 445, 92, 445, 93], ["Q", 445, 94, 445, 95.5], ["Q", 445, 97, 446.5, 101], ["Q", 448, 105, 450, 109.5], ["Q", 452, 114, 455.5, 122], ["Q", 459, 130, 464, 141.5], ["Q", 469, 153, 473.5, 164.5], ["Q", 478, 176, 484, 190], ["Q", 490, 204, 495.5, 215.5], ["Q", 501, 227, 509.5, 239], ["Q", 518, 251, 532.5, 268.5], ["Q", 547, 286, 558, 296], ["Q", 569, 306, 578.5, 311], ["Q", 588, 316, 600.5, 321], ["Q", 613, 326, 622, 329], ["Q", 631, 332, 638, 333], ["Q", 645, 334, 649.5, 334], ["Q", 654, 334, 656.5, 334], ["Q", 659, 334, 664.5, 332.5], ["Q", 670, 331, 675.5, 329], ["Q", 681, 327, 687, 323.5], ["Q", 693, 320, 698.5, 316.5], ["Q", 704, 313, 711, 306.5], ["Q", 718, 300, 730, 287], ["Q", 742, 274, 751, 262], ["Q", 760, 250, 765.5, 239], ["Q", 771, 228, 775.5, 215.5], ["Q", 780, 203, 781.5, 196.5], ["Q", 783, 190, 783.5, 187], ["Q", 784, 184, 783.5, 181.5], ["Q", 783, 179, 781.5, 176], ["Q", 780, 173, 777.5, 169.5], ["Q", 775, 166, 773, 163.5], ["Q", 771, 161, 768, 159], ["Q", 765, 157, 760.5, 154.5], ["Q", 756, 152, 750, 150.5], ["Q", 744, 149, 735.5, 148.5], ["Q", 727, 148, 717, 149], ["Q", 707, 150, 691, 153], ["Q", 675, 156, 623, 173], ["Q", 571, 190, 547.5, 203], ["Q", 524, 216, 496, 233.5], ["Q", 468, 251, 448.5, 265], ["Q", 429, 279, 409, 294], ["Q", 389, 309, 366.5, 324], ["L", 343.996, 339.004]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 439.879, "height": 247.008, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 432.5, "fill": null, "left": 632.5, "path": [["M", 245.996, 451], ["Q", 246, 451, 246.5, 451], ["Q", 247, 451, 248.5, 451], ["Q", 250, 451, 253, 450.5], ["Q", 256, 450, 266.5, 449], ["Q", 277, 448, 289, 447.5], ["Q", 301, 447, 323, 445], ["Q", 345, 443, 386, 440.5], ["Q", 427, 438, 458.5, 437], ["Q", 490, 436, 522.5, 435], ["Q", 555, 434, 598, 432.5], ["Q", 641, 431, 675.5, 429.5], ["Q", 710, 428, 748, 426.5], ["Q", 786, 425, 815, 424], ["Q", 844, 423, 869, 421.5], ["Q", 894, 420, 927.5, 418.5], ["Q", 961, 417, 978, 416], ["Q", 995, 415, 1001, 414.5], ["Q", 1007, 414, 1011, 414], ["Q", 1015, 414, 1017, 414], ["L", 1019.004, 414]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 773.008, "height": 37, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 563.5, "fill": null, "left": 883.5, "path": [["M", 931.004, 565], ["Q", 931, 565, 930.5, 565], ["Q", 930, 565, 929.5, 565], ["Q", 929, 565, 926, 565], ["Q", 923, 565, 919.5, 565], ["Q", 916, 565, 908, 565], ["Q", 900, 565, 889.5, 564], ["Q", 879, 563, 869.5, 562.5], ["Q", 860, 562, 854, 562], ["Q", 848, 562, 845.5, 562], ["Q", 843, 562, 839.5, 562], ["L", 835.996, 562]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 95.008, "height": 3, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}}	2026-01-01 18:46:55.477+00
dff96720-3eb0-4c25-9578-0a7e8e848745	b1814878-5d12-4cb4-8a68-5d89213c698c	la-campanella	{"0": {"objects": [{"top": 323.7241, "fill": null, "left": 534.1194, "path": [["M", 439.004, 73.996], ["Q", 439, 74, 434.5, 77.5], ["Q", 430, 81, 425, 86], ["Q", 420, 91, 415, 97], ["Q", 410, 103, 402.5, 113.5], ["Q", 395, 124, 382.5, 142.5], ["Q", 370, 161, 361, 180], ["Q", 352, 199, 342.5, 225], ["Q", 333, 251, 327, 271], ["Q", 321, 291, 316, 315], ["Q", 311, 339, 305.5, 375.5], ["Q", 300, 412, 299.5, 434.5], ["Q", 299, 457, 301.5, 473.5], ["Q", 304, 490, 308.5, 506.5], ["Q", 313, 523, 317.5, 533], ["Q", 322, 543, 327, 548.5], ["Q", 332, 554, 336.5, 558], ["Q", 341, 562, 346.5, 564.5], ["Q", 352, 567, 372, 570.5], ["Q", 392, 574, 407, 572.5], ["Q", 422, 571, 439.5, 567], ["Q", 457, 563, 470.5, 558.5], ["Q", 484, 554, 522, 533.5], ["Q", 560, 513, 579.5, 499.5], ["Q", 599, 486, 627, 464], ["Q", 655, 442, 673.5, 424.5], ["Q", 692, 407, 704.5, 390], ["Q", 717, 373, 731, 344], ["Q", 745, 315, 746, 305.5], ["Q", 747, 296, 746.5, 289], ["Q", 746, 282, 743.5, 276], ["Q", 741, 270, 737, 262], ["Q", 733, 254, 729, 249.5], ["Q", 725, 245, 715.5, 238], ["Q", 706, 231, 702.5, 229], ["Q", 699, 227, 694.5, 225], ["Q", 690, 223, 688, 222], ["Q", 686, 221, 682.5, 221], ["Q", 679, 221, 673.5, 220.5], ["Q", 668, 220, 660.5, 220], ["Q", 653, 220, 640, 219.5], ["Q", 627, 219, 614.5, 218.5], ["Q", 602, 218, 588, 218], ["Q", 574, 218, 555, 218], ["Q", 536, 218, 522.5, 218.5], ["Q", 509, 219, 500, 220.5], ["Q", 491, 222, 481, 224], ["Q", 471, 226, 465.5, 228], ["Q", 460, 230, 453.5, 233], ["Q", 447, 236, 442, 239], ["Q", 437, 242, 433.5, 245.5], ["Q", 430, 249, 425, 254.5], ["Q", 420, 260, 417, 265], ["Q", 414, 270, 411.5, 276.5], ["Q", 409, 283, 406, 302], ["Q", 403, 321, 403.5, 333], ["Q", 404, 345, 406, 356], ["Q", 408, 367, 411.5, 378], ["Q", 415, 389, 427, 411.5], ["Q", 439, 434, 444.5, 439.5], ["Q", 450, 445, 455, 449], ["Q", 460, 453, 466.5, 456.5], ["Q", 473, 460, 483.5, 464.5], ["Q", 494, 469, 502, 470], ["Q", 510, 471, 532.5, 470], ["Q", 555, 469, 569.5, 466], ["Q", 584, 463, 616, 451], ["Q", 648, 439, 664, 429.5], ["Q", 680, 420, 693, 409], ["Q", 706, 398, 727.5, 373.5], ["Q", 749, 349, 758.5, 323.5], ["Q", 768, 298, 768.5, 287], ["Q", 769, 276, 769, 264], ["Q", 769, 252, 764, 242.5], ["Q", 759, 233, 751.5, 229.5], ["Q", 744, 226, 734.5, 223.5], ["Q", 725, 221, 716.5, 220], ["Q", 708, 219, 702.5, 219], ["Q", 697, 219, 687.5, 219], ["Q", 678, 219, 670, 219.5], ["Q", 662, 220, 654.5, 221], ["Q", 647, 222, 641, 222.5], ["Q", 635, 223, 630, 223.5], ["Q", 625, 224, 618, 225.5], ["Q", 611, 227, 607.5, 228.5], ["Q", 604, 230, 600, 232.5], ["Q", 596, 235, 594.5, 236], ["Q", 593, 237, 592, 238.5], ["Q", 591, 240, 590, 240.5], ["Q", 589, 241, 587, 245], ["Q", 585, 249, 584, 250.5], ["Q", 583, 252, 581, 257], ["Q", 579, 262, 578, 264], ["Q", 577, 266, 576, 268.5], ["Q", 575, 271, 574, 273], ["Q", 573, 275, 572.5, 276.5], ["Q", 572, 278, 571, 280.5], ["Q", 570, 283, 569.5, 284.5], ["Q", 569, 286, 568.5, 288], ["Q", 568, 290, 567.5, 291.5], ["Q", 567, 293, 567, 294.5], ["Q", 567, 296, 567, 298], ["Q", 567, 300, 566.5, 303.5], ["Q", 566, 307, 566, 310], ["Q", 566, 313, 566, 314.5], ["Q", 566, 316, 566, 318], ["Q", 566, 320, 566, 323], ["Q", 566, 326, 566.5, 330.5], ["Q", 567, 335, 567.5, 337.5], ["Q", 568, 340, 568.5, 342], ["Q", 569, 344, 569.5, 346.5], ["Q", 570, 349, 570.5, 351], ["Q", 571, 353, 571.5, 354.5], ["Q", 572, 356, 572, 356.5], ["Q", 572, 357, 572.5, 358], ["Q", 573, 359, 573, 360], ["Q", 573, 361, 573.5, 361.5], ["Q", 574, 362, 574, 363], ["Q", 574, 364, 574.5, 364], ["Q", 575, 364, 575.5, 365.5], ["L", 576.004, 367.004]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 469.7613, "height": 499.4561, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}}	2026-01-01 19:21:51.806+00
3cc24683-455a-4144-adf4-4d28ddd6999e	10128b61-f8e6-44cf-86af-7c7f4669705a	la-campanella	{"0": {"objects": [{"top": 251, "fill": null, "left": 831.998, "path": [["M", 692.996, 22.996], ["Q", 693, 23, 694.5, 25], ["Q", 696, 27, 699, 30.5], ["Q", 702, 34, 705.5, 38], ["Q", 709, 42, 715.5, 51], ["Q", 722, 60, 747, 95], ["Q", 772, 130, 784, 147.5], ["Q", 796, 165, 805, 178.5], ["Q", 814, 192, 821.5, 204.5], ["Q", 829, 217, 841.5, 236], ["Q", 854, 255, 862.5, 265.5], ["Q", 871, 276, 878, 284.5], ["Q", 885, 293, 898.5, 306.5], ["Q", 912, 320, 917.5, 323], ["Q", 923, 326, 927, 328], ["Q", 931, 330, 933.5, 330.5], ["Q", 936, 331, 940.5, 331.5], ["Q", 945, 332, 947, 331], ["Q", 949, 330, 950, 327.5], ["Q", 951, 325, 953.5, 318], ["Q", 956, 311, 958.5, 301], ["Q", 961, 291, 964.5, 267.5], ["Q", 968, 244, 969, 231], ["Q", 970, 218, 970.5, 202], ["Q", 971, 186, 971, 177.5], ["Q", 971, 169, 969.5, 165.5], ["Q", 968, 162, 966.5, 158.5], ["Q", 965, 155, 964, 153.5], ["Q", 963, 152, 961.5, 151.5], ["Q", 960, 151, 959.5, 151], ["Q", 959, 151, 956, 154], ["Q", 953, 157, 948.5, 162.5], ["Q", 944, 168, 936, 179.5], ["Q", 928, 191, 920, 204], ["Q", 912, 217, 896, 240], ["Q", 880, 263, 854.5, 299], ["Q", 829, 335, 809, 359], ["Q", 789, 383, 770, 404], ["Q", 751, 425, 727.5, 449], ["Q", 704, 473, 701.5, 476], ["L", 698.996, 479.004]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 278.004, "height": 456.008, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#8b5cf6", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}}	2026-01-01 19:22:09.396+00
e5808264-bea0-4e63-8ddc-d0190f544f08	edwin_guo	onboarding	{"name": "Edwin Guo", "email": "", "createdAt": "2026-01-02T04:12:14.706Z"}	2026-01-02 04:12:14.842+00
b8da4838-eac6-4782-a9b2-38ef85ae65b4	piano_student	716ebd65-43cc-4b68-a637-f1b443ee368c	{"0": {"objects": [{"top": 151.8142, "fill": "#ef4444", "left": 612.2266, "text": "PLAY FASTER", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 345.8203, "height": 58.76, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 52, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "2": {"objects": [{"top": 255.3693, "fill": null, "left": 528.5, "path": [["M", 489.004, 164.91287657430732], ["Q", 489, 164.9168765743073, 484, 167.91536523929472], ["Q", 479, 170.91385390428212, 475, 174.41209068010076], ["Q", 471, 177.9103274559194, 468.5, 180.9088161209068], ["Q", 466, 183.9073047858942, 464.5, 186.90579345088162], ["Q", 463, 189.90428211586902, 462, 191.90327455919396], ["Q", 461, 193.9022670025189, 460, 196.9007556675063], ["Q", 459, 199.8992443324937, 458, 204.39697732997482], ["Q", 457, 208.89471032745593, 455, 214.89168765743074], ["Q", 453, 220.88866498740555, 452, 225.8861460957179], ["Q", 451, 230.88362720403023, 450.5, 234.8816120906801], ["Q", 450, 238.87959697732998, 450, 242.87758186397986], ["Q", 450, 246.87556675062973, 451, 251.37329974811084], ["Q", 452, 255.87103274559195, 454, 261.36826196473555], ["Q", 456, 266.8654911838791, 460, 274.3617128463476], ["Q", 464, 281.85793450881613, 468, 288.35465994962215], ["Q", 472, 294.8513853904282, 477, 299.84886649874056], ["Q", 482, 304.8463476070529, 486.5, 308.8443324937028], ["Q", 491, 312.84231738035265, 494, 315.84080604534006], ["Q", 497, 318.83929471032747, 503, 323.3370277078086], ["Q", 509, 327.8347607052897, 515.5, 330.8332493702771], ["Q", 522, 333.8317380352645, 529, 336.33047858942064], ["Q", 536, 338.82921914357684, 538.5, 339.8287153652393], ["Q", 541, 340.8282115869018, 544, 341.82770780856424], ["Q", 547, 342.8272040302267, 549, 343.8267002518892], ["Q", 551, 344.82619647355165, 552, 344.82619647355165], ["Q", 553, 344.82619647355165, 554, 345.3259445843829], ["Q", 555, 345.8256926952141, 556.5, 345.8256926952141], ["Q", 558, 345.8256926952141, 560, 345.8256926952141], ["Q", 562, 345.8256926952141, 563.5, 345.8256926952141], ["Q", 565, 345.8256926952141, 566.5, 345.3259445843829], ["Q", 568, 344.82619647355165, 570, 343.326952141058], ["Q", 572, 341.82770780856424, 574.5, 339.3289672544081], ["Q", 577, 336.8302267002519, 585, 325.83576826196474], ["Q", 593, 314.8413098236776, 595.5, 308.8443324937028], ["Q", 598, 302.84735516372797, 601, 292.352644836272], ["Q", 604, 281.85793450881613, 605.5, 275.3612090680101], ["Q", 607, 268.86448362720404, 607, 262.8675062972292], ["Q", 607, 256.8705289672544, 606.5, 249.87405541561714], ["Q", 606, 242.87758186397986, 604.5, 237.8801007556675], ["Q", 603, 232.88261964735517, 601, 228.38488664987406], ["Q", 599, 223.88715365239295, 596.5, 219.88916876574308], ["Q", 594, 215.8911838790932, 590.5, 212.39294710327457], ["Q", 587, 208.89471032745593, 582, 204.39697732997482], ["Q", 577, 199.8992443324937, 573.5, 197.90025188916877], ["Q", 570, 195.90125944584383, 568.5, 194.90176322418137], ["Q", 567, 193.9022670025189, 565, 193.40251889168766], ["Q", 563, 192.90277078085643, 561.5, 192.4030226700252], ["Q", 560, 191.90327455919396, 557.5, 190.9037783375315], ["Q", 555, 189.90428211586902, 553, 189.4045340050378], ["Q", 551, 188.90478589420655, 547.5, 188.40503778337532], ["Q", 544, 187.9052896725441, 539.5, 186.90579345088162], ["Q", 535, 185.90629722921915, 531.5, 185.40654911838791], ["Q", 528, 184.90680100755668, 523.5, 183.9073047858942], ["Q", 519, 182.90780856423174, 516.5, 182.4080604534005], ["Q", 514, 181.90831234256927, 512, 180.9088161209068], ["Q", 510, 179.90931989924434, 508, 178.90982367758187], ["Q", 506, 177.9103274559194, 505.5, 177.41057934508817], ["Q", 505, 176.91083123425693, 504.5, 176.91083123425693], ["Q", 504, 176.91083123425693, 503.5, 176.91083123425693], ["Q", 503, 176.91083123425693, 501, 177.41057934508817], ["Q", 499, 177.9103274559194, 497, 177.9103274559194], ["Q", 495, 177.9103274559194, 491.5, 177.9103274559194], ["Q", 488, 177.9103274559194, 478, 178.41007556675063], ["Q", 468, 178.90982367758187, 465, 178.41007556675063], ["Q", 462, 177.9103274559194, 459, 177.9103274559194], ["L", 455.996, 177.9103274559194]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 157, "height": 180.9128, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 227.3854, "fill": null, "left": 975.8485, "path": [["M", 959.004, 151.91942569269523], ["Q", 959, 151.92342569269522, 955.5, 152.9229219143577], ["Q", 952, 153.92241813602016, 942, 155.9214105793451], ["Q", 932, 157.92040302267003, 924, 159.91939546599497], ["Q", 916, 161.9183879093199, 909, 163.4176322418136], ["Q", 902, 164.9168765743073, 894, 167.41561712846348], ["Q", 886, 169.91435768261965, 877, 172.91284634760706], ["Q", 868, 175.91133501259446, 862, 178.90982367758187], ["Q", 856, 181.90831234256927, 851.5, 185.40654911838791], ["Q", 847, 188.90478589420655, 846, 190.9037783375315], ["Q", 845, 192.90277078085643, 843.5, 196.9007556675063], ["Q", 842, 200.89874055415618, 840.5, 207.39546599496222], ["Q", 839, 213.89219143576827, 838.5, 218.8896725440806], ["Q", 838, 223.88715365239295, 838, 230.383879093199], ["Q", 838, 236.88060453400504, 838, 245.87607052896726], ["Q", 838, 254.87153652392948, 838.5, 260.368765743073], ["Q", 839, 265.86599496221663, 839, 269.8639798488665], ["Q", 839, 273.8619647355164, 840, 276.8604534005038], ["Q", 841, 279.8589420654912, 842, 283.35717884130986], ["Q", 843, 286.8554156171285, 846, 291.8528967254408], ["Q", 849, 296.85037783375316, 852, 299.84886649874056], ["Q", 855, 302.84735516372797, 859, 305.8458438287154], ["Q", 863, 308.8443324937028, 871, 313.3420654911839], ["Q", 879, 317.839798488665, 886, 320.8382871536524], ["Q", 893, 323.8367758186398, 900, 325.33602015113354], ["Q", 907, 326.8352644836272, 912.5, 327.3350125944585], ["Q", 918, 327.8347607052897, 926.5, 328.83425692695215], ["Q", 935, 329.8337531486146, 946, 331.33299748110835], ["Q", 957, 332.832241813602, 964, 333.8317380352645], ["Q", 971, 334.83123425692696, 979.5, 335.3309823677582], ["Q", 988, 335.83073047858943, 996.5, 335.83073047858943], ["Q", 1005, 335.83073047858943, 1011, 335.3309823677582], ["Q", 1017, 334.83123425692696, 1023.5, 333.3319899244333], ["Q", 1030, 331.83274559193956, 1035.5, 329.8337531486146], ["Q", 1041, 327.8347607052897, 1047.5, 323.8367758186398], ["Q", 1054, 319.83879093198993, 1064.5, 311.343073047859], ["Q", 1075, 302.84735516372797, 1082, 294.8513853904282], ["Q", 1089, 286.8554156171285, 1094.5, 277.85994962216625], ["Q", 1100, 268.86448362720404, 1103.5, 259.8690176322418], ["Q", 1107, 250.8735516372796, 1109, 241.37833753148615], ["Q", 1111, 231.8831234256927, 1112.5, 217.89017632241814], ["Q", 1114, 203.89722921914358, 1113, 193.40251889168766], ["Q", 1112, 182.90780856423174, 1110, 175.91133501259446], ["Q", 1108, 168.91486146095718, 1104.5, 160.91889168765744], ["Q", 1101, 152.9229219143577, 1096.5, 146.92594458438288], ["Q", 1092, 140.92896725440806, 1086.5, 136.43123425692696], ["Q", 1081, 131.93350125944585, 1075.5, 129.43476070528968], ["Q", 1070, 126.9360201511335, 1060, 124.93702770780857], ["Q", 1050, 122.93803526448363, 1038, 121.43879093198993], ["Q", 1026, 119.93954659949623, 1019, 119.43979848866499], ["Q", 1012, 118.94005037783376, 1003.5, 118.94005037783376], ["Q", 995, 118.94005037783376, 986, 118.94005037783376], ["Q", 977, 118.94005037783376, 970, 118.94005037783376], ["Q", 963, 118.94005037783376, 954, 118.94005037783376], ["Q", 945, 118.94005037783376, 939, 118.94005037783376], ["Q", 933, 118.94005037783376, 928, 119.43979848866499], ["Q", 923, 119.93954659949623, 916.5, 120.9390428211587], ["Q", 910, 121.93853904282116, 907, 122.4382871536524], ["Q", 904, 122.93803526448363, 902, 123.9375314861461], ["Q", 900, 124.93702770780857, 897.5, 125.93652392947104], ["Q", 895, 126.9360201511335, 893.5, 127.93551637279597], ["Q", 892, 128.93501259445844, 891, 129.9345088161209], ["Q", 890, 130.93400503778338, 889, 131.4337531486146], ["Q", 888, 131.93350125944585, 887.5, 132.43324937027708], ["Q", 887, 132.93299748110832, 886.5, 133.93249370277078], ["L", 885.996, 134.93598992443324]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 275.6969, "height": 216.8907, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#f97316", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 8479}	2026-01-04 02:51:49.176+00
a5663f08-8df6-4b89-a3f9-57b415cae4d3	edwin_guo	ROOM_STATUS	{"activePiece": {"id": "716ebd65-43cc-4b68-a637-f1b443ee368c", "title": "The Storm", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T15:04:59.706044+00:00", "difficulty": "Intermediate", "youtube_url": null}}	2026-01-03 10:11:00.829627+00
cb883b31-394a-442c-b571-de1442db05b5	b1814878-5d12-4cb4-8a68-5d89213c698c	ROOM_STATUS	{"settings": {"viewMode": "sheet-music", "aspectRatio": "widescreen", "teacherControlEnabled": false}, "activePiece": {"id": "716ebd65-43cc-4b68-a637-f1b443ee368c", "title": "The Storm", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T15:04:59.706044+00:00", "difficulty": "Intermediate", "youtube_url": null}}	2026-01-04 02:47:55.712734+00
b87d2bf0-bbeb-4d55-b6ae-2b34d6706948	caedmon_crosby	716ebd65-43cc-4b68-a637-f1b443ee368c	{"0": {"objects": [{"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 387.6953, "fill": "#ef4444", "left": 542.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 0}	2026-01-02 20:56:11.857+00
b585545d-1de7-42d1-a6d8-ed6a76b8d51d	guest	ROOM_STATUS	{"settings": {"viewMode": "sheet-music", "aspectRatio": "widescreen", "teacherControlEnabled": false}, "activePiece": {"id": "716ebd65-43cc-4b68-a637-f1b443ee368c", "title": "The Storm", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T15:04:59.706044+00:00", "difficulty": "Intermediate", "youtube_url": null}}	2026-01-04 04:14:55.413396+00
1858439b-9099-4b95-9801-870964aeb27e	guest	c07a9d49-696e-458c-957b-353e31da7f37	{"scrollX": 0}	2026-01-04 00:54:40.175+00
671788b7-1219-4d81-8f8e-7b659b23fa27	piano_student	c07a9d49-696e-458c-957b-353e31da7f37	{"0": {"objects": [{"top": 396.6908, "fill": "#ef4444", "left": 384.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 77.0273, "height": 47.46, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 42, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 270.7542, "fill": "#22c55e", "left": 504, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 364.7069, "fill": "#ef4444", "left": 654.3301, "text": "ASDF", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 53.3398, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 0}	2026-01-04 02:14:33.136+00
e9f4b743-a14c-4368-ab43-c9aabe6d74b5	caedmon_crosby	ROOM_STATUS	{"activePiece": {"id": "716ebd65-43cc-4b68-a637-f1b443ee368c", "title": "The Storm", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T15:04:59.706044+00:00", "difficulty": "Intermediate", "youtube_url": null}}	2026-01-03 04:53:57.000295+00
2baa53fe-8d1e-42bd-9910-6e7828d7ed55	padhma_berk	ROOM_STATUS	{"activePiece": {"id": "c07a9d49-696e-458c-957b-353e31da7f37", "title": "Burgmuller Tarantella", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767329055059_Burgmuller%20Tarantella%20With%20Counting%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767329054633_Burgmuller%20Tarantella%20With%20Counting%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T04:44:16.057989+00:00", "difficulty": "Grade 3", "youtube_url": null}}	2026-01-02 05:53:53.170083+00
95116927-3224-4b57-91ec-4fd8e7f304f0	3a7b64a1-67bd-4d16-a921-9215046da9c5	la-campanella	{"0": {"objects": [{"top": 304, "fill": null, "left": 727.5003, "path": [["M", 727.996, 304], ["Q", 728, 304, 727.5, 304], ["L", 727.004, 304]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 0.9926, "height": 0, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#22c55e", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 6}	2026-01-01 21:57:34.383+00
b7e94440-1afe-47b9-aa3f-4b779c1c9cd3	guest_session	la-campanella	{"scrollX": 4}	2026-01-01 21:57:43.905+00
38bacaef-2ab0-44f6-aaf4-eca4d2df3a18	padhma_berk	84a84f27-cd47-4827-8502-3eb5853cf469	{"0": {"objects": [{"top": 250.7368, "fill": null, "left": 140.6131, "path": [["M", 233.004, 86.90546930280956], ["Q", 233, 86.90946930280957, 230, 91.90426638917793], ["Q", 227, 96.8990634755463, 220.5, 107.8876170655567], ["Q", 214, 118.87617065556711, 202.5, 136.3579604578564], ["Q", 191, 153.83975026014568, 177, 176.3163371488033], ["Q", 163, 198.79292403746098, 150.5, 218.77211238293444], ["Q", 138, 238.7513007284079, 125, 261.22788761706556], ["Q", 112, 283.70447450572317, 98.5, 309.1779396462018], ["Q", 85, 334.65140478668053, 74.5, 355.6295525494277], ["Q", 64, 376.6077003121748, 58, 389.0946930280957], ["Q", 52, 401.5816857440166, 50, 408.0749219562955], ["Q", 48, 414.56815816857437, 48.5, 414.56815816857437], ["L", 49.004, 414.56815816857437]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 184.7818, "height": 327.6627, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#8b5cf6", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 234.7555, "fill": null, "left": 339.5, "path": [["M", 402.004, 134.85552133194588], ["Q", 402, 134.85952133194587, 401, 135.85848074921955], ["Q", 400, 136.85744016649323, 397.5, 139.85431841831425], ["Q", 395, 142.85119667013527, 392, 147.34651404786678], ["Q", 389, 151.84183142559831, 386, 156.33714880332985], ["Q", 383, 160.8324661810614, 380, 166.82622268470342], ["Q", 377, 172.81997918834546, 372.5, 182.8095733610822], ["Q", 368, 192.79916753381892, 360, 207.78355879292403], ["Q", 352, 222.76795005202914, 342, 240.24973985431842], ["Q", 332, 257.7315296566077, 320, 275.71279916753383], ["Q", 308, 293.6940686784599, 297.5, 307.67950052029136], ["Q", 287, 321.6649323621228, 282, 328.15816857440166], ["L", 276.996, 334.65540478668055]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 125.008, "height": 199.7999, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#8b5cf6", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 257.7315, "fill": null, "left": 444.5, "path": [["M", 511.004, 163.82534443288242], ["Q", 511, 163.8293444328824, 510, 164.8283038501561], ["Q", 509, 165.82726326742974, 507.5, 169.3236212278876], ["Q", 506, 172.81997918834546, 502.5, 178.31425598335068], ["Q", 499, 183.80853277835587, 495.5, 190.30176899063474], ["Q", 492, 196.79500520291361, 487.5, 204.786680541103], ["Q", 483, 212.7783558792924, 475.5, 224.26638917793963], ["Q", 468, 235.75442247658688, 458, 249.24037460978144], ["Q", 448, 262.726326742976, 438, 276.21227887617067], ["Q", 428, 289.69823100936526, 418.5, 301.1862643080125], ["Q", 409, 312.6742976066597, 401.5, 321.6649323621228], ["Q", 394, 330.65556711758586, 390.5, 335.15088449531737], ["Q", 387, 339.6462018730489, 385, 342.6430801248699], ["Q", 383, 345.6399583766909, 380.5, 348.6368366285119], ["L", 377.996, 351.63771488033296]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 133.008, "height": 187.8124, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#8b5cf6", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 66}	2026-01-02 04:44:28.884+00
9644b553-44d6-4da9-8e11-36ede913e0ac	guest	84a84f27-cd47-4827-8502-3eb5853cf469	{"scrollX": 0}	2026-01-02 04:10:25.597+00
0a1b1e96-9dbb-4414-96e3-91fca4db95c6	padhma_berk	onboarding	{"name": "Padhma Berk", "email": "", "createdAt": "2026-01-02T04:11:47.891Z"}	2026-01-02 04:11:48.03+00
bf20b13c-9d79-43b0-bafe-159b8925604d	edwin_guo	84a84f27-cd47-4827-8502-3eb5853cf469	{"0": {"objects": [{"top": 314.5188, "fill": null, "left": 390.2329, "path": [["M", 455.004, 115.87529240374609], ["Q", 455, 115.87929240374609, 454.5, 116.37877211238293], ["Q", 454, 116.87825182101976, 452, 117.87721123829343], ["Q", 450, 118.87617065556711, 447, 121.87304890738812], ["Q", 444, 124.86992715920915, 437, 130.36420395421436], ["Q", 430, 135.85848074921955, 420, 145.34859521331947], ["Q", 410, 154.83870967741936, 398, 166.82622268470345], ["Q", 386, 178.81373569198752, 369.5, 197.29448491155046], ["Q", 353, 215.77523413111342, 327.5, 247.24245577523413], ["Q", 302, 278.7096774193548, 277, 314.17273673257023], ["Q", 252, 349.63579604578564, 237, 381.1030176899063], ["Q", 222, 412.57023933402706, 216, 436.5452653485952], ["Q", 210, 460.5202913631633, 211.5, 472.5078043704474], ["Q", 213, 484.4953173777315, 218, 490.48907388137354], ["Q", 223, 496.4828303850156, 230.5, 499.9791883454734], ["Q", 238, 503.4755463059313, 252.5, 506.9719042663892], ["Q", 267, 510.468262226847, 287.5, 511.96670135275747], ["Q", 308, 513.465140478668, 335.5, 512.4661810613943], ["Q", 363, 511.4672216441207, 391.5, 507.471383975026], ["Q", 420, 503.4755463059313, 443.5, 496.9823100936524], ["Q", 467, 490.48907388137354, 482, 484.4953173777315], ["Q", 497, 478.5015608740895, 507, 471.0093652445369], ["Q", 517, 463.51716961498437, 528, 453.0280957336108], ["Q", 539, 442.5390218522372, 547, 429.05306971904264], ["Q", 555, 415.56711758584805, 561, 401.0822060353798], ["Q", 567, 386.5972944849115, 568.5, 371.61290322580646], ["Q", 570, 356.62851196670135, 569.5, 344.14151925078045], ["Q", 569, 331.6545265348595, 568, 326.1602497398543], ["Q", 567, 320.6659729448491, 563.5, 315.67117585848075], ["Q", 560, 310.67637877211234, 553, 303.68366285119663], ["Q", 546, 296.6909469302809, 533.5, 287.20083246618105], ["Q", 521, 277.71071800208114, 504, 268.2206035379812], ["Q", 487, 258.73048907388136, 471, 250.73881373569196], ["Q", 455, 242.7471383975026, 434, 235.25494276795004], ["Q", 413, 227.7627471383975, 395.5, 223.26742976066595], ["Q", 378, 218.77211238293444, 363.5, 216.77419354838707], ["Q", 349, 214.77627471383974, 334, 213.27783558792925], ["Q", 319, 211.77939646201872, 308.5, 211.77939646201872], ["Q", 298, 211.77939646201872, 287.5, 211.27991675338188], ["L", 276.996, 210.77643704474505]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 359.1324, "height": 397.2871, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 0}	2026-01-02 04:12:31.967+00
1c9eaec5-1f12-4e75-9c1f-00e764d8354d	piano_student	onboarding	{"name": "Piano Student", "email": "", "createdAt": "2026-01-03T10:11:36.743Z"}	2026-01-03 10:11:36.749+00
cc7a077c-78b1-40f0-85d4-ce50fdcfbe18	guest	716ebd65-43cc-4b68-a637-f1b443ee368c	{"0": {"objects": [{"top": 387.6953, "fill": "#ef4444", "left": 524.5, "text": "Text", "type": "IText", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 36.6797, "height": 22.6, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": null, "styles": [], "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "fontSize": 20, "overline": false, "pathSide": "left", "direction": "ltr", "fontStyle": "normal", "pathAlign": "baseline", "textAlign": "left", "underline": false, "fontFamily": "Arial", "fontWeight": "normal", "lineHeight": 1.16, "paintFirst": "fill", "charSpacing": 0, "linethrough": false, "strokeWidth": 1, "strokeLineCap": "butt", "strokeUniform": false, "strokeLineJoin": "miter", "backgroundColor": "", "pathStartOffset": 0, "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 4, "textBackgroundColor": "", "textDecorationThickness": 66.667, "globalCompositeOperation": "source-over"}, {"top": 244.3748, "fill": null, "left": 589, "path": [["M", 464.996, 148.92093702770782], ["Q", 465, 148.9249370277078, 466.5, 149.92443324937028], ["Q", 468, 150.92392947103275, 470.5, 153.92241813602016], ["Q", 473, 156.92090680100756, 476, 159.41964735516373], ["Q", 479, 161.9183879093199, 483, 165.41662468513854], ["Q", 487, 168.91486146095718, 495, 175.41158690176323], ["Q", 503, 181.90831234256927, 518, 194.90176322418137], ["Q", 533, 207.89521410579346, 550, 221.38841309823678], ["Q", 567, 234.8816120906801, 579.5, 244.8765743073048], ["Q", 592, 254.87153652392948, 601.5, 262.36775818639796], ["Q", 611, 269.8639798488665, 621.5, 277.85994962216625], ["Q", 632, 285.855919395466, 641, 293.35214105793455], ["Q", 650, 300.84836272040303, 659.5, 307.8448362720403], ["Q", 669, 314.8413098236776, 679.5, 321.83778337531487], ["Q", 690, 328.83425692695215, 695.5, 332.33249370277076], ["Q", 701, 335.83073047858943, 703.5, 337.32997481108316], ["Q", 706, 338.82921914357684, 708, 339.3289672544081], ["Q", 710, 339.8287153652393, 711.5, 339.8287153652393], ["L", 713.004, 339.8287153652393]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 248.008, "height": 190.9078, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 243.3773, "fill": null, "left": 601.5, "path": [["M", 731.004, 165.9123727959698], ["Q", 731, 165.91637279596978, 723, 168.41511335012595], ["Q", 715, 170.91385390428212, 705.5, 175.91133501259446], ["Q", 696, 180.9088161209068, 679, 193.9022670025189], ["Q", 662, 206.895717884131, 644.5, 221.38841309823678], ["Q", 627, 235.88110831234258, 611, 247.37531486146096], ["Q", 595, 258.86952141057935, 579, 270.3637279596977], ["Q", 563, 281.85793450881613, 553, 287.35516372795973], ["Q", 543, 292.8523929471033, 531.5, 298.34962216624683], ["Q", 520, 303.84685138539044, 512.5, 306.84534005037784], ["Q", 505, 309.84382871536525, 499, 311.8428211586902], ["Q", 493, 313.8418136020151, 485.5, 316.34055415617127], ["Q", 478, 318.83929471032747, 475, 319.83879093198993], ["L", 471.996, 320.8422871536524]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 259.008, "height": 154.9299, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}, {"top": 216.3909, "fill": null, "left": 730, "path": [["M", 735, 138.92597481108314], ["Q", 735, 138.92997481108313, 734.5, 139.42972292191436], ["Q", 734, 139.9294710327456, 734, 142.927959697733], ["Q", 734, 145.9264483627204, 733.5, 149.42468513853905], ["Q", 733, 152.9229219143577, 732.5, 159.41964735516373], ["Q", 732, 165.91637279596978, 731.5, 171.9133501259446], ["Q", 731, 177.9103274559194, 730.5, 184.40705289672545], ["Q", 730, 190.9037783375315, 729, 201.3984886649874], ["Q", 728, 211.89319899244333, 727, 222.38790931989925], ["Q", 726, 232.88261964735517, 725.5, 243.3773299748111], ["Q", 725, 253.872040302267, 725, 262.36775818639796], ["Q", 725, 270.863476070529, 725, 275.8609571788413], ["Q", 725, 280.85843828715366, 725.5, 287.35516372795973], ["L", 726.004, 293.85588916876577]], "type": "Path", "angle": 0, "flipX": false, "flipY": false, "skewX": 0, "skewY": 0, "width": 10, "height": 154.9299, "scaleX": 1, "scaleY": 1, "shadow": null, "stroke": "#ef4444", "opacity": 1, "originX": "center", "originY": "center", "version": "7.0.0", "visible": true, "fillRule": "nonzero", "paintFirst": "fill", "strokeWidth": 4, "strokeLineCap": "round", "strokeUniform": false, "strokeLineJoin": "round", "backgroundColor": "", "strokeDashArray": null, "strokeDashOffset": 0, "strokeMiterLimit": 10, "globalCompositeOperation": "source-over"}], "version": "7.0.0", "background": "transparent"}, "scrollX": 0}	2026-01-04 04:14:48.617+00
7bf7576a-06f5-499a-b568-f79ed7b12a40	padhma_berk	c07a9d49-696e-458c-957b-353e31da7f37	{"scrollX": 10131}	2026-01-02 04:45:49.981+00
bb67ca1c-bb8d-4a61-ba87-8069bfdaee14	caedmon_crosby	onboarding	{"name": "Caedmon Crosby", "email": "", "createdAt": "2026-01-02T17:10:51.073Z"}	2026-01-02 17:10:51.24+00
2650331e-80e3-4479-8e40-0dc9d6965c8f	caedmon_crosby	84a84f27-cd47-4827-8502-3eb5853cf469	{"scrollX": 66}	2026-01-02 17:11:20.888+00
3874056b-bf40-4104-a703-df6e9295d3b2	piano_student	ROOM_STATUS	{"settings": {"viewMode": "sheet-music", "aspectRatio": "widescreen", "teacherControlEnabled": false}, "activePiece": {"id": "716ebd65-43cc-4b68-a637-f1b443ee368c", "title": "The Storm", "mp3_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3", "user_id": "teacher-1", "xml_url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml", "composer": "Burgmuller", "created_at": "2026-01-02T15:04:59.706044+00:00", "difficulty": "Intermediate", "youtube_url": null}}	2026-01-04 02:55:48.929183+00
\.


--
-- Data for Name: classroom_presets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classroom_presets (id, user_id, preset_type, data, updated_at) FROM stdin;
\.


--
-- Data for Name: classroom_recordings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classroom_recordings (id, student_id, teacher_id, filename, url, size_bytes, created_at) FROM stdin;
5b12d595-f92d-4bce-9b38-78368522d598	guest	teacher-1	Lesson - 1/2/2026	https://pub-60e6b0a374844facac69e92d54cb236e.r2.dev/guest_1767414978193.webm	1503028	2026-01-03 04:36:18.972387+00
a1780c41-bdb0-498e-b740-c01e50d78a85	guest	teacher-1	Lesson - 1/2/2026	https://pub-60e6b0a374844facac69e92d54cb236e.r2.dev/guest_1767415678533.webm	1138353	2026-01-03 04:47:59.21757+00
5891fa4e-4c35-4586-b763-ce7604e4c8a5	edwin_guo	teacher-1	Lesson - 1/2/2026	https://pub-60e6b0a374844facac69e92d54cb236e.r2.dev/edwin_guo_1767419045623.webm	3034113	2026-01-03 05:44:06.467718+00
7300dd7c-4d6d-4862-94da-afca2317feaa	piano_student	teacher-1	Lesson - 1/3/2026	https://pub-60e6b0a374844facac69e92d54cb236e.r2.dev/piano_student_1767436938071.webm	1595503	2026-01-03 10:42:18.522803+00
\.


--
-- Data for Name: classroom_rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classroom_rooms (id, room_name, created_by, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: event_invites; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_invites (id, event_id, student_id, status, student_notes, updated_at) FROM stdin;
8a425ab4-b0e8-4f5e-bb40-63aa58d5d6f6	0aadb37f-2985-41c0-8553-3028a32394e0	3a7b64a1-67bd-4d16-a921-9215046da9c5	pending	\N	2025-12-13 12:48:06.676549+00
b15a983e-8e6c-4560-9108-68fc1d7e46e5	0aadb37f-2985-41c0-8553-3028a32394e0	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	not_going		2025-12-13 13:52:55.346+00
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (id, title, start_time, duration_minutes, location_type, location_details, description, rsvp_deadline, created_at, created_by, duration, zoom_meeting_id) FROM stdin;
0aadb37f-2985-41c0-8553-3028a32394e0	Winter Recital 2026	2026-01-25 00:00:00+00	60	virtual	https://us06web.zoom.us/j/82165399638?pwd=AOD2kq7Jx6H31PbbbhtWct6oAu7ij5.1	Winter Recital For Lionel Yu Piano Students	2026-01-11 07:59:59+00	2025-12-13 12:48:06.579609+00	\N	60	\N
\.


--
-- Data for Name: inquiries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inquiries (id, name, email, phone, experience, goals, status, created_at, updated_at) FROM stdin;
d3e766e8-0f0b-4e60-acb6-3c0ffb229e41	NEW STUDENT	yulionel829@gmail.com	8184411897	Intermediate	HELP	new	2026-01-04 02:56:56.117117+00	2026-01-04 02:56:56.117117+00
40e22134-d524-4896-95b4-2a2b2d958e58	Brilliant Pianist	musicalbasics@gmail.com	\N	Returning	Hello I want piano lessons!	new	2026-01-04 04:54:44.378122+00	2026-01-04 04:54:44.378122+00
\.


--
-- Data for Name: lessons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lessons (id, student_id, date, "time", status, notes, video_url, sheet_music_url, created_at, updated_at, duration, zoom_link, zoom_meeting_id, credit_snapshot, reminder_24h_sent, reminder_2h_sent, reminder_15m_sent, is_confirmed) FROM stdin;
f3c0e816-bd04-4e64-a59a-5f4ee6eec402	ea536caa-89cf-4997-a649-577f6c64f990	2025-12-14	16:15:00	scheduled	\N	\N	\N	2025-12-14 10:57:20.750415+00	2025-12-14 10:57:20.750415+00	45	https://us06web.zoom.us/j/88309601949?pwd=79n2IZPCXQRiYbHuRa20tVOTBv7a2s.1	\N	\N	f	f	f	f
289fef96-d1f1-40c4-995a-46fa58b3f970	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	2025-12-07	15:00:00	completed	Excellent progress on Bach Prelude in C Major. Focus on dynamics and phrasing.	https://example.com/lesson-recording.mp4	https://example.com/bach-prelude.pdf	2025-12-14 16:17:40.096546+00	2025-12-14 16:17:40.096546+00	60	\N	\N	\N	f	f	f	f
fcffaf64-88ef-4346-afa1-448a21f6d916	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	2025-11-30	15:00:00	cancelled	Student requested cancellation due to illness.	\N	\N	2025-12-14 16:17:40.096546+00	2025-12-14 16:17:40.096546+00	60	\N	\N	\N	f	f	f	f
6f1a113e-76a5-4450-8d54-90a1b07b43e0	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-14	14:30:00	completed	Great work on the Waltz! Remember to count and lift pedal on the 3rd beat. 	\N	\N	2025-12-14 16:20:03.334472+00	2025-12-14 23:14:15.589154+00	30	https://us06web.zoom.us/j/82686246209?pwd=b84tnSRVDyc9YCnyCowvNTquluCNTx.1	82686246209	\N	f	f	f	f
a68b7ba6-34ea-474d-8a59-db3527511d16	ea536caa-89cf-4997-a649-577f6c64f990	2025-12-14	18:00:00	completed	Ila - avoid using the wrist to play weaker fingers (such as the 4th finger). \n\nCordelia - keep wrists high and play softly. Also, counting to stay on tempo\n\nI've also attached a sheet music for both girls if they want to start sightreading this. 	\N	\N	2025-12-15 14:59:11.458203+00	2025-12-15 14:59:11.458203+00	60	\N	\N	\N	f	f	f	f
db1376c2-f771-4d50-9d39-3d103b8c48d4	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-14	17:15:00	completed	Waris - continue counting and keeping the wrist high. Pay attention to the accents and articulation in the Allegretto piece. 	\N	\N	2025-12-15 15:08:26.996616+00	2025-12-15 15:08:26.996616+00	60	\N	\N	\N	f	f	f	f
81d876b6-3474-4477-8599-d59daedf2550	7664c5ce-4f36-4514-9a4f-2353c4e769fa	2025-12-15	16:30:00	scheduled	\N	\N	\N	2025-12-15 22:41:04.852516+00	2025-12-15 22:41:04.852516+00	60	https://us06web.zoom.us/j/88654206843?pwd=gwDUBXkjhHieNKwcA7JEevcXmKIG0W.1	88654206843	\N	f	f	f	f
01a9b459-416d-421d-aecb-9b536d1ba454	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-15	15:30:00	completed	Great job! keep wrists high and count. New piece attached. 	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%2001a9b459-416d-421d-aecb-9b536d1ba454/1765844858646_Bartok_-_Allegretto.pdf	2025-12-14 16:27:12.630724+00	2025-12-16 00:27:48.441404+00	45	https://us06web.zoom.us/j/83698456954?pwd=4oky74Mfg7G1XPulbYnhLwSAz0wosY.1	83698456954	\N	f	f	f	f
00c308c7-b17c-49e3-aae5-9e3903ed4cdf	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-16	19:00:00	completed	good job	\N	\N	2025-12-15 22:40:18.877378+00	2025-12-16 10:29:04.489625+00	60	https://us06web.zoom.us/j/82980687958?pwd=lGQy43KSiCkbDHKP43ovzMsQaC5HrN.1	82980687958	\N	f	f	f	f
fc095962-f400-44e5-ab9c-907fa0ff01cc	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-13	12:00:00	completed		https://www.dropbox.com/scl/fo/b1iuphv6hhave32i8iajr/AMGk2fevIju08lpcSox5sZI?rlkey=00fsruf1vismjc80kdemkm6do&st=8xofi29p&dl=0	\N	2025-12-16 10:29:59.767949+00	2025-12-16 10:29:59.767949+00	60	\N	\N	\N	f	f	f	f
1423e957-64e8-4397-ad10-ed14ab7b33b6	ebc039fd-8043-419f-97e0-77c2b902da75	2025-12-16	12:15:00	completed		\N	\N	2025-12-16 11:28:07.960379+00	2025-12-16 22:55:25.086761+00	45	https://us06web.zoom.us/j/86313136372?pwd=fW71VBF7dLNAX7hbZ2uCyBeHaR1gnN.1	86313136372	\N	f	f	f	f
0950d438-5df7-417c-a35e-5b45806aba01	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-16	12:00:00	completed	Good job on your playing	\N	\N	2025-12-17 02:20:47.924045+00	2025-12-17 02:20:47.924045+00	60	\N	\N	\N	f	f	f	f
d6843ff9-315d-4548-a397-589c0e323894	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-19	15:15:00	scheduled	\N	\N	\N	2025-12-17 03:51:19.321817+00	2025-12-17 03:51:19.321817+00	30	https://us06web.zoom.us/j/86786461909?pwd=cvqwW1DbqyJCelyfYPAl4jxaRNNF1M.1	86786461909	\N	f	f	f	f
6b2d5f10-6a88-4792-94ac-529bcc0f68f9	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-22	09:00:00	scheduled	\N	\N	\N	2025-12-16 22:55:17.999986+00	2025-12-18 13:40:25.572306+00	30	https://us06web.zoom.us/j/83517257899?pwd=pBK95BFvA66MKD4UWiZb8lTJAdZOU2.1	83517257899	\N	f	f	f	f
0aa6e824-dee2-4c2b-92d1-c63568d66bc5	ac966367-dc7b-4934-b668-847a84e4ee85	2025-12-18	15:00:00	completed	Hopefully you get more time to practice this week! Remember to count for where is my mind. Practice the counting worksheet!	\N	\N	2025-12-16 23:21:49.749089+00	2025-12-19 01:58:33.877358+00	30	https://us06web.zoom.us/j/81781605363?pwd=3PMCauyXtmqV9e6XSPFg661pxRhFhp.1	81781605363	\N	f	f	f	f
6c1f9633-5132-4a13-8432-f4b5f9cd6886	b8edc751-854a-4716-b520-7112d13f7b69	2025-12-18	15:45:00	completed	Great work playing the Kuhlau sonatina and Joy to the world from memory! Please make sure you have your sheet music in binder form ready next lesson.	\N	\N	2025-12-16 23:20:57.741782+00	2025-12-19 01:59:06.939693+00	45	https://us06web.zoom.us/j/85160774352?pwd=vBEBhP51cn5Da4vUuSMxkHUEVEzWR0.1	85160774352	\N	f	f	f	f
70f18c93-85a1-426c-a998-bcf43a11b5ef	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-20	15:00:00	scheduled	\N	\N	\N	2025-12-20 00:25:07.413902+00	2025-12-20 00:25:07.413902+00	45	https://us06web.zoom.us/j/82010848897?pwd=VBnRte3bmAZv6OiMgkBzbCM0COwHjl.1	82010848897	\N	f	f	f	f
cf782820-b515-4e0a-8a52-5da4a2f720dd	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-19	18:00:00	completed	Test Note	\N	\N	2025-12-20 00:25:46.560586+00	2025-12-21 21:31:57.955443+00	30	https://us06web.zoom.us/j/83134426358?pwd=9IFJsUJoUF2nvQrlAu0hUudRG0vc71.1	83134426358	\N	f	f	f	f
a9a375a2-71dc-4df5-b39e-fb9054167825	ebc039fd-8043-419f-97e0-77c2b902da75	2025-12-20	12:15:00	completed	zxcvzxcvzxcv	\N	\N	2025-12-20 20:08:07.672296+00	2025-12-21 23:24:16.779645+00	45	https://us06web.zoom.us/j/84366655749?pwd=GBkpfypD7bCaXnFhJXh59ZslZleb0T.1	84366655749	\N	f	f	f	f
4f4defb7-5e64-4da5-a555-c37f73852843	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-21	11:00:00	completed	asdf	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%204f4defb7-5e64-4da5-a555-c37f73852843/1766360384115_Confessions_2013.pdf	2025-12-21 21:17:26.701311+00	2025-12-21 23:39:46.374+00	60	\N	\N	\N	f	f	f	f
82dcc098-9fb7-480f-a8d2-2cf1266f6bda	458267a3-ffa8-4c1c-9969-e18ccc710695	2025-12-21	10:00:00	completed	Kai, great job on the Mendelssohn Etude and the Tarantella. For the etude, make sure to practice hands separately, and for the Tarantella, count especially during the "jumpy" section. Great work!	\N	\N	2025-12-18 15:17:12.409037+00	2025-12-21 23:53:22.275775+00	30	https://us06web.zoom.us/j/84377079589?pwd=4sOxmnrelfOOsaqRk1wqWqiLg3vdvd.1	84377079589	\N	f	f	f	f
1bdbfb15-f194-4147-b9a8-76e5067b5cc8	10128b61-f8e6-44cf-86af-7c7f4669705a	2025-12-18	16:45:00	completed	Great work on the Tarantella today! Here is the next piece you can start sightreading.	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%201bdbfb15-f194-4147-b9a8-76e5067b5cc8/1766361248795_Wedding_Day_Troldhaugen_Grieg.pdf	2025-12-16 23:19:52.411193+00	2025-12-21 23:54:11.528907+00	45	https://us06web.zoom.us/j/84271010129?pwd=gGMFadr17ruCRHubFX0sFd6DmvUGJy.1	84271010129	\N	f	f	f	f
780c7458-cb47-49d0-bff8-2c4d808a9b6c	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-21	09:00:00	completed	zcxzxcvzxcv	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20780c7458-cb47-49d0-bff8-2c4d808a9b6c/1766359762560_Tchaikovsky_Dumka_Op_61.pdf	2025-12-21 21:07:25.028057+00	2025-12-21 23:29:25.622622+00	60	\N	\N	\N	f	f	f	f
de205f8b-a320-457b-80b1-9c1fa13defb4	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-21	13:30:00	completed	Roy, great work on Revolutionary Etude. It's honestly a bit difficult, and you can benefit from a slightly easier piece. Attached is a good piece to practice (also in C-minor) that will help both your right and left hand technique. 	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20de205f8b-a320-457b-80b1-9c1fa13defb4/1766361604487_IMSLP925939-PMLP6627-lanning_mbm_31.pdf	2025-12-17 02:19:49.877081+00	2025-12-22 00:00:26.38243+00	45	https://us06web.zoom.us/j/85319691467?pwd=r65FCuerhvBysfjJkfXpPZ91ofK1gZ.1	85319691467	\N	f	f	f	f
9e0f234c-2d3e-4899-aa98-a1e5e86d0dfb	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-22	15:30:00	scheduled	\N	\N	\N	2025-12-22 14:31:32.578079+00	2025-12-22 14:31:32.578079+00	45	https://us06web.zoom.us/j/83238274068?pwd=ACxJ9rC5lrJdNBYheByiibaCI5bJJ8.1	83238274068	\N	f	f	f	f
cd90f69b-a9de-41d9-9be3-af01b2f653ca	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-21	14:30:00	completed	Oceanna, great job on the Waltz in A minor. as we discussed, you can benefit from an arpeggio exercise. I will send you one soon here.	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20cd90f69b-a9de-41d9-9be3-af01b2f653ca/1766365262092_Introduction_to_Arpeggios_-_Full_Score.pdf	2025-12-21 19:52:07.290047+00	2025-12-22 01:01:09.625273+00	30	https://us06web.zoom.us/j/89479318013?pwd=L47g2SEY2xybfkx1LMtkkVzXt8jVSa.1	89479318013	\N	f	f	f	f
6efdb038-105c-4ebb-8092-ffe64ac48623	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-21	17:15:00	completed	Waris - good job on Allegretto today. Remember to keep your wrists high and emphasize the contrast (difference) between articulations. \n\nRegarding Experience, please have your dad send me a copy of the same sheet music that you have if you want to study it in our lessons.\n\nAlso, I've attached a piece that I think will be great for your technique. You can begin sightreading this piece. 	\N	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%206efdb038-105c-4ebb-8092-ffe64ac48623/1766369769585_Burgmuller_Tarantella_With_Counting_Version_-_Full_Score.pdf	2025-12-21 19:52:26.109829+00	2025-12-22 02:16:22.362899+00	30	https://us06web.zoom.us/j/87943725539?pwd=zMBMt0WFIfcmJU8VssmqBoI6dMU8Hf.1	87943725539	\N	f	f	f	f
c3849670-6251-4d42-8e88-9674330c62b2	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-28	13:30:00	completed	Remember to count Revolutionary Etude! 	\N	\N	2025-12-28 18:37:39.000375+00	2025-12-29 03:29:24.010341+00	45	https://us06web.zoom.us/j/83632522337?pwd=bbTmj20R0nY14rzRAX4oI02x2mzT7Z.1	83632522337	2	f	f	f	f
391a7867-c142-4880-b2f2-6af9143de0e0	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-28	17:15:00	completed	Dear Sarab, please see attached for another piece that I think Waris will really benefit from. He should continue practicing Experience with metronome like he did today during our lesson. 	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20391a7867-c142-4880-b2f2-6af9143de0e0/1766979050433_Burgmuller_Tarantella_With_Counting_Version_-_Full_Score.pdf	2025-12-28 18:38:20.26386+00	2025-12-29 03:31:25.495264+00	30	https://us06web.zoom.us/j/85740983071?pwd=5tJ97iFHYM2M8CPsxj3mLiHazqJ5Nx.1	85740983071	2	f	f	f	f
05cdc93f-a848-45ce-bca3-31fa4eb50789	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-29	12:00:00	completed	Great work on your pieces today! Wow. Your rhythm, finger control, articulations, and dynamics are all improving. Watch the wrist movement and keep it high. Here's the full version of William Tell you can start practicing. 	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%2005cdc93f-a848-45ce-bca3-31fa4eb50789/1767041475388_William_Tell_Overture_Full_Lesson_Version_-_Full_Score.pdf	2025-12-29 13:57:23.796631+00	2025-12-29 20:51:17.574536+00	30	https://us06web.zoom.us/j/86288779804?pwd=6eAOnrJx0STUnspW9V9r4vm2uwmB2j.1	86288779804	3	f	f	f	f
2764b7c0-1d69-4277-85ad-131077263b5a	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-29	14:30:00	completed	Hey Oceanna! Great work on the Waltz! Remember to coordinate the left and right hands so they play at the same time. Also try to understand the chords behind the piece. I've attached a chords exercise for you to understand 7ths better. 	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%202764b7c0-1d69-4277-85ad-131077263b5a/1767050760961_Standard_7th_Chords_Exercise.pdf	2025-12-28 18:38:01.693111+00	2025-12-29 23:26:09.570808+00	30	https://us06web.zoom.us/j/86821876497?pwd=Goh1ceyt5eqXDJsEhGHIXk9P2jXbLB.1	86821876497	2	f	f	t	f
f0700eb0-0fbb-44e7-bdf5-9afe325200bc	10128b61-f8e6-44cf-86af-7c7f4669705a	2026-01-01	16:45:00	scheduled	\N	\N	\N	2025-12-30 02:50:00.978048+00	2025-12-30 02:50:00.978048+00	45	https://us06web.zoom.us/j/86570705974?pwd=m0GmGVabf6EKnqCDiCIwukV56sRzLs.1	86570705974	\N	f	f	f	f
7f68312a-7ff0-4ad5-8990-9fa93bfd79a9	ac966367-dc7b-4934-b668-847a84e4ee85	2026-01-01	15:00:00	scheduled	\N	\N	\N	2025-12-30 02:50:32.879964+00	2025-12-30 02:50:32.879964+00	30	https://us06web.zoom.us/j/81416482908?pwd=Qv9brcjvLl7KYiUxsmQYv8TiGirKYk.1	81416482908	\N	f	f	f	f
d542fe88-f2af-48c3-ac2b-23e03b28bc6c	b8edc751-854a-4716-b520-7112d13f7b69	2026-01-01	15:45:00	completed	Hey Nate, great work today on the Kuhlau piece as well as Joy to the world! Continue playing the Kuhlau sonatina from memory. Here is a new piece for you to start learning.	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20d542fe88-f2af-48c3-ac2b-23e03b28bc6c/1767330159971_Burgmuller_The_Storm_All_Markings_Version_-_Full_Score.pdf	2025-12-30 02:50:17.009774+00	2026-01-02 05:02:42.905137+00	45	https://us06web.zoom.us/j/86355596518?pwd=VrXvyKL9SZ6LOtG5YqP2R7IgttbU6u.1	86355596518	0	f	f	f	f
df8beead-5843-4b31-8f7b-255f35fce8ab	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-29	15:30:00	completed	Hey Padhma! Great job on the mozart piece today. It's a huge progress and I can tell you have been practicing hard on it. It's only a few difficult sections that require better counting, but otherwise I have to commend you on conquering such a difficult piece!	\N	\N	2025-12-29 03:32:09.835341+00	2025-12-30 01:51:56.418204+00	45	https://us06web.zoom.us/j/89431847171?pwd=sZexGKy3LyfF1DBQY1WdYETqk7AZJB.1	89431847171	2	f	t	t	f
f5158292-33f3-482c-9a99-f050af87a9e2	7664c5ce-4f36-4514-9a4f-2353c4e769fa	2025-12-29	16:30:00	completed	Hi Yang, Yizhong needs to learn better counting. I also think the current piece is too hard for him. Attached is a piece I think he should learn (that's easier and he will benefit from!) 	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%20f5158292-33f3-482c-9a99-f050af87a9e2/1767059718017_allegretto-bartok-grade-3-piano-exam-pieces-2025-2026.pdf	2025-12-29 03:33:23.735089+00	2025-12-30 01:55:19.620774+00	60	https://us06web.zoom.us/j/85383510369?pwd=MYcLn7KzbAsu4tBxk4w7rOB816T4Yv.1	85383510369	3	f	t	f	f
e4e919f9-9b4c-4184-a388-f191ed618102	10128b61-f8e6-44cf-86af-7c7f4669705a	2026-01-08	16:45:00	scheduled	\N	\N	\N	2026-01-01 16:11:45.886189+00	2026-01-01 16:11:45.886189+00	45	https://us06web.zoom.us/j/88395710404?pwd=zKmwkXdvCFMfck0KUK4kTbPtz7vzRm.1	88395710404	\N	f	f	f	f
c88beede-c96b-4f6e-9215-6d54e22adf36	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-31	12:00:00	completed	Good job	\N	\N	2026-01-01 16:12:17.114142+00	2026-01-01 16:12:17.114142+00	60	\N	\N	\N	f	f	f	f
59854bb4-ddd3-440f-96c8-5d56819c5860	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-01-05	15:00:00	scheduled	\N	\N	\N	2025-12-31 03:30:02.119838+00	2026-01-01 16:30:57.679472+00	60	https://us06web.zoom.us/j/83674944993?pwd=MPYGzwr5BZ7axcKCKalhb1iMaP1GSg.1	83674944993	\N	f	f	f	f
7bf530fb-7181-498c-acd7-79110d366edd	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-05	14:00:00	scheduled	\N	\N	\N	2026-01-01 15:41:10.189628+00	2026-01-01 16:31:41.569532+00	45	https://us06web.zoom.us/j/81129526793?pwd=ZKzLqPKVI8X8bQOM6XbAHrp8jeibdm.1	81129526793	\N	f	t	f	f
434ac3e7-cec9-4fdd-89dd-6a758c2202b5	3a7b64a1-67bd-4d16-a921-9215046da9c5	2026-01-05	20:00:00	scheduled	\N	\N	\N	2025-12-29 20:53:24.569787+00	2026-01-02 05:01:04.087522+00	60	https://us06web.zoom.us/j/85158339110?pwd=ORG7SBuf8zyPmIOWGUajQRstbzx9wx.1	85158339110	\N	f	t	t	t
512f43fa-b15b-4f83-a84e-83ca986399ac	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-09	15:15:00	scheduled	\N	\N	\N	2026-01-02 18:19:56.867175+00	2026-01-02 18:19:56.867175+00	30	https://us06web.zoom.us/j/84855594264?pwd=b78H88DuIzslHiblcOaBrhxhpDa4ib.1	84855594264	\N	f	f	f	f
2326dfbc-f302-4173-b1e2-b136b67b4472	bedceebb-fada-4354-9542-b9377ff9a4d3	2026-01-02	15:15:00	completed	Caedmon, great job on the Arabesque today! I can tell you have been practicing, but we need to keep our wrists high, and count with the metronome's assistance. Every finger should be moved purposefully to follow the count, not the other way around (count following the fingers). I've reattached the counting worksheet as well!	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/sheet_music%20/%202326dfbc-f302-4173-b1e2-b136b67b4472/1767398241831_Introduction_to_Counting_-_Full_Score.pdf	2026-01-02 18:19:43.543892+00	2026-01-02 23:57:24.496886+00	30	https://us06web.zoom.us/j/82667069545?pwd=9EaHbGs1ogh1i7twwHDbqpmpAxlW2p.1	82667069545	1	f	f	f	t
\.


--
-- Data for Name: makeup_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.makeup_slots (id, start_time, is_taken, end_time) FROM stdin;
104fffbe-911b-4c42-ba48-c3285c0f7282	2025-12-15 23:00:00+00	f	2025-12-16 00:00:00+00
9671cb7d-ca64-45f8-9a24-5cb1d51a3971	2025-12-17 22:00:00+00	f	2025-12-17 23:00:00+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, sender_id, recipient_id, content, is_read, created_at, attachments) FROM stdin;
73e2282e-0595-46ed-ac30-fda59ae8c46d	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hello! I had a question about Burgmuller's Arabesque m8, how do I play this?	t	2025-12-19 23:42:48.325914+00	\N
52043148-a148-4cf2-916f-631555335856	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	For this measure, make sure to practice the right hand slowly while counting	t	2025-12-20 00:23:41.151909+00	\N
fde5bc23-6a27-4439-b924-da5115daaee0	10128b61-f8e6-44cf-86af-7c7f4669705a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hi Lionel, from your previous  lesson notes,  I don't see  Edwin's next piano piece . Where can I find it? Thank you!  Zou 12/19/2025	t	2025-12-20 07:14:26.884433+00	\N
1afd231a-ada6-439c-ba8f-35cfc807938b	10128b61-f8e6-44cf-86af-7c7f4669705a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hi Lionel, Received the music sheets, thank you!	t	2025-12-22 03:26:10.339346+00	\N
a2ccda0c-d57d-4f85-9371-a34ebf1f3223	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	asdfasdf	t	2025-12-09 10:50:23.125752+00	\N
d5ac3724-264f-417c-b98f-0ff5dc4557fc	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	asdfasdfasdfsadf	t	2025-12-09 10:50:24.957922+00	\N
bc3edf5b-54f9-49ad-a35e-804c5551ac37	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	xcvzvxzcvxzcxcv	t	2025-12-09 10:53:12.974052+00	\N
2af92544-fdc0-464a-9820-d19fa72e9c95	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	mopk	t	2025-12-09 10:59:26.251177+00	\N
13f2e3e2-70b3-47f9-8e80-90b090a66d42	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	asdfasdfasfd1894984	t	2025-12-09 15:39:19.943938+00	\N
f2e8642d-5b52-446b-9502-01b6044418b0	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	asdfadsfsadf	t	2025-12-09 15:49:08.480117+00	\N
57ecbd29-1b1d-4d65-b3f8-590a809274e9	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	xzcvzxcv	t	2025-12-09 15:49:11.883566+00	\N
17dc0a4c-1078-4399-97f6-b461a7b4a8fa	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	asdfasdfxzcvxzcv	t	2025-12-09 15:17:14.008264+00	\N
03c0e045-9502-4272-bc0b-95ff19263d40	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	asdfadsf	t	2025-12-09 15:48:25.16077+00	\N
5364b4c7-c6bd-4f01-a8e5-50b52bdd3827	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	xzcvzcxv	t	2025-12-09 15:48:27.144481+00	\N
a92b9387-ec7a-41c9-861b-115c21f4c806	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	erwrwewre	t	2025-12-09 15:48:53.362267+00	\N
0ce8627b-59c6-4b2a-a582-95013d943361	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	werwaerwer	t	2025-12-09 15:55:18.485477+00	\N
5984dbc8-0a2f-4ba3-838c-166401df59f0	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	xfvzdxcvzxcvzcvxzcvx	t	2025-12-11 20:56:47.394589+00	\N
79b69bd5-4e9d-44eb-993e-2c57978b0495	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	werqrewqrew	t	2025-12-11 20:56:49.403156+00	\N
7eacda03-fa32-49d8-95d4-5d3608bc7e93	e96d34d9-5cc9-43a8-81c2-9545d1b11508	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	asdfasdfxczvcvxz	t	2025-12-12 10:42:12.290183+00	\N
2e175fb9-ada1-4dac-899a-8919c9cb411a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	asdfasdf	t	2025-12-09 16:52:50.643862+00	\N
a1b9119d-833f-4fd5-bea4-8c74e9351a72	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	zxcvzxcvzxcvcxz	t	2025-12-09 16:52:53.032575+00	\N
327d159c-d9d2-4413-aca5-020545fd554c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	erwwererwsadfdsaf	t	2025-12-09 16:55:13.534563+00	\N
47adccf8-b0e9-41c7-8b5d-b13ed953c7b3	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	gjaiodgjiadsgojadsogji	t	2025-12-09 16:55:16.164669+00	\N
cbe98706-6375-4925-babd-797bc10c6ace	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	zxcvzxcv	t	2025-12-09 17:22:21.291177+00	\N
1632880c-e6a0-4426-956c-b2cfa7ec9152	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	qwerjqwerioqwriojwqjrweqr	t	2025-12-09 17:22:25.021466+00	\N
20e45803-4c5b-4e03-8e26-7b6e88370926	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	qwerwqerqwerweqrzvxcxzvcvzxc	t	2025-12-09 17:55:55.211885+00	\N
e264dc89-95f3-4d3f-89a0-069aabd265a5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	wqerqwerqwerhjhopggfh	t	2025-12-09 17:55:58.00483+00	\N
85bbddec-9ec6-40d8-b6dc-dc51a4da9b3b	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	zxcvzxcvzxcv	t	2025-12-09 17:58:45.931472+00	\N
b3a669f1-8bd1-4d20-a3c4-bad76c644574	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	weqrwerwqerrweq	t	2025-12-09 17:58:48.614974+00	\N
22e6075e-416c-4c4e-97fd-9017f08aead6	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	e96d34d9-5cc9-43a8-81c2-9545d1b11508	xzvcxzcv	t	2025-12-09 11:00:33.950046+00	\N
dccb7714-3224-44b6-aaf4-749bb4107c60	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	e96d34d9-5cc9-43a8-81c2-9545d1b11508	ewqrwqerweqrew	t	2025-12-09 11:00:35.531413+00	\N
460dc49a-0bb5-418b-a367-319100c9b179	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	e96d34d9-5cc9-43a8-81c2-9545d1b11508	asdfasdfdsaf	t	2025-12-09 11:00:43.898281+00	\N
7068932b-3853-4e0b-96a8-ce9843d75d0c	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	adsfxzvc	t	2025-12-09 16:10:58.092843+00	\N
552d36c9-9740-4510-b2a5-2b78f2b8e676	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	qwerqwerwqr	t	2025-12-09 16:10:59.975584+00	\N
c8dffc93-1afe-4ce2-9970-e1f1cc35036f	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	e96d34d9-5cc9-43a8-81c2-9545d1b11508	ejfioajfoijawefjawejf	t	2025-12-11 20:57:10.902479+00	\N
57f029cc-d3e8-4fb8-9fb6-101d546d15f7	e96d34d9-5cc9-43a8-81c2-9545d1b11508	e96d34d9-5cc9-43a8-81c2-9545d1b11508	sadfasdfasdf	t	2025-12-14 23:13:11.953408+00	\N
977a9ba3-a42e-451d-86e8-f893a40cfd59	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	Hello!	t	2025-12-20 00:23:32.250878+00	\N
4b3af213-8ab4-4131-9c9a-bb9f56a5a6d4	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	Also, pay attention to the left hand wrist movement	t	2025-12-20 00:23:53.436308+00	\N
35de8c03-074a-43f7-b689-176915773dd4	e96d34d9-5cc9-43a8-81c2-9545d1b11508	10128b61-f8e6-44cf-86af-7c7f4669705a	Hi Zou! My apologies, we got the sheet music PDF upload to work today, you should see it in your "completed lessons" section!	t	2025-12-22 00:28:19.44786+00	\N
6a678413-97e0-4378-a2c1-2d3fc4cc1616	e96d34d9-5cc9-43a8-81c2-9545d1b11508	b1814878-5d12-4cb4-8a68-5d89213c698c	workout gloves: https://www.amazon.com/dp/B01I956VVY	t	2025-12-16 00:31:10.199863+00	\N
eb2a9abb-c46a-4a51-a1a5-3524ba48f80a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	terqwterteyytt	t	2025-12-09 17:58:52.819719+00	\N
c3465727-a8e7-4e94-bc45-6d8b20431f92	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	xzcvzdsfsaf	t	2025-12-14 09:08:56.429224+00	\N
21068e68-c99a-4bbd-ba88-1ff8acf2da97	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	qwerqwerqwer	t	2025-12-14 09:08:59.422539+00	\N
8a195cb1-e74b-4024-b90c-d9b96be6165a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	hello	t	2025-12-16 16:23:46.155074+00	\N
c6bb14f9-61ee-4fb7-945a-d62cfc79e24b	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	asdfasdf	t	2025-12-14 23:13:36.706998+00	\N
10abd6fc-e066-4722-8cf7-aed20e39418e	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	xzcvzxcvzxcvzvxc	t	2025-12-15 19:50:54.191829+00	\N
74a80a90-4aa9-4e54-bf26-bcca55fd4b73	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	zxcvzxcvzxcv	t	2025-12-16 16:22:56.782159+00	\N
1c681fc3-2e40-4e41-8012-6af78b681374	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	eqwrqwerwer	t	2025-12-16 16:23:01.134057+00	\N
c9ff4b6e-bade-4862-850e-9a6075309362	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	asdfasdf	t	2025-12-16 16:49:03.887006+00	\N
f11ee898-ed0b-4a6e-bdf0-3f3168eda90b	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	zxcvzxcvvzxc	t	2025-12-16 16:49:11.612885+00	\N
697bc82d-3a4b-4929-86b1-093ce2538e96	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	asdfxzcvzxcvzxvc	t	2025-12-17 02:21:41.889425+00	\N
bacab45c-a0fb-40f8-ab9a-fcf528c2c087	b1814878-5d12-4cb4-8a68-5d89213c698c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hi Professor Lionel, I emailed you regarding the DreamPiano preorder, and not sure if you saw it. Can I place a new preorder with your Xmas offer I got today and remove the previous preorder? I like the idea of prepaying and getting a discount plus helping you find your initial order. Let me know😊	t	2025-12-26 16:39:40.9375+00	\N
2b4256bc-0e04-491c-9a82-84ef147e4e87	b1814878-5d12-4cb4-8a68-5d89213c698c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	*fund not find	t	2025-12-26 16:40:12.674463+00	\N
77903638-3197-4e6c-b161-cabdd2a62cf7	b1814878-5d12-4cb4-8a68-5d89213c698c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Also, I know there is a recital coming up. I don't have anything ready to play right now since the pieces you assigned are challenging! Do you think I will be ready by then? Or will you assign an easier one for me to complete by then? Just wondering.. I still get anxiety from performing!	t	2025-12-26 16:41:51.293677+00	\N
76dd4339-4724-4680-8a27-b5bc3646d128	e96d34d9-5cc9-43a8-81c2-9545d1b11508	bedceebb-fada-4354-9542-b9377ff9a4d3	Hi Caedmon / Michelle, as i wrote in my email, I am unable to do tomorrow's lesson (Dec 26) but I am happy to resume lessons starting Jan 2nd. Let's please communicate via this portal going forward to prevent further communication issues. Thanks & Merry Christmas!	t	2025-12-25 16:58:29.317419+00	\N
33236021-0188-4b59-bc44-2ed3d9146a63	e96d34d9-5cc9-43a8-81c2-9545d1b11508	b1814878-5d12-4cb4-8a68-5d89213c698c	Dear Padhma, I think the tarantella by pieczonka is a great piece for you to play during the recital. Or if you want to play the easier Grieg Waltz that we played a few months ago, that is also possible :)	t	2025-12-27 11:52:03.787461+00	\N
d0ab4c71-72b7-4b5f-94fa-1243eb5a450e	b1814878-5d12-4cb4-8a68-5d89213c698c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Just FYI, I cannot tap on the watch buttons for tutorial videos on my iphone in this portal. Maybe it only works on a desktop, I have not tried that yet.	t	2025-12-30 15:20:18.810039+00	\N
991231dc-115d-4389-982a-d8debe58522c	e96d34d9-5cc9-43a8-81c2-9545d1b11508	b1814878-5d12-4cb4-8a68-5d89213c698c	Hey Padhma! Indeed, we are still working on that. Thank you for notifying me, it is greatly appreciated. let me know if you see anything else!	f	2025-12-30 17:12:00.304166+00	\N
87938ae6-fa92-4a5d-ba71-12117ff95234	e96d34d9-5cc9-43a8-81c2-9545d1b11508	10128b61-f8e6-44cf-86af-7c7f4669705a	Hi Edwin / Zou, double checking if we are still confirmed for our lesson today?	t	2026-01-01 15:19:07.869573+00	\N
14a732db-98d2-40a6-8177-1b2cb87510b1	e96d34d9-5cc9-43a8-81c2-9545d1b11508	b8edc751-854a-4716-b520-7112d13f7b69	Hi Nate / Tracie, double checking if we are still confirmed for our lesson today?	f	2026-01-01 15:19:24.129277+00	\N
6f1e25ce-df89-4920-ac50-03979fbc3890	e96d34d9-5cc9-43a8-81c2-9545d1b11508	ac966367-dc7b-4934-b668-847a84e4ee85	Hi Micah, double checking if we are still confirmed for our lesson today?	t	2026-01-01 15:19:15.865737+00	\N
b4132983-ff3a-4f5e-b4e7-0ff6f094af74	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	HI lionel, I sent a message through g mail, should we do lessons next week?	t	2026-01-01 23:14:13.179023+00	\N
03f29c68-7030-481b-b548-d11e3c599c48	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	sorry for the delayed message i am still getting used to the new student portal	t	2026-01-01 23:15:21.958235+00	\N
1a66acf2-108e-439e-9334-5296010412bb	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Now that i know how to use it I shall be more prompt in replying	t	2026-01-01 23:16:05.496017+00	\N
196c732f-3c93-4e7a-9b95-71437413d9d8	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Again, so sorry about the confusion. Also i have practiced the counting sheet and applied it to where is my mind, and i completed Burgmuller's Arabesque	t	2026-01-01 23:21:39.778857+00	\N
723bb47b-a74b-4bd4-9d1b-b19882de7506	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Also, are we using the classroom for the lessons for now on?	t	2026-01-01 23:23:13.388582+00	\N
41b3f146-6439-49be-9159-d54926c51ed1	10128b61-f8e6-44cf-86af-7c7f4669705a	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Yes, confirmed.	t	2026-01-01 23:14:33.56543+00	\N
872a22d1-2b83-4438-9143-8750de351720	e96d34d9-5cc9-43a8-81c2-9545d1b11508	10128b61-f8e6-44cf-86af-7c7f4669705a	Wonderful, see you then.	f	2026-01-01 23:39:52.660956+00	\N
a6dcfd23-9c09-4b3e-926c-8d22c7cf8a9e	e96d34d9-5cc9-43a8-81c2-9545d1b11508	ac966367-dc7b-4934-b668-847a84e4ee85	Hey Micah! no problem, everyone's getting more used to the portal, and I didn't get your email through gmail for some reason (emails getting lost was a big reason why we switched to the portal). The "classroom" isn't ready yet, so for now we will still use Zoom.	t	2026-01-01 23:41:23.220114+00	\N
1a29e389-8979-4b8e-be64-18c5acece0b2	e96d34d9-5cc9-43a8-81c2-9545d1b11508	ac966367-dc7b-4934-b668-847a84e4ee85	If you want, we can reschedule for tomorrow or Saturday at the same time, or we can wait until next week. Glad to hear you have been practicing!	t	2026-01-01 23:41:49.017369+00	\N
7d673af8-71be-4483-9fc7-34d93c7123be	ac966367-dc7b-4934-b668-847a84e4ee85	e96d34d9-5cc9-43a8-81c2-9545d1b11508	We can do Thursday of next week (I work tomorrow and Saturday) Thank you so much Lionel!	t	2026-01-02 00:04:18.901309+00	\N
382f3cbe-b9ce-4ce1-a7eb-db92108fbf62	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	Hello!!	t	2026-01-01 22:53:19.220245+00	\N
9d2d35a3-e8a9-42de-b218-8c0f2964de8f	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	Hello?	t	2026-01-02 14:59:06.138722+00	\N
1bd3aa42-e3e4-4691-a29b-ba55343918a5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	3a7b64a1-67bd-4d16-a921-9215046da9c5	Some tips.	t	2026-01-02 14:59:15.580888+00	[{"url": "https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/lesson_materials/chat-attachments/e96d34d9-5cc9-43a8-81c2-9545d1b11508/1767365954775_Lionel_Yu_Performance_Tips_2025.pdf", "name": "Lionel Yu Performance Tips 2025.pdf", "size": 113801, "type": "file"}]
ce60ad85-d387-40d7-b846-2ce5aa61b8ee	3a7b64a1-67bd-4d16-a921-9215046da9c5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hello	t	2026-01-02 14:59:55.731338+00	\N
e7dc1b28-c245-4e65-9d69-cdd97a016f31	356415aa-1051-4ed2-a29d-7d1c329f7e0f	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Helloooo sir	f	2026-01-02 17:15:07.780733+00	\N
d3464a38-064a-4d7d-aef1-7e4955db097d	ea536caa-89cf-4997-a649-577f6c64f990	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Hi Lionel!  I'm so sorry, I thought we were going to be able to make our piano lesson tomorrow, but we just had a scheduling issue arise.  I'm so sorry, we'll definitely be ready next week!!  BTW, do you prefer to keep scheduling communication here, or via email?	f	2026-01-04 01:26:48.357966+00	\N
\.


--
-- Data for Name: pieces; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pieces (id, user_id, title, composer, difficulty, youtube_url, xml_url, mp3_url, created_at) FROM stdin;
84a84f27-cd47-4827-8502-3eb5853cf469	teacher-1	Arabesque	Burgmuller	Grade 2	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767327002965_Burgmuller%20Arabesque%20Full%20Lesson%20Version.musicxml	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767327003412_Burgmuller%20Arabesque%20Full%20Lesson%20Version.mp3	2026-01-02 04:10:03.904631+00
c07a9d49-696e-458c-957b-353e31da7f37	teacher-1	Burgmuller Tarantella	Burgmuller	Grade 3	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767329054633_Burgmuller%20Tarantella%20With%20Counting%20Version.musicxml	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767329055059_Burgmuller%20Tarantella%20With%20Counting%20Version.mp3	2026-01-02 04:44:16.057989+00
716ebd65-43cc-4b68-a637-f1b443ee368c	teacher-1	The Storm	Burgmuller	Intermediate	\N	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/sheet_music/teacher-1/1767366299070_Burgmuller%20The%20Storm%20All%20Markings%20Version.musicxml	https://glexdzzmdkqpfbqqffyw.supabase.co/storage/v1/object/public/audio_files/teacher-1/1767367162546_Burgmuller%20The%20Storm%20All%20Markings%20Version.mp3	2026-01-02 15:04:59.706044+00
\.


--
-- Data for Name: pricing_tiers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pricing_tiers (duration, single_price, pack_price) FROM stdin;
45	6000	22500
60	7500	27500
30	5000	16500
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, name, email, phone, role, credits, credits_total, balance_due, zoom_link, stripe_customer_id, created_at, updated_at, lesson_duration, default_meeting_link, lesson_day, available_hours, timezone, studio_name, parent_email, public_id) FROM stdin;
e96d34d9-5cc9-43a8-81c2-9545d1b11508	Professor Lionel	support@musicalbasics.com	(555) 987-6543	admin	0	0	0.00	https://zoom.us/j/admin-studio	\N	2025-12-14 16:17:40.279641+00	2025-12-14 16:19:00.931143+00	30	\N	\N	[{"day": "Monday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Tuesday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Wednesday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Thursday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Friday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Saturday", "end": "17:00", "start": "12:00", "enabled": true}, {"day": "Sunday", "end": "17:00", "start": "12:00", "enabled": true}]	America/Los_Angeles	Lionel Yu Piano Studio	\N	\N
b8edc751-854a-4716-b520-7112d13f7b69	Nate Mahon	nate.mahon@icloud.com	\N	student	0	2	0.00	\N	\N	2025-12-16 23:20:20.606219+00	2026-01-02 05:02:42.857755+00	45	\N	Thursday	[]	UTC	\N	sassafras918@gmail.com	nate_mahon
3a7b64a1-67bd-4d16-a921-9215046da9c5	Piano Student	yulionel829@gmail.com	8184411897	student	505	147	0.00	\N	\N	2025-12-09 15:33:12.683065+00	2026-01-02 05:02:59.688699+00	45	\N	\N	[]	UTC	\N	\N	piano_student
356415aa-1051-4ed2-a29d-7d1c329f7e0f	Best student	djsputty@gmail.com	\N	student	8	4	0.00	\N	\N	2026-01-02 16:11:36.380298+00	2026-01-02 16:11:48.728527+00	45	\N	Wednesday	[]	UTC	\N	\N	best_student
bedceebb-fada-4354-9542-b9377ff9a4d3	Caedmon Crosby	ubermichellita@hotmail.com	\N	student	1	2	0.00	\N	\N	2025-12-17 03:50:49.018831+00	2026-01-02 23:57:24.438608+00	30	\N	Friday	[]	UTC	\N	\N	caedmon_crosby
fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	Emily Chen	student@demo.com	(555) 123-4567	student	2	4	0.00	https://zoom.us/j/123456789	\N	2025-12-09 10:11:27.106334+00	2026-01-01 19:17:49.3458+00	45	\N	Thursday	[]	UTC	\N	\N	emily_chen
ac966367-dc7b-4934-b668-847a84e4ee85	Micah Finn	micahfinn1@gmail.com	\N	student	2	3	0.00	\N	\N	2025-12-16 23:21:35.243907+00	2026-01-01 19:17:49.3458+00	30	\N	Thursday	[]	UTC	\N	living4him76@yahoo.com	micah_finn
ea536caa-89cf-4997-a649-577f6c64f990	Ila and Cordelia Daigle	aldaigle@gmail.com	\N	student	8	0	0.00	\N	\N	2025-12-14 08:49:53.112355+00	2026-01-01 19:17:49.3458+00	45	\N	Sunday	[]	UTC	\N	\N	ila_and_cordelia_daigle
458267a3-ffa8-4c1c-9969-e18ccc710695	Kai Steinberg	eran.steinberg@gmail.com	\N	student	3	4	0.00	\N	\N	2025-12-18 13:41:15.370167+00	2026-01-01 19:17:49.3458+00	30	\N	Sunday	[]	UTC	\N	mimi.rodnay@gmail.com	kai_steinberg
ebc039fd-8043-419f-97e0-77c2b902da75	Jose Piano Teacher	josedvdrocha@gmail.com	\N	student	997	999	0.00	\N	\N	2025-12-16 11:27:46.165058+00	2026-01-01 19:17:49.3458+00	45	\N	Tuesday	[]	UTC	\N	\N	jose_piano_teacher
10128b61-f8e6-44cf-86af-7c7f4669705a	Edwin Guo	zouwu80@gmail.com	\N	student	5	6	0.00	\N	\N	2025-12-14 13:26:44.462216+00	2026-01-01 19:17:49.3458+00	45	\N	Thursday	[]	UTC	\N	\N	edwin_guo
e8a5996d-484f-40f8-bd17-eb6cf8323baf	Roy Yin	kylie718@gmail.com	\N	student	2	6	0.00	\N	\N	2025-12-14 16:45:43.326868+00	2026-01-01 19:17:49.3458+00	45	\N	Sunday	[]	UTC	\N	\N	roy_yin
0d15924c-5764-431d-ac1f-34a967c9285d	Waris Matharu	sarabjitmatharu@gmail.com	\N	student	2	5	0.00	\N	\N	2025-12-14 17:21:58.517344+00	2026-01-01 19:17:49.3458+00	30	\N	Sunday	[]	UTC	\N	\N	waris_matharu
615b4a9c-f8fc-42ca-bf23-b863a18d1788	Olga Piano Teacher	hello@dreamplaypianos.com	\N	student	999	999	0.00	\N	\N	2025-12-29 13:59:39.332667+00	2026-01-01 19:17:49.3458+00	60	\N	\N	[]	UTC	\N	\N	olga_piano_teacher
a7be1876-00ae-4f6d-8818-be02c2a4bf45	Yakir Shimon	yakir30g@gmail.com	\N	student	3	4	0.00	\N	\N	2025-12-16 22:49:30.683888+00	2026-01-01 19:17:49.3458+00	30	\N	Thursday	[]	UTC	\N	\N	yakir_shimon
8999a0e4-94ab-4efc-9b05-bd8aedc504a9	Oceanna Chan	oceanna.chan@outlook.com	\N	student	2	1	0.00	\N	\N	2025-12-14 16:19:49.34185+00	2026-01-01 19:17:49.3458+00	30	\N	Sunday	[]	UTC	\N	\N	oceanna_chan
b1814878-5d12-4cb4-8a68-5d89213c698c	Padhma Berk	jayde.ireland@gmail.com	\N	student	2	2	0.00	\N	\N	2025-12-14 16:26:50.273064+00	2026-01-01 19:17:49.3458+00	45	\N	Monday	[]	UTC	\N	\N	padhma_berk
7664c5ce-4f36-4514-9a4f-2353c4e769fa	Yuelin and Yizhong	ddmxuyang@gmail.com	\N	student	3	4	0.00	\N	\N	2025-12-15 22:37:28.470295+00	2026-01-01 19:17:49.3458+00	60	\N	Monday	[]	UTC	\N	\N	yuelin_and_yizhong
\.


--
-- Data for Name: resource_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_assignments (id, resource_id, student_id, created_at) FROM stdin;
b2b255e2-5bac-478b-a373-1faa704bd4c6	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-22 04:27:25.520867+00
806d8967-4901-4d1a-bc2c-8cebc450b57b	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	10128b61-f8e6-44cf-86af-7c7f4669705a	2025-12-22 04:27:25.520867+00
eacb4faf-154c-4022-864c-6e0991a7af4f	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	2025-12-22 04:27:25.520867+00
ca3a5bb1-7a2f-4e83-9719-0763715eee0e	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	ea536caa-89cf-4997-a649-577f6c64f990	2025-12-22 04:27:25.520867+00
eee15c4d-d153-4b58-842b-745081653528	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	ebc039fd-8043-419f-97e0-77c2b902da75	2025-12-22 04:27:25.520867+00
cfb94130-2d06-43df-882f-edb48212f25e	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	458267a3-ffa8-4c1c-9969-e18ccc710695	2025-12-22 04:27:25.520867+00
82bc8218-53c6-4553-8f12-7d46d94fd0e0	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	ac966367-dc7b-4934-b668-847a84e4ee85	2025-12-22 04:27:25.520867+00
7ebc6acc-5a32-4da4-a367-aa0b25057c4b	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	b8edc751-854a-4716-b520-7112d13f7b69	2025-12-22 04:27:25.520867+00
7786a5b3-a117-46ab-bfc3-bad249d1d328	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-22 04:27:25.520867+00
d2e16f40-85b0-46c2-b379-d2746565b46a	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-22 04:27:25.520867+00
d262bfe3-7699-40b4-b3c1-5b20b6202a99	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-22 04:27:25.520867+00
2a511df3-1add-4e34-8ab6-db64aa26410f	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-22 04:27:25.520867+00
5933f4a3-9c5c-4ad0-930f-70f07ed3c6f0	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-22 04:27:25.520867+00
46f9cf8f-a470-44ad-822c-96d07a49f0a0	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-22 04:27:25.520867+00
18282478-2d0f-4c7f-a719-b845e8c0fdee	bd7f8aa8-7b98-455e-b28f-0ece1f399a49	7664c5ce-4f36-4514-9a4f-2353c4e769fa	2025-12-22 04:27:25.520867+00
06dd7f1e-3fc4-4dc3-bebc-86234c4b624a	95b1c580-5631-45c5-b96b-070c65171b74	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-22 04:33:52.572264+00
99b9c1d7-34e1-44f6-88ed-c7cb23dfb12b	95b1c580-5631-45c5-b96b-070c65171b74	10128b61-f8e6-44cf-86af-7c7f4669705a	2025-12-22 04:33:52.572264+00
0bd0acdc-9dfa-448f-8b0b-aec7007582f2	95b1c580-5631-45c5-b96b-070c65171b74	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	2025-12-22 04:33:52.572264+00
3c3f6d9f-d4a5-4294-bf36-8614c764c48b	95b1c580-5631-45c5-b96b-070c65171b74	ea536caa-89cf-4997-a649-577f6c64f990	2025-12-22 04:33:52.572264+00
dd972416-0c6c-4fdd-9452-3cdeb1e884f9	95b1c580-5631-45c5-b96b-070c65171b74	ebc039fd-8043-419f-97e0-77c2b902da75	2025-12-22 04:33:52.572264+00
42200556-2e5d-4ef1-81a0-9f0171ee0e0b	95b1c580-5631-45c5-b96b-070c65171b74	458267a3-ffa8-4c1c-9969-e18ccc710695	2025-12-22 04:33:52.572264+00
3c35a208-2daa-4368-a284-ac2d035adcd5	95b1c580-5631-45c5-b96b-070c65171b74	ac966367-dc7b-4934-b668-847a84e4ee85	2025-12-22 04:33:52.572264+00
35a50cb7-06f7-457b-866d-0cf52fc715c2	95b1c580-5631-45c5-b96b-070c65171b74	b8edc751-854a-4716-b520-7112d13f7b69	2025-12-22 04:33:52.572264+00
5de75db5-af44-4a82-9fbf-7cda8a39301d	95b1c580-5631-45c5-b96b-070c65171b74	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-22 04:33:52.572264+00
5c7ce58d-9eab-46b8-bbd6-9f9b34a2653f	95b1c580-5631-45c5-b96b-070c65171b74	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-22 04:33:52.572264+00
bc340731-c213-40e7-b1ce-dd83fd682fc5	95b1c580-5631-45c5-b96b-070c65171b74	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-22 04:33:52.572264+00
ffc59574-0063-4c56-bbaf-53259cbb02a3	95b1c580-5631-45c5-b96b-070c65171b74	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-22 04:33:52.572264+00
58f7a8b1-4f71-4db5-9db4-3591cf0831c0	95b1c580-5631-45c5-b96b-070c65171b74	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-22 04:33:52.572264+00
5f861f62-e38b-4687-8fe3-7814a572cf84	95b1c580-5631-45c5-b96b-070c65171b74	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-22 04:33:52.572264+00
2e5acb8e-f296-46ec-86ed-d92e70d707c4	95b1c580-5631-45c5-b96b-070c65171b74	7664c5ce-4f36-4514-9a4f-2353c4e769fa	2025-12-22 04:33:52.572264+00
35d4d794-acd3-40f0-bd91-91ad583ec099	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	bedceebb-fada-4354-9542-b9377ff9a4d3	2025-12-22 04:34:38.468254+00
fafe6644-a5a1-42ec-8123-84e994149080	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	10128b61-f8e6-44cf-86af-7c7f4669705a	2025-12-22 04:34:38.468254+00
8b5480be-7ecc-489c-88ed-b24ef5ffbcc6	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	fb6e3f04-e2e3-4155-bd99-c36a534c7fc1	2025-12-22 04:34:38.468254+00
69433399-7ff3-49b6-8ecf-b24a800d291a	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	ea536caa-89cf-4997-a649-577f6c64f990	2025-12-22 04:34:38.468254+00
b1709d4c-c1da-4db8-8f65-fb20a55c08bb	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	ebc039fd-8043-419f-97e0-77c2b902da75	2025-12-22 04:34:38.468254+00
91cb86be-b4c8-4f42-b80b-ae343525be92	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	458267a3-ffa8-4c1c-9969-e18ccc710695	2025-12-22 04:34:38.468254+00
d989102b-1df0-4bbf-b8ef-c7e39b57d065	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	ac966367-dc7b-4934-b668-847a84e4ee85	2025-12-22 04:34:38.468254+00
85dba0e2-de0f-490c-8c30-9c656281be63	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	b8edc751-854a-4716-b520-7112d13f7b69	2025-12-22 04:34:38.468254+00
e231cb14-2129-4db2-b377-9beae59701e8	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	8999a0e4-94ab-4efc-9b05-bd8aedc504a9	2025-12-22 04:34:38.468254+00
d1e1b4fd-7ebe-444c-8704-928682d07398	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	b1814878-5d12-4cb4-8a68-5d89213c698c	2025-12-22 04:34:38.468254+00
21a81d39-342a-401e-8551-97512211a528	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	3a7b64a1-67bd-4d16-a921-9215046da9c5	2025-12-22 04:34:38.468254+00
44a8192f-28fe-491b-8a21-4246365c312e	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	e8a5996d-484f-40f8-bd17-eb6cf8323baf	2025-12-22 04:34:38.468254+00
614bfd1e-74b4-4203-b825-16eb6e89db79	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	0d15924c-5764-431d-ac1f-34a967c9285d	2025-12-22 04:34:38.468254+00
4c8c60c9-bfc7-4c7c-8315-b49b712abc03	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	a7be1876-00ae-4f6d-8818-be02c2a4bf45	2025-12-22 04:34:38.468254+00
6d0c914f-6ccb-425d-aa82-d8b93f380790	d8b3bb2a-78d3-47c7-8e8b-258650d54b49	7664c5ce-4f36-4514-9a4f-2353c4e769fa	2025-12-22 04:34:38.468254+00
\.


--
-- Data for Name: resources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resources (id, title, description, category, file_url, file_type, created_at) FROM stdin;
bd7f8aa8-7b98-455e-b28f-0ece1f399a49	Hanon Exercise Num 1 - Full Score	Hanon Exercise 1 - good for finger technique.	Sheet Music	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/library/1766377644147_Hanon_Exercise_Num_1_-_Full_Score.pdf	pdf	2025-12-22 04:27:25.38805+00
95b1c580-5631-45c5-b96b-070c65171b74	Introduction to Counting - Full Score	Introduction to Counting - Super Important For Everyone!	Exercises	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/library/1766378031053_Introduction_to_Counting_-_Full_Score.pdf	pdf	2025-12-22 04:33:52.408332+00
d8b3bb2a-78d3-47c7-8e8b-258650d54b49	Articulations Introduction Overview - Full Score	Overview of Articulations You Will See In Sheet Music	Theory	https://dmbnstbteqlhxyczlcst.supabase.co/storage/v1/object/public/lesson_materials/library/1766378077298_Articulations_Introduction_Overview_-_Full_Score.pdf	pdf	2025-12-22 04:34:38.322333+00
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, student_id, name, rating, text, status, created_at) FROM stdin;
fd737234-4e33-44e3-800b-9f0e6041caf5	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Zou W.	5	My son has been taking Lionel's piano lessons a little over one year now. My son's piano skills has been moved to the next level; such as playing solid rhythm, playing with dynamics and playing with clear finger articulation, etc. Lionel is the best piano teacher that my son never had before... Lionel made my son a bright star at his school performances. I highly recommend Lionel as your piano teacher with his affordable piano lesson prices. Lionel’s piano lessons will worth every dollar you pay.	approved	2025-12-25 21:32:19.535218+00
cad01304-b603-44b5-abe6-009e95db718b	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Yakir S.	5	Lionel is an incredible piano teacher, patient, knowledgeable, and truly passionate about music. Every lesson is inspiring and well-structured, and he knows exactly how to adapt his teaching style to my level and goals. Thanks to him, I’ve made real progress and started enjoying playing in a way I never imagined. Highly recommended to anyone who wants to learn piano the right way!	approved	2025-12-25 21:32:03.642334+00
2747fbbf-f97a-47d3-a6aa-7a9f163bb3e2	e96d34d9-5cc9-43a8-81c2-9545d1b11508	Padhma B.	5	I have experience as a self-guided piano student, and finally decided to search for the right teacher to help me improve. I'm happy to have found Lionel, because not only did he teach me skills that I never saw in any other tutorials online, but he was also able to correct my posture and other issues that I would not have otherwise figured out without an actual teacher. I am lucky that he's my teacher and guiding me on my piano journey, and I highly recommended him as a talented and patient teacher for all levels! (also-If you are a self guided learner like I was, don't wait- he can correct things that will stall your progress later!)	approved	2025-12-25 21:33:04.318932+00
\.


--
-- Data for Name: site_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_pages (id, html_template, script_content, variable_values, updated_at) FROM stdin;
home	<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Lionel Yu Piano Studio</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n  <style>\n    /* Custom scroll behavior */\n    html { scroll-behavior: smooth; }\n  </style>\n</head>\n<body class="bg-white text-gray-950 font-sans antialiased selection:bg-black selection:text-white">\n\n  <nav class="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">\n    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">\n      <div class="flex items-center gap-2">\n        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>\n        <span class="font-serif text-xl font-bold">Lionel Yu Piano Studio</span>\n      </div>\n      <a href="/login" class="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors">\n        Student Login\n      </a>\n    </div>\n  </nav>\n\n  <section class="relative py-20 lg:py-32 overflow-hidden">\n    <div class="absolute inset-0 opacity-[0.03] pointer-events-none">\n      <div class="w-full h-full" style="background-image: repeating-linear-gradient(90deg, #000 0px, #000 60px, #fff 60px, #fff 70px, #000 70px, #000 100px, #fff 100px, #fff 110px); background-size: 100% 200px;"></div>\n    </div>\n\n    <div class="max-w-7xl mx-auto px-4">\n      <div class="grid lg:grid-cols-2 gap-12 items-center">\n        <div class="space-y-8">\n          <div class="space-y-4">\n            <h1 class="font-serif text-5xl lg:text-6xl font-bold leading-tight">\n              Master Piano with Excellence\n            </h1>\n            <p class="text-xl text-gray-500 leading-relaxed">\n              Transform your musical journey with personalized instruction, flexible scheduling, and a proven system designed for serious students.\n            </p>\n          </div>\n\n          <div class="flex flex-col sm:flex-row gap-4">\n            <a href="/login" class="inline-flex h-12 items-center justify-center rounded-md bg-black px-8 text-base font-medium text-white shadow hover:bg-gray-800 transition-colors">\n              Student Portal\n            </a>\n            <a href="/contact" class="inline-flex h-12 items-center justify-center rounded-md border border-gray-200 bg-transparent px-8 text-base font-medium shadow-sm hover:bg-gray-50 transition-colors">\n              Inquire for Lessons\n            </a>\n          </div>\n\n          <div class="grid grid-cols-3 gap-6 pt-8 border-t border-gray-100">\n            <div>\n              <div class="font-serif text-3xl font-bold">1.27m</div>\n              <div class="text-sm text-gray-500">YouTube Subscribers</div>\n            </div>\n            <div>\n              <div class="font-serif text-3xl font-bold">50+</div>\n              <div class="text-sm text-gray-500">Students Taught</div>\n            </div>\n            <div>\n              <div class="font-serif text-3xl font-bold">100%</div>\n              <div class="text-sm text-gray-500">Satisfaction Rate</div>\n            </div>\n          </div>\n        </div>\n\n        <div class="relative">\n          <div class="aspect-[4/5] rounded-lg overflow-hidden border-2 border-gray-100 shadow-2xl">\n            <img src="{{hero_image_url}}" alt="Professional Piano Instruction" class="w-full h-full object-cover" />\n          </div>\n          <div class="absolute -bottom-6 -left-6 w-32 h-32 bg-gray-900/10 rounded-full -z-10"></div>\n          <div class="absolute -top-6 -right-6 w-24 h-24 bg-gray-900/5 rounded-full -z-10"></div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <section class="py-20 bg-gray-50/50">\n    <div class="max-w-7xl mx-auto px-4">\n      <div class="max-w-3xl mx-auto">\n        <div class="text-center space-y-4 mb-12">\n          <h2 class="font-serif text-4xl font-bold">About Your Teacher</h2>\n          <div class="h-1 w-20 bg-black mx-auto"></div>\n        </div>\n\n        <div class="space-y-6 text-lg leading-relaxed text-gray-700">\n          <p>\n            With over 30 years of piano experience and having played in some of the world's biggest concert halls, I teach students of all ages and skill levels, bringing a unique mixture of classical technique and modern musicality to each student. My approach is rooted in building strong technical foundations while nurturing each student's individual musical voice.\n          </p>\n\n          <p>\n            I have studied at Juilliard, Peabody and NYU Music Schools and with some of the world's best pianists, such as Stanislav Khristenko, Assaff Weisman, Peter Dugan, and others. But my greatest joy comes from witnessing the moment when a student discovers their own musical potential.\n          </p>\n\n          <div class="rounded-lg border-l-4 border-l-black bg-white p-6 shadow-sm">\n            <p class="font-serif text-xl italic text-gray-800">\n              "My teaching philosophy centers on three pillars: discipline, creativity, and joy. I believe that mastery comes from consistent practice, but the journey should always be filled with the excitement of musical discovery."\n            </p>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <section class="py-20" id="contact">\n    <div class="max-w-7xl mx-auto px-4">\n      <div class="max-w-4xl mx-auto">\n        <div class="text-center space-y-4 mb-12">\n          <h2 class="font-serif text-4xl font-bold">The Studio System</h2>\n          <p class="text-xl text-gray-500">Flexible consistency for serious students</p>\n          <div class="h-1 w-20 bg-black mx-auto"></div>\n        </div>\n\n        <div class="grid md:grid-cols-3 gap-6">\n          <div class="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">\n            <div class="space-y-4">\n              <div class="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">\n                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>\n              </div>\n              <h3 class="font-serif text-xl font-bold">Credit-Based Packages</h3>\n              <p class="text-gray-500 leading-relaxed">\n                Purchase 4-lesson packages that work with your schedule. No rigid monthly commitments—just consistent progress at your pace.\n              </p>\n            </div>\n          </div>\n\n          <div class="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">\n            <div class="space-y-4">\n              <div class="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">\n                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>\n              </div>\n              <h3 class="font-serif text-xl font-bold">Fair Cancellation Policy</h3>\n              <p class="text-gray-500 leading-relaxed">\n                Life happens. Reschedule with 24+ hours notice at no charge. We'll find you a makeup slot that works for your week.\n              </p>\n            </div>\n          </div>\n\n          <div class="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">\n            <div class="space-y-4">\n              <div class="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">\n                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>\n              </div>\n              <h3 class="font-serif text-xl font-bold">Professional Standards</h3>\n              <p class="text-gray-500 leading-relaxed">\n                Clear expectations, detailed lesson notes, and recorded sessions ensure you get maximum value from every minute of instruction.\n              </p>\n            </div>\n          </div>\n        </div>\n\n        <div class="mt-8 rounded-lg bg-gray-50 border border-gray-200 p-6">\n          <p class="text-center text-lg text-gray-700">\n            <strong class="font-serif">The Result?</strong> Students make faster progress because they can maintain weekly momentum without the stress of rigid scheduling. It's the perfect balance of structure and flexibility.\n          </p>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <section class="py-20 bg-gray-50/50">\n    <div class="max-w-7xl mx-auto px-4">\n      <div class="max-w-5xl mx-auto">\n        <div class="text-center space-y-4 mb-12">\n          <h2 class="font-serif text-4xl font-bold">What Students Say</h2>\n          <div class="h-1 w-20 bg-black mx-auto"></div>\n        </div>\n\n        <div class="grid md:grid-cols-3 gap-6">\n          <div class="rounded-xl bg-white p-6 shadow-sm border border-gray-100">\n            <div class="space-y-4">\n              <div class="flex gap-1">\n                <span class="text-black">★★★★★</span>\n              </div>\n              <p class="text-gray-600 italic leading-relaxed">\n                "I have experience as a self-guided piano student, and finally decided to search for the right teacher to help me improve. I'm happy to have found Lionel, because not only did he teach me skills that I never saw in any other tutorials online, but he was also able to correct my posture and other issues that I would not have otherwise figured out without an actual teacher. I am lucky that he's my teacher and guiding me on my piano journey, and I highly recommended him as a talented and patient teacher for all levels! (also-If you are a self guided learner like I was, don't wait- he can correct things that will stall your progress later!)"\n              </p>\n              <div class="pt-4 border-t border-gray-100">\n                <p class="font-semibold">Padhma B.</p>\n                <p class="text-sm text-gray-500">Adult Student, 6 months</p>\n              </div>\n            </div>\n          </div>\n\n          <div class="rounded-xl bg-white p-6 shadow-sm border border-gray-100">\n            <div class="space-y-4">\n              <div class="flex gap-1">\n                <span class="text-black">★★★★★</span>\n              </div>\n              <p class="text-gray-600 italic leading-relaxed">\n                "My son has been taking Lionel's piano lessons a little over one year now. My son's piano skills has been moved to the next level; such as playing solid rhythm, playing with dynamics and playing with clear finger articulation, etc. Lionel is the best piano teacher that my son never had before... Lionel made my son a bright star at his school performances.\nI highly recommend Lionel as your piano teacher with his affordable piano lesson prices. Lionel’s piano lessons will worth every dollar you pay."\n              </p>\n              <div class="pt-4 border-t border-gray-100">\n                <p class="font-semibold">Zou W.</p>\n                <p class="text-sm text-gray-500">Parent of Student, 1 year</p>\n              </div>\n            </div>\n          </div>\n\n          <div class="rounded-xl bg-white p-6 shadow-sm border border-gray-100">\n            <div class="space-y-4">\n              <div class="flex gap-1">\n                <span class="text-black">★★★★★</span>\n              </div>\n              <p class="text-gray-600 italic leading-relaxed">\n                "Lionel is an incredible piano teacher, patient, knowledgeable, and truly passionate about music. Every lesson is inspiring and well-structured, and he knows exactly how to adapt his teaching style to my level and goals. Thanks to him, I’ve made real progress and started enjoying playing in a way I never imagined. Highly recommended to anyone who wants to learn piano the right way!"\n              </p>\n              <div class="pt-4 border-t border-gray-100">\n                <p class="font-semibold">Yakir S.</p>\n                <p class="text-sm text-gray-500">Beginner Student, 3 months</p>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n<section class="py-24 bg-gray-50 border-t border-gray-100" id="contact">\n    <div class="max-w-3xl mx-auto px-6">\n      <div class="text-center mb-12">\n        <h2 class="font-serif text-4xl font-bold mb-4">Ready to Begin Your Musical Journey?</h2>\n        <p class="text-gray-500 text-lg">\n          Send me a message to discuss your goals and schedule a consultation.\n        </p>\n      </div>\n\n<form action="https://formspree.io/f/mzznqdro" method="POST" class="space-y-4">\n        \n        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">\n          <input \n            type="text" \n            name="name"\n            placeholder="Name" \n            required\n            class="w-full px-4 py-3 rounded-md bg-gray-100 border-none focus:ring-2 focus:ring-black focus:outline-none transition-all placeholder:text-gray-400"\n          />\n          \n          <input \n            type="email" \n            name="email"\n            placeholder="Email *" \n            required\n            class="w-full px-4 py-3 rounded-md bg-gray-100 border-none focus:ring-2 focus:ring-black focus:outline-none transition-all placeholder:text-gray-400"\n          />\n        </div>\n\n        <textarea \n          name="message"\n          rows="5" \n          placeholder="Tell me about yourself and your piano experience!" \n          required\n          class="w-full px-4 py-3 rounded-md bg-gray-100 border-none focus:ring-2 focus:ring-black focus:outline-none transition-all placeholder:text-gray-400 resize-none"\n        ></textarea>\n\n        <button \n          type="submit" \n          class="inline-flex h-12 items-center justify-center rounded-md bg-gray-900 px-8 text-sm font-medium text-white shadow hover:bg-black transition-colors"\n        >\n          Send Message\n        </button>\n\n      </form>\n    </div>\n  </section>\n\n  <footer class="border-t border-gray-100 bg-gray-50/50">\n    <div class="max-w-7xl mx-auto px-4 py-12">\n      <div class="flex flex-col md:flex-row justify-between items-center gap-6">\n        <div class="flex items-center gap-2">\n          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>\n          <span class="font-serif text-lg font-bold">Lionel Yu Piano Studio</span>\n        </div>\n\n        <div class="flex gap-6">\n          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" class="text-gray-500 hover:text-black transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>\n          </a>\n          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" class="text-gray-500 hover:text-black transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>\n          </a>\n          <a href="mailto:support@musicalbasics.com" class="text-gray-500 hover:text-black transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>\n          </a>\n        </div>\n\n        <p class="text-sm text-gray-500">© 2025 Lionel Yu Piano Studio. All rights reserved.</p>\n      </div>\n    </div>\n  </footer>\n\n</body>\n</html>		{"site_title": "Lionel Yu Piano Studio", "about_quote": "My teaching philosophy centers on building strong fundamentals while nurturing each student's unique musical voice. I believe in structured progress with room for creative exploration.", "about_title": "About Your Teacher", "card_1_text": "", "card_2_text": "", "card_3_text": "", "cta_primary": "Inquire for Lessons", "studio_name": "Lionel Yu Piano Studio", "test_1_name": "", "test_1_role": "", "test_2_name": "", "test_2_role": "", "test_3_name": "", "test_3_role": "", "about_text_1": "", "about_text_2": "", "card_1_title": "", "card_2_title": "", "card_3_title": "", "cta_headline": "", "stat_1_label": "Years Teaching", "stat_2_label": "Students Taught", "stat_3_label": "Satisfaction Rate", "system_title": "", "test_1_quote": "", "test_2_quote": "", "test_3_quote": "", "cta_secondary": "Student Portal", "hero_headline": "Master Piano with Excellence", "stat_1_number": "15+", "stat_2_number": "200+", "stat_3_number": "98%", "about_headline": "", "hero_image_url": "/lionel-yu-at-piano.JPG", "cta_button_text": "", "cta_subheadline": "", "nav_button_text": "Student Login", "system_subtitle": "", "cta_primary_text": "", "footer_copyright": "© 2025 Piano Studio. All rights reserved.", "hero_cta_primary": "Inquire for Lessons", "hero_subheadline": "Transform your musical journey with personalized instruction, flexible scheduling, and a proven system designed for serious students.", "about_paragraph_1": "With over 15 years of dedicated teaching experience, I bring a wealth of knowledge from my training at prestigious conservatories and years of professional performance.", "about_paragraph_2": "My teaching philosophy centers on building strong fundamentals while nurturing each student's unique musical voice. I believe in structured progress with room for creative exploration.", "login_button_text": "Student Login", "hero_cta_secondary": "Student Portal", "system_result_text": "", "testimonial_1_name": "Sarah Chen", "testimonial_1_role": "Adult Student, 2 years", "testimonial_2_name": "Michael Torres", "testimonial_2_role": "Parent of Emma, age 12", "testimonial_3_name": "James Kim", "testimonial_3_role": "Pre-Conservatory Student", "testimonials_title": "What Students Say", "system_result_title": "", "testimonial_1_quote": "The structured approach combined with flexibility has been perfect for my busy schedule. I've made more progress in 6 months than years of previous lessons.", "testimonial_2_quote": "My daughter has flourished under this instruction. The recitals and group classes have built her confidence tremendously.", "testimonial_3_quote": "Professional, demanding, but always supportive. Exactly what I needed to prepare for my conservatory auditions."}	2025-12-15 14:04:01.382+00
\.


--
-- Data for Name: messages_2026_01_01; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_01 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_02; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_02 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_03; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_03 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_04; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_04 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_05; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_05 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_06; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_06 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: messages_2026_01_07; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.messages_2026_01_07 (topic, extension, payload, event, private, updated_at, inserted_at, id) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.schema_migrations (version, inserted_at) FROM stdin;
20211116024918	2025-12-25 02:23:17
20211116045059	2025-12-25 02:23:19
20211116050929	2025-12-25 02:23:22
20211116051442	2025-12-25 02:23:24
20211116212300	2025-12-25 02:23:26
20211116213355	2025-12-25 02:23:29
20211116213934	2025-12-25 02:23:31
20211116214523	2025-12-25 02:23:34
20211122062447	2025-12-25 02:23:36
20211124070109	2025-12-25 02:23:38
20211202204204	2025-12-25 02:23:40
20211202204605	2025-12-25 02:23:42
20211210212804	2025-12-25 02:23:49
20211228014915	2025-12-25 02:23:52
20220107221237	2025-12-25 02:23:54
20220228202821	2025-12-25 02:23:56
20220312004840	2025-12-25 02:23:58
20220603231003	2025-12-25 02:24:01
20220603232444	2025-12-25 02:24:04
20220615214548	2025-12-25 02:24:06
20220712093339	2025-12-25 02:24:08
20220908172859	2025-12-25 02:24:10
20220916233421	2025-12-25 02:24:13
20230119133233	2025-12-25 02:24:15
20230128025114	2025-12-25 02:24:18
20230128025212	2025-12-25 02:24:20
20230227211149	2025-12-25 02:24:22
20230228184745	2025-12-25 02:24:24
20230308225145	2025-12-25 02:24:26
20230328144023	2025-12-25 02:24:29
20231018144023	2025-12-25 02:24:31
20231204144023	2025-12-25 02:24:35
20231204144024	2025-12-25 02:24:37
20231204144025	2025-12-25 02:24:39
20240108234812	2025-12-25 02:24:41
20240109165339	2025-12-25 02:24:43
20240227174441	2025-12-25 02:24:47
20240311171622	2025-12-25 02:24:50
20240321100241	2025-12-25 02:24:55
20240401105812	2025-12-25 02:25:01
20240418121054	2025-12-25 02:25:04
20240523004032	2025-12-25 02:25:12
20240618124746	2025-12-25 02:25:14
20240801235015	2025-12-25 02:25:16
20240805133720	2025-12-25 02:25:18
20240827160934	2025-12-25 02:25:20
20240919163303	2025-12-25 02:25:23
20240919163305	2025-12-25 02:25:25
20241019105805	2025-12-25 02:25:28
20241030150047	2025-12-25 02:25:36
20241108114728	2025-12-25 02:25:39
20241121104152	2025-12-25 02:25:41
20241130184212	2025-12-25 02:25:43
20241220035512	2025-12-25 02:25:46
20241220123912	2025-12-25 02:25:48
20241224161212	2025-12-25 02:25:50
20250107150512	2025-12-25 02:25:52
20250110162412	2025-12-25 02:25:54
20250123174212	2025-12-25 02:25:56
20250128220012	2025-12-25 02:25:59
20250506224012	2025-12-25 02:26:00
20250523164012	2025-12-25 02:26:02
20250714121412	2025-12-25 02:26:05
20250905041441	2025-12-25 02:26:07
20251103001201	2025-12-25 02:26:09
\.


--
-- Data for Name: subscription; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.subscription (id, subscription_id, entity, filters, claims, created_at) FROM stdin;
512	7270b7c8-e92a-11f0-bcf5-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,guest)"}	{"exp": 1767589238, "iat": 1767502778, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:36.670127
514	74d2d078-e92a-11f0-8dda-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,guest)"}	{"exp": 1767589242, "iat": 1767502782, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:40.671062
515	74d397ba-e92a-11f0-8040-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,piano_student)"}	{"exp": 1767589242, "iat": 1767502782, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:40.896687
516	74d39684-e92a-11f0-9b28-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,guest)"}	{"exp": 1767589242, "iat": 1767502782, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:40.904278
519	7895c6ca-e92a-11f0-89ae-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,piano_student)"}	{"exp": 1767589247, "iat": 1767502787, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:46.981242
511	64236dfa-e92a-11f0-8fd3-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,guest)"}	{"exp": 1767589238, "iat": 1767502778, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:12.677267
513	74d3161e-e92a-11f0-a7c1-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,preview)"}	{"exp": 1767589242, "iat": 1767502782, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:40.672419
517	758a3420-e92a-11f0-89a2-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,piano_student)"}	{"exp": 1767589242, "iat": 1767502782, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:41.872802
518	7866c71c-e92a-11f0-ba1a-0a58a9feac02	public.classroom_annotations	{"(student_id,eq,piano_student)"}	{"exp": 1767589248, "iat": 1767502788, "iss": "https://api.supabase.co/v1/projects/glexdzzmdkqpfbqqffyw/api-keys-jwt-issuer", "role": "anon", "api_key_hash": "047XJjrXXJQhAr4X2nDBxZXVyXqdHB0-dr5nZCMGaQU"}	2026-01-04 05:01:46.673054
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) FROM stdin;
lesson_materials	lesson_materials	\N	2025-12-09 15:06:15.73422+00	2025-12-09 15:06:15.73422+00	t	f	\N	\N	\N	STANDARD
sheet_music	sheet_music	\N	2026-01-01 22:12:23.276561+00	2026-01-01 22:12:23.276561+00	t	f	\N	\N	\N	STANDARD
audio_files	audio_files	\N	2026-01-01 22:12:29.737007+00	2026-01-01 22:12:29.737007+00	t	f	\N	\N	\N	STANDARD
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_analytics (name, type, format, created_at, updated_at, id, deleted_at) FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_vectors (id, type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
0	create-migrations-table	e18db593bcde2aca2a408c4d1100f6abba2195df	2025-12-25 02:23:13.062165
1	initialmigration	6ab16121fbaa08bbd11b712d05f358f9b555d777	2025-12-25 02:23:13.078602
2	storage-schema	5c7968fd083fcea04050c1b7f6253c9771b99011	2025-12-25 02:23:13.085937
3	pathtoken-column	2cb1b0004b817b29d5b0a971af16bafeede4b70d	2025-12-25 02:23:13.114603
4	add-migrations-rls	427c5b63fe1c5937495d9c635c263ee7a5905058	2025-12-25 02:23:13.170399
5	add-size-functions	79e081a1455b63666c1294a440f8ad4b1e6a7f84	2025-12-25 02:23:13.175992
6	change-column-name-in-get-size	f93f62afdf6613ee5e7e815b30d02dc990201044	2025-12-25 02:23:13.182715
7	add-rls-to-buckets	e7e7f86adbc51049f341dfe8d30256c1abca17aa	2025-12-25 02:23:13.188865
8	add-public-to-buckets	fd670db39ed65f9d08b01db09d6202503ca2bab3	2025-12-25 02:23:13.194419
9	fix-search-function	3a0af29f42e35a4d101c259ed955b67e1bee6825	2025-12-25 02:23:13.200309
10	search-files-search-function	68dc14822daad0ffac3746a502234f486182ef6e	2025-12-25 02:23:13.206489
11	add-trigger-to-auto-update-updated_at-column	7425bdb14366d1739fa8a18c83100636d74dcaa2	2025-12-25 02:23:13.212679
12	add-automatic-avif-detection-flag	8e92e1266eb29518b6a4c5313ab8f29dd0d08df9	2025-12-25 02:23:13.219648
13	add-bucket-custom-limits	cce962054138135cd9a8c4bcd531598684b25e7d	2025-12-25 02:23:13.225516
14	use-bytes-for-max-size	941c41b346f9802b411f06f30e972ad4744dad27	2025-12-25 02:23:13.231452
15	add-can-insert-object-function	934146bc38ead475f4ef4b555c524ee5d66799e5	2025-12-25 02:23:13.253128
16	add-version	76debf38d3fd07dcfc747ca49096457d95b1221b	2025-12-25 02:23:13.259435
17	drop-owner-foreign-key	f1cbb288f1b7a4c1eb8c38504b80ae2a0153d101	2025-12-25 02:23:13.265289
18	add_owner_id_column_deprecate_owner	e7a511b379110b08e2f214be852c35414749fe66	2025-12-25 02:23:13.271184
19	alter-default-value-objects-id	02e5e22a78626187e00d173dc45f58fa66a4f043	2025-12-25 02:23:13.279247
20	list-objects-with-delimiter	cd694ae708e51ba82bf012bba00caf4f3b6393b7	2025-12-25 02:23:13.285008
21	s3-multipart-uploads	8c804d4a566c40cd1e4cc5b3725a664a9303657f	2025-12-25 02:23:13.292711
22	s3-multipart-uploads-big-ints	9737dc258d2397953c9953d9b86920b8be0cdb73	2025-12-25 02:23:13.306533
23	optimize-search-function	9d7e604cddc4b56a5422dc68c9313f4a1b6f132c	2025-12-25 02:23:13.318112
24	operation-function	8312e37c2bf9e76bbe841aa5fda889206d2bf8aa	2025-12-25 02:23:13.324112
25	custom-metadata	d974c6057c3db1c1f847afa0e291e6165693b990	2025-12-25 02:23:13.331075
26	objects-prefixes	ef3f7871121cdc47a65308e6702519e853422ae2	2025-12-25 02:23:13.337097
27	search-v2	33b8f2a7ae53105f028e13e9fcda9dc4f356b4a2	2025-12-25 02:23:13.351951
28	object-bucket-name-sorting	ba85ec41b62c6a30a3f136788227ee47f311c436	2025-12-25 02:23:13.827543
29	create-prefixes	a7b1a22c0dc3ab630e3055bfec7ce7d2045c5b7b	2025-12-25 02:23:13.850759
30	update-object-levels	6c6f6cc9430d570f26284a24cf7b210599032db7	2025-12-25 02:23:13.864457
31	objects-level-index	33f1fef7ec7fea08bb892222f4f0f5d79bab5eb8	2025-12-25 02:23:13.927969
32	backward-compatible-index-on-objects	2d51eeb437a96868b36fcdfb1ddefdf13bef1647	2025-12-25 02:23:13.942356
33	backward-compatible-index-on-prefixes	fe473390e1b8c407434c0e470655945b110507bf	2025-12-25 02:23:14.064469
34	optimize-search-function-v1	82b0e469a00e8ebce495e29bfa70a0797f7ebd2c	2025-12-25 02:23:14.06688
35	add-insert-trigger-prefixes	63bb9fd05deb3dc5e9fa66c83e82b152f0caf589	2025-12-25 02:23:14.165026
36	optimise-existing-functions	81cf92eb0c36612865a18016a38496c530443899	2025-12-25 02:23:14.222967
37	add-bucket-name-length-trigger	3944135b4e3e8b22d6d4cbb568fe3b0b51df15c1	2025-12-25 02:23:14.237204
38	iceberg-catalog-flag-on-buckets	19a8bd89d5dfa69af7f222a46c726b7c41e462c5	2025-12-25 02:23:14.244172
39	add-search-v2-sort-support	39cf7d1e6bf515f4b02e41237aba845a7b492853	2025-12-25 02:23:14.255883
40	fix-prefix-race-conditions-optimized	fd02297e1c67df25a9fc110bf8c8a9af7fb06d1f	2025-12-25 02:23:14.263005
41	add-object-level-update-trigger	44c22478bf01744b2129efc480cd2edc9a7d60e9	2025-12-25 02:23:14.27212
42	rollback-prefix-triggers	f2ab4f526ab7f979541082992593938c05ee4b47	2025-12-25 02:23:14.278519
43	fix-object-level	ab837ad8f1c7d00cc0b7310e989a23388ff29fc6	2025-12-25 02:23:14.287188
44	vector-bucket-type	99c20c0ffd52bb1ff1f32fb992f3b351e3ef8fb3	2025-12-25 02:23:14.293635
45	vector-buckets	049e27196d77a7cb76497a85afae669d8b230953	2025-12-25 02:23:14.29957
46	buckets-objects-grants	fedeb96d60fefd8e02ab3ded9fbde05632f84aed	2025-12-25 02:23:14.312674
47	iceberg-table-metadata	649df56855c24d8b36dd4cc1aeb8251aa9ad42c2	2025-12-25 02:23:14.318356
48	iceberg-catalog-ids	2666dff93346e5d04e0a878416be1d5fec345d6f	2025-12-25 02:23:14.323809
49	buckets-objects-grants-postgres	072b1195d0d5a2f888af6b2302a1938dd94b8b3d	2025-12-25 02:23:14.339809
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version, owner_id, user_metadata, level) FROM stdin;
85d5ead6-7cb7-4e83-99f0-f5772fd63226	lesson_materials	sheet_music / 391a7867-c142-4880-b2f2-6af9143de0e0/1766979050433_Burgmuller_Tarantella_With_Counting_Version_-_Full_Score.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2025-12-29 03:30:51.281521+00	2025-12-29 03:30:51.281521+00	2025-12-29 03:30:51.281521+00	{"eTag": "\\"e63206482a8ffe3662c29b2c5568812b\\"", "size": 80469, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2025-12-29T03:30:52.000Z", "contentLength": 80469, "httpStatusCode": 200}	fcb80701-754e-4ed2-9dab-d8fd09d2fd09	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
0f7ade88-d7a7-4a86-9ea4-0a84128fd33a	lesson_materials	sheet_music / 05cdc93f-a848-45ce-bca3-31fa4eb50789/1767041475388_William_Tell_Overture_Full_Lesson_Version_-_Full_Score.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2025-12-29 20:51:14.173842+00	2025-12-29 20:51:14.173842+00	2025-12-29 20:51:14.173842+00	{"eTag": "\\"6e8c93049ed47b04e2a17fabbf8ff635\\"", "size": 45144, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2025-12-29T20:51:15.000Z", "contentLength": 45144, "httpStatusCode": 200}	fc2773cc-8cd4-4310-933a-75b5e632b392	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
a2d02d98-695a-4e3c-ab65-6e89596eb666	lesson_materials	sheet_music / 2764b7c0-1d69-4277-85ad-131077263b5a/1767050760961_Standard_7th_Chords_Exercise.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2025-12-29 23:25:59.525672+00	2025-12-29 23:25:59.525672+00	2025-12-29 23:25:59.525672+00	{"eTag": "\\"a650cd058ca163943fa900f26bef2052\\"", "size": 39721, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2025-12-29T23:26:00.000Z", "contentLength": 39721, "httpStatusCode": 200}	e779459c-5803-49f4-840a-f0a02b43f220	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
daffafd1-0ec7-47ef-907a-d8a183e37e7f	lesson_materials	sheet_music / f5158292-33f3-482c-9a99-f050af87a9e2/1767059718017_allegretto-bartok-grade-3-piano-exam-pieces-2025-2026.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2025-12-30 01:55:16.567744+00	2025-12-30 01:55:16.567744+00	2025-12-30 01:55:16.567744+00	{"eTag": "\\"db5a130e6d532d5353d3fbb69e141436\\"", "size": 84003, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2025-12-30T01:55:17.000Z", "contentLength": 84003, "httpStatusCode": 200}	1741e9d6-6384-4a2a-8525-d3155913f675	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
27ccf12e-cb16-409c-8e96-181754cc96d4	sheet_music	teacher-1/1767325902432_Burgmuller Arabesque Full Lesson Version.musicxml	\N	2026-01-02 03:51:43.048373+00	2026-01-02 03:51:43.048373+00	2026-01-02 03:51:43.048373+00	{"eTag": "\\"5d1593a320ae0f04ac02b075e7e2b7b8\\"", "size": 265983, "mimetype": "application/xml", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T03:51:43.000Z", "contentLength": 265983, "httpStatusCode": 200}	b9f3c2d5-775d-4e16-a96a-3f4ceb4d94ec	\N	{}	2
0f64dda0-a767-4b88-a942-ad303bef86b1	audio_files	teacher-1/1767325903089_Burgmuller Arabesque Full Lesson Version.mp3	\N	2026-01-02 03:51:43.305819+00	2026-01-02 03:51:43.305819+00	2026-01-02 03:51:43.305819+00	{"eTag": "\\"e468f9b1020113b0d44b604c816af9cf\\"", "size": 753384, "mimetype": "audio/mpeg", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T03:51:44.000Z", "contentLength": 753384, "httpStatusCode": 200}	bbbf68ba-b5de-4d13-adf0-7ae7058e3e6f	\N	{}	2
5d000d0d-1270-49e8-893d-557f36b7bc4a	sheet_music	teacher-1/1767327002965_Burgmuller Arabesque Full Lesson Version.musicxml	\N	2026-01-02 04:10:03.36721+00	2026-01-02 04:10:03.36721+00	2026-01-02 04:10:03.36721+00	{"eTag": "\\"5d1593a320ae0f04ac02b075e7e2b7b8\\"", "size": 265983, "mimetype": "application/xml", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T04:10:04.000Z", "contentLength": 265983, "httpStatusCode": 200}	c4281f98-9b29-4f65-ab5d-ca967dd94476	\N	{}	2
7da585c1-ec37-492d-b41a-48930393517e	audio_files	teacher-1/1767327003412_Burgmuller Arabesque Full Lesson Version.mp3	\N	2026-01-02 04:10:03.76772+00	2026-01-02 04:10:03.76772+00	2026-01-02 04:10:03.76772+00	{"eTag": "\\"e468f9b1020113b0d44b604c816af9cf\\"", "size": 753384, "mimetype": "audio/mpeg", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T04:10:04.000Z", "contentLength": 753384, "httpStatusCode": 200}	f868cdd7-113f-4c8c-a9fe-3bf0715c280b	\N	{}	2
8ba1c01f-3596-4cb9-a0d5-4b318ce0bc4a	sheet_music	teacher-1/1767329054633_Burgmuller Tarantella With Counting Version.musicxml	\N	2026-01-02 04:44:15.027127+00	2026-01-02 04:44:15.027127+00	2026-01-02 04:44:15.027127+00	{"eTag": "\\"a171db787301ef86e6814fc45b2171a0\\"", "size": 459327, "mimetype": "application/xml", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T04:44:15.000Z", "contentLength": 459327, "httpStatusCode": 200}	22aa6fc9-494c-43b0-a814-bba5ff1cc4c9	\N	{}	2
6fabdc31-d52d-4d7b-ab02-aebd358086e8	audio_files	teacher-1/1767329055059_Burgmuller Tarantella With Counting Version.mp3	\N	2026-01-02 04:44:15.42914+00	2026-01-02 04:44:15.42914+00	2026-01-02 04:44:15.42914+00	{"eTag": "\\"719e53f82925ec05ed2461c6965b9f8c\\"", "size": 1519830, "mimetype": "audio/mpeg", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T04:44:16.000Z", "contentLength": 1519830, "httpStatusCode": 200}	daaf9cca-76a6-4bb2-87a3-e336d62e862f	\N	{}	2
1fcdc6f7-8903-4fa9-9067-5300c58aab21	lesson_materials	sheet_music / d542fe88-f2af-48c3-ac2b-23e03b28bc6c/1767330159971_Burgmuller_The_Storm_All_Markings_Version_-_Full_Score.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 05:02:40.595998+00	2026-01-02 05:02:40.595998+00	2026-01-02 05:02:40.595998+00	{"eTag": "\\"11c4fdfe2ab69f76fed5cad0a050720e\\"", "size": 97135, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T05:02:41.000Z", "contentLength": 97135, "httpStatusCode": 200}	8175b43b-988c-4f79-9690-10c42255fb83	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
bc3fb9a2-0005-4681-97b2-f55a4533205e	lesson_materials	chat-attachments/e96d34d9-5cc9-43a8-81c2-9545d1b11508/1767365954775_Lionel_Yu_Performance_Tips_2025.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 14:59:15.181402+00	2026-01-02 14:59:15.181402+00	2026-01-02 14:59:15.181402+00	{"eTag": "\\"de4e2fbfadbed22d5c79f86af01a5bb9\\"", "size": 113801, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T14:59:16.000Z", "contentLength": 113801, "httpStatusCode": 200}	047a365c-0890-4ceb-8a05-136a72f352b0	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
08f08c71-a20b-4685-baa9-e216a7d51efb	sheet_music	teacher-1/1767366299070_Burgmuller The Storm All Markings Version.musicxml	\N	2026-01-02 15:04:59.482296+00	2026-01-02 15:04:59.482296+00	2026-01-02 15:04:59.482296+00	{"eTag": "\\"c8bcc68dbcb7bb70635c38c379ba7237\\"", "size": 467680, "mimetype": "application/xml", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T15:05:00.000Z", "contentLength": 467680, "httpStatusCode": 200}	a88d0ca9-cbef-43a3-a6fe-89c6822d93f8	\N	{}	2
b0dfe124-3d82-4296-891f-2a1858693778	audio_files	teacher-1/1767367162546_Burgmuller The Storm All Markings Version.mp3	\N	2026-01-02 15:19:22.941733+00	2026-01-02 15:19:22.941733+00	2026-01-02 15:19:22.941733+00	{"eTag": "\\"d684a7121ee74f5805aa92c2c667d0da\\"", "size": 1516494, "mimetype": "audio/mpeg", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T15:19:23.000Z", "contentLength": 1516494, "httpStatusCode": 200}	079ce095-5db7-4b84-8834-6470e17a088b	\N	{}	2
992face8-311e-4c42-a64b-d18b3afa0008	lesson_materials	sheet_music / 2326dfbc-f302-4173-b1e2-b136b67b4472/1767398241831_Introduction_to_Counting_-_Full_Score.pdf	e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 23:57:22.53214+00	2026-01-02 23:57:22.53214+00	2026-01-02 23:57:22.53214+00	{"eTag": "\\"377fc4f937b1e2c2911e435e3240d133\\"", "size": 33682, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-01-02T23:57:23.000Z", "contentLength": 33682, "httpStatusCode": 200}	0b759c93-f71c-40b7-a87e-b6b76779c973	e96d34d9-5cc9-43a8-81c2-9545d1b11508	{}	3
\.


--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.prefixes (bucket_id, name, created_at, updated_at) FROM stdin;
lesson_materials	sheet_music 	2025-12-29 03:30:51.281521+00	2025-12-29 03:30:51.281521+00
lesson_materials	sheet_music / 391a7867-c142-4880-b2f2-6af9143de0e0	2025-12-29 03:30:51.281521+00	2025-12-29 03:30:51.281521+00
lesson_materials	sheet_music / 05cdc93f-a848-45ce-bca3-31fa4eb50789	2025-12-29 20:51:14.173842+00	2025-12-29 20:51:14.173842+00
lesson_materials	sheet_music / 2764b7c0-1d69-4277-85ad-131077263b5a	2025-12-29 23:25:59.525672+00	2025-12-29 23:25:59.525672+00
lesson_materials	sheet_music / f5158292-33f3-482c-9a99-f050af87a9e2	2025-12-30 01:55:16.567744+00	2025-12-30 01:55:16.567744+00
sheet_music	teacher-1	2026-01-02 03:51:43.048373+00	2026-01-02 03:51:43.048373+00
audio_files	teacher-1	2026-01-02 03:51:43.305819+00	2026-01-02 03:51:43.305819+00
lesson_materials	sheet_music / d542fe88-f2af-48c3-ac2b-23e03b28bc6c	2026-01-02 05:02:40.595998+00	2026-01-02 05:02:40.595998+00
lesson_materials	chat-attachments	2026-01-02 14:59:15.181402+00	2026-01-02 14:59:15.181402+00
lesson_materials	chat-attachments/e96d34d9-5cc9-43a8-81c2-9545d1b11508	2026-01-02 14:59:15.181402+00	2026-01-02 14:59:15.181402+00
lesson_materials	sheet_music / 2326dfbc-f302-4173-b1e2-b136b67b4472	2026-01-02 23:57:22.53214+00	2026-01-02 23:57:22.53214+00
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads (id, in_progress_size, upload_signature, bucket_id, key, version, owner_id, created_at, user_metadata) FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads_parts (id, upload_id, size, part_number, bucket_id, key, etag, owner_id, version, created_at) FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.vector_indexes (id, name, bucket_id, data_type, dimension, distance_metric, metadata_configuration, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--

COPY vault.secrets (id, name, description, secret, key_id, nonce, created_at, updated_at) FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 494, true);


--
-- Name: subscription_id_seq; Type: SEQUENCE SET; Schema: realtime; Owner: supabase_admin
--

SELECT pg_catalog.setval('realtime.subscription_id_seq', 520, true);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: auth_audit_logs auth_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_audit_logs
    ADD CONSTRAINT auth_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: classroom_annotations classroom_annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_annotations
    ADD CONSTRAINT classroom_annotations_pkey PRIMARY KEY (id);


--
-- Name: classroom_annotations classroom_annotations_student_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_annotations
    ADD CONSTRAINT classroom_annotations_student_id_song_id_key UNIQUE (student_id, song_id);


--
-- Name: classroom_presets classroom_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_presets
    ADD CONSTRAINT classroom_presets_pkey PRIMARY KEY (id);


--
-- Name: classroom_presets classroom_presets_user_id_preset_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_presets
    ADD CONSTRAINT classroom_presets_user_id_preset_type_key UNIQUE (user_id, preset_type);


--
-- Name: classroom_recordings classroom_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_recordings
    ADD CONSTRAINT classroom_recordings_pkey PRIMARY KEY (id);


--
-- Name: classroom_rooms classroom_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_rooms
    ADD CONSTRAINT classroom_rooms_pkey PRIMARY KEY (id);


--
-- Name: classroom_rooms classroom_rooms_room_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classroom_rooms
    ADD CONSTRAINT classroom_rooms_room_name_key UNIQUE (room_name);


--
-- Name: event_invites event_invites_event_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_student_id_key UNIQUE (event_id, student_id);


--
-- Name: event_invites event_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: makeup_slots makeup_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_slots
    ADD CONSTRAINT makeup_slots_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: pieces pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_pkey PRIMARY KEY (id);


--
-- Name: pricing_tiers pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_pkey PRIMARY KEY (duration);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: resource_assignments resource_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_assignments
    ADD CONSTRAINT resource_assignments_pkey PRIMARY KEY (id);


--
-- Name: resource_assignments resource_assignments_resource_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_assignments
    ADD CONSTRAINT resource_assignments_resource_id_student_id_key UNIQUE (resource_id, student_id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: site_pages site_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_pages
    ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: postgres
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_01 messages_2026_01_01_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_01
    ADD CONSTRAINT messages_2026_01_01_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_02 messages_2026_01_02_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_02
    ADD CONSTRAINT messages_2026_01_02_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_03 messages_2026_01_03_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_03
    ADD CONSTRAINT messages_2026_01_03_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_04 messages_2026_01_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_04
    ADD CONSTRAINT messages_2026_01_04_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_05 messages_2026_01_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_05
    ADD CONSTRAINT messages_2026_01_05_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_06 messages_2026_01_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_06
    ADD CONSTRAINT messages_2026_01_06_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_01_07 messages_2026_01_07_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_01_07
    ADD CONSTRAINT messages_2026_01_07_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: idx_lessons_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lessons_date ON public.lessons USING btree (date);


--
-- Name: idx_lessons_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lessons_status ON public.lessons USING btree (status);


--
-- Name: idx_lessons_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lessons_student_id ON public.lessons USING btree (student_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_has_attachments; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_has_attachments ON public.messages USING btree (((attachments IS NOT NULL)));


--
-- Name: idx_messages_recipient_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_recipient_id ON public.messages USING btree (recipient_id);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_resource_assignments_resource_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resource_assignments_resource_id ON public.resource_assignments USING btree (resource_id);


--
-- Name: idx_resource_assignments_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resource_assignments_student_id ON public.resource_assignments USING btree (student_id);


--
-- Name: idx_resources_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resources_category ON public.resources USING btree (category);


--
-- Name: unique_status_per_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX unique_status_per_student ON public.classroom_annotations USING btree (student_id, song_id);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: postgres
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_01_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_01_inserted_at_topic_idx ON realtime.messages_2026_01_01 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_02_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_02_inserted_at_topic_idx ON realtime.messages_2026_01_02 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_03_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_03_inserted_at_topic_idx ON realtime.messages_2026_01_03 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_04_inserted_at_topic_idx ON realtime.messages_2026_01_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_05_inserted_at_topic_idx ON realtime.messages_2026_01_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_06_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_06_inserted_at_topic_idx ON realtime.messages_2026_01_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_01_07_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_01_07_inserted_at_topic_idx ON realtime.messages_2026_01_07 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_01_01_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_01_inserted_at_topic_idx;


--
-- Name: messages_2026_01_01_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_01_pkey;


--
-- Name: messages_2026_01_02_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_02_inserted_at_topic_idx;


--
-- Name: messages_2026_01_02_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_02_pkey;


--
-- Name: messages_2026_01_03_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_03_inserted_at_topic_idx;


--
-- Name: messages_2026_01_03_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_03_pkey;


--
-- Name: messages_2026_01_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_04_inserted_at_topic_idx;


--
-- Name: messages_2026_01_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_04_pkey;


--
-- Name: messages_2026_01_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_05_inserted_at_topic_idx;


--
-- Name: messages_2026_01_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_05_pkey;


--
-- Name: messages_2026_01_06_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_06_inserted_at_topic_idx;


--
-- Name: messages_2026_01_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_06_pkey;


--
-- Name: messages_2026_01_07_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_01_07_inserted_at_topic_idx;


--
-- Name: messages_2026_01_07_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: postgres
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_01_07_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: supabase_auth_admin
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: inquiries handle_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: lessons on_lessons_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_lessons_updated BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: profiles on_profiles_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: supabase_admin
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: lessons lessons_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resource_assignments resource_assignments_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_assignments
    ADD CONSTRAINT resource_assignments_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: resource_assignments resource_assignments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_assignments
    ADD CONSTRAINT resource_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: makeup_slots Admin manage slots; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage slots" ON public.makeup_slots USING (((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'role'::text) = 'admin'::text));


--
-- Name: site_pages Admin write access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin write access" ON public.site_pages USING (((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'role'::text) = 'admin'::text));


--
-- Name: lessons Admins can delete lessons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete lessons" ON public.lessons FOR DELETE USING (public.is_admin());


--
-- Name: messages Admins can delete messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete messages" ON public.messages FOR DELETE USING (public.is_admin());


--
-- Name: reviews Admins can delete reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete reviews" ON public.reviews FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: event_invites Admins can insert invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert invites" ON public.event_invites FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: lessons Admins can insert lessons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert lessons" ON public.lessons FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: events Admins can manage events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage events" ON public.events TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: resource_assignments Admins can manage resource assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage resource assignments" ON public.resource_assignments USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: resources Admins can manage resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage resources" ON public.resources USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());


--
-- Name: event_invites Admins can update invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update invites" ON public.event_invites FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: lessons Admins can update lessons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update lessons" ON public.lessons FOR UPDATE USING (public.is_admin());


--
-- Name: reviews Admins can update reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update reviews" ON public.reviews FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: auth_audit_logs Admins can view all auth logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all auth logs" ON public.auth_audit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: inquiries Admins can view all inquiries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all inquiries" ON public.inquiries USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: event_invites Admins can view all invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all invites" ON public.event_invites FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: lessons Admins can view all lessons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all lessons" ON public.lessons FOR SELECT USING (public.is_admin());


--
-- Name: messages Admins can view all messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT USING (public.is_admin());


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());


--
-- Name: reviews Admins can view all reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all reviews" ON public.reviews FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: pricing_tiers Allow admin update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin update" ON public.pricing_tiers FOR UPDATE USING (((((auth.jwt() ->> 'user_metadata'::text))::jsonb ->> 'role'::text) = 'admin'::text));


--
-- Name: classroom_presets Allow all access to presets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access to presets" ON public.classroom_presets USING (true) WITH CHECK (true);


--
-- Name: pricing_tiers Allow public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read" ON public.pricing_tiers FOR SELECT USING (true);


--
-- Name: inquiries Anyone can insert inquiries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can insert inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);


--
-- Name: reviews Authenticated users can insert reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: events Authenticated users can view events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view events" ON public.events FOR SELECT TO authenticated USING (true);


--
-- Name: pieces Enable all access for pieces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for pieces" ON public.pieces USING (true) WITH CHECK (true);


--
-- Name: classroom_annotations Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.classroom_annotations FOR SELECT USING (true);


--
-- Name: reviews Public can read approved reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can read approved reviews" ON public.reviews FOR SELECT USING ((status = 'approved'::text));


--
-- Name: pieces Public read access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read access" ON public.pieces FOR SELECT USING (true);


--
-- Name: site_pages Public read access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read access" ON public.site_pages FOR SELECT USING (true);


--
-- Name: makeup_slots Public read available slots; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read available slots" ON public.makeup_slots FOR SELECT USING ((is_taken = false));


--
-- Name: classroom_recordings Public read recordings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read recordings" ON public.classroom_recordings FOR SELECT USING (true);


--
-- Name: classroom_annotations Service Role Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service Role Full Access" ON public.classroom_annotations USING (true);


--
-- Name: classroom_rooms Service Role Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service Role Full Access" ON public.classroom_rooms USING (true);


--
-- Name: event_invites Students can update their own invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students can update their own invites" ON public.event_invites FOR UPDATE TO authenticated USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: resources Students can view assigned resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students can view assigned resources" ON public.resources FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.resource_assignments
  WHERE ((resource_assignments.resource_id = resources.id) AND (resource_assignments.student_id = auth.uid())))));


--
-- Name: resource_assignments Students can view own assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students can view own assignments" ON public.resource_assignments FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: lessons Students can view own lessons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students can view own lessons" ON public.lessons FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: event_invites Students can view their own invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students can view their own invites" ON public.event_invites FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: event_invites Students manage invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students manage invites" ON public.event_invites USING ((student_id = auth.uid()));


--
-- Name: events Students view events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Students view events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.event_invites
  WHERE ((event_invites.event_id = events.id) AND (event_invites.student_id = auth.uid())))));


--
-- Name: classroom_recordings Teacher upload recordings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Teacher upload recordings" ON public.classroom_recordings FOR INSERT WITH CHECK (true);


--
-- Name: messages Users can mark received messages as read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can mark received messages as read" ON public.messages FOR UPDATE USING ((auth.uid() = recipient_id)) WITH CHECK ((auth.uid() = recipient_id));


--
-- Name: messages Users can send messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (role = ( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))));


--
-- Name: profiles Users can view admin profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view admin profiles" ON public.profiles FOR SELECT USING (((role = 'admin'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: messages Users can view own messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: auth_audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: classroom_annotations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classroom_annotations ENABLE ROW LEVEL SECURITY;

--
-- Name: classroom_presets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classroom_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: classroom_recordings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classroom_recordings ENABLE ROW LEVEL SECURITY;

--
-- Name: classroom_rooms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classroom_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: inquiries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: lessons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: makeup_slots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.makeup_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: pieces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pieces ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.resource_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: site_pages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: postgres
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Allow Authenticated Uploads ometb9_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow Authenticated Uploads ometb9_0" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'lesson_materials'::text));


--
-- Name: objects Allow Authenticated Uploads ometb9_1; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow Authenticated Uploads ometb9_1" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'lesson_materials'::text));


--
-- Name: objects Allow Authenticated Uploads ometb9_2; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow Authenticated Uploads ometb9_2" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'lesson_materials'::text));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime_messages_publication OWNER TO supabase_admin;

--
-- Name: supabase_realtime classroom_annotations; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.classroom_annotations;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: supabase_admin
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION moddatetime(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.moddatetime() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_updated_at() TO anon;
GRANT ALL ON FUNCTION public.handle_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_realtime_admin;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_realtime_admin;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_realtime_admin;


--
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO supabase_realtime_admin;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO supabase_realtime_admin;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE auth_audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.auth_audit_logs TO anon;
GRANT ALL ON TABLE public.auth_audit_logs TO authenticated;
GRANT ALL ON TABLE public.auth_audit_logs TO service_role;


--
-- Name: TABLE classroom_annotations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classroom_annotations TO anon;
GRANT ALL ON TABLE public.classroom_annotations TO authenticated;
GRANT ALL ON TABLE public.classroom_annotations TO service_role;


--
-- Name: TABLE classroom_presets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classroom_presets TO anon;
GRANT ALL ON TABLE public.classroom_presets TO authenticated;
GRANT ALL ON TABLE public.classroom_presets TO service_role;


--
-- Name: TABLE classroom_recordings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classroom_recordings TO anon;
GRANT ALL ON TABLE public.classroom_recordings TO authenticated;
GRANT ALL ON TABLE public.classroom_recordings TO service_role;


--
-- Name: TABLE classroom_rooms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classroom_rooms TO anon;
GRANT ALL ON TABLE public.classroom_rooms TO authenticated;
GRANT ALL ON TABLE public.classroom_rooms TO service_role;


--
-- Name: TABLE event_invites; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_invites TO anon;
GRANT ALL ON TABLE public.event_invites TO authenticated;
GRANT ALL ON TABLE public.event_invites TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE inquiries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inquiries TO anon;
GRANT ALL ON TABLE public.inquiries TO authenticated;
GRANT ALL ON TABLE public.inquiries TO service_role;


--
-- Name: TABLE lessons; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lessons TO anon;
GRANT ALL ON TABLE public.lessons TO authenticated;
GRANT ALL ON TABLE public.lessons TO service_role;


--
-- Name: TABLE makeup_slots; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.makeup_slots TO anon;
GRANT ALL ON TABLE public.makeup_slots TO authenticated;
GRANT ALL ON TABLE public.makeup_slots TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE pieces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pieces TO anon;
GRANT ALL ON TABLE public.pieces TO authenticated;
GRANT ALL ON TABLE public.pieces TO service_role;


--
-- Name: TABLE pricing_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pricing_tiers TO anon;
GRANT ALL ON TABLE public.pricing_tiers TO authenticated;
GRANT ALL ON TABLE public.pricing_tiers TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE resource_assignments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.resource_assignments TO anon;
GRANT ALL ON TABLE public.resource_assignments TO authenticated;
GRANT ALL ON TABLE public.resource_assignments TO service_role;


--
-- Name: TABLE resources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.resources TO anon;
GRANT ALL ON TABLE public.resources TO authenticated;
GRANT ALL ON TABLE public.resources TO service_role;


--
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reviews TO anon;
GRANT ALL ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;


--
-- Name: TABLE site_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.site_pages TO anon;
GRANT ALL ON TABLE public.site_pages TO authenticated;
GRANT ALL ON TABLE public.site_pages TO service_role;


--
-- Name: TABLE messages_2026_01_01; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_01 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_01 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_02; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_02 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_02 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_03; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_03 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_03 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_04; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_04 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_04 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_05; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_05 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_05 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_06; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_06 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_06 TO dashboard_user;


--
-- Name: TABLE messages_2026_01_07; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_01_07 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_01_07 TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.schema_migrations TO postgres;
GRANT ALL ON TABLE realtime.schema_migrations TO dashboard_user;
GRANT SELECT ON TABLE realtime.schema_migrations TO anon;
GRANT SELECT ON TABLE realtime.schema_migrations TO authenticated;
GRANT SELECT ON TABLE realtime.schema_migrations TO service_role;
GRANT ALL ON TABLE realtime.schema_migrations TO supabase_realtime_admin;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;
GRANT ALL ON TABLE realtime.subscription TO supabase_realtime_admin;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO supabase_realtime_admin;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.buckets FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.objects FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- Name: TABLE prefixes; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.prefixes TO service_role;
GRANT ALL ON TABLE storage.prefixes TO authenticated;
GRANT ALL ON TABLE storage.prefixes TO anon;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

\unrestrict qN1cw1WF0ZHNaAaq2LCrKOakDypK4l1EbpXraXwYUa9EZIKxPdoBY7iYBFKpPzV


-- Migration: Add google_event_id to lessons table
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS google_event_id TEXT;
