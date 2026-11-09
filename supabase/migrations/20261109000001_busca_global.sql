-- Busca global (Ctrl K): uma chamada só, ignorando acentos e maiúsculas.
-- Roda com as permissões de quem busca (security invoker): cada pessoa só encontra o que já pode ver.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_norm(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

-- Verdadeiro quando todas as palavras buscadas aparecem no texto, em qualquer ordem
create or replace function public.search_match(hay text, terms text[])
returns boolean language sql immutable parallel safe set search_path = public, extensions as $$
  select coalesce(bool_and(public.search_norm(hay) like '%' || t || '%'), false)
  from unnest(terms) t where t <> '';
$$;

create or replace function public.global_search(_q text, _limit int default 5)
returns table (kind text, id uuid, label text, sub text)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  terms text[] := regexp_split_to_array(public.search_norm(trim(_q)), '\s+');
  lim int := least(greatest(coalesce(_limit, 5), 1), 20);
begin
  if length(trim(coalesce(_q, ''))) < 2 then return; end if;
  return query (select 'campaigns'::text, c.id, c.name, c.status from campaigns c
                where c.deleted_at is null and public.search_match(concat_ws(' ', c.name, array_to_string(c.products, ' ')), terms)
                order by c.start_date desc nulls last limit lim);
  return query (select 'projects'::text, p.id, p.name, p.status from projects p
                where p.deleted_at is null and public.search_match(p.name, terms) order by p.updated_at desc limit lim);
  return query (select 'tasks'::text, t.id, t.title, t.status from tasks t
                where t.deleted_at is null and public.search_match(t.title, terms) order by t.updated_at desc limit lim);
  return query (select 'contracts'::text, k.id, k.object, k.company from contracts k
                where k.deleted_at is null and public.search_match(concat_ws(' ', k.object, k.company), terms) order by k.end_date desc nulls last limit lim);
  return query (select 'partners'::text, x.id, x.company, x.category from partners x
                where x.deleted_at is null and public.search_match(concat_ws(' ', x.company, x.contact_name), terms) order by x.company limit lim);
  return query (select 'events'::text, e.id, e.name, coalesce(to_char(e.event_date, 'DD/MM/YYYY'), '') from events e
                where e.deleted_at is null and public.search_match(concat_ws(' ', e.name, e.city), terms) order by e.event_date desc nulls last limit lim);
  return query (select 'sponsorships'::text, s.id, s.event_name, s.institution from sponsorships s
                where s.deleted_at is null and public.search_match(concat_ws(' ', s.event_name, s.institution), terms) order by s.start_date desc nulls last limit lim);
  return query (select 'content_items'::text, ci.id, ci.title, ci.category from content_items ci
                where ci.deleted_at is null and public.search_match(ci.title, terms) order by ci.updated_at desc limit lim);
  return query (select 'offline_media'::text, m.id, m.title, m.city from offline_media m
                where m.deleted_at is null and public.search_match(concat_ws(' ', m.title, m.city, m.location), terms) order by m.install_date desc nulls last limit lim);
end;
$$;

grant execute on function public.global_search(text, int) to authenticated;
grant execute on function public.search_norm(text) to authenticated;
grant execute on function public.search_match(text, text[]) to authenticated;
