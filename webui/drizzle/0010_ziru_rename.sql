-- Rename legacy "knowhere" database identifiers to Ziru names.
-- Conditional statements keep this safe for both migration-only and
-- db:push-provisioned databases (some objects were created by db:push
-- and do not exist in migration-only databases).

DO $$
BEGIN
  IF to_regclass('public.knowhere_api_keys') IS NOT NULL THEN
    ALTER TABLE "knowhere_api_keys" RENAME TO "ziru_api_keys";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'knowhere_api_keys_user_id_idx') THEN
    ALTER INDEX "knowhere_api_keys_user_id_idx" RENAME TO "ziru_api_keys_user_id_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'knowhere_api_keys_user_label_idx') THEN
    ALTER INDEX "knowhere_api_keys_user_label_idx" RENAME TO "ziru_api_keys_user_label_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'workspaces'
               AND column_name = 'active_knowhere_api_key_id') THEN
    ALTER TABLE "workspaces" RENAME COLUMN "active_knowhere_api_key_id" TO "active_ziru_api_key_id";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sources'
               AND column_name = 'knowhere_job_id') THEN
    ALTER TABLE "sources" RENAME COLUMN "knowhere_job_id" TO "ziru_job_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sources'
               AND column_name = 'knowhere_document_id') THEN
    ALTER TABLE "sources" RENAME COLUMN "knowhere_document_id" TO "ziru_document_id";
  END IF;
END $$;
