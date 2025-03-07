# SSE Simplified

A simplified implementation of Server-Sent Events (SSE) for JSON-RPC communication.

## Overview

This repository contains a simplified version of Server-Sent Events (SSE) implementation that maintains core functionality while being easy to understand and use. It provides both client and server implementations for SSE communication using the JSON-RPC 2.0 message format.

## Features

- **Simplified SSE Client**: Connects to an SSE endpoint and handles incoming messages.
- **Simplified SSE Server**: Establishes SSE connections and handles incoming POST requests.
- **JSON-RPC 2.0 Message Format**: All communication follows the JSON-RPC 2.0 specification.
- **Example Implementation**: Demonstrates how to run both the client and server.
- **Test Suite**: Comprehensive test suite for testing various aspects of the SSE implementation.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sse-simplified.git
cd sse-simplified

# Install dependencies
npm install
```

## Usage

### Running the Example

The example demonstrates a simple client-server interaction using SSE:

```bash
npm run dev
```

### Running the Tests

The test suite covers various aspects of the SSE implementation:

```bash
npm run test:sse
```

## API

### Client

```typescript
import { SseClient } from 'sse-simplified';

// Create a client
const client = new SseClient(new URL('http://localhost:3000/sse'));

// Set up event handlers
client.onmessage = (message) => {
  console.log('Received message:', message);
};

client.onerror = (error) => {
  console.error('Error:', error);
};

client.onclose = () => {
  console.log('Connection closed');
};

// Start the client
await client.start();

// Send a message
await client.send({
  jsonrpc: '2.0',
  id: 1,
  method: 'example.method',
  params: { data: 'Hello from client' }
});

// Close the connection
await client.close();
```

### Server

```typescript
import http from 'node:http';
import { URL } from 'node:url';
import { SseServer } from 'sse-simplified';

// Create a server
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  
  // Handle SSE connection request
  if (req.method === 'GET' && url.pathname === '/sse') {
    const sseServer = new SseServer('/message', res);
    
    sseServer.onmessage = async (message) => {
      console.log('Received message:', message);
      
      // Send a response
      await sseServer.send({
        jsonrpc: '2.0',
        id: message.id,
        result: { data: 'Hello from server' }
      });
    };
    
    sseServer.start();
  }
  
  // Handle message POST requests
  if (req.method === 'POST' && url.pathname === '/message' && sessionId) {
    // Handle the message
    sseServer.handlePostMessage(req, res);
  }
});

server.listen(3000);
```

## License

MIT
