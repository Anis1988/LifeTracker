-- 🧾 Receipts go to Spending (owner's request): a receipt (from an email, its attachment, or added by hand) is a
-- spending line in "transactions", the same table as the bank alert emails, the bank CSV and SimpleFIN.
-- The same purchase is counted once: a receipt that matches a bank line (same amount ±$0.01, ±3 days, a similar shop)
-- is attached to that line instead of adding a new one, and a bank line arriving later for a receipt already there is
-- merged into it (server code: _shared/receipts.ts).
-- Same rules as before: the owner can read and delete their own lines ("own transactions" policies); lines are only
-- added or changed by the server. Old rows keep working: every new column is optional or has a default.

alter table public.transactions
  add column if not exists source text not null default 'bank' check (source in ('bank','alert','csv','receipt')), -- where the line came from
  add column if not exists receipt_path text,   -- the receipt: a file in the private "docs" bucket (<user id>/…), or gmail:<message id>
  add column if not exists receipt_key text,    -- mail:<gmail id>:<file hash> | mail:<gmail id>:body | hand:<file hash>: never the same receipt twice
  add column if not exists receipt_hash text,   -- SHA-256 of the receipt file
  add column if not exists note text check (note is null or length(note) <= 300), -- "From email: <subject> — <sender>, <date>"
  add column if not exists details jsonb;       -- what was read on the receipt: store, date, total, tax, card (last 4), items [{name, qty, price}], read (free | ai | hand), by

update public.transactions set source = 'alert' where source = 'bank' and external_id like 'mail:%';
update public.transactions set source = 'csv' where source = 'bank' and external_id like 'csv:%';

create unique index if not exists transactions_receipt_key on public.transactions (user_id, receipt_key) where receipt_key is not null;
create index if not exists transactions_receipt_hash on public.transactions (user_id, receipt_hash) where receipt_hash is not null;
