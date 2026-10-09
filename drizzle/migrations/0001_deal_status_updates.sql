CREATE OR REPLACE FUNCTION public.update_deal_status(_deal_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_deal public.deals%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to update a booking'; END IF;
  SELECT * INTO v_deal FROM public.deals WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.has_role(v_user, 'admin'::app_role) AND v_deal.assigned_to <> v_user THEN RAISE EXCEPTION 'You cannot update this booking'; END IF;
  IF v_deal.status = 'cancelled' OR v_deal.status = 'registered' THEN RAISE EXCEPTION 'This booking cannot be changed'; END IF;
  IF NOT ((v_deal.status = 'booked' AND _status = 'agreement_signed') OR (v_deal.status = 'agreement_signed' AND _status = 'registered')) THEN
    RAISE EXCEPTION 'Booking status must advance from booked to agreement signed to registered';
  END IF;
  UPDATE public.deals SET status = _status, updated_at = now() WHERE id = _deal_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_deal_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_deal_status(uuid, text) TO authenticated;