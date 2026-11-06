-- 001 – Initial schema for the Digital Household Survey & MIS
-- Compatible with MySQL 8.0+ and MariaDB 10.6+. utf8mb4 for Nepali Unicode.

CREATE TABLE wards (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ward_no       SMALLINT UNSIGNED NOT NULL,
  name          VARCHAR(150) NULL,
  office_address VARCHAR(255) NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wards_no (ward_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlements (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ward_id     INT UNSIGNED NOT NULL,
  code        VARCHAR(20) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_code (ward_id, code),
  CONSTRAINT fk_settlement_ward FOREIGN KEY (ward_id) REFERENCES wards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(60) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  full_name      VARCHAR(150) NOT NULL,
  role           ENUM('admin','supervisor','enumerator') NOT NULL,
  ward_id        INT UNSIGNED NULL,
  phone          VARCHAR(20) NULL,
  email          VARCHAR(150) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_logins  INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until   DATETIME NULL,
  token_version  INT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at  DATETIME NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY ix_users_role (role),
  CONSTRAINT fk_users_ward FOREIGN KEY (ward_id) REFERENCES wards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  ip          VARCHAR(45) NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY ix_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE households (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid            CHAR(36) NOT NULL,
  household_code  VARCHAR(40) NOT NULL,
  ward_id         INT UNSIGNED NOT NULL,
  settlement_id   INT UNSIGNED NOT NULL,
  house_no        INT UNSIGNED NOT NULL,
  family_no       INT UNSIGNED NOT NULL,
  head_name       VARCHAR(150) NOT NULL,
  head_gender     VARCHAR(5) NULL,
  phone           VARCHAR(20) NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_household_uuid (uuid),
  UNIQUE KEY uq_household_code (household_code),
  UNIQUE KEY uq_household_place (settlement_id, house_no, family_no),
  KEY ix_household_ward (ward_id),
  KEY ix_household_head (head_name),
  CONSTRAINT fk_household_ward FOREIGN KEY (ward_id) REFERENCES wards(id),
  CONSTRAINT fk_household_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id),
  CONSTRAINT fk_household_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE surveys (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid            CHAR(36) NOT NULL,
  household_id    INT UNSIGNED NOT NULL,
  round_no        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  form_id         VARCHAR(60) NOT NULL,
  form_version    VARCHAR(20) NOT NULL,
  status          ENUM('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
  answers         JSON NOT NULL,
  completion      DECIMAL(5,2) NOT NULL DEFAULT 0,
  warning_count   INT UNSIGNED NOT NULL DEFAULT 0,
  enumerator_id   INT UNSIGNED NOT NULL,
  reviewer_id     INT UNSIGNED NULL,
  submitted_at    DATETIME NULL,
  reviewed_at     DATETIME NULL,
  review_comment  TEXT NULL,
  gps_lat         DECIMAL(10,7) NULL,
  gps_lng         DECIMAL(10,7) NULL,
  gps_accuracy_m  DECIMAL(8,2) NULL,
  gps_captured_at DATETIME NULL,
  version         INT UNSIGNED NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_survey_uuid (uuid),
  UNIQUE KEY uq_survey_round (household_id, round_no),
  KEY ix_survey_status (status),
  KEY ix_survey_enumerator (enumerator_id),
  CONSTRAINT fk_survey_household FOREIGN KEY (household_id) REFERENCES households(id),
  CONSTRAINT fk_survey_enumerator FOREIGN KEY (enumerator_id) REFERENCES users(id),
  CONSTRAINT fk_survey_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per question per survey; denormalised copy of surveys.answers used by reports.
CREATE TABLE survey_answers (
  survey_id    BIGINT UNSIGNED NOT NULL,
  question_id  VARCHAR(20) NOT NULL,
  answer       JSON NOT NULL,
  PRIMARY KEY (survey_id, question_id),
  KEY ix_answers_question (question_id),
  CONSTRAINT fk_answers_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE survey_status_history (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id    BIGINT UNSIGNED NOT NULL,
  from_status  VARCHAR(20) NULL,
  to_status    VARCHAR(20) NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  comment      TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_history_survey (survey_id),
  CONSTRAINT fk_history_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NULL,
  action       VARCHAR(60) NOT NULL,
  entity_type  VARCHAR(40) NULL,
  entity_id    VARCHAR(64) NULL,
  details      JSON NULL,
  ip           VARCHAR(45) NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id),
  KEY ix_audit_user (user_id),
  KEY ix_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
