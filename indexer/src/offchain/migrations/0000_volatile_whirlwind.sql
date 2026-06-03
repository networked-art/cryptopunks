CREATE SCHEMA IF NOT EXISTS "offchain";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offchain"."ens_profile" (
	"address" text PRIMARY KEY NOT NULL,
	"ens" text,
	"data" json,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offchain"."prediction_backtests" (
	"run_id" text NOT NULL,
	"name" text NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_backtests_run_id_name_pk" PRIMARY KEY("run_id","name")
);
--> statement-breakpoint
CREATE TABLE "offchain"."prediction_market_context" (
	"run_id" text PRIMARY KEY NOT NULL,
	"v2_floor_wei" numeric(78, 0),
	"v1_floor_wei" numeric(78, 0),
	"v2_bid_floor_wei" numeric(78, 0),
	"v1_bid_floor_wei" numeric(78, 0),
	"v2_listed_count" integer NOT NULL,
	"v1_listed_count" integer NOT NULL,
	"v2_active_bid_count" integer NOT NULL,
	"v1_active_bid_count" integer NOT NULL,
	"recent_v2_sales_count" integer NOT NULL,
	"recent_v1_sales_count" integer NOT NULL,
	"v1_v2_multiplier" numeric(12, 6) NOT NULL,
	"context_json" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offchain"."prediction_model_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"trained_at" timestamp with time zone NOT NULL,
	"data_cutoff" timestamp with time zone NOT NULL,
	"training_started_at" timestamp with time zone NOT NULL,
	"training_finished_at" timestamp with time zone NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_model_runs_status_check" CHECK ("offchain"."prediction_model_runs"."status" in ('active', 'superseded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "offchain"."punk_predictions" (
	"run_id" text NOT NULL,
	"standard" text NOT NULL,
	"punk_id" integer NOT NULL,
	"quick_sale_wei" numeric(78, 0) NOT NULL,
	"fair_value_wei" numeric(78, 0) NOT NULL,
	"p10_sale_wei" numeric(78, 0) NOT NULL,
	"p50_sale_wei" numeric(78, 0) NOT NULL,
	"p90_sale_wei" numeric(78, 0) NOT NULL,
	"sale_probability_24h" numeric(8, 6) NOT NULL,
	"confidence" text NOT NULL,
	"drivers_json" jsonb NOT NULL,
	"comps_json" jsonb NOT NULL,
	"trait_premiums_json" jsonb NOT NULL,
	"market_context_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "punk_predictions_run_id_standard_punk_id_pk" PRIMARY KEY("run_id","standard","punk_id"),
	CONSTRAINT "punk_predictions_standard_check" CHECK ("offchain"."punk_predictions"."standard" in ('v1', 'v2')),
	CONSTRAINT "punk_predictions_punk_id_check" CHECK ("offchain"."punk_predictions"."punk_id" >= 0 and "offchain"."punk_predictions"."punk_id" < 10000),
	CONSTRAINT "punk_predictions_confidence_check" CHECK ("offchain"."punk_predictions"."confidence" in ('low', 'medium', 'high')),
	CONSTRAINT "punk_predictions_probability_check" CHECK ("offchain"."punk_predictions"."sale_probability_24h" >= 0 and "offchain"."punk_predictions"."sale_probability_24h" <= 1),
	CONSTRAINT "punk_predictions_quantile_order_check" CHECK ("offchain"."punk_predictions"."p10_sale_wei" <= "offchain"."punk_predictions"."p50_sale_wei" and "offchain"."punk_predictions"."p50_sale_wei" <= "offchain"."punk_predictions"."p90_sale_wei")
);
--> statement-breakpoint
ALTER TABLE "offchain"."prediction_backtests" ADD CONSTRAINT "prediction_backtests_run_id_prediction_model_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "offchain"."prediction_model_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offchain"."prediction_market_context" ADD CONSTRAINT "prediction_market_context_run_id_prediction_model_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "offchain"."prediction_model_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offchain"."punk_predictions" ADD CONSTRAINT "punk_predictions_run_id_prediction_model_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "offchain"."prediction_model_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_model_runs_active_idx" ON "offchain"."prediction_model_runs" USING btree ("active");--> statement-breakpoint
CREATE INDEX "prediction_model_runs_trained_at_idx" ON "offchain"."prediction_model_runs" USING btree ("trained_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_model_runs_active_unique" ON "offchain"."prediction_model_runs" USING btree ("active") WHERE "offchain"."prediction_model_runs"."active" = true;--> statement-breakpoint
CREATE INDEX "punk_predictions_standard_punk_idx" ON "offchain"."punk_predictions" USING btree ("standard","punk_id");
