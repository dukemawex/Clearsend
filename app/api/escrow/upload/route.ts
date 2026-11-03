import { NextResponse } from "next/server";
import { extractDocument, DocumentError } from "@/lib/documents";
import { attachEscrowDocument, getEscrow, EscrowError } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";

export const runtime = "nodejs";
export const maxDuration = 60;

// Role-authenticated upload. Payer uploads the spec (before delivery), recipient uploads
// the deliverable (while funded). Extracted text is stored in the escrow record in Upstash.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const escrowId = String(form.get("escrowId") ?? "");
    const role = String(form.get("role") ?? "") as EscrowRole;
    const token = String(form.get("token") ?? "");
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");
    if (!escrowId || !(file instanceof File)) return NextResponse.json({ error: "escrowId and file are required" }, { status: 400 });
    if (kind !== "spec" && kind !== "deliverable") return NextResponse.json({ error: "kind must be spec or deliverable" }, { status: 400 });

    const serviceKey = request.headers.get("x-clearsend-api-key");
    const hasServiceKey = !!serviceKey && serviceKey === process.env.CLEAR_SEND_API_KEY;
    if (!hasServiceKey) {
      if (!role || !token) return NextResponse.json({ error: "Missing role or token" }, { status: 401 });
      if (!verifyEscrowToken(escrowId, role, token)) return NextResponse.json({ error: "Invalid token for this role" }, { status: 403 });
      if (kind === "spec" && role !== "payer") return NextResponse.json({ error: "Only the payer can upload the spec" }, { status: 403 });
      if (kind === "deliverable" && role !== "recipient") return NextResponse.json({ error: "Only the recipient can upload the deliverable" }, { status: 403 });
    }

    const escrow = await getEscrow(escrowId);
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    if (kind === "spec" && !["created", "funded"].includes(escrow.state)) return NextResponse.json({ error: `Spec is locked once escrow is ${escrow.state}` }, { status: 409 });
    if (kind === "deliverable" && escrow.state !== "funded") return NextResponse.json({ error: `Deliverable upload needs a funded escrow (now ${escrow.state})` }, { status: 409 });

    const doc = await extractDocument(file);
    const updated = await attachEscrowDocument(escrowId, kind, doc);
    return NextResponse.json({ document: { ...doc, text: undefined, chars: doc.text.length, preview: doc.text.slice(0, 400) }, escrow: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("escrow_upload_error", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
