CREATE TYPE "chain_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "damage_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "inspection_status" AS ENUM('processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "passport_status" AS ENUM('draft', 'submitted', 'ai_processing', 'ai_complete', 'pending_review', 'approved', 'published', 'ai_failed');--> statement-breakpoint
CREATE TYPE "photo_type" AS ENUM('front', 'side', 'back', 'nameplate', 'damage');--> statement-breakpoint
CREATE TYPE "review_decision" AS ENUM('accept', 'edit');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('seller', 'buyer', 'inspector', 'admin');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY,
	"company_id" uuid,
	"name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"created_by" uuid,
	"category" varchar(100) NOT NULL,
	"brand" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"serial_number" varchar(100),
	"year" integer,
	"capacity" varchar(100),
	"location" varchar(200),
	"previous_usage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "asset_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"type" "photo_type" NOT NULL,
	"storage_path" text NOT NULL,
	"file_sha256" char(64) NOT NULL,
	"quality_ok" boolean DEFAULT false NOT NULL,
	"quality_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_id" uuid NOT NULL,
	"status" "inspection_status" DEFAULT 'processing'::"inspection_status" NOT NULL,
	"detected_brand" varchar(100),
	"detected_model" varchar(100),
	"confidence" numeric(4,3),
	"ocr_result" jsonb,
	"damage_result" jsonb,
	"damage_severity" "damage_severity",
	"condition_score" integer,
	"grade" varchar(3),
	"value_estimate" numeric(14,2),
	"value_min" numeric(14,2),
	"value_max" numeric(14,2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_inspections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"asset_code" varchar(30) NOT NULL CONSTRAINT "passports_asset_code_unique" UNIQUE,
	"asset_id" uuid NOT NULL,
	"inspection_id" uuid,
	"status" "passport_status" DEFAULT 'draft'::"passport_status" NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passport_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"passport_id" uuid NOT NULL,
	"inspection_id" uuid,
	"version" integer NOT NULL,
	"chain_status" "chain_status" DEFAULT 'pending'::"chain_status" NOT NULL,
	"chain_cluster" varchar(20),
	"tx_signature" text,
	"slot" integer,
	"anchored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passport_records_passport_version_unique" UNIQUE("passport_id","version")
);
--> statement-breakpoint
ALTER TABLE "passport_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seller_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"passport_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "review_decision" NOT NULL,
	"edits" jsonb,
	"notes" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "asset_code_counters" (
	"year" integer PRIMARY KEY,
	"last_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_code_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "profiles_company_id_idx" ON "profiles" ("company_id");--> statement-breakpoint
CREATE INDEX "assets_company_id_idx" ON "assets" ("company_id");--> statement-breakpoint
CREATE INDEX "asset_photos_asset_id_idx" ON "asset_photos" ("asset_id");--> statement-breakpoint
CREATE INDEX "ai_inspections_asset_id_idx" ON "ai_inspections" ("asset_id");--> statement-breakpoint
CREATE INDEX "passports_asset_id_idx" ON "passports" ("asset_id");--> statement-breakpoint
CREATE INDEX "passport_records_passport_id_idx" ON "passport_records" ("passport_id");--> statement-breakpoint
CREATE INDEX "seller_reviews_passport_id_idx" ON "seller_reviews" ("passport_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_profiles_id_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_inspections" ADD CONSTRAINT "ai_inspections_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_inspection_id_ai_inspections_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "ai_inspections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "passport_records" ADD CONSTRAINT "passport_records_passport_id_passports_id_fkey" FOREIGN KEY ("passport_id") REFERENCES "passports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passport_records" ADD CONSTRAINT "passport_records_inspection_id_ai_inspections_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "ai_inspections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_passport_id_passports_id_fkey" FOREIGN KEY ("passport_id") REFERENCES "passports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_reviewer_id_profiles_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "profiles"("id") ON DELETE SET NULL;