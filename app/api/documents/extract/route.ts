import { NextResponse } from "next/server";
import { extractDocument, DocumentError } from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 60;

// Extracts text from a chat attachment. Nothing is stored; the text is returned to the
// browser, which sends it to the agent fenced as untrusted data.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file in the 'file' field" }, { status: 400 });
    const doc = await extractDocument(file);
    return NextResponse.json(doc);
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("document_extract_error", error);
    return NextResponse.json({ error: "Could not read this document" }, { status: 500 });
  }
}
