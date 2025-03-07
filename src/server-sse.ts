import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Transport } from "./transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "./types.js";

/**
 * Simplified server transport for SSE: sends messages over an SSE connection 
 * and receives messages from HTTP POST requests.
 */
export class SseServer implements Transport {
  private _sseResponse?: ServerResponse;
  private _sessionId: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * Creates a new SSE server transport
   * @param _endpoint - The relative or absolute URL where clients should POST messages
   * @param res - The server response object to establish the SSE stream
   */
  constructor(
    private _endpoint: string,
    private res: ServerResponse,
  ) {
    this._sessionId = randomUUID();
  }

  /**
   * Handles the initial SSE connection request.
   * Call this when a GET request is made to establish the SSE stream.
   */
  async start(): Promise<void> {
    if (this._sseResponse) {
      throw new Error("SSE server already started!");
    }

    this.res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Send the endpoint event
    this.res.write(
      `event: endpoint\ndata: ${encodeURI(this._endpoint)}?sessionId=${this._sessionId}\n\n`
    );

    this._sseResponse = this.res;
    this.res.on("close", () => {
      this._sseResponse = undefined;
      this.onclose?.();
    });
  }

  /**
   * Handles incoming POST messages.
   * Call this when a POST request is made to send a message to the server.
   */
  async handlePostMessage(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!this._sseResponse) {
      const message = "SSE connection not established";
      res.writeHead(500).end(message);
      throw new Error(message);
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const contentType = req.headers["content-type"];
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`Unsupported content-type: ${contentType}`);
        }

        const parsedMessage = JSON.parse(body);
        this.handleMessage(parsedMessage);
        res.writeHead(202).end("Accepted");
      } catch (error) {
        res.writeHead(400).end(`Invalid message: ${error}`);
        this.onerror?.(error as Error);
      }
    });
  }

  /**
   * Handle a client message, regardless of how it arrived.
   */
  async handleMessage(message: unknown): Promise<void> {
    let parsedMessage: JSONRPCMessage;
    try {
      parsedMessage = JSONRPCMessageSchema.parse(message);
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }

    this.onmessage?.(parsedMessage);
  }

  async close(): Promise<void> {
    this._sseResponse?.end();
    this._sseResponse = undefined;
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._sseResponse) {
      throw new Error("Not connected");
    }

    this._sseResponse.write(
      `event: message\ndata: ${JSON.stringify(message)}\n\n`
    );
  }

  /**
   * Returns the session ID for this transport.
   * Use this to route incoming POST requests.
   */
  get sessionId(): string {
    return this._sessionId;
  }
}
