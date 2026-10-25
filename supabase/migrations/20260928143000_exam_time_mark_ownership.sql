-- New bank questions can be authored without marks. Existing revision marks
-- remain historical data for previously saved workflows.
alter table public.questions
  alter column marks drop not null,
  alter column marks drop default;

alter table public.question_revisions
  alter column marks drop not null;

-- Draft and finalized exam items own teacher-assigned marks. Legacy rows keep
-- these fields null and continue to read the marks captured in their revision.
alter table public.exam_draft_questions
  add column assigned_marks smallint check (assigned_marks between 1 and 1000),
  add column point_marks jsonb check (point_marks is null or jsonb_typeof(point_marks) = 'object');

alter table public.exam_snapshot_questions
  add column assigned_marks smallint check (assigned_marks between 1 and 1000),
  add column point_marks jsonb check (point_marks is null or jsonb_typeof(point_marks) = 'object');

create function public.valid_exam_point_marks(total smallint, points jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  point_key text;
  point_value jsonb;
  point_total integer := 0;
  point_count integer := 0;
begin
  if total is null or points is null then
    return total is null and points is null;
  end if;
  if total < 1 or total > 1000 or jsonb_typeof(points) <> 'object' then
    return false;
  end if;
  for point_key, point_value in select key, value from jsonb_each(points) loop
    if length(btrim(point_key)) = 0 or jsonb_typeof(point_value) <> 'number'
       or point_value::text !~ '^[1-9][0-9]*$' then
      return false;
    end if;
    point_total := point_total + (point_value::text)::integer;
    point_count := point_count + 1;
    if point_total > total or point_count > 200 then return false; end if;
  end loop;
  return point_count > 0 and point_total = total;
exception when numeric_value_out_of_range then
  return false;
end;
$$;

alter table public.exam_draft_questions
  add constraint exam_draft_questions_point_marks_valid
    check (public.valid_exam_point_marks(assigned_marks, point_marks));
alter table public.exam_snapshot_questions
  add constraint exam_snapshot_questions_point_marks_valid
    check (public.valid_exam_point_marks(assigned_marks, point_marks));

revoke all on function public.valid_exam_point_marks(smallint,jsonb) from public;
grant execute on function public.valid_exam_point_marks(smallint,jsonb) to authenticated, service_role;
