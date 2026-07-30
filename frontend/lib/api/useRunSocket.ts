"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "./client";
import type { RunEventEnvelope } from "./types";

/** Frames the server sends on `/live`. Chat turns and run state changes
 * arrive as ordinary events (`chat.message`/`chat.reply`/`run.state_changed`)
 * inside the `event` envelope. */
type InboundFrame =
  | { type: "event"; run_id: string; event: RunEventEnvelope }
  | { type: "subscribed"; run_id: string };

const RECONNECT_DELAY_MS = 1500;

/**
 * ONE WebSocket for the whole operator session, not one per run.
 *
 * The socket is opened once when the dashboard mounts and lives until it
 * unmounts. Changing `runId` does not reconnect, it sends `unsubscribe`
 * for the old run and `subscribe` for the new one over the existing
 * connection. Reconnect (after a drop) re-subscribes to whatever run is
 * current, resuming from the last seq already applied so nothing is missed
 * and nothing is replayed twice.
 */
export function useRunSocket(runId: string | null) {
  const [connected, setConnected] = useState(false);
  // `epoch` increments every time the buffer is cleared for a new run. A
  // consumer folding these events keeps a cursor into `events`, and that
  // cursor has to rewind in lockstep with the reset, inferring it from
  // `events.length` alone is wrong, because a backfill burst can batch into
  // a single render whose length already exceeds the old cursor.
  const [buffer, setBuffer] = useState<{ epoch: number; events: RunEventEnvelope[] }>({
    epoch: 0,
    events: [],
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Current run + its high-water seq, held in refs so the long-lived socket
  // callbacks always see the latest values without being re-created.
  const runIdRef = useRef<string | null>(runId);
  const lastSeqRef = useRef(0);
  // Chat sent while the socket is mid-connect would otherwise be dropped
  // (`send` only works when OPEN), queue and flush on open instead.
  const outboxRef = useRef<{ runId: string; body: string }[]>([]);

  const send = useCallback((frame: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }, []);

  // --- the single connection, created once ---------------------------------
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const url = `${WS_BASE}/live`;
      console.info(`[ws] connecting: ${url}`);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        console.info("[ws] session open");
        setConnected(true);
        // Re-subscribe to whatever run is current. On a reconnect this
        // resumes from the last applied seq rather than replaying history.
        if (runIdRef.current) {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              run_id: runIdRef.current,
              since: lastSeqRef.current,
            }),
          );
        }
        const queued = outboxRef.current;
        outboxRef.current = [];
        if (queued.length > 0) console.info(`[ws] flushing ${queued.length} queued message(s)`);
        for (const m of queued) {
          ws.send(JSON.stringify({ type: "chat.message", run_id: m.runId, body: m.body }));
        }
      };

      ws.onmessage = (raw) => {
        const frame = JSON.parse(raw.data) as InboundFrame;
        if (frame.type !== "event") return;
        // Late frames for a run we've already switched away from would
        // otherwise leak into the new run's timeline.
        if (frame.run_id !== runIdRef.current) return;
        console.info(`[ws] <- seq=${frame.event.seq} ${frame.event.type}`, frame.event.payload);
        lastSeqRef.current = Math.max(lastSeqRef.current, frame.event.seq);
        setBuffer((prev) => ({ epoch: prev.epoch, events: [...prev.events, frame.event] }));
      };

      ws.onclose = (ev) => {
        console.warn(`[ws] session closed code=${ev.code} reason=${ev.reason || "none"}`);
        setConnected(false);
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
        console.error("[ws] session error, closing");
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  // --- run switches are frames on that connection, not reconnects ----------
  useEffect(() => {
    const previous = runIdRef.current;
    if (previous === runId) return;

    if (previous) send({ type: "unsubscribe", run_id: previous });

    runIdRef.current = runId;
    lastSeqRef.current = 0;
    outboxRef.current = [];
    // New epoch: tells consumers their fold cursor is now stale.
    setBuffer((prev) => ({ epoch: prev.epoch + 1, events: [] }));

    if (runId) send({ type: "subscribe", run_id: runId, since: 0 });
  }, [runId, send]);

  const sendChat = useCallback(
    (body: string) => {
      const target = runIdRef.current;
      if (!target) return;
      const sent = send({ type: "chat.message", run_id: target, body });
      if (!sent) {
        console.warn(`[ws] not open, queuing: ${body}`);
        outboxRef.current.push({ runId: target, body });
      }
    },
    [send],
  );

  return { connected, events: buffer.events, epoch: buffer.epoch, sendChat };
}
