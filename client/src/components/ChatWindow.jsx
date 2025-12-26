import { useEffect, useMemo, useRef, useState, useContext, useCallback, useLayoutEffect } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from '../api/axios';
import { useParams } from "react-router-dom";
import { Send } from "lucide-react";
import AuthContext from "../context/AuthProvider";
import { socket } from "../api/socket";
import { toast } from 'react-toastify';

/** Normalize backend message -> UI */
function toUiMessage(m) {
  const id = m.id || m._id;
  const text = m.text ?? m.content?.text ?? "";
  const author =
    m.author ??
    m.username ??
    m.sender?.username ??
    m.senderUsername ??
    m.sender_name ??
    "";
  const createdAt = m.createdAt ?? m.timestamp ?? Date.now();
  const editedAt = m.editedAt ?? null;
  return { id, author, text, createdAt, editedAt };
}

/** Bump chat in sidebar cache */
function bumpChatInChatsCache(qc, username, chatId, uiMsg) {
  qc.setQueryData(["chats", username], (prev = []) => {
    if (!Array.isArray(prev) || prev.length === 0) return prev;
    const idx = prev.findIndex((c) => c.id === chatId || c._id === chatId);
    if (idx === -1) return prev;

    const chat = { ...prev[idx] };
    if ("lastMessage" in chat) {
      chat.lastMessage = chat.lastMessage || {};
      chat.lastMessage.id = uiMsg.id;
      chat.lastMessage.text = uiMsg.text;
      chat.lastMessage.author = uiMsg.author;
      chat.lastMessage.createdAt = uiMsg.createdAt;
    }
    if ("updatedAt" in chat) chat.updatedAt = new Date(uiMsg.createdAt).toISOString();
    if ("lastMessageAt" in chat) chat.lastMessageAt = new Date(uiMsg.createdAt).toISOString();

    const clone = [...prev];
    clone.splice(idx, 1);
    clone.unshift(chat);
    return clone;
  });
}

export default function ChatWindow() {
  const { chatId } = useParams();
  const { auth } = useContext(AuthContext);
  const currentUser = auth?.username ?? "";
  const qc = useQueryClient();
  const [msgCtx, setMsgCtx] = useState({ open: false, x: 0, y: 0, message: null });
  const menuRef = useRef(null);
  const [menuSize, setMenuSize] = useState({ w: 160, h: 0 }); 
  const [msgConfirm, setMsgConfirm] = useState({ open: false, message: null });
  const [edit, setEdit] = useState({ open: false, message: null, text: "" });

  const [value, setValue] = useState("");
  const taRef = useRef(null);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null); // ⬅️ restored
  const loadingOlderRef = useRef(false);

  //HANDLING OF CONTEXT MENU POSITION SO IT DOESN'T HIDE BEHIND THE SCREEN //
  useLayoutEffect(() => {
    if (msgCtx.open && menuRef.current) {
      const r = menuRef.current.getBoundingClientRect();
      setMenuSize({ w: r.width, h: r.height });
    }
  }, [msgCtx.open]);

  const PADDING = 8;
  const safeLeft = Math.max(
    PADDING,
    Math.min(msgCtx.x, window.innerWidth - menuSize.w - PADDING)
  );
  const safeTop = Math.max(
    PADDING,
    Math.min(msgCtx.y, window.innerHeight - menuSize.h - PADDING)
  );
  //HANDLING OF CONTEXT MENU POSITION SO IT DOESN'T HIDE BEHIND THE SCREEN //

  //MESSAGE DELETION HANDLING//
  const deleteMessageApi = async ({ messageId }) => {
    await axios.delete(`/chats/${chatId}/messages/${messageId}`, { data: { username: auth.username } });
  };

  const { mutate: mutateDeleteMessage, isPending: isDeletingMsg } = useMutation({
    mutationFn: deleteMessageApi,
    onMutate: async ({ messageId }) => {
      await qc.cancelQueries({ queryKey: ["messages", chatId] });
      const prev = qc.getQueryData(["messages", chatId]);

      // Optimistically remove the message from the pages
      qc.setQueryData(["messages", chatId], (cur) => {
        if (!cur?.pages) return cur;
        const pages = cur.pages.map((pg) => ({
          ...pg,
          items: (pg.items || []).filter((m) => m.id !== messageId),
        }));
        return { ...cur, pages };
      });

      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["messages", chatId], ctx.prev);
      toast.error("Failed to delete message");
    },
    onSettled: () => {
      // Keep things fresh
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
      qc.invalidateQueries({ queryKey: ["chats", currentUser] });
    },
  });

  useEffect(() => {
    if (!chatId) return;
    const onDeleted = (payload) => {
      if (!payload || String(payload.chatId) !== String(chatId)) return;
      const mid = payload.messageId;
      qc.setQueryData(["messages", chatId], (cur) => {
        if (!cur?.pages) return cur;
        const pages = cur.pages.map((pg) => ({
          ...pg,
          items: (pg.items || []).filter((m) => m.id !== mid),
        }));
        return { ...cur, pages };
      });
    };
    socket.on("message:deleted", onDeleted);
    return () => socket.off("message:deleted", onDeleted);
  }, [qc, chatId]);

  useEffect(() => {
    const closeAll = () => setMsgCtx({ open:false, x:0, y:0, message:null });
    const onEsc = (e) => { if (e.key === 'Escape') { closeAll(); setMsgConfirm({ open:false, message:null }); } };
    window.addEventListener('click', closeAll);
    window.addEventListener('contextmenu', closeAll);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('click', closeAll);
      window.removeEventListener('contextmenu', closeAll);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);
  //MESSAGE DELETION HANDLING//

  //MESSAGE EDITION HANDLING//
  const editMessageApi = async ({ messageId, text }) => {
    const res = await axios.put(`/chats/${chatId}/messages/${messageId}`, {
      text,
      username: auth.username,
    });
    return res.data; // { id, chatId, text, editedAt }
  };

  const { mutate: mutateEditMessage, isPending: isEditingMsg } = useMutation({
    mutationFn: editMessageApi,
    onMutate: async ({ messageId, text }) => {
      await qc.cancelQueries({ queryKey: ["messages", chatId] });
      await qc.cancelQueries({ queryKey: ["chats", currentUser] });
      const prevMsgs  = qc.getQueryData(["messages", chatId]);
      const prevChats = qc.getQueryData(["chats", currentUser]);
      const optimisticEditedAt = new Date().toISOString();

      // Optimistically update message text + editedAt
      qc.setQueryData(["messages", chatId], (cur) => {
        if (!cur?.pages) return cur;
        const pages = cur.pages.map(pg => ({
          ...pg,
          items: (pg.items || []).map(m =>
            m.id === messageId ? { ...m, text, editedAt: optimisticEditedAt } : m
          ),
        }));
        return { ...cur, pages };
      });

      // If it’s the lastMessage, update preview
      qc.setQueryData(["chats", currentUser], (list = []) => {
        return list.map(c => {
          const cid = c.id ?? c._id;
          if (String(cid) !== String(chatId)) return c;
          if (c.lastMessage?.id && String(c.lastMessage.id) === String(messageId)) {
            return {
              ...c,
              lastMessage: {
                ...c.lastMessage,
                text,
              },
            };
          }
          return c;
        });
      });

      return { prevMsgs, prevChats };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prevMsgs)  qc.setQueryData(["messages", chatId], ctx.prevMsgs);
      if (ctx?.prevChats) qc.setQueryData(["chats", currentUser], ctx.prevChats);
      toast.error("Failed to edit message");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
      qc.invalidateQueries({ queryKey: ["chats", currentUser] });
    },
  });

  useEffect(() => {
    if (!chatId) return;
    const onEdited = (payload) => {
      if (!payload || String(payload.chatId) !== String(chatId)) return;
      const { messageId, text, editedAt } = payload;

      qc.setQueryData(["messages", chatId], (cur) => {
        if (!cur?.pages) return cur;
        const pages = cur.pages.map(pg => ({
          ...pg,
          items: (pg.items || []).map(m =>
            m.id === messageId ? { ...m, text, editedAt } : m
          ),
        }));
        return { ...cur, pages };
      });
    };
    socket.on("message:edited", onEdited);
    return () => socket.off("message:edited", onEdited);
  }, [qc, chatId]);
  //MESSAGE EDITION HANDLING//

  // -------- Fetch (infinite) messages --------
  const fetchMessages = async ({ pageParam }) => {
    const params = { limit: 50 };
    if (pageParam) params.cursor = pageParam;
    const res = await axios.get(`/chats/${chatId}/messages`, {
      params: {
        limit: 50,
        username: auth.username,
      },
    });
    const data = res.data || { items: [], nextCursor: null };
    return {
      items: (data.items || []).map(toUiMessage),
      nextCursor: data.nextCursor ?? null,
    };
  };

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: fetchMessages,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    staleTime: 15_000,
    enabled: !!chatId,
  });

  const messages = useMemo(() => {
    const all = (data?.pages || []).flatMap((p) => p.items);
    return all.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [data]);

  // -------- Auto-grow textarea --------
  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${next}px`;
  };
  useEffect(() => { autoGrow(); }, [value]);

  // -------- Keep view pinned to newest on new message --------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // -------- WebSocket: join room + listen for message:new --------
  useEffect(() => {
    if (!chatId) return;

    // Join/leave per active chat (App owns connect/disconnect)
    socket.emit("chat:join", { chatId });

    const onNew = (serverMsg) => {
      if (!serverMsg || (serverMsg.chatId !== chatId && String(serverMsg.chatId) !== String(chatId))) return;

      const uiMsg = toUiMessage(serverMsg);

      // Deduplicate against cache
      const already = qc.getQueryData(["messages", chatId]);
      if (already?.pages?.some((pg) => pg.items?.some((m) => m.id === uiMsg.id))) return;

      // Append to last page
      qc.setQueryData(["messages", chatId], (prev) => {
        if (!prev) return prev;
        const pages = prev.pages ? [...prev.pages] : [];
        if (pages.length === 0) {
          pages.push({ items: [uiMsg], nextCursor: null });
        } else {
          const last = pages[pages.length - 1];
          pages[pages.length - 1] = { ...last, items: [...(last.items || []), uiMsg] };
        }
        return { ...prev, pages };
      });

      bumpChatInChatsCache(qc, currentUser, chatId, uiMsg);
    };

    socket.on("message:new", onNew);

    return () => {
      socket.off("message:new", onNew);
      socket.emit("chat:leave", { chatId });
    };
  }, [qc, chatId, currentUser]);

  // -------- Send (POST) with optimistic UI --------
  const sendMessage = async ({ text, tempId }) => {
    const res = await axios.post(`/chats/${chatId}/messages`, { 
      text, 
      username: auth.username 
    });
    return { server: res.data, tempId };
  };

  const { mutate: mutateSend, isPending: isSending } = useMutation({
    mutationFn: sendMessage,
    onMutate: async ({ text, tempId }) => {
      await qc.cancelQueries({ queryKey: ["messages", chatId] });
      const optimistic = { id: tempId, author: currentUser, text, createdAt: Date.now(), _optimistic: true };

      qc.setQueryData(["messages", chatId], (prev) => {
        if (!prev) {
          return { pages: [{ items: [optimistic], nextCursor: null }], pageParams: [undefined] };
        }
        const pages = prev.pages ? [...prev.pages] : [];
        if (pages.length === 0) pages.push({ items: [optimistic], nextCursor: null });
        else {
          const last = pages[pages.length - 1];
          pages[pages.length - 1] = { ...last, items: [...(last.items || []), optimistic] };
        }
        return { ...prev, pages };
      });

      return { tempId };
    },
    onSuccess: ({ server, tempId }) => {
      const uiMsg = toUiMessage(server);
      qc.setQueryData(["messages", chatId], (prev) => {
        if (!prev?.pages) return prev;
        const pages = prev.pages.map((pg) => ({
          ...pg,
          items: (pg.items || []).map((m) => (m.id === tempId ? uiMsg : m)),
        }));
        return { ...prev, pages };
      });
      bumpChatInChatsCache(qc, currentUser, chatId, uiMsg);
    },
    onError: (_err, vars) => {
      const tempId = vars?.tempId;
      qc.setQueryData(["messages", chatId], (prev) => {
        if (!prev?.pages) return prev;
        const pages = prev.pages.map((pg) => ({ ...pg, items: (pg.items || []).filter((m) => m.id !== tempId) }));
        return { ...prev, pages };
      });
    },
  });

  // -------- UI handlers --------
  const canSend = value.trim().length > 0 && !isSending;
  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mutateSend({ text, tempId });
    setValue("");
    requestAnimationFrame(() => autoGrow());
  }, [value, mutateSend]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // -------- Infinite scroll: load older on top reach --------
  const onScroll = async (e) => {
    if (!hasNextPage || loadingOlderRef.current) return;
    const el = e.currentTarget;
    if (el.scrollTop <= 24) {
      loadingOlderRef.current = true;
      const prevHeight = el.scrollHeight;
      await fetchNextPage();
      requestAnimationFrame(() => {
        const newHeight = el.scrollHeight;
        el.scrollTop = newHeight - prevHeight;
        loadingOlderRef.current = false;
      });
    }
  };

  // CHOOSE THE COLOR OF THE MESSAGE //
  const OTHER_USER_PALETTE = [
    "bg-slate-100",
    "bg-emerald-100",
    "bg-amber-100",
    "bg-rose-100",
    "bg-sky-100",
    "bg-indigo-100",
    "bg-lime-100",
    "bg-cyan-100",
    "bg-fuchsia-100",
    "bg-violet-100",
  ];

  const seedRef = useRef(Math.random().toString(36).slice(2));

  const hashString = useCallback((s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return h >>> 0;
  }, []);

  const otherColorFor = useCallback((author) => {
    const key = `${author || "unknown"}|${seedRef.current}`;
    const idx = hashString(key) % OTHER_USER_PALETTE.length;
    return OTHER_USER_PALETTE[idx];
  }, [hashString]);

  const bubbleClasses = useCallback((isMine, author) => {
    return isMine
      ? "bg-blue-500 text-white"
      : `${otherColorFor(author)} text-slate-900`;
  }, [otherColorFor]);
  // CHOOSE THE COLOR OF THE MESSAGE //


  return (
    <div className="flex h-full flex-col bg-white">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Messages */}
      <div
        ref={scrollRef}              
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading messages…</div>
        )}
        {isError && (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            Failed to load messages. <button className="ml-2 underline" onClick={() => refetch()}>Retry</button>
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Start the conversation…</div>
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {/* Older loader hint — restored */}
          {hasNextPage && (
            <div className="mb-2 mt-1 flex justify-center">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                Scroll up to load older…
              </span>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.author === currentUser;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), setMsgCtx({ open: true, x: e.clientX, y: e.clientY, message: m }))}>
                <div className={`max-w-[75%] ${mine ? "items-end text-right" : "items-start text-left"} flex flex-col`}>
                  {!mine && <span className="mb-1 text-xs text-slate-500">{m.author}</span>}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-[1.35] shadow-sm ${
                      bubbleClasses(mine, m.author)
                    } ${m._optimistic ? "opacity-70" : ""}`}
                  >
                    {m.text}
                  </div>
                  <span className="mt-1 text-[10px] leading-none text-slate-400">
                    {m._optimistic ? "sending…" : formatTime(m.createdAt)}
                     {m.editedAt ? " · edited" : ""}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Compose */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-2">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onInput={autoGrow}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message…"
            aria-label="Type your message"
            className="no-scrollbar w-full resize-none rounded-2xl border border-blue-200 bg-slate-900/5 px-3 py-2 text-[15px] leading-[1.2] shadow-sm outline-none transition-[height,background-color,border-color] duration-200 ease-out placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-300/40 backdrop-blur-md"
            style={{ height: "40px", minHeight: "40px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send"
            className={`ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md shadow-sm transition active:scale-[0.98] ${
              canSend
                ? "border-blue-300 text-blue-300 bg-slate-900/5 hover:bg-slate-900/10"
                : "border-blue-200 text-blue-200 bg-slate-900/5 cursor-not-allowed opacity-60"
            }`}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Message Context Menu */}
      {msgCtx.open && (
        <div ref={menuRef} role="menu" className="fixed z-[1000] min-w-[140px] rounded-md border border-slate-200 bg-white shadow-lg"
            style={{ left: safeLeft, top: safeTop }}
            onClick={(e) => e.stopPropagation()}>
          {msgCtx.message?.author === currentUser && (
            <button
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                setMsgCtx({ open: false, x: 0, y: 0, message: null });
                setEdit({ open: true, message: msgCtx.message, text: msgCtx.message?.text ?? "" });
              }}
            >
              Edit
            </button>
          )}
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-red-50 hover:text-red-600"
            onClick={() => {
              setMsgCtx({ open: false, x: 0, y: 0, message: null });
              setMsgConfirm({ open: true, message: msgCtx.message });
            }}>
            Delete
          </button>
        </div>
      )}

      {/* Message Delete Confirm */}
      {msgConfirm.open && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/20"
            onClick={() => setMsgConfirm({ open: false, message: null })}>
          <section onClick={(e) => e.stopPropagation()} className="w-[360px] rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete message?</h3>
            <p className="text-sm text-slate-600">This will remove the message for everyone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border px-4 py-2 text-sm" onClick={() => setMsgConfirm({ open: false, message: null })}>No</button>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={isDeletingMsg}
                onClick={() => {
                  const id = msgConfirm.message?.id;
                  if (id) mutateDeleteMessage({ messageId: id });
                  setMsgConfirm({ open: false, message: null });
                }}
              >
                {isDeletingMsg ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </section>
        </div>
      )}

      {edit.open && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/20"
            onClick={() => setEdit({ open: false, message: null, text: "" })}>
          <section onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Edit message</h3>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={4}
              value={edit.text}
              onChange={(e) => setEdit((s) => ({ ...s, text: e.target.value }))}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border px-4 py-2 text-sm"
                      onClick={() => setEdit({ open: false, message: null, text: "" })}>
                Cancel
              </button>
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={isEditingMsg || !edit.text.trim()}
                onClick={() => {
                  const id = edit.message?.id;
                  if (id) mutateEditMessage({ messageId: id, text: edit.text.trim() });
                  setEdit({ open: false, message: null, text: "" });
                }}>
                {isEditingMsg ? "Saving…" : "Save"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
