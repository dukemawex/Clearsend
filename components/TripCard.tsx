"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import type { TripRecord } from "@/lib/trips";
import Link from "next/link";

type TripCardProps = {
  trip: TripRecord;
};

function getStateBadgeColor(state: TripRecord["state"]): string {
  switch (state) {
    case "draft":
      return "bg-gray-500";
    case "passenger_details_pending":
      return "bg-yellow-500";
    case "payment_pending":
      return "bg-blue-500";
    case "payment_approved":
      return "bg-indigo-500";
    case "ticketing":
      return "bg-purple-500";
    case "confirmed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "refunded":
      return "bg-orange-500";
    default:
      return "bg-gray-400";
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TripCard({ trip }: TripCardProps) {
  return (
    <Link href={`/trips/${trip.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">
                {trip.origin} → {trip.destination}
              </CardTitle>
              <CardDescription>
                {formatDate(trip.departureDate)} • {trip.airline}
              </CardDescription>
            </div>
            <Badge className={`${getStateBadgeColor(trip.state)} text-white`}>
              {trip.state.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Departure</span>
            <span className="font-medium">{trip.departureTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Arrival</span>
            <span className="font-medium">{trip.arrivalTime}</span>
          </div>
          {trip.stops !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Stops</span>
              <span className="font-medium">{trip.stops === 0 ? "Non-stop" : `${trip.stops} stop${trip.stops !== 1 ? "s" : ""}`}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 mt-2">
            <span className="text-gray-600">Total</span>
            <span className="font-bold text-lg">
              {trip.currency} {trip.totalPrice.toFixed(2)}
            </span>
          </div>
          {trip.provider !== "duffel" && trip.state === "confirmed" && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ Test mode booking - no actual ticket issued
            </div>
          )}
          {trip.duffelBookingReference && (
            <div className="text-xs text-gray-500">
              Booking ref: {trip.duffelBookingReference}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
