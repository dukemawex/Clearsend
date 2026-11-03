import { Suspense } from "react";
import { Room, Skeleton } from "@/components/room/ui";
import ReturnClient from "./ReturnClient";

export default function ReturnPage() {
  return <Room><Suspense fallback={<Skeleton className="h-40" />}><ReturnClient /></Suspense></Room>;
}
