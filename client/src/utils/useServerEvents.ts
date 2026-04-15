"use client";

import { useEffect, useRef } from "react";
import { getAccessToken } from "./api";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type EventHandler = (payload: unknown) => void;

export function useServerEvents(handlers: Record<string, EventHandler | undefined>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let isCancelled = false;
    let abortController: AbortController | null = null;

    const connect = async () => {
      try {
        const accessToken = await getAccessToken();
        if (isCancelled) {
          return;
        }

        abortController = new AbortController();
        const response = await fetch(`${apiUrl}/api/events`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          signal: abortController.signal
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to connect to server events");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? "";

          for (const message of messages) {
            const eventLine = message
              .split("\n")
              .find((line) => line.startsWith("event: "));
            const dataLine = message
              .split("\n")
              .find((line) => line.startsWith("data: "));

            if (!eventLine || !dataLine) {
              continue;
            }

            const eventName = eventLine.replace("event: ", "").trim();
            const payload = JSON.parse(dataLine.replace("data: ", ""));
            handlersRef.current[eventName]?.(payload);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          window.setTimeout(connect, 1500);
        }
      }
    };

    void connect();

    return () => {
      isCancelled = true;
      abortController?.abort();
    };
  }, []);
}
