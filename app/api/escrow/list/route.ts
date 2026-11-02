import { NextResponse } from "next/server";
import { listEscrows } from "@/lib/escrow";

export async function GET() {
  try {
    const escrows = await listEscrows();
    return NextResponse.json(escrows);
  } catch (error) {
    console.error("escrow_list_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list escrows" },
      { status: 500 }
    );
  }
}
