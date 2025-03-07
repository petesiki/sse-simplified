import { JSONRPCMessage } from "./types.js";

/**
 * Minimal interface for a transport that a client or server can communicate over.
 */
export interface Transport {
  /**
   * Starts processing messages on the transport.
   */
  start(): Promise<void>;

  /**
   * Sends a JSON-RPC message.
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Closes the connection.
   */
  close(): Promise<void>;

  /**
   * Callback for when the connection is closed.
   */
  onclose?: () => void;

  /**
   * Callback for when an error occurs.
   */
  onerror?: (error: Error) => void;

  /**
   * Callback for when a message is received.
   */
  onmessage?: (message: JSONRPCMessage) => void;
}
