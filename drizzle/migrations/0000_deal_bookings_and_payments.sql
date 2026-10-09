DO $$ BEGIN CREATE TYPE public.unit_status AS ENUM ('Available','Blocked','Sold'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, location text, description text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects read" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects admin write" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE TABLE IF NOT EXISTS public.units (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, tower text, unit_number text NOT NULL, unit_type public.property_type, sqft numeric, price numeric, status public.unit_status NOT NULL DEFAULT 'Available', lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units read" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "units admin write" ON public.units FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "units caller update" ON public.units FOR UPDATE TO authenticated USING (lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = units.lead_id AND l.assigned_to = auth.uid()));
--> statement-breakpoint
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  booking_date date NOT NULL DEFAULT CURRENT_DATE,
  base_price numeric(14,2) NOT NULL,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  agreed_price numeric(14,2) NOT NULL,
  payment_plan text NOT NULL DEFAULT 'Construction-linked',
  status text NOT NULL DEFAULT 'booked',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deals_prices_positive CHECK (base_price > 0 AND discount_amount >= 0 AND agreed_price > 0 AND agreed_price = base_price - discount_amount),
  CONSTRAINT deals_status_valid CHECK (status IN ('booked', 'agreement_signed', 'registered', 'cancelled')),
  CONSTRAINT deals_payment_plan_nonempty CHECK (length(trim(payment_plan)) > 0)
);
GRANT SELECT ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read assigned deals" ON public.deals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR assigned_to = auth.uid());
CREATE INDEX deals_assigned_booking_idx ON public.deals (assigned_to, booking_date DESC);
CREATE UNIQUE INDEX deals_one_active_unit_idx ON public.deals (unit_id) WHERE status <> 'cancelled';

CREATE TABLE public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name text NOT NULL,
  percentage numeric(5,2) NOT NULL,
  amount_due numeric(14,2) NOT NULL,
  due_date date,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_milestones_percentage_valid CHECK (percentage > 0 AND percentage <= 100),
  CONSTRAINT payment_milestones_amount_positive CHECK (amount_due > 0),
  CONSTRAINT payment_milestones_order_nonnegative CHECK (order_index >= 0),
  CONSTRAINT payment_milestones_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT payment_milestones_deal_order_unique UNIQUE (deal_id, order_index)
);
GRANT SELECT ON public.payment_milestones TO authenticated;
GRANT ALL ON public.payment_milestones TO service_role;
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read assigned deal milestones" ON public.payment_milestones FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND (public.has_role(auth.uid(), 'admin'::app_role) OR d.assigned_to = auth.uid())));
CREATE INDEX payment_milestones_deal_order_idx ON public.payment_milestones (deal_id, order_index);

CREATE TABLE public.deal_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE RESTRICT,
  milestone_id uuid NOT NULL REFERENCES public.payment_milestones(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL,
  reference_no text,
  receipt_number text NOT NULL UNIQUE,
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT deal_payments_method_valid CHECK (payment_method IN ('Bank transfer', 'UPI', 'Cheque', 'Cash', 'Other'))
);
GRANT SELECT ON public.deal_payments TO authenticated;
GRANT ALL ON public.deal_payments TO service_role;
ALTER TABLE public.deal_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read assigned deal payments" ON public.deal_payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND (public.has_role(auth.uid(), 'admin'::app_role) OR d.assigned_to = auth.uid())));
CREATE INDEX deal_payments_deal_date_idx ON public.deal_payments (deal_id, paid_on DESC);

CREATE OR REPLACE FUNCTION public.create_deal_booking(_lead_id uuid, _unit_id uuid, _base_price numeric, _discount_amount numeric, _payment_plan text, _booking_date date, _notes text, _milestones jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_assignee uuid;
  v_unit public.units%ROWTYPE;
  v_deal uuid;
  v_agreed numeric(14,2);
  v_total numeric;
  v_count integer;
  v_item jsonb;
  v_name text;
  v_percentage numeric(5,2);
  v_due date;
  v_amount numeric(14,2);
  v_index integer := 0;
  v_assigned uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to create a booking'; END IF;
  v_admin := public.has_role(v_user, 'admin'::app_role);
  SELECT l.assigned_to INTO v_assignee FROM public.leads l WHERE l.id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF NOT v_admin AND v_assignee IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'You can only book for a lead assigned to you'; END IF;
  v_assigned := COALESCE(v_assignee, v_user);
  SELECT * INTO v_unit FROM public.units WHERE id = _unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;
  IF v_unit.status <> 'Available'::public.unit_status OR EXISTS (SELECT 1 FROM public.deals d WHERE d.unit_id = _unit_id AND d.status <> 'cancelled') THEN
    RAISE EXCEPTION 'This unit is no longer available';
  END IF;
  IF _base_price IS NULL OR _base_price <= 0 OR _discount_amount IS NULL OR _discount_amount < 0 OR _discount_amount >= _base_price THEN
    RAISE EXCEPTION 'Enter a valid price and discount';
  END IF;
  v_agreed := _base_price - _discount_amount;
  IF COALESCE(length(trim(_payment_plan)), 0) = 0 THEN RAISE EXCEPTION 'Choose a payment plan'; END IF;
  IF jsonb_typeof(_milestones) <> 'array' THEN RAISE EXCEPTION 'Add a payment schedule'; END IF;
  v_count := jsonb_array_length(_milestones);
  IF v_count < 1 OR v_count > 20 THEN RAISE EXCEPTION 'A schedule must contain 1 to 20 milestones'; END IF;
  SELECT sum((item->>'percentage')::numeric) INTO v_total FROM jsonb_array_elements(_milestones) item;
  IF v_total <> 100 THEN RAISE EXCEPTION 'Milestone percentages must total 100%%'; END IF;
  INSERT INTO public.deals(lead_id, unit_id, assigned_to, booking_date, base_price, discount_amount, agreed_price, payment_plan, notes)
  VALUES (_lead_id, _unit_id, v_assigned, COALESCE(_booking_date, CURRENT_DATE), _base_price, _discount_amount, v_agreed, trim(_payment_plan), NULLIF(trim(_notes), ''))
  RETURNING id INTO v_deal;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_milestones) LOOP
    v_name := NULLIF(trim(v_item->>'name'), '');
    v_percentage := (v_item->>'percentage')::numeric;
    v_due := NULLIF(v_item->>'due_date', '')::date;
    IF v_name IS NULL OR v_percentage <= 0 OR v_percentage > 100 THEN RAISE EXCEPTION 'Each milestone needs a name and a valid percentage'; END IF;
    v_amount := CASE WHEN v_index = v_count - 1 THEN v_agreed - COALESCE((SELECT sum(pm.amount_due) FROM public.payment_milestones pm WHERE pm.deal_id = v_deal), 0) ELSE round(v_agreed * v_percentage / 100, 2) END;
    INSERT INTO public.payment_milestones(deal_id, name, percentage, amount_due, due_date, order_index)
    VALUES (v_deal, v_name, v_percentage, v_amount, v_due, v_index);
    v_index := v_index + 1;
  END LOOP;
  UPDATE public.units SET status = 'Sold'::public.unit_status, lead_id = _lead_id WHERE id = _unit_id;
  UPDATE public.leads SET status = 'Booked'::public.lead_status WHERE id = _lead_id;
  INSERT INTO public.lead_activities(lead_id, type, content, created_by)
  VALUES (_lead_id, 'system', 'Unit ' || COALESCE(v_unit.tower || ' · ', '') || v_unit.unit_number || ' booked for ' || v_agreed::text, v_user);
  RETURN v_deal;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_deal_booking(uuid, uuid, numeric, numeric, text, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deal_booking(uuid, uuid, numeric, numeric, text, date, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_deal_payment(_deal_id uuid, _milestone_id uuid, _amount numeric, _paid_on date, _payment_method text, _reference_no text, _notes text)
RETURNS TABLE(payment_id uuid, receipt_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_deal public.deals%ROWTYPE;
  v_milestone public.payment_milestones%ROWTYPE;
  v_paid numeric;
  v_payment uuid := gen_random_uuid();
  v_receipt text := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to record a payment'; END IF;
  v_admin := public.has_role(v_user, 'admin'::app_role);
  SELECT * INTO v_deal FROM public.deals WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT v_admin AND v_deal.assigned_to <> v_user THEN RAISE EXCEPTION 'You cannot record payments for this booking'; END IF;
  IF v_deal.status = 'cancelled' THEN RAISE EXCEPTION 'Payments cannot be recorded for a cancelled booking'; END IF;
  SELECT * INTO v_milestone FROM public.payment_milestones WHERE id = _milestone_id AND deal_id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment milestone not found'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF _payment_method NOT IN ('Bank transfer', 'UPI', 'Cheque', 'Cash', 'Other') THEN RAISE EXCEPTION 'Choose a valid payment method'; END IF;
  SELECT COALESCE(sum(p.amount), 0) INTO v_paid FROM public.deal_payments p WHERE p.milestone_id = _milestone_id;
  IF round(v_paid + _amount, 2) > v_milestone.amount_due THEN RAISE EXCEPTION 'Payment exceeds this milestone balance'; END IF;
  INSERT INTO public.deal_payments(id, deal_id, milestone_id, amount, paid_on, payment_method, reference_no, receipt_number, notes, recorded_by)
  VALUES (v_payment, _deal_id, _milestone_id, _amount, COALESCE(_paid_on, CURRENT_DATE), _payment_method, NULLIF(trim(_reference_no), ''), v_receipt, NULLIF(trim(_notes), ''), v_user);
  RETURN QUERY SELECT v_payment, v_receipt;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_deal_payment(uuid, uuid, numeric, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_deal_payment(uuid, uuid, numeric, date, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_deal_booking(_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_deal public.deals%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to cancel a booking'; END IF;
  SELECT * INTO v_deal FROM public.deals WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.has_role(v_user, 'admin'::app_role) AND v_deal.assigned_to <> v_user THEN RAISE EXCEPTION 'You cannot cancel this booking'; END IF;
  IF v_deal.status = 'registered' THEN RAISE EXCEPTION 'A registered deal cannot be cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_payments WHERE deal_id = _deal_id) THEN RAISE EXCEPTION 'This booking has receipts; resolve those payments before cancelling'; END IF;
  IF v_deal.status = 'cancelled' THEN RETURN; END IF;
  UPDATE public.deals SET status = 'cancelled', updated_at = now() WHERE id = _deal_id;
  UPDATE public.units SET status = 'Available'::public.unit_status, lead_id = NULL WHERE id = v_deal.unit_id AND status = 'Sold'::public.unit_status;
  UPDATE public.leads SET status = 'Negotiation'::public.lead_status WHERE id = v_deal.lead_id AND status = 'Booked'::public.lead_status;
  INSERT INTO public.lead_activities(lead_id, type, content, created_by)
  VALUES (v_deal.lead_id, 'system', 'Booking cancelled; unit released', v_user);
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_deal_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_deal_booking(uuid) TO authenticated;

CREATE TRIGGER deals_touch BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();