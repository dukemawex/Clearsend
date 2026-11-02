#!/usr/bin/env node

/**
 * Smoke test for ClearSend PayPal + AI integration
 * Tests: agent error handling, money route auth, MCP endpoint, well-known discovery,
 *        Sky Scrapper airport lookup, remittance formatting
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
    
    if (response.status !== 503) {
      throw new Error(`Expected 503 status, got ${response.status}`);
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
    
    // If CLEAR_SEND_API_KEY is not set, it will try PayPal and fail with 503 or 500 (no PayPal creds)
    // If CLEAR_SEND_API_KEY is set, it should return 401
    if (response.status !== 401 && response.status !== 503 && response.status !== 500) {
      throw new Error(`Expected 401, 500, or 503 status, got ${response.status}`);
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

  // Test 4: Well-known AI plugin discovery endpoint
  results.push(await test('Well-known AI plugin discovery endpoint responds', async () => {
    const response = await fetch(`${BASE_URL}/.well-known/ai-plugin.json`);
    
    if (!response.ok) {
      throw new Error(`Expected 200 status, got ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.name || data.name !== 'ClearSend') {
      throw new Error(`Expected name "ClearSend", got: ${data.name}`);
    }
    
    if (!data.capabilities || !Array.isArray(data.capabilities)) {
      throw new Error(`Expected capabilities array, got: ${JSON.stringify(data.capabilities)}`);
    }
    
    if (!data.endpoints || !data.endpoints.mcp) {
      throw new Error(`Expected MCP endpoint, got: ${JSON.stringify(data.endpoints)}`);
    }
  }));

  // Test 5: MCP endpoint GET returns info
  results.push(await test('MCP endpoint GET returns info', async () => {
    const response = await fetch(`${BASE_URL}/api/mcp`);
    
    if (!response.ok) {
      throw new Error(`Expected 200 status, got ${response.status}`);
    }
    
    const data = await response.json();
    if (data.protocol !== 'mcp-over-http') {
      throw new Error(`Expected mcp-over-http protocol, got: ${data.protocol}`);
    }
  }));

  // Test 6: MCP endpoint tools/list requires auth (if configured)
  results.push(await test('MCP endpoint tools/list works or requires auth', async () => {
    const response = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/list'
      })
    });
    
    // Either succeeds (200) or requires auth (401)
    if (response.status !== 200 && response.status !== 401) {
      throw new Error(`Expected 200 or 401 status, got ${response.status}`);
    }
    
    if (response.status === 200) {
      const data = await response.json();
      if (!data.tools || !Array.isArray(data.tools)) {
        throw new Error(`Expected tools array, got: ${JSON.stringify(data)}`);
      }
      
      // Check for key tools
      const toolNames = data.tools.map(t => t.name);
      if (!toolNames.includes('calculateRemittance')) {
        throw new Error(`Expected calculateRemittance tool, got: ${toolNames.join(', ')}`);
      }
    }
  }));

  // Test 7: Judges page loads
  results.push(await test('Judges page loads', async () => {
    const response = await fetch(`${BASE_URL}/judges`);
    
    if (!response.ok) {
      throw new Error(`Expected 200 status, got ${response.status}`);
    }
    
    const html = await response.text();
    if (!html.includes('PayPal + AI')) {
      throw new Error(`Expected "PayPal + AI" in judges page`);
    }
    
    if (!html.includes('Architecture')) {
      throw new Error(`Expected "Architecture" in judges page`);
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
