-- 003 – Supervisor review & data quality
ALTER TABLE surveys ADD COLUMN review_notes JSON NULL AFTER review_comment;
ALTER TABLE surveys ADD COLUMN reject_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER review_notes;
ALTER TABLE survey_status_history ADD COLUMN details JSON NULL AFTER comment;

-- households confirmed as duplicates point at the record that is kept; they are excluded from reports
ALTER TABLE households ADD COLUMN duplicate_of INT UNSIGNED NULL AFTER phone;
ALTER TABLE households ADD CONSTRAINT fk_household_duplicate FOREIGN KEY (duplicate_of) REFERENCES households(id);

-- supervisor decisions on suspected duplicate pairs (household_a < household_b)
CREATE TABLE duplicate_reviews (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_a   INT UNSIGNED NOT NULL,
  household_b   INT UNSIGNED NOT NULL,
  decision      ENUM('not_duplicate','duplicate') NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_duplicate_pair (household_a, household_b),
  CONSTRAINT fk_dup_a FOREIGN KEY (household_a) REFERENCES households(id),
  CONSTRAINT fk_dup_b FOREIGN KEY (household_b) REFERENCES households(id),
  CONSTRAINT fk_dup_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
