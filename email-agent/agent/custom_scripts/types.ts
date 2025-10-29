// agent/custom_scripts/types.ts

/**
 * Email interface representing an email message
 */
export interface Email {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  isRead: boolean;
  hasAttachments: boolean;
  labels?: string[];
  uid?: number;
}

/**
 * Types of events that listeners can subscribe to
 */
export type EventType =
  | "email_received"        // New email arrives
  | "email_sent"            // User sends an email
  | "email_starred"         // Email is starred
  | "email_archived"        // Email is archived
  | "email_labeled"         // Label added to email
  | "scheduled_time";       // Time-based (cron)

/**
 * Configuration for a listener
 */
export interface ListenerConfig {
  // Unique identifier for this listener
  id: string;

  // Human-readable name
  name: string;

  // Optional description of what this listener does
  description?: string;

  // Whether this listener is active
  enabled: boolean;

  // Type of event to listen for
  event: EventType;
}

/**
 * Options for notify context method
 */
export interface NotifyOptions {
  // Priority for notification display
  priority?: "low" | "normal" | "high";
}

/**
 * Options for calling a subagent
 */
export interface SubagentOptions<T = any> {
  // The prompt to send to the agent
  prompt: string;

  // JSON Schema for structured response
  schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };

  // Optional model to use (defaults to haiku for speed)
  model?: "opus" | "sonnet" | "haiku";
}

/**
 * Context object provided to listener handlers
 * Contains methods to interact with the email system and user
 */
export interface ListenerContext {
  // Show a notification to the user
  notify(message: string, options?: NotifyOptions): Promise<void>;

  // Email actions
  archiveEmail(emailId: string): Promise<void>;
  starEmail(emailId: string): Promise<void>;
  unstarEmail(emailId: string): Promise<void>;
  markAsRead(emailId: string): Promise<void>;
  markAsUnread(emailId: string): Promise<void>;
  addLabel(emailId: string, label: string): Promise<void>;
  removeLabel(emailId: string, label: string): Promise<void>;

  // Call a subagent with a prompt and get structured response
  callAgent<T = any>(options: SubagentOptions<T>): Promise<T>;
}

/**
 * A listener module exports a config and handler function
 */
export interface ListenerModule {
  config: ListenerConfig;
  handler: (data: any, context: ListenerContext) => Promise<void>;
}
