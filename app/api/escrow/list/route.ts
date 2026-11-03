import { NextResponse } from "next/server";
import { listEscrows } from "@/lib/escrow";

export async function GET() {
  try {
    const escrows = await listEscrows();
    // Public list: never expose uploaded document text, only file metadata.
    return NextResponse.json(escrows.map((e) => ({ ...e, documents: e.documents?.map((d) => ({ ...d, text: undefined })) })));
  } catch (error) {
    console.error("escrow_list_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list escrows" },
      { status: 500 }
    );
  }
}
