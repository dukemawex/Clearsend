"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import type { PassengerDetails } from "@/lib/trips";

type PassengerDetailsFormProps = {
  onSubmit: (details: PassengerDetails) => void;
  isSubmitting?: boolean;
};

export function PassengerDetailsForm({ onSubmit, isSubmitting }: PassengerDetailsFormProps) {
  const [formData, setFormData] = useState<Partial<PassengerDetails>>({
    title: "mr",
    gender: "male",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const newErrors: Record<string, string> = {};
    if (!formData.firstName) newErrors.firstName = "First name is required";
    if (!formData.lastName) newErrors.lastName = "Last name is required";
    if (!formData.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.phone) newErrors.phone = "Phone number is required";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(formData as PassengerDetails);
  };

  const updateField = (field: keyof PassengerDetails, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: "" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passenger Details</CardTitle>
        <CardDescription>
          Enter details exactly as they appear on the traveler&apos;s passport
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                Title
              </label>
              <select
                id="title"
                value={formData.title || "mr"}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="mr">Mr</option>
                <option value="ms">Ms</option>
                <option value="mrs">Mrs</option>
                <option value="dr">Dr</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="gender" className="block text-sm font-medium mb-1">
                Gender
              </label>
              <select
                id="gender"
                value={formData.gender || "male"}
                onChange={(e) => updateField("gender", e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium mb-1">
                First Name *
              </label>
              <input
                id="firstName"
                type="text"
                value={formData.firstName || ""}
                onChange={(e) => updateField("firstName", e.target.value)}
                className={`w-full p-2 border rounded-md ${errors.firstName ? "border-red-500" : ""}`}
                placeholder="As on passport"
              />
              {errors.firstName && (
                <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium mb-1">
                Last Name *
              </label>
              <input
                id="lastName"
                type="text"
                value={formData.lastName || ""}
                onChange={(e) => updateField("lastName", e.target.value)}
                className={`w-full p-2 border rounded-md ${errors.lastName ? "border-red-500" : ""}`}
                placeholder="As on passport"
              />
              {errors.lastName && (
                <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-medium mb-1">
              Date of Birth *
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth || ""}
              onChange={(e) => updateField("dateOfBirth", e.target.value)}
              className={`w-full p-2 border rounded-md ${errors.dateOfBirth ? "border-red-500" : ""}`}
            />
            {errors.dateOfBirth && (
              <p className="text-sm text-red-600 mt-1">{errors.dateOfBirth}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={formData.email || ""}
              onChange={(e) => updateField("email", e.target.value)}
              className={`w-full p-2 border rounded-md ${errors.email ? "border-red-500" : ""}`}
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Phone *
            </label>
            <input
              id="phone"
              type="tel"
              value={formData.phone || ""}
              onChange={(e) => updateField("phone", e.target.value)}
              className={`w-full p-2 border rounded-md ${errors.phone ? "border-red-500" : ""}`}
              placeholder="+1234567890"
            />
            {errors.phone && (
              <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Continue to Payment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
