import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentError, extractDocument, sanitizeFilename, type ExtractedDocument } from "@/lib/documents";
import { extractSpec } from "@/lib/spec";
import { rateLimit } from "@/lib/chatbots/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const TextBody = z.object({ name: z.string().min(1).max(120).default("spec.txt"), text: z.string().min(20, "Spec text is too short to extract from").max(20_000) });
const mem = new Map<string, { n: number; w: number }>();

async function allowed(ip: string) {
  try { return await rateLimit(`spec:${ip}`, 8, 60); } catch {
    const w = Math.floor(Date.now() / 60_000); const e = mem.get(ip);
    if (!e || e.w !== w) { mem.set(ip, { n: 1, w }); return true; }
    return ++e.n <= 8;
  }
}

// Extracts a structured escrow spec from an uploaded document (multipart "file") or JSON {name,text}.
// Nothing is stored here; the payer reviews/edits the result and it is saved only when they create the escrow.
export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!(await allowed(ip))) return NextResponse.json({ error: "Too many extraction requests. Wait a minute and retry." }, { status: 429 });
  try {
    let doc: ExtractedDocument;
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file in the 'file' field" }, { status: 400 });
      doc = await extractDocument(file);
    } else {
      const b = TextBody.parse(await request.json());
      doc = { name: sanitizeFilename(b.name), kind: "txt", size: b.text.length, text: b.text, truncated: false, method: "plain-text", uploadedAt: Date.now() };
    }
    if (!doc.text.trim()) return NextResponse.json({ document: doc, spec: null, error: doc.note ?? "No readable text in this document, so no spec could be extracted. Describe the spec in the form instead." }, { status: 422 });
    const { spec, model } = await extractSpec(doc.name, doc.text);
    return NextResponse.json({ document: doc, spec, model });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("spec_extract_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spec extraction failed" }, { status: 502 });
  }
}
