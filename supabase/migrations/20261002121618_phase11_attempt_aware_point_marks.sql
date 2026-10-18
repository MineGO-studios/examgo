-- Preserve legacy scoring while allowing one marked question to offer more
-- displayed points than the teacher requires the student to attempt.
begin;

alter table public.exam_draft_questions
  add column mark_attempt_count smallint check (mark_attempt_count between 1 and 200);
alter table public.exam_snapshot_questions
  add column mark_attempt_count smallint check (mark_attempt_count between 1 and 200);

create function public.valid_attempt_exam_point_marks(total smallint, points jsonb, attempts smallint)
returns boolean
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  point_key text; point_value jsonb; mark integer;
  point_count integer := 0; point_total integer := 0;
  first_mark integer; equal_marks boolean := true;
begin
  if attempts is null then
    return public.valid_exam_point_marks(total, points);
  end if;
  if total is null or points is null or total not between 1 and 1000
    or attempts not between 1 and 200 or jsonb_typeof(points) <> 'object' then
    return false;
  end if;
  for point_key, point_value in select key, value from jsonb_each(points) loop
    if length(btrim(point_key)) = 0 or jsonb_typeof(point_value) <> 'number'
      or length(point_value::text) > 4 or point_value::text !~ '^[1-9][0-9]*$' then
      return false;
    end if;
    mark := (point_value::text)::integer;
    if mark > 1000 then return false; end if;
    first_mark := coalesce(first_mark, mark);
    equal_marks := equal_marks and mark = first_mark;
    point_count := point_count + 1;
    point_total := point_total + mark;
    if point_count > 200 then return false; end if;
  end loop;
  if point_count = 0 or attempts > point_count then return false; end if;
  if attempts = point_count then return point_total = total; end if;
  return equal_marks and first_mark * attempts = total;
end;
$$;

revoke all on function public.valid_attempt_exam_point_marks(smallint,jsonb,smallint) from public,anon;
grant execute on function public.valid_attempt_exam_point_marks(smallint,jsonb,smallint) to authenticated,service_role;

alter table public.exam_draft_questions
  drop constraint exam_draft_questions_point_marks_valid,
  add constraint exam_draft_questions_point_marks_valid
    check (public.valid_attempt_exam_point_marks(assigned_marks, point_marks, mark_attempt_count));
alter table public.exam_snapshot_questions
  drop constraint exam_snapshot_questions_point_marks_valid,
  add constraint exam_snapshot_questions_point_marks_valid
    check (public.valid_attempt_exam_point_marks(assigned_marks, point_marks, mark_attempt_count));

commit;
