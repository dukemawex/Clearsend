import { NextResponse } from "next/server";
import { getTrip, markPaymentApproved, markTicketing, confirmTrip, failTrip, refundTrip } from "@/lib/trips";
import { createOrder as createPayPalOrder, captureOrder, refundCapture } from "@/lib/paypal";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    if (trip.state !== "payment_pending") {
      return NextResponse.json({ error: `Trip is in ${trip.state} state, expected payment_pending` }, { status: 400 });
    }

    // Step 1: Create PayPal order
    const orderDescription = `Flight from ${trip.origin} to ${trip.destination} on ${trip.departureDate} with ${trip.airline}`;
    const paypalOrder = await createPayPalOrder({
      amount: trip.totalPrice,
      currency: trip.currency,
      description: orderDescription,
    });

    const links = paypalOrder.links as Array<{ rel: string; href: string }> | undefined;
    const approveUrl = links?.find((l) => l.rel === "approve")?.href;

    return NextResponse.json({
      tripId: trip.id,
      orderId: paypalOrder.id,
      status: paypalOrder.status,
      approveUrl,
      amount: trip.totalPrice,
      currency: trip.currency,
    });

  } catch (error) {
    console.error("trips_book_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate booking" },
      { status: 500 }
    );
  }
}

// Capture and complete booking
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { orderId } = body;

    const trip = await getTrip(id);
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Step 2: Capture the PayPal order
    const capture = await captureOrder(orderId);
    const captureId = (capture.purchase_units?.[0]?.payments?.captures?.[0]?.id) as string | undefined;
    
    if (!captureId) {
      throw new Error("No capture ID returned from PayPal");
    }

    // Step 3: Update trip with payment info
    await markPaymentApproved(id, orderId, captureId);
    await markTicketing(id);

    // Step 4: For Duffel provider, create airline order
    if (trip.provider === "duffel" && process.env.DUFFEL_API_KEY) {
      try {
        const duffelOrder = await createDuffelOrder(trip, captureId);
        await confirmTrip(id, duffelOrder.id, duffelOrder.booking_reference, duffelOrder.pnr);
        
        return NextResponse.json({
          success: true,
          tripId: id,
          orderId,
          captureId,
          duffelOrderId: duffelOrder.id,
          bookingReference: duffelOrder.booking_reference,
          pnr: duffelOrder.pnr,
          state: "confirmed",
        });
      } catch (duffelError) {
        console.error("duffel_order_failed", duffelError);
        
        // Auto-refund on Duffel failure
        try {
          const refund = await refundCapture(captureId, undefined, "Airline booking failed");
          const refundId = (refund.id) as string;
          await refundTrip(id, refundId, `Duffel order failed: ${duffelError instanceof Error ? duffelError.message : String(duffelError)}`);
          
          return NextResponse.json({
            success: false,
            tripId: id,
            error: "Airline booking failed. Your payment has been automatically refunded.",
            refunded: true,
            refundId,
          }, { status: 500 });
        } catch (refundError) {
          console.error("auto_refund_failed", refundError);
          await failTrip(id, `Duffel failed and refund failed: ${refundError instanceof Error ? refundError.message : String(refundError)}`);
          
          return NextResponse.json({
            success: false,
            tripId: id,
            error: "Airline booking and refund both failed. Please contact support.",
          }, { status: 500 });
        }
      }
    }

    // For non-Duffel providers or if DUFFEL_API_KEY not set, mark as confirmed (test mode)
    await confirmTrip(id);
    
    return NextResponse.json({
      success: true,
      tripId: id,
      orderId,
      captureId,
      state: "confirmed",
      note: trip.provider !== "duffel" 
        ? "Test mode booking - no actual airline ticket issued"
        : "Duffel API key not configured - test mode booking",
    });

  } catch (error) {
    console.error("trips_capture_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete booking" },
      { status: 500 }
    );
  }
}

async function createDuffelOrder(trip: typeof import("@/lib/trips").TripRecord._type, captureId: string) {
  const key = process.env.DUFFEL_API_KEY;
  if (!key) throw new Error("DUFFEL_API_KEY not configured");

  if (!trip.passenger) throw new Error("Passenger details required");
  if (!trip.providerOfferId) throw new Error("Provider offer ID required for Duffel booking");

  // Map passenger details to Duffel format
  const duffelPassenger = {
    type: "adult" as const,
    title: trip.passenger.title,
    given_name: trip.passenger.firstName,
    family_name: trip.passenger.lastName,
    gender: trip.passenger.gender === "male" ? "m" : "f",
    born_on: trip.passenger.dateOfBirth,
    email: trip.passenger.email,
    phone_number: trip.passenger.phone,
  };

  const requestBody = {
    data: {
      type: "instant",
      selected_offers: [trip.providerOfferId],
      passengers: [duffelPassenger],
      payments: [
        {
          type: "balance",
          amount: trip.totalPrice.toFixed(2),
          currency: trip.currency,
        },
      ],
      metadata: {
        clearsend_trip_id: trip.id,
        paypal_capture_id: captureId,
      },
    },
  };

  const response = await fetch("https://api.duffel.com/air/orders", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Duffel-Version": "v2",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  const body = await response.json();

  if (!response.ok) {
    const errorMsg = body.errors?.[0]?.message || body.message || response.statusText;
    throw new Error(`Duffel order creation failed: ${errorMsg}`);
  }

  return body.data as {
    id: string;
    booking_reference: string;
    pnr?: string;
  };
}
