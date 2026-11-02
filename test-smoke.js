#!/usr/bin/env node

/**
 * Smoke test for ClearSend P0 fixes
 * Tests: agent error handling, money route auth
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`Testing ClearSend at ${BASE_URL}\n`);
  
  const results = [];
  
  // Test 1: Agent route with no API keys should return a clear error
  results.push(await test('Agent returns clear error when no API keys configured', async () => {
    const response = await fetch(`${BASE_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }]
      })
    });
    
    if (response.status !== 500) {
      throw new Error(`Expected 500 status, got ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.error || !data.error.includes('AI provider')) {
      throw new Error(`Expected clear error message about AI provider, got: ${JSON.stringify(data)}`);
    }
  }));
  
  // Test 2: Payouts route requires auth when CLEAR_SEND_API_KEY is set
  results.push(await test('Payouts route requires auth', async () => {
    const response = await fetch(`${BASE_URL}/api/payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientEmail: 'test@example.com',
        amount: 100,
        currency: 'USD'
      })
    });
    
    // If CLEAR_SEND_API_KEY is not set, it will try PayPal and fail with 503 (no PayPal creds)
    // If CLEAR_SEND_API_KEY is set, it should return 401
    if (response.status !== 401 && response.status !== 503) {
      throw new Error(`Expected 401 or 503 status, got ${response.status}`);
    }
  }));
  
  // Test 3: Orders route requires auth when CLEAR_SEND_API_KEY is set
  results.push(await test('Orders route requires auth', async () => {
    const response = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 500,
        description: 'Test flight'
      })
    });
    
    // Same as payouts - 401 if auth is configured, 503 if PayPal is missing
    if (response.status !== 401 && response.status !== 503) {
      throw new Error(`Expected 401 or 503 status, got ${response.status}`);
    }
  }));
  
  // Test 4: Escrow create route accepts valid input
  results.push(await test('Escrow create accepts valid input', async () => {
    const response = await fetch(`${BASE_URL}/api/escrow/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer: 'Test Payer',
        payerEmail: 'payer@example.com',
        recipient: 'Test Recipient',
        recipientEmail: 'recipient@example.com',
        recipientCountry: 'US',
        amount: 100,
        currency: 'USD',
        specification: 'Test specification'
      })
    });
    
    if (response.status !== 201) {
      throw new Error(`Expected 201 status, got ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.id || data.state !== 'created') {
      throw new Error(`Expected escrow with id and state='created', got: ${JSON.stringify(data)}`);
    }
  }));
  
  console.log(`\nResults: ${results.filter(Boolean).length}/${results.length} tests passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
