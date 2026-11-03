"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { TripRecord, PassengerDetails } from "@/lib/trips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PassengerDetailsForm } from "@/components/PassengerDetailsForm";

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingStep, setBookingStep] = useState<"details" | "payment" | "complete">("details");

  useEffect(() => {
    loadTrip();
  }, [id]);

  const loadTrip = async () => {
    try {
      const res = await fetch(`/api/trips/${id}`);
      if (!res.ok) throw new Error("Failed to load trip");
      const data = await res.json();
      setTrip(data);
      
      // Determine booking step based on state
      if (data.state === "confirmed" || data.state === "refunded" || data.state === "failed") {
        setBookingStep("complete");
      } else if (data.state === "payment_pending" || data.state === "payment_approved" || data.state === "ticketing") {
        setBookingStep("payment");
      }
      
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handlePassengerSubmit = async (passenger: PassengerDetails) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/trips/${id}/passenger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passenger),
      });
      
      if (!res.ok) throw new Error("Failed to save passenger details");
      
      const updatedTrip = await res.json();
      setTrip(updatedTrip);
      setBookingStep("payment");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save passenger details");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitiatePayment = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/trips/${id}/book`, {
        method: "POST",
      });
      
      if (!res.ok) throw new Error("Failed to create payment");
      
      const data = await res.json();
      
      if (data.approveUrl) {
        // Redirect to PayPal for approval
        window.location.href = data.approveUrl;
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to initiate payment");
      setIsProcessing(false);
    }
  };

  // Capture happens on /paypal/return, where the payer types CAPTURE.

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading trip...</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-red-600">Error: {error || "Trip not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-gray-600">{trip.airline} • {trip.departureDate}</p>
        </div>

        {/* Booking Stepper */}
        <div className="mb-8 flex items-center justify-between">
          <div className={`flex-1 text-center ${bookingStep === "details" ? "font-bold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${bookingStep === "details" ? "bg-blue-600 text-white" : "bg-gray-300"}`}>
              1
            </div>
            <span className="text-sm">Traveller Details</span>
          </div>
          <div className="flex-1 border-t border-gray-300" />
          <div className={`flex-1 text-center ${bookingStep === "payment" ? "font-bold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${bookingStep === "payment" ? "bg-blue-600 text-white" : "bg-gray-300"}`}>
              2
            </div>
            <span className="text-sm">Payment</span>
          </div>
          <div className="flex-1 border-t border-gray-300" />
          <div className={`flex-1 text-center ${bookingStep === "complete" ? "font-bold" : "text-gray-400"}`}>
            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${bookingStep === "complete" ? "bg-green-600 text-white" : "bg-gray-300"}`}>
              ✓
            </div>
            <span className="text-sm">Confirmed</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {bookingStep === "details" && (
              <PassengerDetailsForm onSubmit={handlePassengerSubmit} isSubmitting={isProcessing} />
            )}

            {bookingStep === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-md">
                    <p className="text-sm text-blue-900">
                      You will be redirected to PayPal to complete your payment securely.
                    </p>
                  </div>
                  <Button 
                    onClick={handleInitiatePayment} 
                    className="w-full" 
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Pay with PayPal"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {bookingStep === "complete" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    Booking Confirmed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {trip.state === "confirmed" && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                      <p className="text-sm text-blue-900">
                        <strong>Test booking via Duffel sandbox</strong><br />
                        No real airline ticket has been issued. Duffel&apos;s sandbox only sells sample flights, so the booked test flight is {trip.duffelTestAirline ?? "Duffel Airways"}{trip.duffelTestAmount ? ` (${trip.duffelTestAmount})` : ""}. The price you paid is the {trip.priceLabel ?? "provider fare"}.
                      </p>
                    </div>
                  )}
                  {trip.duffelOrderId && (
                    <div>
                      <p className="text-sm text-gray-600">Duffel test order</p>
                      <p className="text-sm font-mono">{trip.duffelOrderId}</p>
                    </div>
                  )}
                  
                  {trip.duffelBookingReference && (
                    <div>
                      <p className="text-sm text-gray-600">Booking Reference</p>
                      <p className="text-xl font-mono font-bold">{trip.duffelBookingReference}</p>
                    </div>
                  )}
                  
                  {trip.paypalCaptureId && (
                    <div>
                      <p className="text-sm text-gray-600">PayPal Transaction ID</p>
                      <p className="text-sm font-mono">{trip.paypalCaptureId}</p>
                    </div>
                  )}
                  
                  {(trip.state === "refunded" || trip.state === "failed") && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                      <p className="text-sm text-red-900">
                        <strong>{trip.state === "refunded" ? "Booking failed, payment refunded" : "Booking failed"}</strong><br />
                        {trip.refundReason}{trip.refundId && <> · PayPal refund <code>{trip.refundId}</code></>}
                      </p>
                    </div>
                  )}
                  
                  <Button onClick={() => window.print()} variant="secondary" className="w-full">
                    Print Itinerary
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How this trip was made</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ol className="space-y-2">
                  <li>1. <b>Search</b>: {trip.priceLabel ?? trip.provider}{trip.kernelEvidence && <> · <a className="text-blue-700 underline" href={trip.kernelEvidence.searchUrl} target="_blank" rel="noreferrer">Google Flights</a>{trip.kernelEvidence.replayUrl && <> · <a className="text-blue-700 underline" href={trip.kernelEvidence.replayUrl} target="_blank" rel="noreferrer">Kernel replay</a></>}</>}</li>
                  <li>2. <b>Pick</b>: {trip.airline}, {trip.currency} {trip.basePrice.toFixed(2)}</li>
                  <li>3. <b>Fund</b>: {trip.paypalCaptureId ? <>PayPal sandbox capture <code>{trip.paypalCaptureId}</code></> : trip.paypalOrderId ? <>PayPal order <code>{trip.paypalOrderId}</code> awaiting approval</> : "not yet paid"}</li>
                  <li>4. <b>Booking ref</b>: {trip.duffelBookingReference ? <><code>{trip.duffelBookingReference}</code> (Test booking via Duffel sandbox)</> : trip.bookingError ?? "pending"}</li>
                  <li>5. <b>Receipt</b>: {(trip.receipts ?? []).length ? (trip.receipts ?? []).map((r) => <a key={r.id} className="mr-2 text-blue-700 underline" href={`/receipt/${r.id}`}>{r.number}</a>) : "issued after payment"}</li>
                </ol>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Flight Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Airline</p>
                  <p className="font-medium">{trip.airline}</p>
                </div>
                <div>
                  <p className="text-gray-600">Route</p>
                  <p className="font-medium">{trip.origin} → {trip.destination}</p>
                </div>
                <div>
                  <p className="text-gray-600">Date</p>
                  <p className="font-medium">{trip.departureDate}</p>
                </div>
                <div>
                  <p className="text-gray-600">Departure</p>
                  <p className="font-medium">{trip.departureTime}</p>
                </div>
                <div>
                  <p className="text-gray-600">Arrival</p>
                  <p className="font-medium">{trip.arrivalTime}</p>
                </div>
                {trip.duration && (
                  <div>
                    <p className="text-gray-600">Duration</p>
                    <p className="font-medium">{trip.duration}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-600">Stops</p>
                  <p className="font-medium">
                    {trip.stops === 0 ? "Non-stop" : `${trip.stops} stop${trip.stops !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Price Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{trip.priceLabel ?? "Base Fare"}</span>
                  <span>{trip.currency} {trip.basePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Service Fee (3%)</span>
                  <span>{trip.currency} {trip.serviceFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span>{trip.currency} {trip.totalPrice.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {trip.passenger && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Passenger</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <p className="text-gray-600">Name</p>
                    <p className="font-medium">
                      {trip.passenger.title}. {trip.passenger.firstName} {trip.passenger.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Date of Birth</p>
                    <p className="font-medium">{trip.passenger.dateOfBirth}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium">{trip.passenger.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Phone</p>
                    <p className="font-medium">{trip.passenger.phone}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={`${trip.state === "confirmed" ? "bg-green-600" : trip.state === "failed" || trip.state === "refunded" ? "bg-red-600" : "bg-blue-600"} text-white`}>
                  {trip.state.replace(/_/g, " ")}
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
