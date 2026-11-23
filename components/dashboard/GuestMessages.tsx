"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { GuestChat, GuestChatThread } from "@/lib/customer";

type Result = { thread?: GuestChatThread; error?: string };

/** How often the list is read again while the page is open and in view. */
const POLL_MS = 20000;

const STATUS: Record<GuestChat["status"], { text: string; cls: string }> = {
  open: { text: "Waiting on You", cls: "is-warn" },
  answered: { text: "Answered", cls: "is-ok" },
  closed: { text: "Closed", cls: "is-off" },
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Guests' messages, as tickets: the list on one side, the conversation on the
 * other. A guest writes when nobody could take their call; an answer here
 * reaches them in the panel they wrote from, and by email when they left one.
 * The phone shows the same conversations.
 */
export default function GuestMessages({
  initial,
  first,
  list,
  open,
  reply,
  setStatus,
}: {
  initial: GuestChat[];
  /** The conversation to open first: from the address, or the oldest waiting. */
  first: number | null;
  list: () => Promise<GuestChat[]>;
  open: (id: number) => Promise<Result>;
  reply: (id: number, body: string) => Promise<Result>;
  setStatus: (id: number, status: "open" | "closed") => Promise<Result>;
}) {
  const [chats, setChats] = useState(initial);
  const [show, setShow] = useState<"waiting" | "all">(initial.some((c) => c.status === "open") ? "waiting" : "all");
  const [selected, setSelected] = useState<number | null>(first);
  const [thread, setThread] = useState<GuestChatThread | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const log = useRef<HTMLOListElement>(null);

  const load = useCallback(
    (id: number) => {
      start(async () => {
        const r = await open(id);
        if (r.error) return setError(r.error);
        setError("");
        setThread(r.thread ?? null);
      });
    },
    [open]
  );

  useEffect(() => {
    if (selected !== null) load(selected);
  }, [selected, load]);

  // New messages arrive while the page is open: the list, and the open
  // conversation when it changed.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const fresh = await list().catch(() => null);
      if (!fresh) return;
      setChats(fresh);
      const now = fresh.find((c) => c.id === selected);
      if (now && thread && now.updatedAt !== thread.chat.updatedAt && !pending) {
        const r = await open(now.id);
        if (r.thread) setThread(r.thread);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [list, open, selected, thread, pending]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [thread]);

  function after(r: Result) {
    if (r.error) return setError(r.error);
    setError("");
    if (r.thread) {
      const t = r.thread;
      setThread(t);
      setChats((all) => all.map((c) => (c.id === t.chat.id ? t.chat : c)));
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !draft.trim()) return;
    const id = thread.chat.id;
    start(async () => {
      const r = await reply(id, draft);
      after(r);
      if (!r.error) setDraft("");
    });
  }

  const waiting = chats.filter((c) => c.status === "open");
  const shown = show === "waiting" ? waiting : chats;
  const chat = thread?.chat ?? null;

  return (
    <>
      <section className="group-box" aria-labelledby="msg-list-title" data-tour="messages-list">
        <h2 id="msg-list-title">Messages</h2>
        <div role="tablist" aria-label="Which messages" className="view-toggle">
          {(
            [
              ["waiting", `Waiting on You (${waiting.length})`],
              ["all", `All (${chats.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={show === id}
              className="view-tab"
              onClick={() => setShow(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            {show === "waiting"
              ? "Nothing waiting. When nobody can take a guest's call, they write instead, and it shows here."
              : "No messages yet. When nobody can take a guest's call, they write instead, and it shows here."}
          </p>
        ) : (
          <ul className="msg-list" aria-label="Conversations">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="msg-row"
                  aria-current={c.id === selected ? "true" : undefined}
                  onClick={() => setSelected(c.id)}
                >
                  <span className="msg-row-top">
                    <strong>{c.name || "A guest"}</strong>
                    <span className="msg-when">{when(c.updatedAt)}</span>
                  </span>
                  <span className="msg-preview">
                    {c.lastFromGuest ? "" : "You: "}
                    {c.preview}
                  </span>
                  <span className={`status ${STATUS[c.status].cls}`}>{STATUS[c.status].text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="group-box" aria-labelledby="msg-thread-title" data-tour="messages-thread">
        {chat && thread ? (
          <>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "start", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="msg-thread-title">{chat.name || "A guest"}</h2>
                <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
                  {chat.email ? (
                    <a href={`mailto:${chat.email}`} style={{ color: "var(--primary)" }}>
                      {chat.email}
                    </a>
                  ) : (
                    "No email left: they read your answer where they wrote."
                  )}
                </p>
              </div>
              <span className={`status ${STATUS[chat.status].cls}`} style={{ flex: "none" }}>
                {STATUS[chat.status].text}
              </span>
            </div>

            <ol className="msg-thread" ref={log} aria-label="Conversation">
              {thread.messages.map((m) => (
                <li key={m.id} className={m.fromGuest ? "msg-them" : "msg-us"}>
                  <span className="msg-who">
                    {m.fromGuest ? chat.name || "Guest" : m.name} · {when(m.at)}
                  </span>
                  <span className="msg-said">{m.body}</span>
                </li>
              ))}
            </ol>

            {error ? (
              <p role="alert" style={{ color: "var(--destructive)", margin: 0 }}>
                {error}
              </p>
            ) : null}

            <form onSubmit={send} style={{ display: "grid", gap: "0.5rem" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                aria-label="Your answer"
                placeholder={chat.email ? "Your answer: they get it here and by email" : "Your answer"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e);
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={pending}
                  onClick={() =>
                    start(async () => after(await setStatus(chat.id, chat.status === "closed" ? "open" : "closed")))
                  }
                >
                  {chat.status === "closed" ? "Reopen" : "Close"}
                </button>
                <button type="submit" className="btn btn-go" disabled={pending || !draft.trim()}>
                  Send
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 id="msg-thread-title">Conversation</h2>
            <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
              {error || (chats.length ? "Choose a message to read and answer it." : "Answers you write show here.")}
            </p>
          </>
        )}
      </section>
    </>
  );
}
