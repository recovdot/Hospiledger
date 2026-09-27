-- Preflight existing evidence before either unique index: report affected rows, never discard photos.
DO $$
DECLARE
  path_conflicts text;
  slot_conflicts text;
BEGIN
  SELECT string_agg(format('storage_path=%L ids=[%s]', storage_path, ids), E'\n')
    INTO path_conflicts
  FROM (
    SELECT storage_path, string_agg(id::text, ', ' ORDER BY id) AS ids
    FROM asset_photos
    GROUP BY storage_path
    HAVING count(*) > 1
  ) AS duplicates;

  SELECT string_agg(format('asset_id=%s type=%s ids=[%s]', asset_id, type, ids), E'\n')
    INTO slot_conflicts
  FROM (
    SELECT asset_id, type, string_agg(id::text, ', ' ORDER BY id) AS ids
    FROM asset_photos
    WHERE type IN ('front', 'side', 'back', 'nameplate')
    GROUP BY asset_id, type
    HAVING count(*) > 1
  ) AS duplicates;

  IF path_conflicts IS NOT NULL OR slot_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'asset_photos uniqueness preflight failed. Duplicate paths:%; Duplicate required slots:%',
      E'\n' || coalesce(path_conflicts, '(none)'),
      E'\n' || coalesce(slot_conflicts, '(none)')
      USING HINT = 'Review conflicting photo IDs and correct explicitly before applying this migration; do not delete evidence automatically.';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "backend_job_kind" AS ENUM('inspection', 'anchor', 'delete_photo');--> statement-breakpoint
CREATE TYPE "backend_job_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "backend_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "backend_job_kind" NOT NULL,
	"target_id" text NOT NULL,
	"status" "backend_job_status" DEFAULT 'pending'::"backend_job_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"prepared_signature" text,
	"blockhash" text,
	"last_valid_block_height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backend_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photo_upload_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"type" "photo_type" NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_upload_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public_rpc_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_rpc_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_inspections" ADD COLUMN "failure_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_photos_storage_path_unique" ON "asset_photos" ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_photos_required_slot_unique" ON "asset_photos" ("asset_id","type") WHERE "type" IN ('front', 'side', 'back', 'nameplate');--> statement-breakpoint
CREATE UNIQUE INDEX "backend_jobs_kind_target_id_unique" ON "backend_jobs" ("kind","target_id");--> statement-breakpoint
CREATE INDEX "backend_jobs_claim_idx" ON "backend_jobs" ("status","run_after","lease_until");--> statement-breakpoint
CREATE INDEX "photo_upload_reservations_asset_id_idx" ON "photo_upload_reservations" ("asset_id");--> statement-breakpoint
CREATE INDEX "photo_upload_reservations_expiry_idx" ON "photo_upload_reservations" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_upload_reservations_storage_path_unique" ON "photo_upload_reservations" ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "public_rpc_budgets_client_window_unique" ON "public_rpc_budgets" ("client_key","window_start");--> statement-breakpoint
CREATE INDEX "public_rpc_budgets_window_start_idx" ON "public_rpc_budgets" ("window_start");--> statement-breakpoint
ALTER TABLE "photo_upload_reservations" ADD CONSTRAINT "photo_upload_reservations_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;