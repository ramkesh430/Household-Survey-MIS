-- 002 – Offline sync support
-- last_op_id: idempotency key of the last applied save/submit, so a retried request
-- (response lost on a flaky network) is acknowledged instead of failing with a version conflict.
ALTER TABLE surveys ADD COLUMN last_op_id CHAR(36) NULL AFTER version;
ALTER TABLE surveys ADD COLUMN client_updated_at DATETIME NULL AFTER last_op_id;
CREATE INDEX ix_survey_updated ON surveys (updated_at);
CREATE INDEX ix_household_updated ON households (updated_at);
