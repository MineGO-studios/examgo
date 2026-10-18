create index questions_bank_owner_idx
  on public.questions (bank_id, owner_id);

create index question_revisions_question_owner_idx
  on public.question_revisions (question_id, owner_id);

create index question_revisions_bank_owner_idx
  on public.question_revisions (bank_id, owner_id);

create index question_groups_parent_owner_idx
  on public.question_groups (parent_group_id, owner_id)
  where parent_group_id is not null;

create index question_group_questions_group_owner_idx
  on public.question_group_questions (group_id, owner_id);

create index question_group_questions_question_owner_idx
  on public.question_group_questions (question_id, owner_id);

create index question_group_questions_owner_idx
  on public.question_group_questions (owner_id);

create index exam_snapshots_draft_owner_idx
  on public.exam_snapshots (source_draft_id, owner_id)
  where source_draft_id is not null;

create index exam_snapshot_questions_snapshot_owner_idx
  on public.exam_snapshot_questions (snapshot_id, owner_id);

create index exam_snapshot_questions_revision_owner_idx
  on public.exam_snapshot_questions (question_revision_id, owner_id);

create index exam_snapshot_questions_group_owner_idx
  on public.exam_snapshot_questions (source_group_id, owner_id)
  where source_group_id is not null;

create index exam_snapshot_questions_owner_idx
  on public.exam_snapshot_questions (owner_id);
