-- TIGERIS AI OS — schema v5 (Phase 4): recommendations, expert reviews, decisions, handoffs, institutional memory.
-- Reviews, decisions and memory entries are append-only. Recommendations and handoffs carry a status the
-- application may advance, and nothing else. The core governance rules are enforced here as well as in code:
-- the author never reviews or decides, a handoff exists only for an approval, memory only for a completed
-- handoff, and TIGERIS never executes an external action.

CREATE TABLE recommendations (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  key               text NOT NULL,
  case_id           uuid NOT NULL REFERENCES cases(id),
  option_id         uuid NOT NULL REFERENCES draft_options(id),
  scenario_run_id   uuid NOT NULL REFERENCES scenario_runs(id),
  rationale         text NOT NULL CHECK (length(btrim(rationale)) >= 10),
  status            text NOT NULL DEFAULT 'in_review' CHECK (status IN
                      ('in_review','changes_requested','endorsed','awaiting_second_approval',
                       'approved','rejected','deferred','evidence_requested')),
  policy_version    text NOT NULL,
  created_by        uuid NOT NULL REFERENCES principals(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
-- At most one open recommendation per case.
CREATE UNIQUE INDEX recommendations_one_open ON recommendations (case_id)
  WHERE status IN ('in_review','endorsed','awaiting_second_approval');

CREATE TABLE expert_reviews (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  recommendation_id  uuid NOT NULL REFERENCES recommendations(id),
  reviewer_id        uuid NOT NULL REFERENCES principals(id),
  verdict            text NOT NULL CHECK (verdict IN ('endorse','request_changes')),
  rationale          text NOT NULL CHECK (length(btrim(rationale)) >= 10),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX expert_reviews_rec_idx ON expert_reviews (recommendation_id, created_at);

CREATE TABLE decisions (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  key                text NOT NULL,
  recommendation_id  uuid NOT NULL REFERENCES recommendations(id),
  case_id            uuid NOT NULL REFERENCES cases(id),
  approver_id        uuid NOT NULL REFERENCES principals(id),
  outcome            text NOT NULL CHECK (outcome IN ('approve','reject','defer','request_evidence')),
  rationale          text NOT NULL CHECK (length(btrim(rationale)) >= 10),
  -- A blocked attempt is refused, not recorded: only pass (completes or second half) and hold are stored.
  policy_result      text NOT NULL CHECK (policy_result IN ('pass','hold')),
  policy_version     text NOT NULL,
  policy_reasons     jsonb NOT NULL,
  completes          boolean NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  UNIQUE (recommendation_id, approver_id)
);

CREATE TABLE handoffs (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  key                 text NOT NULL,
  decision_id         uuid NOT NULL UNIQUE REFERENCES decisions(id),
  case_id             uuid NOT NULL REFERENCES cases(id),
  owner_role          text NOT NULL DEFAULT 'operations_owner' CHECK (owner_role = 'operations_owner'),
  scope               text NOT NULL,
  status              text NOT NULL DEFAULT 'awaiting_acknowledgement' CHECK (status IN
                        ('awaiting_acknowledgement','acknowledged','in_progress','completed')),
  -- CLAUDE.md §6: no code path executes an external action. Lifting this needs a decision and a migration.
  executed_by_tigeris boolean NOT NULL DEFAULT false CHECK (NOT executed_by_tigeris),
  acknowledged_by     uuid REFERENCES principals(id),
  acknowledged_at     timestamptz,
  started_by          uuid REFERENCES principals(id),
  started_at          timestamptz,
  status_note         text,
  outcome_text        text,
  completed_by        uuid REFERENCES principals(id),
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  CHECK (status <> 'completed' OR (outcome_text IS NOT NULL AND completed_by IS NOT NULL))
);

CREATE TABLE memory_entries (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  key                text NOT NULL,
  case_id            uuid NOT NULL REFERENCES cases(id),
  recommendation_id  uuid NOT NULL REFERENCES recommendations(id),
  handoff_id         uuid NOT NULL UNIQUE REFERENCES handoffs(id),
  title              text NOT NULL,
  action_class       text NOT NULL,
  decision_rationale text NOT NULL,
  expected           jsonb NOT NULL,
  outcome            text NOT NULL,
  lesson             text NOT NULL CHECK (length(btrim(lesson)) >= 10),
  approved_by        jsonb NOT NULL,
  recorded_by        uuid NOT NULL REFERENCES principals(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  search             tsvector GENERATED ALWAYS AS (
                       to_tsvector('simple', title || ' ' || action_class || ' ' || decision_rationale || ' ' ||
                                             outcome || ' ' || lesson)) STORED,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX memory_entries_search_idx ON memory_entries USING gin (search);

-- ───────────────────────────── Guards ─────────────────────────────

CREATE FUNCTION guard_expert_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author uuid;
BEGIN
  SELECT created_by INTO author FROM recommendations WHERE id = NEW.recommendation_id;
  IF author = NEW.reviewer_id THEN
    RAISE EXCEPTION 'governance: the author of a recommendation cannot review it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expert_reviews_guard BEFORE INSERT ON expert_reviews FOR EACH ROW EXECUTE FUNCTION guard_expert_review();

CREATE FUNCTION guard_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author uuid;
BEGIN
  SELECT created_by INTO author FROM recommendations WHERE id = NEW.recommendation_id;
  IF author = NEW.approver_id THEN
    RAISE EXCEPTION 'governance: the author of a recommendation can never decide on it' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expert_reviews WHERE recommendation_id = NEW.recommendation_id AND verdict = 'endorse') THEN
    RAISE EXCEPTION 'governance: expert review is mandatory before any decision' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.outcome = 'approve' AND EXISTS (
       SELECT 1 FROM expert_reviews WHERE recommendation_id = NEW.recommendation_id AND reviewer_id = NEW.approver_id) THEN
    RAISE EXCEPTION 'governance: the reviewer cannot also approve' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER decisions_guard BEFORE INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION guard_decision();

CREATE FUNCTION guard_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decisions WHERE id = NEW.decision_id AND outcome = 'approve' AND completes) THEN
    RAISE EXCEPTION 'governance: a handoff exists only for a completed approval' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER handoffs_guard BEFORE INSERT ON handoffs FOR EACH ROW EXECUTE FUNCTION guard_handoff();

CREATE FUNCTION guard_memory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM handoffs WHERE id = NEW.handoff_id AND status = 'completed') THEN
    RAISE EXCEPTION 'governance: only an approved decision with a recorded outcome becomes memory'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER memory_entries_guard BEFORE INSERT ON memory_entries FOR EACH ROW EXECUTE FUNCTION guard_memory();

-- ───────────────────────────── Isolation and privileges ─────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recommendations','expert_reviews','decisions','handoffs','memory_entries']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON recommendations, expert_reviews, decisions, handoffs, memory_entries TO tigeris_app;
-- Status columns only: the record itself (who, what, why) never changes once written.
GRANT UPDATE (status, updated_at) ON recommendations TO tigeris_app;
GRANT UPDATE (status, acknowledged_by, acknowledged_at, started_by, started_at, status_note,
              outcome_text, completed_by, completed_at) ON handoffs TO tigeris_app;
