// agent/custom_scripts/listeners/example-listener.ts
import type { ListenerConfig, Email, ListenerContext } from "../types";

/**
 * Example listener demonstrating the listener format
 *
 * This listener watches for incoming emails and logs information about them.
 * It's disabled by default - set enabled: true to activate it.
 */

export const config: ListenerConfig = {
  id: "example_listener",
  name: "Example Email Listener",
  description: "Demonstrates listener structure - logs info about received emails",
  enabled: true, // Set to true to enable
  event: "email_received"
};

export async function handler(email: Email, context: ListenerContext): Promise<void> {
  // Example: Filter for specific conditions
  if (!email.from.includes("example.com")) {
    return; // Skip emails not from example.com
  }

  // Example: Check subject for keywords
  const subject = email.subject.toLowerCase();
  if (subject.includes("urgent") || subject.includes("important")) {
    // Example: Send a notification
    await context.notify(`Important email received: ${email.subject}`, {
      priority: "high"
    });

    // Example: Star the email
    await context.starEmail(email.messageId);
  }

  // Example: Auto-archive newsletters
  if (subject.includes("newsletter")) {
    await context.archiveEmail(email.messageId);
    await context.markAsRead(email.messageId);
  }
}
