"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/AppNav";

const DESTINATIONS = [
  { name: "Nigeria", code: "NG", currency: "NGN", flag: "🇳🇬" },
  { name: "United Kingdom", code: "GB", currency: "GBP", flag: "🇬🇧" },
  { name: "Kenya", code: "KE", currency: "KES", flag: "🇰🇪" },
  { name: "Ghana", code: "GH", currency: "GHS", flag: "🇬🇭" },
  { name: "South Africa", code: "ZA", currency: "ZAR", flag: "🇿🇦" },
];

export default function SendMoneyPage() {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [quote, setQuote] = useState<{
    fee: number;
    rate: number;
    received: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const calculateQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setIsCalculating(true);
    try {
      // Simulate FX calculation (in real app would call /api/fx or calculateRemittance)
      const amountNum = parseFloat(amount);
      const fee = amountNum * 0.025;
      const midMarketRate = destination.currency === "NGN" ? 1348.45 : 
                            destination.currency === "GBP" ? 0.79 :
                            destination.currency === "KES" ? 129.50 :
                            destination.currency === "GHS" ? 12.05 : 18.50;
      const fxRate = midMarketRate * 0.988;
      const received = (amountNum - fee) * fxRate;

      setQuote({ fee, rate: fxRate, received });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSend = () => {
    if (!recipientEmail) {
      alert("Please enter recipient email");
      return;
    }
    alert("This would initiate a PayPal payout. In the full implementation, this calls the createPayout agent tool with ApprovalBar.");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />
      <div className="p-8 pt-24">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Send Money</h1>
            <p className="text-gray-600">
              Transfer funds internationally with transparent fees
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>New Transfer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={calculateQuote}
                  className="w-full p-3 border rounded-md text-lg"
                  placeholder="500.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Destination</label>
                <select
                  value={destination.code}
                  onChange={(e) => {
                    const dest = DESTINATIONS.find(d => d.code === e.target.value);
                    if (dest) {
                      setDestination(dest);
                      if (quote) calculateQuote();
                    }
                  }}
                  className="w-full p-3 border rounded-md"
                >
                  {DESTINATIONS.map((dest) => (
                    <option key={dest.code} value={dest.code}>
                      {dest.flag} {dest.name}
                    </option>
                  ))}
                </select>
              </div>

              {quote && (
                <div className="bg-blue-50 p-4 rounded-md space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">You send</span>
                    <span className="font-medium">USD {parseFloat(amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fee (2.5%)</span>
                    <span className="font-medium">USD {quote.fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Exchange rate</span>
                    <span className="font-medium">1 USD = {quote.rate.toFixed(4)} {destination.currency}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">Recipient gets</span>
                    <span className="text-lg font-bold">{destination.currency} {quote.received.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Recipient Email (PayPal)</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full p-3 border rounded-md"
                  placeholder="recipient@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use a PayPal sandbox account email for testing
                </p>
              </div>

              <Button
                onClick={handleSend}
                disabled={!quote || !recipientEmail || isCalculating}
                className="w-full"
              >
                Continue with PayPal
              </Button>

              <p className="text-xs text-gray-500 text-center">
                💡 Tip: You can also use the chat assistant for natural language transfers
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
