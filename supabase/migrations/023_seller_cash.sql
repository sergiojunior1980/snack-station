-- O vendedor abre e fecha o caixa e lança entrada ou saída.

drop policy if exists "ler caixa" on public.cash_sessions;
create policy "ler caixa" on public.cash_sessions
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "ler movimentos de caixa" on public.cash_movements;
create policy "ler movimentos de caixa" on public.cash_movements
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "ler lotes" on public.stock_lots;
create policy "ler lotes" on public.stock_lots
  for select to authenticated using (public.has_menu('estoque') or public.has_menu('relatorios'));

create or replace function public.open_cash_session(p_opening_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre para abrir o caixa';
  end if;
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Valor de abertura inválido';
  end if;
  if exists (select 1 from public.cash_sessions where closed_at is null) then
    raise exception 'Já existe um caixa aberto';
  end if;

  insert into public.cash_sessions (opened_by, opening_cents, opening_note)
  values (auth.uid(), p_opening_cents, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cash_expected(p_session_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_from timestamptz;
  v_to timestamptz;
  v_sales integer;
  v_in integer;
  v_out integer;
  v_purchases integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select opening_cents, opened_at, coalesce(closed_at, now())
    into v_open, v_from, v_to
  from public.cash_sessions where id = p_session_id;
  if v_from is null then return 0; end if;

  select coalesce(sum(sp.amount_cents), 0) into v_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods m on m.id = sp.payment_method and m.kind = 'recebimento' and m.counts_as_cash
  where s.created_at >= v_from and s.created_at < v_to;

  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where created_at >= v_from and created_at < v_to;

  select coalesce(sum(p.total_cents), 0) into v_purchases
  from public.purchases p
  join public.payment_methods m on m.id = p.payment_method and m.kind = 'pagamento' and m.settles_balance
  where p.created_at >= v_from and p.created_at < v_to;

  return v_open + v_sales + v_in - v_out - v_purchases;
end;
$$;

create or replace function public.close_cash_session(p_counted_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_expected integer;
begin
  if auth.uid() is null then
    raise exception 'Entre para fechar o caixa';
  end if;
  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Valor contado inválido';
  end if;

  select id into v_id
  from public.cash_sessions
  where closed_at is null
  for update;

  if v_id is null then
    raise exception 'Não há caixa aberto';
  end if;

  v_expected := public.cash_expected(v_id);

  update public.cash_sessions
  set closed_by = auth.uid(),
      closed_at = now(),
      counted_cents = p_counted_cents,
      expected_cents = v_expected,
      difference_cents = p_counted_cents - v_expected,
      closing_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.register_cash_movement(p_kind text, p_amount_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre para lançar a entrada ou a saída';
  end if;
  if p_kind not in ('entrada', 'retirada') then
    raise exception 'Movimento inválido';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Informe a observação do movimento';
  end if;

  select id into v_session from public.cash_sessions where closed_at is null;

  insert into public.cash_movements (session_id, kind, amount_cents, note, created_by)
  values (v_session, p_kind, p_amount_cents, trim(p_note), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
