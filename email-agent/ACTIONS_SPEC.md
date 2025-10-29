# Actions Specification

## Overview

Actions are interactive UI elements that the agent can dynamically create to provide users with one-click operations in the chat interface. Each action is defined as a TypeScript file that exports an action configuration.

## Purpose

- Provide contextual, interactive buttons in chat messages
- Enable one-click operations like searching emails, drafting replies, setting reminders
- Allow the agent to create custom workflows dynamically
- Give users quick access to common operations without typing

## Architecture

### Directory Structure

```
agent/custom_scripts/
├── actions/
│   ├── view-urgent-emails.ts
│   ├── draft-reply-to-boss.ts
│   ├── schedule-meeting.ts
│   └── archive-newsletters.ts
└── types.ts
```

### File Format

Each action file must export an `action` object conforming to the `ActionConfig` interface.

```typescript
// agent/custom_scripts/actions/example-action.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "unique_action_id",
  label: "Button Label",
  description: "What this action does",
  icon: "🚀",
  type: "search", // or other action type
  style: "primary",
  params: {
    // Action-specific parameters
  },
  enabled: true
};
```

## Type Definitions

```typescript
// agent/custom_scripts/types.ts

export interface ActionConfig {
  // Unique identifier for this action
  id: string;

  // Text displayed on the button
  label: string;

  // Optional description shown on hover or in action list
  description?: string;

  // Optional emoji or icon identifier
  icon?: string;

  // Type of action to perform
  type: "search" | "draft_email" | "show_email" | "set_reminder" | "archive" | "custom";

  // Parameters passed to the action handler
  params: Record<string, any>;

  // Button styling variant
  style?: "primary" | "secondary" | "danger";

  // Whether this action is enabled (default: true)
  enabled?: boolean;
}
```

## Action Types

### 1. `search`

Searches emails using Gmail query syntax.

**Parameters:**
- `query` (string): Gmail search query

**Example:**
```typescript
export const action: ActionConfig = {
  id: "search_urgent",
  label: "View Urgent Emails",
  type: "search",
  params: {
    query: "from:boss@company.com urgent"
  }
};
```

### 2. `draft_email`

Opens a draft email composer.

**Parameters:**
- `emailId` (string, optional): ID of email to reply to
- `to` (string, optional): Recipient email address
- `subject` (string, optional): Email subject
- `template` (string, optional): Template identifier

**Example:**
```typescript
export const action: ActionConfig = {
  id: "draft_reply",
  label: "Draft Reply",
  type: "draft_email",
  params: {
    emailId: "abc123@example.com",
    to: "boss@company.com"
  }
};
```

### 3. `show_email`

Displays a specific email.

**Parameters:**
- `emailId` (string): Email message ID

**Example:**
```typescript
export const action: ActionConfig = {
  id: "show_email_abc",
  label: "Read Email",
  type: "show_email",
  params: {
    emailId: "abc123@example.com"
  }
};
```

### 4. `set_reminder`

Sets a reminder for an email.

**Parameters:**
- `emailId` (string): Email message ID
- `duration` (string): Time duration (e.g., "1h", "tomorrow", "next week")

**Example:**
```typescript
export const action: ActionConfig = {
  id: "remind_later",
  label: "Remind Me Later",
  type: "set_reminder",
  params: {
    emailId: "abc123@example.com",
    duration: "1h"
  }
};
```

### 5. `archive`

Archives emails matching a query.

**Parameters:**
- `query` (string): Gmail search query for emails to archive
- `emailId` (string, optional): Specific email ID to archive

**Example:**
```typescript
export const action: ActionConfig = {
  id: "archive_newsletters",
  label: "Archive Newsletters",
  type: "archive",
  params: {
    query: "newsletter OR unsubscribe"
  }
};
```

### 6. `custom`

Custom action with flexible parameters.

**Parameters:**
- `action` (string): Custom action identifier
- Additional parameters as needed

**Example:**
```typescript
export const action: ActionConfig = {
  id: "open_calendar",
  label: "Open Calendar",
  type: "custom",
  params: {
    action: "open_url",
    url: "https://calendar.google.com"
  }
};
```

## Complete Examples

### Simple Search Action

```typescript
// agent/custom_scripts/actions/view-unread.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "view_unread",
  label: "View Unread",
  description: "Show all unread emails",
  icon: "📬",
  type: "search",
  style: "primary",
  params: {
    query: "is:unread"
  },
  enabled: true
};
```

### Context-Specific Action

```typescript
// agent/custom_scripts/actions/draft-boss-reply.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "draft_boss_reply",
  label: "Reply to Boss",
  description: "Draft a professional reply to latest email from boss",
  icon: "✍️",
  type: "draft_email",
  style: "primary",
  params: {
    to: "boss@company.com",
    template: "professional_reply"
  },
  enabled: true
};
```

### Bulk Operation Action

```typescript
// agent/custom_scripts/actions/archive-old-newsletters.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "archive_old_newsletters",
  label: "Archive Old Newsletters",
  description: "Archives all newsletters older than 30 days",
  icon: "📦",
  type: "archive",
  style: "secondary",
  params: {
    query: "older_than:30d (newsletter OR unsubscribe)"
  },
  enabled: true
};
```

### Conditional Action

```typescript
// agent/custom_scripts/actions/urgent-action.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "view_urgent_today",
  label: "Today's Urgent Items",
  description: "Shows urgent emails received today",
  icon: "🚨",
  type: "search",
  style: "danger",
  params: {
    query: "newer_than:1d (urgent OR asap OR critical)"
  },
  enabled: true
};
```

## ActionsManager Implementation

```typescript
// ccsdk/actions-manager.ts
import { readdir, watch } from "fs/promises";
import { join } from "path";
import type { ActionConfig } from "../agent/custom_scripts/types";

export class ActionsManager {
  private actionsDir = join(process.cwd(), "agent/custom_scripts/actions");
  private actions: Map<string, ActionConfig> = new Map();
  private watchers: Set<() => void> = new Set();

  /**
   * Load all action files from the actions directory
   */
  async loadAllActions(): Promise<ActionConfig[]> {
    this.actions.clear();

    try {
      const files = await readdir(this.actionsDir);

      for (const file of files) {
        if (file.endsWith(".ts") && !file.startsWith("_")) {
          await this.loadAction(file);
        }
      }
    } catch (error) {
      console.error("Error loading actions:", error);
    }

    return Array.from(this.actions.values());
  }

  /**
   * Load a single action file
   */
  private async loadAction(filename: string) {
    try {
      const filePath = join(this.actionsDir, filename);
      // Cache bust for hot reload
      const module = await import(`${filePath}?t=${Date.now()}`);

      if (module.action && module.action.id) {
        this.actions.set(module.action.id, module.action);
        console.log(`Loaded action: ${module.action.id}`);
      }
    } catch (error) {
      console.error(`Error loading action ${filename}:`, error);
    }
  }

  /**
   * Get a specific action by ID
   */
  getAction(id: string): ActionConfig | undefined {
    return this.actions.get(id);
  }

  /**
   * Get all enabled actions
   */
  getAllActions(): ActionConfig[] {
    return Array.from(this.actions.values()).filter(a => a.enabled !== false);
  }

  /**
   * Watch for file changes and reload actions
   */
  async watchActions(onChange: (actions: ActionConfig[]) => void) {
    try {
      const watcher = watch(this.actionsDir);

      for await (const event of watcher) {
        console.log(`Action file ${event.eventType}: ${event.filename}`);

        if (event.filename?.endsWith(".ts")) {
          const actions = await this.loadAllActions();
          onChange(actions);
          this.notifyWatchers();
        }
      }
    } catch (error) {
      console.error("Error watching actions:", error);
    }
  }

  /**
   * Register a callback for when actions change
   */
  onActionsChanged(callback: () => void) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  /**
   * Notify all registered watchers
   */
  private notifyWatchers() {
    for (const watcher of this.watchers) {
      try {
        watcher();
      } catch (error) {
        console.error("Error notifying watcher:", error);
      }
    }
  }
}
```

## WebSocket Integration

### Message Types

When actions are sent to the frontend:

```typescript
{
  type: "actions_update",
  actions: ActionConfig[],
  sessionId: string
}
```

When user clicks an action:

```typescript
{
  type: "action_clicked",
  actionId: string,
  sessionId: string
}
```

### Server Implementation

```typescript
// In websocket-handler.ts
import { ActionsManager } from "./actions-manager";

const actionsManager = new ActionsManager();

// Load actions on startup
await actionsManager.loadAllActions();

// Start watching for changes
actionsManager.watchActions((actions) => {
  // Broadcast to all connected clients
  broadcastToAll({
    type: "actions_update",
    actions: actions
  });
});

// Handle action clicks
websocket.on("message", (data) => {
  const message = JSON.parse(data);

  if (message.type === "action_clicked") {
    const action = actionsManager.getAction(message.actionId);
    if (action) {
      handleActionExecution(action, session);
    }
  }
});

function handleActionExecution(action: ActionConfig, session: Session) {
  switch (action.type) {
    case "search":
      session.addUserMessage(`Search for emails: ${action.params.query}`);
      break;
    case "draft_email":
      session.addUserMessage(`Draft email to ${action.params.to}`);
      break;
    case "show_email":
      session.addUserMessage(`Show email ${action.params.emailId}`);
      break;
    // ... other action types
  }
}
```

## Frontend Integration

### Actions Component

```typescript
// client/components/ActionButton.tsx
interface ActionButtonProps {
  action: ActionConfig;
  onExecute: (action: ActionConfig) => void;
}

export function ActionButton({ action, onExecute }: ActionButtonProps) {
  const styleClass = {
    primary: "bg-blue-500 hover:bg-blue-600",
    secondary: "bg-gray-500 hover:bg-gray-600",
    danger: "bg-red-500 hover:bg-red-600"
  }[action.style || "primary"];

  return (
    <button
      className={`px-4 py-2 rounded text-white ${styleClass}`}
      onClick={() => onExecute(action)}
      disabled={action.enabled === false}
    >
      {action.icon && <span className="mr-2">{action.icon}</span>}
      {action.label}
    </button>
  );
}
```

### Actions Panel

```typescript
// client/components/ActionsPanel.tsx
export function ActionsPanel({ actions }: { actions: ActionConfig[] }) {
  const handleExecute = (action: ActionConfig) => {
    // Send to WebSocket
    ws.send(JSON.stringify({
      type: "action_clicked",
      actionId: action.id,
      sessionId: currentSessionId
    }));
  };

  return (
    <div className="actions-panel">
      <h3>Quick Actions</h3>
      <div className="grid gap-2">
        {actions.map(action => (
          <ActionButton
            key={action.id}
            action={action}
            onExecute={handleExecute}
          />
        ))}
      </div>
    </div>
  );
}
```

## Agent Workflow

### How the Agent Creates Actions

1. **Agent analyzes user request**: "Watch for urgent emails from boss"

2. **Agent uses Write tool** to create action file:

```typescript
// Agent writes to agent/custom_scripts/actions/boss-urgent-action.ts
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "view_boss_urgent",
  label: "View Boss Urgent",
  description: "Shows urgent emails from your boss",
  icon: "🚨",
  type: "search",
  style: "primary",
  params: {
    query: "from:boss@company.com (urgent OR asap)"
  },
  enabled: true
};
```

3. **Backend detects new file** via file watcher

4. **ActionsManager loads the new action**

5. **Action is broadcast** to all connected clients

6. **Frontend renders** the new action button

7. **User clicks button** → sends action_clicked message

8. **Backend executes** the action based on type and params

### Agent System Prompt Addition

```markdown
You have the ability to create interactive action buttons that users can click.

To create an action:
1. Use the Write tool to create a TypeScript file in `agent/custom_scripts/actions/`
2. Export an `action` object with the ActionConfig interface
3. The action will automatically appear in the chat interface

Example:
```typescript
import type { ActionConfig } from "../types";

export const action: ActionConfig = {
  id: "unique_id",
  label: "Button Text",
  type: "search",
  params: { query: "search query" }
};
```

Available action types:
- search: Search emails with Gmail query
- draft_email: Open email composer
- show_email: Display specific email
- set_reminder: Set reminder for email
- archive: Archive emails
- custom: Custom action

Use actions to provide quick, one-click operations for users.
```

## Error Handling

### Invalid Action File

```typescript
// ActionsManager handles errors gracefully
try {
  const module = await import(filePath);
  if (!module.action?.id) {
    console.error(`Invalid action file ${filename}: missing id`);
    return;
  }
  // Load action...
} catch (error) {
  console.error(`Failed to load ${filename}:`, error);
  // Continue loading other actions
}
```

### Missing Parameters

Frontend should validate required parameters before sending:

```typescript
function validateAction(action: ActionConfig): boolean {
  switch (action.type) {
    case "search":
      return !!action.params.query;
    case "show_email":
      return !!action.params.emailId;
    // ... other validations
    default:
      return true;
  }
}
```

## Best Practices

1. **Unique IDs**: Use descriptive, unique action IDs (e.g., `view_boss_urgent_today`)

2. **Clear Labels**: Button labels should be concise and action-oriented

3. **Helpful Descriptions**: Provide context for what the action does

4. **Appropriate Styling**: Use `danger` style for destructive actions

5. **Enable/Disable**: Use `enabled: false` to temporarily disable actions

6. **Parameterization**: Make actions reusable with flexible parameters

7. **Icon Usage**: Use relevant emojis to make actions visually distinct

8. **File Naming**: Use kebab-case for filenames matching action purpose

## Future Enhancements

- Action groups/categories for organization
- Keyboard shortcuts for actions
- Action confirmation dialogs for destructive operations
- Action history/logging
- Conditional actions based on user context
- Action templates for common patterns
- Batch actions operating on multiple items
