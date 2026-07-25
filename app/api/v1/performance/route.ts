import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// 1. Core Biometric and Performance Ingestion Baselines
const biometricsSchema = z.object({
  weight_kg: z.number().positive().max(200),
  height_cm: z.number().positive().max(250),
  wing_span_cm: z.number().positive().max(250).nullable(),
});

const baselineTelemetrySchema = z.object({
  top_speed_kmh: z.number().nonnegative().max(60),
  acceleration_0_10m_secs: z.number().nonnegative().max(10),
  vertical_jump_cm: z.number().nonnegative().max(150),
  reactive_strength_index: z.number().nonnegative().max(5),
});

// 2. The 5 Universal Taxonomy Pillars (Landing Page Component Safe)
const universalTaxonomyEngineSchema = z.object({
  speed: baselineTelemetrySchema.extend({
    raw_data_timeline: z.array(z.number()).optional(),
  }).catchall(z.any()), // Catchall safely passes custom sport telemetry parameters
  
  agility: z.object({
    pivot_mechanics_score: z.number().min(0).max(100),
    velocity_loss_pct: z.number().min(0).max(100),
  }).catchall(z.any()),
  
  stamina: z.object({
    training_volume_index: z.number().nonnegative(),
    consistency_rating_pct: z.number().min(0).max(100),
  }).catchall(z.any()),
  
  technical_skill: z.object({
    execution_accuracy_pct: z.number().min(0).max(100),
    tool_handling_proficiency: z.number().min(0).max(100),
  }).catchall(z.any()), // Dynamic anchor slot for custom hockey, basketball, or rugby metrics
  
  cognitive_tactical_intelligence: z.object({
    game_iq_score: z.number().min(0).max(100),
    avatar_exam_score: z.number().min(0).max(100),
  }).catchall(z.any()),
});

// 3. Absolute Envelope Payload Container Validation
const globalPerformanceLogSchema = z.object({
  athlete_id: z.string().uuid(),
  taxonomy_node: z.string().min(3),
  recorded_at: z.string().datetime(),
  venue_trust_layer: z.boolean().default(false),
  metrics: z.object({
    sport: z.string().min(2), // Matches 'basketball', 'padel', 'rugby' dynamically
    composite_performance_score: z.number().min(0).max(100),
    universal_taxonomy: universalTaxonomyEngineSchema,
  }),
});

// 4. Ingestion Pipeline Gateway Entry point
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    // Ingest validation filter execution
    const validatedData = globalPerformanceLogSchema.parse(rawBody);
    
    // The architecture is now verified safe to be transmitted directly to Supabase storage tables
    return NextResponse.json({
      status: "INGESTION_SUCCESSFUL",
      sport: validatedData.metrics.sport,
      score: validatedData.metrics.composite_performance_score,
      message: "Data successfully passed universal taxonomy structural rules."
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        status: "INPUT_REJECTED",
        error: "Payload configuration violates the Universal Taxonomy matrix structure.",
        details: error.flatten().fieldErrors,
      }, { status: 400 });
    }
    return NextResponse.json({ status: "SERVER_ERROR", error: "Fatal ingestion breakdown." }, { status: 500 });
  }
}