-- Fail closed for queues that are already declared OWNER-only in 0018.
-- This is a persistence guardrail, not a new role doctrine: it makes the
-- existing work_queues.default_role authority effective even when a case is
-- created asynchronously without an explicit owner.

CREATE OR REPLACE FUNCTION enforce_restricted_support_queue_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  queue_key_value text;
  fallback_owner uuid;
BEGIN
  SELECT q.queue_key INTO queue_key_value
    FROM work_queues q
   WHERE q.id = NEW.queue_id;

  IF queue_key_value IN ('SECUREPAY_STAFF', 'SENSITIVE_REVIEW') THEN
    NEW.required_role := 'OWNER'::role;

    IF NEW.owner_user_id IS NULL THEN
      SELECT u.id INTO fallback_owner
        FROM users u
       WHERE u.active = TRUE AND u.role = 'OWNER'::role
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT 1;
      IF fallback_owner IS NULL THEN
        RAISE EXCEPTION 'Restricted support work requires an active OWNER';
      END IF;
      NEW.owner_user_id := fallback_owner;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = NEW.owner_user_id
         AND u.active = TRUE
         AND u.role = 'OWNER'::role
    ) THEN
      RAISE EXCEPTION 'Restricted support work may only be owned by an active OWNER';
    END IF;

    IF NEW.status = 'INBOX'::work_item_status THEN
      NEW.status := 'READY'::work_item_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restricted_support_queue_owner_guard ON work_items;
CREATE TRIGGER restricted_support_queue_owner_guard
BEFORE INSERT OR UPDATE OF queue_id, owner_user_id, required_role
ON work_items
FOR EACH ROW
EXECUTE FUNCTION enforce_restricted_support_queue_owner();

DO $$
DECLARE
  fallback_owner uuid;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM work_items w
      JOIN work_queues q ON q.id = w.queue_id
      LEFT JOIN users owner ON owner.id = w.owner_user_id
     WHERE q.queue_key IN ('SECUREPAY_STAFF', 'SENSITIVE_REVIEW')
       AND (w.owner_user_id IS NULL OR owner.active IS DISTINCT FROM TRUE OR owner.role IS DISTINCT FROM 'OWNER'::role)
  ) THEN
    SELECT u.id INTO fallback_owner
      FROM users u
     WHERE u.active = TRUE AND u.role = 'OWNER'::role
     ORDER BY u.created_at ASC, u.id ASC
     LIMIT 1;
    IF fallback_owner IS NULL THEN
      RAISE EXCEPTION 'Cannot secure existing restricted support work without an active OWNER';
    END IF;

    UPDATE work_items w
       SET owner_user_id = fallback_owner,
           required_role = 'OWNER'::role,
           status = CASE WHEN w.status = 'INBOX'::work_item_status THEN 'READY'::work_item_status ELSE w.status END,
           routing_reason = COALESCE(w.routing_reason, 'Restricted support shelf: OWNER-only'),
           updated_at = now()
      FROM work_queues q
     WHERE q.id = w.queue_id
       AND q.queue_key IN ('SECUREPAY_STAFF', 'SENSITIVE_REVIEW');
  END IF;
END;
$$;

COMMENT ON FUNCTION enforce_restricted_support_queue_owner() IS
  'Fail-closed enforcement for SecurePay staff and sensitive support shelves. These queues remain OWNER-only until the role doctrine explicitly introduces another privileged support role.';
