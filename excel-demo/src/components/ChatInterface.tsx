import React, { useState, useCallback } from 'react';
import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { ChatMessage, OutputFile } from './types';
import { detectTodoListInMessage, TodoItem } from './utils/todoDetection';

const API_BASE_URL = '/api';

function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTodos, setCurrentTodos] = useState<TodoItem[]>([]);

  const sendMessage = useCallback(
    async (content: string, files?: File[]) => {
      if ((!content.trim() && !files?.length) || isLoading) return;

      // Create user message content with file info
      let displayContent = content;
      if (files?.length) {
        const fileList = files.map((f) => f.name).join(', ');
        displayContent = content
          ? `${content}\n\nFiles: ${fileList}`
          : `Files: ${fileList}`;
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: displayContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder for assistant response
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: '',
          timestamp: new Date(),
          isThinking: true,
        },
      ]);

      setIsLoading(true);
      setError(null);

      try {
        // Prepare form data
        const formData = new FormData();
        formData.append('content', content);

        if (files?.length) {
          files.forEach((file) => {
            formData.append('files', file);
          });
        }

        // Make request with SSE
        const response = await fetch(`${API_BASE_URL}/query`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by \n\n)
          const sseMessages = buffer.split('\n\n');
          buffer = sseMessages.pop() || ''; // Keep incomplete message in buffer

          for (const message of sseMessages) {
            if (!message.trim()) continue;

            // SSE messages start with "data: "
            const dataMatch = message.match(/^data: (.+)$/m);
            if (!dataMatch) continue;

            try {
              const eventData = JSON.parse(dataMatch[1]);

              if (eventData.type === 'message') {
                // Handle SDK message
                const sdkMessage: SDKMessage = eventData.data;

                if (sdkMessage.type === 'assistant') {
                  setMessages((prev) => {
                    const existingIndex = prev.findIndex(
                      (m) => m.type === 'assistant' && !m.content
                    );

                    // Extract text content
                    const textContent = sdkMessage.message.content
                      .filter((c) => c.type === 'text')
                      .map((c) => (c.type === 'text' ? c.text : ''))
                      .join('');

                    // Preserve all content blocks
                    const contentBlocks = sdkMessage.message.content;

                    if (existingIndex >= 0) {
                      const updated = [...prev];
                      updated[existingIndex] = {
                        ...updated[existingIndex],
                        content: textContent,
                        contentBlocks: contentBlocks as any,
                        raw: sdkMessage,
                        isThinking: false,
                      };

                      // Check for todo list
                      const todos = detectTodoListInMessage(
                        JSON.stringify(sdkMessage)
                      );
                      if (todos && todos.length > 0) {
                        setCurrentTodos(todos);
                      }
                      return updated;
                    }

                    const newMessage = {
                      id: Date.now().toString(),
                      type: 'assistant' as const,
                      content: textContent,
                      contentBlocks: contentBlocks as any,
                      timestamp: new Date(),
                      raw: sdkMessage,
                    };

                    // Check for todo list
                    const todos = detectTodoListInMessage(
                      JSON.stringify(sdkMessage)
                    );
                    if (todos && todos.length > 0) {
                      setCurrentTodos(todos);
                    }

                    return [...prev, newMessage];
                  });
                }
              } else if (eventData.type === 'output-files') {
                // Handle output files
                const outputFiles: OutputFile[] = eventData.data;
                console.log('Received output files:', outputFiles);

                setMessages((prev) => {
                  const updated = [...prev];
                  const lastAssistantIndex = updated.findLastIndex(
                    (m) => m.type === 'assistant'
                  );

                  if (lastAssistantIndex >= 0) {
                    updated[lastAssistantIndex] = {
                      ...updated[lastAssistantIndex],
                      outputFiles,
                    };
                  }

                  return updated;
                });
              } else if (eventData.type === 'error') {
                // Handle error
                const errorMessage = eventData.message || 'Unknown error';
                setError(errorMessage);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    type: 'error',
                    content: `Error: ${errorMessage}`,
                    timestamp: new Date(),
                  },
                ]);
              } else if (eventData.type === 'complete') {
                // Query completed
                setIsLoading(false);
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }

        setIsLoading(false);
        console.log('Query completed successfully');
      } catch (err) {
        console.error('Error sending message:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'error',
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          },
        ]);
      }
    },
    [isLoading]
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-800">
          CLAUDE EXCEL AGENT
        </h1>
      </header>

      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          currentTodos={currentTodos}
        />
      </div>

      <div className="border-t border-gray-200 bg-white">
        <MessageInput onSendMessage={sendMessage} disabled={isLoading} />
      </div>

      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

export default ChatInterface;
