begin;
revoke execute on function public.list_trip_corridors() from anon;
revoke execute on function public.create_trip_draft(uuid,text,text,timestamptz,numeric,text,numeric,text) from anon;
revoke execute on function public.publish_my_trip(uuid) from anon;
grant execute on function public.list_trip_corridors() to authenticated;
grant execute on function public.create_trip_draft(uuid,text,text,timestamptz,numeric,text,numeric,text) to authenticated;
grant execute on function public.publish_my_trip(uuid) to authenticated;
commit;
