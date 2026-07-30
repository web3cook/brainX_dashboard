"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "./client";
import type { RunEventEnvelope } from "./types";

/** Every frame the server can send on `/runs/{id}/live`. Chat turns and run
 * state changes arrive as ordinary events (`chat.message`/`chat.reply`/
 * `run.state_changed`) inside the `event` envelope — the separate `run.state`
 * frame is just a convenience duplicate the server also sends. */
type InboundFrame =
  | { type: "event"; event: RunEventEnvelope }
  | { type: "run.state"; state: string };

const RECONNECT_DELAY_MS = 1500;

export function useRunSocket(runId: string | null) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RunEventEnvelope[]>([]);
  const lastSeqRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Messages sent while mid-connect or mid-reconnect would otherwise be
  // silently dropped (ws.send only works once readyState is OPEN) — this is
  // the queue that made the CMO look unresponsive after a fresh run start or
  // a brief network blip. Flushed the moment the socket opens.
  const outboxRef = useRef<string[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Resetting on runId change (not new state derived from props/state
    // during render) — the accompanying WebSocket connect below must live in
    // this same effect, so the reset does too.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([]);
    lastSeqRef.current = 0;
    outboxRef.current = [];
    if (!runId) return;

    const connect = () => {
      if (!mountedRef.current) return;
      const url = `${WS_BASE}/runs/${runId}/live?since=${lastSeqRef.current}`;
       
      console.info(`[ws] connecting: ${url}`);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
         
        console.info(`[ws] open (run=${runId})`);
        setConnected(true);
        const queued = outboxRef.current;
        outboxRef.current = [];
        if (queued.length > 0) {
           
          console.info(`[ws] flushing ${queued.length} queued chat message(s)`);
        }
        for (const body of queued) {
          ws.send(JSON.stringify({ type: "chat.message", body }));
        }
      };

      ws.onmessage = (raw) => {
        const frame = JSON.parse(raw.data) as InboundFrame;
        if (frame.type === "event") {
           
          console.info(`[ws] <- event seq=${frame.event.seq} type=${frame.event.type}`, frame.event.payload);
          lastSeqRef.current = Math.max(lastSeqRef.current, frame.event.seq);
          setEvents((prev) => [...prev, frame.event]);
        }
      };

      ws.onclose = (ev) => {
         
        console.warn(`[ws] closed (run=${runId}) code=${ev.code} reason=${ev.reason || "none"}`);
        setConnected(false);
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
         
        console.error(`[ws] error (run=${runId}) — closing`);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [runId]);

  const sendChat = useCallback((body: string) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
       
      console.info(`[ws] -> chat.message: ${body}`);
      ws.send(JSON.stringify({ type: "chat.message", body }));
    } else {
      // Mid-connect or mid-reconnect — queue it rather than dropping it;
      // `onopen` flushes this the moment the socket is ready.
       
      console.warn(`[ws] not open (readyState=${ws?.readyState}) — queuing: ${body}`);
      outboxRef.current.push(body);
    }
  }, []);

  return { connected, events, sendChat };
}
