-- 10 · Operations: inventory, assets, library, document management

create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name_am       text not null,
  category_am   text,
  unit_am       text not null default 'አሃድ',
  quantity      numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  unit_cost     numeric(14,2) not null default 0,
  currency      text not null default 'ETB',
  location_am   text,
  supplier      text,
  is_active     boolean not null default true,
  note_am       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (quantity >= 0)
);

create table public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.inventory_items (id) on delete cascade,
  direction     text not null check (direction in ('in','out','adjust')),
  quantity      numeric(12,2) not null check (quantity <> 0),
  reason_am     text,
  transaction_id uuid references public.transactions (id) on delete set null,
  moved_on      date not null default current_date,
  moved_by      uuid references public.profiles (id) on delete set null,
  counterparty  text,
  created_at    timestamptz not null default now()
);

create index inventory_moves_idx on public.inventory_movements (item_id, moved_on desc);

-- Stock is always the sum of signed movements, never a hand-edited number.
create or replace function public.apply_inventory_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric;
begin
  v_delta := case when new.direction = 'in' then abs(new.quantity)
                  when new.direction = 'out' then -abs(new.quantity)
                  else new.quantity end;

  update inventory_items
     set quantity = quantity + v_delta
   where id = new.item_id;

  if not found then
    raise exception 'inventory item % not found', new.item_id;
  end if;

  if (select quantity from inventory_items where id = new.item_id) < 0 then
    raise exception 'movement would drive stock of item % below zero', new.item_id;
  end if;

  return new;
end;
$$;

create trigger inventory_movement_apply
  after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- Edit or delete a movement by rebuilding the item's stock from scratch.
create or replace function public.rebuild_inventory_stock(p_item uuid) returns void
language sql security definer set search_path = public as $$
  update inventory_items i
     set quantity = coalesce((
           select sum(case when m.direction = 'in' then abs(m.quantity)
                           when m.direction = 'out' then -abs(m.quantity)
                           else m.quantity end)
             from inventory_movements m where m.item_id = i.id
         ), 0)
   where i.id = p_item;
$$;

-- Stock on hand is the sum of every movement, so the recount runs with owner
-- rights instead of whatever the person posting a slip is allowed to see.
create or replace function public.resync_inventory() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.rebuild_inventory_stock(old.item_id);
    return old;
  end if;
  perform public.rebuild_inventory_stock(new.item_id);
  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then
    perform public.rebuild_inventory_stock(old.item_id);
  end if;
  return new;
end;
$$;

create trigger inventory_movement_resync
  after update or delete on public.inventory_movements
  for each row execute function public.resync_inventory();

create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  tag           text not null unique,
  name_am       text not null,
  kind          text not null default 'equipment'
                 check (kind in ('equipment','furniture','vehicle','electronics','building','book_set','instrument','other')),
  purchase_on   date,
  cost          numeric(14,2),
  currency      text not null default 'ETB',
  supplier      text,
  serial_no     text,
  warranty_until date,
  location_am   text,
  department_id uuid references public.departments (id) on delete set null,
  assigned_to_member uuid references public.members (id) on delete set null,
  assigned_to_staff  uuid references public.teacher_profiles (id) on delete set null,
  status        text not null default 'active'
                 check (status in ('active','in_use','storage','repair','retired','lost')),
  photo_media_id uuid references public.media_files (id) on delete set null,
  maintenance_notes text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.library_books (
  id          uuid primary key default gen_random_uuid(),
  title_am    text not null,
  author_am   text,
  publisher   text,
  published_on date,
  isbn        text,
  category_am text,
  language    text not null default 'am',
  summary_am  text,
  cover_media_id uuid references public.media_files (id) on delete set null,
  total_copies integer not null default 1 check (total_copies >= 0),
  is_reference_only boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.library_copies (
  id        uuid primary key default gen_random_uuid(),
  book_id   uuid not null references public.library_books (id) on delete cascade,
  barcode   text not null unique,
  status    text not null default 'available'
             check (status in ('available','on_loan','lost','damaged','processing')),
  note_am   text,
  created_at timestamptz not null default now()
);

create table public.library_loans (
  id             uuid primary key default gen_random_uuid(),
  copy_id        uuid not null references public.library_copies (id) on delete restrict,
  borrower_member_id  uuid references public.members (id) on delete set null,
  borrower_student_id uuid references public.student_profiles (id) on delete set null,
  borrower_staff_id   uuid references public.teacher_profiles (id) on delete set null,
  loaned_on      date not null default current_date,
  due_on         date,
  returned_on    date,
  fine           numeric(12,2) not null default 0,
  fine_paid      boolean not null default false,
  status         text not null default 'borrowed'
                  check (status in ('borrowed','returned','overdue','lost_written_off')),
  handled_by     uuid references public.profiles (id) on delete set null,
  note_am        text,
  created_at     timestamptz not null default now(),
  -- exactly one borrower of the three kinds
  check (
    (borrower_member_id is not null)::int
  + (borrower_student_id is not null)::int
  + (borrower_staff_id  is not null)::int = 1
  )
);

create index library_loans_borrower_idx on public.library_loans (status, due_on);

-- Copy availability follows the open loan, and an overdue loan is flagged by
-- the daily job rather than by the UI guessing.
create or replace function public.sync_copy_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update library_copies set status = 'available' where id = old.copy_id and status = 'on_loan';
    return old;
  end if;

  if new.status = 'returned' or new.status = 'lost_written_off' then
    update library_copies
       set status = case when new.status = 'returned' then 'available' else 'lost' end
     where id = new.copy_id;
  elsif new.status = 'borrowed' then
    update library_copies set status = 'on_loan' where id = new.copy_id;
  end if;

  return new;
end;
$$;

create trigger library_loan_sync
  after insert or update on public.library_loans
  for each row execute function public.sync_copy_status();

create or replace function public.mark_overdue_loans() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update library_loans set status = 'overdue'
   where status = 'borrowed' and due_on is not null and due_on < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ERP document store (constitutions, minutes, reports, policies).
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null default 'private-docs',
  storage_path  text not null,
  title_am      text not null,
  category      text not null default 'general'
                 check (category in ('general','governance','minutes','policy','report','form','contract','curriculum','finance','other')),
  kind          text not null default 'document'
                 check (kind in ('pdf','doc','sheet','image','audio','video','archive','other')),
  version       integer not null default 1,
  tags          text[] not null default '{}',
  is_public     boolean not null default false,
  state         public.content_state not null default 'published',
  valid_until   date,
  linked        jsonb not null default '{}'::jsonb,     -- {class_id, department_id, event_id, …}
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (bucket, storage_path, version)
);

create trigger inventory_items_touch before update on public.inventory_items for each row execute function public.touch_updated_at();
create trigger assets_touch          before update on public.assets          for each row execute function public.touch_updated_at();
create trigger books_touch           before update on public.library_books   for each row execute function public.touch_updated_at();
create trigger documents_touch       before update on public.documents       for each row execute function public.touch_updated_at();
