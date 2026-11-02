"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppNav } from "@/components/AppNav";
import type { TripRecord } from "@/lib/trips";
import type { EscrowRecord } from "@/lib/escrow";

export default function DashboardPage() {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/trips/list").then(r => r.json()).catch(() => []),
      fetch("/api/escrow/list").then(r => r.json()).catch(() => [])
    ]).then(([tripsData, escrowsData]) => {
      setTrips(Array.isArray(tripsData) ? tripsData.slice(0, 3) : []);
      setEscrows(Array.isArray(escrowsData) ? escrowsData.slice(0, 3) : []);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />
      <div className="p-8 pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-gray-600">
              Your ClearSend activity and recent transactions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/" className="block p-3 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span>💬</span>
                    <span className="font-medium">Chat with Agent</span>
                  </div>
                </Link>
                <Link href="/send" className="block p-3 bg-green-50 rounded-md hover:bg-green-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span>💸</span>
                    <span className="font-medium">Send Money</span>
                  </div>
                </Link>
                <Link href="/trips" className="block p-3 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span>✈️</span>
                    <span className="font-medium">Book Flight</span>
                  </div>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Trips</CardTitle>
              </CardHeader>
              <CardContent>
                {trips.length === 0 ? (
                  <p className="text-sm text-gray-500">No trips yet</p>
                ) : (
                  <div className="space-y-2">
                    {trips.map((trip) => (
                      <Link key={trip.id} href={`/trips/${trip.id}`} className="block p-2 bg-gray-50 rounded hover:bg-gray-100">
                        <p className="text-sm font-medium">{trip.origin} → {trip.destination}</p>
                        <p className="text-xs text-gray-500">{trip.airline}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Escrows</CardTitle>
              </CardHeader>
              <CardContent>
                {escrows.length === 0 ? (
                  <p className="text-sm text-gray-500">No escrows</p>
                ) : (
                  <div className="space-y-2">
                    {escrows.map((escrow) => (
                      <Link key={escrow.id} href={`/escrow/${escrow.id}`} className="block p-2 bg-gray-50 rounded hover:bg-gray-100">
                        <p className="text-sm font-medium">{escrow.amount} {escrow.currency}</p>
                        <p className="text-xs text-gray-500 capitalize">{escrow.state}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>How ClearSend Works</CardTitle>
            </CardHeader>
            <CardContent className="prose max-w-none">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-3xl mb-2">💬</div>
                  <h3 className="font-semibold mb-2">Chat with AI Agent</h3>
                  <p className="text-sm text-gray-600">
                    Natural language interface for remittances, flights, and escrow. Just describe what you need.
                  </p>
                </div>
                <div>
                  <div className="text-3xl mb-2">🔍</div>
                  <h3 className="font-semibold mb-2">Transparent Pricing</h3>
                  <p className="text-sm text-gray-600">
                    See all fees, FX rates, and breakdowns before you commit. No hidden charges.
                  </p>
                </div>
                <div>
                  <div className="text-3xl mb-2">✅</div>
                  <h3 className="font-semibold mb-2">Human Approval</h3>
                  <p className="text-sm text-gray-600">
                    Every money-moving action requires your explicit approval. Full control at every step.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
