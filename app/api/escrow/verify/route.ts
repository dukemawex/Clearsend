import { NextRequest, NextResponse } from "next/server";
import { verifyDeliverable, getEscrow } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const VerifyDeliverableSchema = z.object({
  escrowId: z.string(),
  role: z.string().optional(),
  token: z.string().optional(),
});

const EvaluationResultSchema = z.object({
  met: z.boolean(),
  reasons: z.string(),
  criteriaResults: z.array(z.object({
    criterion: z.string(),
    met: z.boolean(),
    reason: z.string(),
  })).optional(),
});

function getEvaluationModel() {
  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAI({ 
      apiKey: process.env.NVIDIA_API_KEY, 
      baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1" 
    });
    return nvidia.chat(process.env.NVIDIA_MODEL ?? "meta/llama-3.1-405b-instruct");
  }
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({ 
      apiKey: process.env.OPENROUTER_API_KEY, 
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1" 
    });
    return openrouter.chat(process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct:free");
  }
  throw new Error("No AI provider configured for evaluation");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, role, token } = VerifyDeliverableSchema.parse(body);
    
    const serviceKey = request.headers.get("x-clearsend-api-key");
    const hasValidServiceKey = serviceKey && serviceKey === process.env.CLEAR_SEND_API_KEY;
    
    if (!hasValidServiceKey) {
      if (!role || !token) {
        return NextResponse.json({ error: "Missing role or token" }, { status: 401 });
      }
      
      if (!verifyEscrowToken(escrowId, role as EscrowRole, token)) {
        return NextResponse.json({ error: "Invalid token for this role" }, { status: 403 });
      }
    }
    
    const escrow = await getEscrow(escrowId);
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    if (escrow.state !== "submitted") {
      return NextResponse.json({ error: `Escrow is ${escrow.state}, expected 'submitted'` }, { status: 400 });
    }
    
    if (!escrow.deliverable) {
      return NextResponse.json({ error: "No deliverable found" }, { status: 400 });
    }
    
    const model = getEvaluationModel();
    
    const prompt = `You are evaluating whether a deliverable meets the specified acceptance criteria for an escrow release.

Specification: ${escrow.specification}

${escrow.acceptanceCriteria && escrow.acceptanceCriteria.length > 0 ? `Acceptance Criteria:\n${escrow.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : ""}

Deliverable Submitted: ${escrow.deliverable}

Evaluate whether the deliverable meets the specification and all acceptance criteria. Be objective and fair. If criteria are clearly met, approve. If they are not met or if critical information is missing, reject with clear reasons.`;
    
    const result = await generateObject({
      model,
      schema: EvaluationResultSchema,
      prompt,
    });
    
    const evaluationResult = {
      ...result.object,
      evaluatedAt: Date.now(),
    };
    
    const updated = await verifyDeliverable(escrowId, evaluationResult);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_verify_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to verify deliverable" }, { status: 500 });
  }
}
