CREATE OR REPLACE FUNCTION public.reschedule_payment_milestone(_milestone_id uuid, _due_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assigned_to uuid;
  _deal_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT d.assigned_to, d.status
    INTO _assigned_to, _deal_status
    FROM public.payment_milestones AS pm
    JOIN public.deals AS d ON d.id = pm.deal_id
   WHERE pm.id = _milestone_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment milestone not found';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) AND _assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'You are not allowed to update this booking';
  END IF;

  IF _deal_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled bookings cannot be rescheduled';
  END IF;

  UPDATE public.payment_milestones
     SET due_date = _due_date
   WHERE id = _milestone_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_payment_milestone(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_payment_milestone(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.reschedule_payment_milestone(uuid, date) TO authenticated;