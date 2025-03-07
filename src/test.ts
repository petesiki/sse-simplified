import { SseClient } from './client-sse.js';
import { SseServer } from './server-sse.js';
import { JSONRPCMessage } from './types.js';
import http from 'node:http';
import { URL } from 'node:url';

// Test utilities
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

// Create JSON-RPC request
const createRequest = (id: number, method: string, params?: any): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  method,
  params
});

// Create JSON-RPC response
const createResponse = (id: number, result: any): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  result
});

// Create JSON-RPC error
const createError = (id: number, code: number, message: string): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message
  }
});

// Create JSON-RPC notification (no response expected)
const createNotification = (method: string, params?: any): JSONRPCMessage => ({
  jsonrpc: "2.0",
  method,
  params
});

// Server setup
async function setupServer() {
  const connections = new Map<string, SseServer>();
  const messageLog: { sessionId: string, message: JSONRPCMessage, timestamp: Date }[] = [];
  
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    // Handle SSE connection request
    if (req.method === 'GET' && url.pathname === '/sse') {
      log('New SSE connection request');
      
      const sseServer = new SseServer('/message', res);
      
      sseServer.onmessage = async (message: JSONRPCMessage) => {
        log(`Server received message from ${sseServer.sessionId}: ${JSON.stringify(message)}`);
        messageLog.push({ 
          sessionId: sseServer.sessionId, 
          message, 
          timestamp: new Date() 
        });
        
        // Handle different message types
        if ('method' in message) {
          switch (message.method) {
            case 'echo':
              // Echo the params back as a result
              if ('id' in message && message.id !== undefined) {
                await sseServer.send(createResponse(
                  Number(message.id), 
                  message.params
                ));
              }
              break;
              
            case 'error':
              // Return an error response
              if ('id' in message && message.id !== undefined) {
                await sseServer.send(createError(
                  Number(message.id),
                  -32000,
                  'Test error response'
                ));
              }
              break;
              
            case 'broadcast':
              // Broadcast to all clients
              if (message.params && typeof message.params === 'object' && 'message' in message.params) {
                const notification = createNotification(
                  'broadcast', 
                  { message: message.params.message }
                );
                
                // Send to all clients
                for (const [, connection] of connections) {
                  await connection.send(notification);
                }
                
                // Send success response to requester
                if ('id' in message && message.id !== undefined) {
                  await sseServer.send(createResponse(
                    Number(message.id),
                    { success: true, recipients: connections.size }
                  ));
                }
              }
              break;
              
            case 'delay':
              // Delay response to test timeouts
              if ('id' in message && message.id !== undefined && message.params) {
                const delayMs = typeof message.params === 'object' && 'ms' in message.params 
                  ? Number(message.params.ms) 
                  : 1000;
                
                // Simulate processing delay
                await delay(delayMs);
                
                await sseServer.send(createResponse(
                  Number(message.id),
                  { delayed: true, ms: delayMs }
                ));
              }
              break;
              
            default:
              // Unknown method
              if ('id' in message && message.id !== undefined) {
                await sseServer.send(createError(
                  Number(message.id),
                  -32601,
                  `Method not found: ${message.method}`
                ));
              }
          }
        }
      };
      
      sseServer.onclose = () => {
        log(`Connection ${sseServer.sessionId} closed`);
        connections.delete(sseServer.sessionId);
      };
      
      sseServer.onerror = (error) => {
        log(`Error on connection ${sseServer.sessionId}: ${error.message}`);
      };
      
      sseServer.start()
        .then(() => {
          log(`SSE connection established with sessionId: ${sseServer.sessionId}`);
          connections.set(sseServer.sessionId, sseServer);
        })
        .catch((error) => {
          log(`Error establishing SSE connection: ${error}`);
          res.writeHead(500).end('Internal Server Error');
        });
      
      return;
    }
    
    // Handle message POST requests
    if (req.method === 'POST' && url.pathname === '/message' && sessionId) {
      log(`Received POST message for session ${sessionId}`);
      
      const connection = connections.get(sessionId);
      if (!connection) {
        res.writeHead(404).end('Session not found');
        return;
      }
      
      connection.handlePostMessage(req, res).catch((error) => {
        log(`Error handling POST message: ${error}`);
      });
      
      return;
    }
    
    // Handle message log request
    if (req.method === 'GET' && url.pathname === '/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(messageLog));
      return;
    }
    
    // Handle active connections request
    if (req.method === 'GET' && url.pathname === '/connections') {
      const activeConnections = Array.from(connections.keys());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: activeConnections.length,
        connections: activeConnections
      }));
      return;
    }
    
    // Handle other requests
    res.writeHead(404).end('Not Found');
  });
  
  const PORT = 3000;
  server.listen(PORT, () => {
    log(`Test server listening on http://localhost:${PORT}`);
    log(`SSE endpoint: http://localhost:${PORT}/sse`);
    log(`Message logs: http://localhost:${PORT}/logs`);
    log(`Active connections: http://localhost:${PORT}/connections`);
  });
  
  return server;
}

// Client setup with message tracking
async function createTestClient(name: string = 'client') {
  const serverUrl = new URL('http://localhost:3000/sse');
  const client = new SseClient(serverUrl);
  
  const messageLog: { type: 'sent' | 'received', message: JSONRPCMessage, timestamp: Date }[] = [];
  
  client.onmessage = (message: JSONRPCMessage) => {
    log(`${name} received message: ${JSON.stringify(message)}`);
    messageLog.push({ type: 'received', message, timestamp: new Date() });
  };
  
  client.onerror = (error: Error) => {
    log(`${name} error: ${error.message}`);
  };
  
  client.onclose = () => {
    log(`${name} connection closed`);
  };
  
  // Wrap the send method to log messages
  const originalSend = client.send.bind(client);
  client.send = async (message: JSONRPCMessage) => {
    messageLog.push({ type: 'sent', message, timestamp: new Date() });
    return originalSend(message);
  };
  
  // Start the client
  await client.start();
  log(`${name} connected`);
  
  return {
    client,
    messageLog,
    // Helper methods for common operations
    echo: async (data: any) => {
      const id = Date.now();
      await client.send(createRequest(id, 'echo', data));
      return id;
    },
    triggerError: async () => {
      const id = Date.now();
      await client.send(createRequest(id, 'error'));
      return id;
    },
    broadcast: async (message: string) => {
      const id = Date.now();
      await client.send(createRequest(id, 'broadcast', { message }));
      return id;
    },
    delayedResponse: async (ms: number) => {
      const id = Date.now();
      await client.send(createRequest(id, 'delay', { ms }));
      return id;
    },
    unknownMethod: async () => {
      const id = Date.now();
      await client.send(createRequest(id, 'unknown_method'));
      return id;
    },
    sendNotification: async (method: string, params?: any) => {
      await client.send(createNotification(method, params));
    },
    close: async () => {
      await client.close();
    }
  };
}

// Test scenarios
async function runTests() {
  try {
    // Start the server
    const server = await setupServer();
    
    // Wait for server to start
    await delay(1000);
    
    log('=== Starting Test Scenarios ===');
    
    // Test 1: Basic echo test
    log('Test 1: Basic echo test');
    const client1 = await createTestClient('client1');
    const echoId = await client1.echo({ text: 'Hello, world!' });
    log(`Sent echo request with id: ${echoId}`);
    await delay(500);
    
    // Test 2: Error handling
    log('Test 2: Error handling');
    const errorId = await client1.triggerError();
    log(`Sent error request with id: ${errorId}`);
    await delay(500);
    
    // Test 3: Multiple clients and broadcasting
    log('Test 3: Multiple clients and broadcasting');
    const client2 = await createTestClient('client2');
    const client3 = await createTestClient('client3');
    await delay(500);
    
    const broadcastId = await client1.broadcast('Hello to all clients!');
    log(`Sent broadcast with id: ${broadcastId}`);
    await delay(1000);
    
    // Test 4: Delayed response
    log('Test 4: Delayed response');
    const delayId = await client2.delayedResponse(2000);
    log(`Sent delayed request with id: ${delayId}`);
    log('Waiting for delayed response (2 seconds)...');
    await delay(3000);
    
    // Test 5: Unknown method
    log('Test 5: Unknown method');
    const unknownId = await client3.unknownMethod();
    log(`Sent unknown method request with id: ${unknownId}`);
    await delay(500);
    
    // Test 6: Notifications (no response expected)
    log('Test 6: Notifications');
    await client1.sendNotification('ping', { timestamp: Date.now() });
    log('Sent notification (no response expected)');
    await delay(500);
    
    // Test 7: Connection closing
    log('Test 7: Connection closing');
    await client2.close();
    log('Closed client2 connection');
    await delay(500);
    
    // Test 8: Rapid message sending
    log('Test 8: Rapid message sending');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(client3.echo({ sequence: i, timestamp: Date.now() }));
      // Small delay to ensure messages don't get batched by the OS
      await delay(50);
    }
    await Promise.all(promises);
    log('Sent 5 rapid messages');
    await delay(1000);
    
    // Clean up
    await client1.close();
    await client3.close();
    server.close();
    
    log('=== Tests Completed ===');
    
  } catch (error) {
    log(`Test error: ${error}`);
  }
}

// Run the tests if this file is executed directly
if (import.meta.url === import.meta.resolve('./test.ts')) {
  runTests().catch(error => {
    console.error('Test runner error:', error);
  });
}

export { setupServer, createTestClient, runTests };
