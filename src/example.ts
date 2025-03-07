import http from 'node:http';
import { URL } from 'node:url';
import { SseClient } from './client-sse.js';
import { SseServer } from './server-sse.js';
import { JSONRPCMessage } from './types.js';

// Example JSON-RPC message
const createExampleRequest = (id: number): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  method: "example.method",
  params: { data: "Hello from client" }
});

const createExampleResponse = (id: number): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  result: { data: "Hello from server" }
});

// Server-side example
async function startServer() {
  // Map to store active SSE connections by sessionId
  const connections = new Map<string, SseServer>();
  
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    
    // Handle SSE connection request
    if (req.method === 'GET' && url.pathname === '/sse') {
      console.log('New SSE connection request');
      
      // Create a new SSE server transport
      const sseServer = new SseServer('/message', res);
      
      // Set up message handler
      sseServer.onmessage = async (message: JSONRPCMessage) => {
        console.log('Server received message:', message);
        
        // If the message has an ID, it's a request expecting a response
        if ('id' in message && typeof message.id !== 'undefined') {
          // Send a response back
          await sseServer.send(createExampleResponse(Number(message.id)));
        }
      };
      
      // Set up close handler
      sseServer.onclose = () => {
        console.log(`Connection ${sseServer.sessionId} closed`);
        connections.delete(sseServer.sessionId);
      };
      
      // Start the SSE connection
      sseServer.start()
        .then(() => {
          console.log(`SSE connection established with sessionId: ${sseServer.sessionId}`);
          connections.set(sseServer.sessionId, sseServer);
        })
        .catch((error) => {
          console.error('Error establishing SSE connection:', error);
          res.writeHead(500).end('Internal Server Error');
        });
      
      return;
    }
    
    // Handle message POST requests
    if (req.method === 'POST' && url.pathname === '/message' && sessionId) {
      console.log(`Received POST message for session ${sessionId}`);
      
      const connection = connections.get(sessionId);
      if (!connection) {
        res.writeHead(404).end('Session not found');
        return;
      }
      
      connection.handlePostMessage(req, res).catch((error) => {
        console.error('Error handling POST message:', error);
      });
      
      return;
    }
    
    // Handle other requests
    res.writeHead(404).end('Not Found');
  });
  
  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  });
  
  return server;
}

// Client-side example
async function startClient() {
  const serverUrl = new URL('http://localhost:3000/sse');
  const client = new SseClient(serverUrl);
  
  // Set up message handler
  client.onmessage = (message: JSONRPCMessage) => {
    console.log('Client received message:', message);
  };
  
  // Set up error handler
  client.onerror = (error: Error) => {
    console.error('Client error:', error);
  };
  
  // Set up close handler
  client.onclose = () => {
    console.log('Client connection closed');
  };
  
  // Start the client
  await client.start();
  console.log('Client connected');
  
  // Send a message to the server
  await client.send(createExampleRequest(1));
  console.log('Client sent message');
  
  return client;
}

// Run the example
// Check if this file is being run directly
if (import.meta.url === import.meta.resolve('./example.ts')) {
  (async () => {
    try {
      const server = await startServer();
      
      // Wait a moment for the server to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const client = await startClient();
      
      // Keep the example running for a while
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Clean up
      await client.close();
      server.close();
      
      console.log('Example completed');
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}

// Export for use in other examples
export { startServer, startClient };
