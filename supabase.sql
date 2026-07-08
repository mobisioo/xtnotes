-- Notepad Vanilla + Supabase
-- نسخه بدون Supabase Auth ایمیلی
-- این نسخه از Username + Password سفارشی استفاده می‌کند و هیچ ایمیلی ارسال نمی‌کند.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table if not exists public.app_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  language text not null default 'plaintext',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_notes
  add column if not exists language text not null default 'plaintext';

update public.app_notes
set language = 'plaintext'
where language is null or trim(language) = '';

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_notes enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke all on public.app_notes from anon, authenticated;

grant usage on schema public to anon, authenticated;

create index if not exists app_users_username_idx on public.app_users(username);
create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);
create index if not exists app_notes_user_id_idx on public.app_notes(user_id);
create index if not exists app_notes_updated_at_idx on public.app_notes(updated_at desc);

-- IMPORTANT MIGRATION FIX:
-- PostgreSQL cannot change the RETURN TABLE shape of an existing function using CREATE OR REPLACE.
-- v12 adds the `language` column to note RPC outputs, so old RPC functions must be dropped first.
drop function if exists public.app_list_notes(uuid);
drop function if exists public.app_create_note(uuid, text, text);
drop function if exists public.app_create_note(uuid, text, text, text);
drop function if exists public.app_update_note(uuid, uuid, text, text, boolean);
drop function if exists public.app_update_note(uuid, uuid, text, text, boolean, text);
drop function if exists public.app_delete_note(uuid, uuid);

create or replace function public.app_get_user_id(p_session_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  select s.user_id
  into v_user_id
  from public.app_sessions s
  where s.token = p_session_token
    and s.expires_at > now();

  if v_user_id is null then
    raise exception 'Invalid or expired session';
  end if;

  update public.app_sessions
  set last_seen_at = now()
  where token = p_session_token;

  return v_user_id;
end;
$$;

revoke all on function public.app_get_user_id(uuid) from public, anon, authenticated;

create or replace function public.app_register(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_user_id uuid;
  v_token uuid;
begin
  v_username := lower(trim(p_username));

  if v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Invalid username. Use 3-30 lowercase English letters, numbers, or underscore.';
  end if;

  if p_password !~ '^[0-9]{4,}$' then
    raise exception 'Password must be at least 4 digits.';
  end if;

  if exists (select 1 from public.app_users where username = v_username) then
    raise exception 'Username already exists.';
  end if;

  insert into public.app_users (username, password_hash)
  values (v_username, crypt(p_password, gen_salt('bf', 10)))
  returning id into v_user_id;

  insert into public.app_sessions (user_id)
  values (v_user_id)
  returning token into v_token;

  return jsonb_build_object(
    'userId', v_user_id,
    'username', v_username,
    'sessionToken', v_token
  );
end;
$$;

create or replace function public.app_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_user record;
  v_token uuid;
begin
  v_username := lower(trim(p_username));

  select u.id, u.username, u.password_hash
  into v_user
  from public.app_users u
  where u.username = v_username;

  if v_user.id is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'Invalid username or password.';
  end if;

  insert into public.app_sessions (user_id)
  values (v_user.id)
  returning token into v_token;

  return jsonb_build_object(
    'userId', v_user.id,
    'username', v_user.username,
    'sessionToken', v_token
  );
end;
$$;

create or replace function public.app_logout(p_session_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.app_sessions
  where token = p_session_token;

  return true;
end;
$$;

create or replace function public.app_list_notes(p_session_token uuid)
returns table (
  id uuid,
  title text,
  content text,
  language text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.app_get_user_id(p_session_token);

  return query
  select
    n.id,
    n.title,
    n.content,
    coalesce(nullif(n.language, ''), 'plaintext') as language,
    n.is_pinned,
    n.created_at,
    n.updated_at
  from public.app_notes n
  where n.user_id = v_user_id
  order by n.is_pinned desc, n.updated_at desc;
end;
$$;

create or replace function public.app_create_note(
  p_session_token uuid,
  p_title text default 'نوت جدید',
  p_content text default '',
  p_language text default 'plaintext'
)
returns table (
  id uuid,
  title text,
  content text,
  language text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_language text;
begin
  v_user_id := public.app_get_user_id(p_session_token);
  v_language := coalesce(nullif(trim(p_language), ''), 'plaintext');

  return query
  with inserted as (
    insert into public.app_notes (user_id, title, content, language)
    values (
      v_user_id,
      coalesce(nullif(trim(p_title), ''), 'نوت جدید'),
      coalesce(p_content, ''),
      v_language
    )
    returning
      app_notes.id,
      app_notes.title,
      app_notes.content,
      app_notes.language,
      app_notes.is_pinned,
      app_notes.created_at,
      app_notes.updated_at
  )
  select
    inserted.id,
    inserted.title,
    inserted.content,
    inserted.language,
    inserted.is_pinned,
    inserted.created_at,
    inserted.updated_at
  from inserted;
end;
$$;

create or replace function public.app_update_note(
  p_session_token uuid,
  p_note_id uuid,
  p_title text,
  p_content text,
  p_is_pinned boolean default null,
  p_language text default null
)
returns table (
  id uuid,
  title text,
  content text,
  language text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.app_get_user_id(p_session_token);

  return query
  with updated as (
    update public.app_notes n
    set
      title = coalesce(nullif(trim(p_title), ''), 'بدون عنوان'),
      content = coalesce(p_content, ''),
      language = coalesce(nullif(trim(p_language), ''), n.language, 'plaintext'),
      is_pinned = coalesce(p_is_pinned, n.is_pinned),
      updated_at = now()
    where n.id = p_note_id
      and n.user_id = v_user_id
    returning n.id, n.title, n.content, n.language, n.is_pinned, n.created_at, n.updated_at
  )
  select
    updated.id,
    updated.title,
    updated.content,
    updated.language,
    updated.is_pinned,
    updated.created_at,
    updated.updated_at
  from updated;

  if not found then
    raise exception 'Note not found.';
  end if;
end;
$$;

create or replace function public.app_delete_note(p_session_token uuid, p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.app_get_user_id(p_session_token);

  delete from public.app_notes n
  where n.id = p_note_id
    and n.user_id = v_user_id;

  if not found then
    raise exception 'Note not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.app_register(text, text) from public;
revoke all on function public.app_login(text, text) from public;
revoke all on function public.app_logout(uuid) from public;
revoke all on function public.app_list_notes(uuid) from public;
revoke all on function public.app_create_note(uuid, text, text, text) from public;
revoke all on function public.app_update_note(uuid, uuid, text, text, boolean, text) from public;
revoke all on function public.app_delete_note(uuid, uuid) from public;

grant execute on function public.app_register(text, text) to anon, authenticated;
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_logout(uuid) to anon, authenticated;
grant execute on function public.app_list_notes(uuid) to anon, authenticated;
grant execute on function public.app_create_note(uuid, text, text, text) to anon, authenticated;
grant execute on function public.app_update_note(uuid, uuid, text, text, boolean, text) to anon, authenticated;
grant execute on function public.app_delete_note(uuid, uuid) to anon, authenticated;

-- مهم: بعد از تغییر تابع‌ها، کش PostgREST را تازه می‌کنیم تا RPCها در API دیده شوند.
notify pgrst, 'reload schema';

-- اگر SQL درست اجرا شده باشد، خروجی این Query باید ۸ تابع app_* را نشان بدهد.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'app_%'
order by p.proname;

-- Telegram bot integration
-- این جدول اتصال chat تلگرام به کاربر داخلی اپ را نگهداری می‌کند.
create table if not exists public.app_telegram_links (
  chat_id bigint primary key,
  telegram_user_id bigint not null,
  telegram_username text,
  first_name text,
  user_id uuid not null references public.app_users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  bot_state text,
  bot_payload jsonb
);

alter table public.app_telegram_links
  add column if not exists bot_state text;

alter table public.app_telegram_links
  add column if not exists bot_payload jsonb;

alter table public.app_telegram_links enable row level security;
revoke all on public.app_telegram_links from anon, authenticated;

create index if not exists app_telegram_links_user_id_idx on public.app_telegram_links(user_id);
create index if not exists app_telegram_links_last_seen_at_idx on public.app_telegram_links(last_seen_at desc);

notify pgrst, 'reload schema';
