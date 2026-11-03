import { NextResponse } from "next/server";
import { listEscrows } from "@/lib/escrow";
import { ownerFromRequest } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** Lists only the calling browser's escrows (cs_uid cookie) plus ones shared with it via a role link. */
export async function GET(request: Request) {
  try {
    const escrows = await listEscrows(ownerFromRequest(request));
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
