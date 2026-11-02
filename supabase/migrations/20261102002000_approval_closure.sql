-- ============================================================
-- 20. The finance approval queue closes when the decision is made
--
-- Two gaps the finance desk ran into:
--
-- 1. `decide_transaction()` booked the decision on the transaction but left its
--    `approval_requests` row 'pending', so the approvals queue kept listing
--    items that had already been decided. `decide_content()` closes its queue
--    row; this does the same for a finance decision, including the escalation
--    row this very function creates when an expense is above the auto-approve
--    limit.
-- 2. `budgets` is written by plain row-level security: updating a row needs
--    `budget.write`, while the seeded finance approver holds `budget.approve`
--    only — so deciding a budget from the approvals desk was refused. An extra
--    permissive update policy would open every column of the row to that
--    approver, so the decision moves into a SECURITY DEFINER function that
--    touches only the approval columns.
-- ============================================================

create or replace function public.decide_transaction(p_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.transactions%rowtype;
  v_limit numeric;
  v_approval uuid;
  v_open uuid;
  v_actor uuid := actor_user_id();
begin
  if p_decision not in ('approve','reject','void') then
    raise exception 'decision must be approve, reject or void';
  end if;
  if not public.has_permission('finance.approve') then
    raise exception 'missing finance.approve permission';
  end if;

  select * into v from transactions where id = p_id;
  if not found then raise exception 'transaction % not found', p_id; end if;

  if p_decision = 'approve' then
    select (value #>> '{}')::numeric into v_limit from finance_settings where key = 'auto_approve_limit';

    -- Expenses above the limit escalate to the approval queue instead of
    -- silently booking. The queue row is kept and reported, not rolled back —
    -- and only opened once: while it is still pending this call refuses again,
    -- and the decision that closes it is the one that books the expense.
    if v_limit is not null and v.amount > v_limit
       and v.type = 'expense' and v.status = 'pending_approval'
       and not exists (
         select 1 from approval_requests ar
          where ar.entity_table = 'transactions' and ar.entity_id = p_id and ar.status = 'pending'
       ) then
      insert into approval_requests (domain, entity_table, entity_id, entity_label, action,
                                     amount, currency, submitted_by, assigned_role, reason, status)
      values ('finance', 'transactions', p_id, v.description_am, 'expense', v.amount, v.currency,
              v_actor, 'finance_approver', 'amount above auto-approve limit', 'pending')
      returning id into v_approval;

      return jsonb_build_object(
        'status', 'requires_approval',
        'transaction', to_jsonb(v),
        'approval_id', v_approval,
        'message_am',
        'ገደቡ ከፈቀደው ከፍ ስለሚል (' || v.amount || ' ' || v.currency || ' > ' || v_limit || ') '
        || 'የፋይናንስ ማረጋገጫ ያስፈልጋል።');
    end if;
  end if;

  update transactions
     set status = case p_decision
                    when 'approve' then 'approved'
                    when 'reject'  then 'rejected'
                    else 'void'
                  end,
         approved_by = case when p_decision = 'approve' then v_actor else approved_by end,
         approved_at = case when p_decision = 'approve' then now() else approved_at end,
         rejection_note = case when p_decision in ('reject','void') then p_note else rejection_note end
   where id = p_id
  returning * into v;

  -- The queue row for this transaction, if there is one, is now decided too.
  select id into v_open from approval_requests
   where entity_table = 'transactions' and entity_id = p_id and status = 'pending'
   order by created_at desc limit 1;

  if v_open is not null then
    update approval_requests
       set status = case p_decision
                      when 'approve' then 'approved'
                      when 'reject'  then 'rejected'
                      else 'cancelled'
                    end,
           decided_by = v_actor,
           decided_at = now(),
           decision_note = coalesce(p_note, 'decided from the finance desk')
     where id = v_open;
  end if;

  return jsonb_build_object(
    'status', v.status,
    'transaction', to_jsonb(v),
    'approval_closed', v_open);
end;
$$;

comment on function public.decide_transaction(uuid, text, text) is
  'Record a finance decision and close its pending approval_requests row.';

-- ─── the budget decision, as a function ──────────────────────────────────────
-- A permissive policy that lets an approver update a submitted budget also
-- whitelists every other column of that row, because row-level security checks
-- the new row against any policy's WITH CHECK, not one policy at a time. The
-- decision therefore goes through a SECURITY DEFINER function that writes only
-- the approval columns, exactly like `decide_transaction()`.
create or replace function public.decide_budget(p_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.budgets%rowtype;
  v_actor uuid := actor_user_id();
begin
  if p_decision not in ('approve','reject') then
    raise exception 'decision must be approve or reject';
  end if;
  if not public.has_permission('budget.approve') then
    raise exception 'missing budget.approve permission';
  end if;

  select * into v from budgets where id = p_id;
  if not found then raise exception 'budget % not found', p_id; end if;
  if v.status <> 'submitted' then
    raise exception 'only a submitted budget can be decided (found %)', v.status;
  end if;

  update budgets
     set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
         approved_amount = case
                             when p_decision = 'approve' then coalesce(approved_amount, planned_amount)
                             else approved_amount
                           end,
         approved_by = case when p_decision = 'approve' then v_actor else approved_by end,
         approved_at = case when p_decision = 'approve' then now() else approved_at end,
         notes = case
                   when p_decision = 'reject' and p_note is not null
                     then trim(coalesce(notes, '') || ' ውድቅ ምክንያት፦ ' || p_note)
                   else notes
                 end
   where id = p_id
  returning * into v;

  return jsonb_build_object('status', v.status, 'budget', to_jsonb(v));
end;
$$;

revoke all on function public.decide_budget(uuid, text, text) from public;
grant execute on function public.decide_budget(uuid, text, text) to authenticated;

comment on function public.decide_budget(uuid, text, text) is
  'Approve or reject a submitted budget; only the approval columns change.';
