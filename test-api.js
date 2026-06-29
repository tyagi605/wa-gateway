#!/usr/bin/env node

/**
 * WhatsApp Gateway - API Testing Script
 * 
 * Usage:
 *   node test-api.js
 * 
 * Make sure the gateway is running before running this script!
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

console.log(`\n🧪 WhatsApp Gateway API Test\n`);
console.log(`📍 Base URL: ${API_BASE_URL}`);
console.log(`🔐 API Key: ${API_KEY.substring(0, 8)}...`);

async function makeRequest(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`\n📤 ${method} ${endpoint}`);
    if (body) console.log(`   Payload: ${JSON.stringify(body)}`);

    const response = await fetch(url, options);
    const data = await response.json();

    console.log(`📥 Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data, null, 2)}`);

    return data;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

async function runTests() {
  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 1: Health Check (No Auth Required)');
  console.log('='.repeat(50));

  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log(`📥 Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 2: Get Account Status');
  console.log('='.repeat(50));

  await makeRequest('GET', '/api/v1/account/detail');

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 3: Send Text Message');
  console.log('='.repeat(50));

  await makeRequest('POST', '/api/v1/message/create', {
    receiverMobileNo: '+919999999999',
    message: 'Hello! This is a test message from WhatsApp Gateway 🎉'
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 4: Send to Multiple Numbers');
  console.log('='.repeat(50));

  await makeRequest('POST', '/api/v1/message/create', {
    receiverMobileNo: '+919999999999, +918888888888',
    message: 'Broadcast message to multiple contacts'
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 5: Send Image');
  console.log('='.repeat(50));

  await makeRequest('POST', '/api/v1/message/create', {
    receiverMobileNo: '+919999999999',
    filePathUrl: 'https://via.placeholder.com/300',
    caption: 'This is a test image'
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST 6: Send with Invalid API Key (Should Fail)');
  console.log('='.repeat(50));

  const invalidResponse = await fetch(`${API_BASE_URL}/api/v1/account/detail`, {
    headers: {
      'x-api-key': 'wrong-api-key',
      'Content-Type': 'application/json'
    }
  });
  const invalidData = await invalidResponse.json();
  console.log(`📥 Status: ${invalidResponse.status} (Should be 401)`);
  console.log(`   Response: ${JSON.stringify(invalidData, null, 2)}`);

  console.log(`\n${'='.repeat(50)}`);
  console.log('✅ Tests Complete');
  console.log('='.repeat(50));
  console.log(`\n💡 Tips:`);
  console.log(`   - Replace +919999999999 with your actual test number`);
  console.log(`   - Make sure the gateway is running (npm start)`);
  console.log(`   - Check the /qr endpoint to ensure WhatsApp is connected`);
  console.log(`   - See DEPLOYMENT.md for full API documentation\n`);
}

// Run tests
runTests().catch(console.error);
