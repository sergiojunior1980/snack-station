-- Corrige fundo de troco e valor contado sem abrir outro caixa.

create or replace function public.correct_cash_session(
  p_session_id uuid,
  p_opening_cents integer,
  p_counted_cents integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_counted integer;
  v_closed timestamptz;
  v_expected integer;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Entre para corrigir o caixa';
  end if;
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Valor de abertura inválido';
  end if;

  select opening_cents, counted_cents, closed_at
    into v_open, v_counted, v_closed
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  if v_closed is null then
    if p_counted_cents is not null then
      raise exception 'O caixa ainda está aberto';
    end if;
    update public.cash_sessions
    set opening_cents = p_opening_cents,
        opening_note = coalesce(v_note, opening_note)
    where id = p_session_id;
    if v_open is distinct from p_opening_cents then
      perform public.append_tape(
        'caixa_vendas',
        'Abertura corrigida de '
          || trim(to_char(v_open / 100.0, 'FM999990.00'))
          || ' para '
          || trim(to_char(p_opening_cents / 100.0, 'FM999990.00'))
      );
    end if;
    return;
  end if;

  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Valor contado inválido';
  end if;

  update public.cash_sessions
  set opening_cents = p_opening_cents
  where id = p_session_id;

  v_expected := public.cash_expected(p_session_id);

  update public.cash_sessions
  set counted_cents = p_counted_cents,
      expected_cents = v_expected,
      difference_cents = p_counted_cents - v_expected,
      closing_note = coalesce(v_note, closing_note)
  where id = p_session_id;

  if v_open is distinct from p_opening_cents or v_counted is distinct from p_counted_cents then
    perform public.append_tape(
      'caixa_vendas',
      'Fechamento corrigido: fundo '
        || trim(to_char(v_open / 100.0, 'FM999990.00'))
        || ' para '
        || trim(to_char(p_opening_cents / 100.0, 'FM999990.00'))
        || ', contado '
        || trim(to_char(coalesce(v_counted, 0) / 100.0, 'FM999990.00'))
        || ' para '
        || trim(to_char(p_counted_cents / 100.0, 'FM999990.00'))
    );
  end if;
end;
$$;

revoke all on function public.correct_cash_session(uuid, integer, integer, text) from public;
grant execute on function public.correct_cash_session(uuid, integer, integer, text) to authenticated;
