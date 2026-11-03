import { TripCard } from "@/components/TripCard";
import { listTrips, type TripRecord } from "@/lib/trips";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  let trips: TripRecord[];
  try {
    trips = await listTrips();
  } catch {
    trips = [];
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Trips</h1>
            <p className="text-gray-600">
              View and manage your flight bookings
            </p>
          </div>
          <Link
            href="/agent"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            New Booking
          </Link>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">✈️</div>
            <h2 className="text-xl font-semibold mb-2">No trips yet</h2>
            <p className="text-gray-600 mb-6">
              Start planning your journey with ClearSend
            </p>
            <Link
              href="/agent"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Search Flights
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
