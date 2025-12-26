import React, { useState, useEffect, useContext, useCallback  } from 'react';
import { Link, useNavigate, useLocation, replace } from 'react-router-dom';
import { LogOut, Menu, Settings, Plus, Home } from 'lucide-react';
import SettingsPopup from './SettingsPopup';
import { ToastContainer, toast } from 'react-toastify';
import { Routes, Route, useMatch } from 'react-router-dom';
import ChatWindow from './ChatWindow';
import axios from '../api/axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AuthContext from "../context/AuthProvider";
import { socket } from '../api/socket';

const Main = ({ setForcedLogout }) => {
  const [showChats, setShowChats] = useState(true);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [ctx, setCtx] = useState({ open: false, x: 0, y: 0, chat: null });
  const [confirm, setConfirm] = useState({ open: false, chat: null });


  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const match = useMatch('/main/chats/:chatId');
  const openChatId = match?.params?.chatId ?? null;

  const { auth, setAuth } = useContext(AuthContext);

  const cols = showChats
    ? "minmax(16rem,22vw) 1fr"
    : "0 1fr";

  const blur = (showAddPopup || showSettingsPopup)
    ? "blur(10px)"
    : "blur(0)";

  const fetchChats = async () => {
    const res = await axios.get('/chats', { params: { username: auth.username } });
    return res.data ?? [];
  }

  const createChat = async ({ mode, usernames, name }) => {
    const payload = { mode, usernames: [auth.username, ...usernames] };
    if (mode === 'group') payload.name = name;
    const res = await axios.post('/chats', payload);
    return res.data;
  }

  //WS SUBSCRIPTION TO MESSAGE:DELETED //
  useEffect(() => {
    if (!auth?.username) return;

    const onMsgDeleted = ({ chatId, messageId, newLastMessage }) => {
      qc.setQueryData(['chats', auth.username], (prev = []) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((c) => {
          const cid = c.id ?? c._id;
          if (String(cid) !== String(chatId)) return c;

          // Only touch preview if it referenced the deleted message, or server provided a replacement
          const wasLast = c.lastMessage?.id && String(c.lastMessage.id) === String(messageId);
          if (!wasLast && !newLastMessage) return c;

          const next = { ...c };
          if (newLastMessage) {
            next.lastMessage = {
              id: newLastMessage.id,
              text: newLastMessage.text,
              author: newLastMessage.author,
              createdAt: newLastMessage.createdAt,
            };
            next.lastMessageAt = newLastMessage.createdAt || next.lastMessageAt;
          } else {
            next.lastMessage = null;
          }
          return next;
        });
      });
    };

    socket.on('message:deleted', onMsgDeleted);
    return () => socket.off('message:deleted', onMsgDeleted);
  }, [auth?.username, qc]);
  //WS SUBSCRIPTION TO MESSAGE:DELETED //

  /* WS SUBSCRIPTION TO CHAT:CREATED */
  useEffect(() => {
    if (!auth?.username) return;

    const onChatCreated = (payload) => {
      // Accept either { chat: {...} } or the chat object directly
      const newChat = payload?.chat ?? payload;
      if (!newChat) return;

      // Try to detect members array across different server shapes
      const rawMembers =
        newChat.members ??
        newChat.usernames ??
        newChat.participants ??
        [];

      const memberUsernames = Array.isArray(rawMembers)
        ? rawMembers.map((m) => (typeof m === 'string' ? m : m?.username)).filter(Boolean)
        : [];

      // Only handle chats that include the current user
      const includesMe =
        memberUsernames.length === 0 // if server didn't send members, assume it's for us
          ? true
          : memberUsernames.includes(auth.username);

      if (!includesMe) return;

      // Normalize a minimal object (keeps all server fields, but ensures an id)
      const normalized = {
        id: newChat.id ?? newChat._id,
        ...newChat,
      };

      // Deduplicate and prepend to the chats cache
      qc.setQueryData(['chats', auth.username], (prev = []) => {
        const exists = prev.some(
          (c) => (c.id ?? c._id) === (normalized.id ?? normalized._id)
        );
        if (exists) return prev;
        return [normalized, ...prev];
      });

      // (Optional) toast
      try {
        const kind = newChat.type === 'group' ? 'group' : 'chat';
        toast.info(`New ${kind} created`);
      } catch {}
    };

    // Subscribe
    socket.on('chat:created', onChatCreated);

    // Cleanup
    return () => {
      socket.off('chat:created', onChatCreated);
    };
  }, [auth?.username, qc]);
  /* WS SUBSCRIPTION TO CHAT:CREATED */

  //WS SUBSCRIPTION TO MESSAGE:EDITED //
  useEffect(() => {
    if (!auth?.username) return;

    const onMsgEdited = ({ chatId, messageId, text }) => {
      qc.setQueryData(['chats', auth.username], (prev = []) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map(c => {
          const cid = c.id ?? c._id;
          if (String(cid) !== String(chatId)) return c;
          if (c.lastMessage?.id && String(c.lastMessage.id) === String(messageId)) {
            return { ...c, lastMessage: { ...c.lastMessage, text } };
          }
          return c; 
        });
      });
    };

    socket.on('message:edited', onMsgEdited);
    return () => socket.off('message:edited', onMsgEdited);
  }, [auth?.username, qc]);
  //WS SUBSCRIPTION TO MESSAGE:EDITED //

  /* HANDLING OF THE ADD CHAT POPUP */
  const [mode, setMode] = useState('chat');
  const [usernames, setUsernames] = useState('');
  const [groupName, setGroupName] = useState('');

  const {
    data: chats = [],
    isLoading: chatsLoading,
    isError: chatsError,
  } = useQuery({
    queryKey: ['chats', auth.username],
    queryFn: fetchChats,
    staleTime: 30_000,
  });

  const {
    mutate: mutateCreateChat,
    isPending: isCreating,
  } = useMutation({
    mutationFn: createChat,
    onSuccess: (newChat) => {
      qc.setQueryData(['chats', auth.username], (prev = []) => {
        const id = newChat.id ?? newChat._id;
        if (prev.some(c => (c.id ?? c._id) === id)) return prev;
        return [newChat, ...prev];
      });
      navigate(`/main/chats/${newChat.id}`);
      setShowAddPopup(false);
      setUsernames('');
      setMode('chat');
    },
    onError: (err) => {
      if (!err?.response) setErrMsg('No server response');
      else setErrMsg('Chat creation failed');
    },
  })

  const handleCreate = () => {
    const userArr = usernames.split(/\s*,\s*/).map(username => username.trim()).filter(Boolean);

    if (mode === 'chat' && userArr.length !== 1) {
      setErrMsg('For a chat, provide exactly one username.');
      return;
    }
    if (mode === 'group' && userArr.length < 2) {
      setErrMsg('For a group, provide two or more usernames.');
      return;
    }
    if (mode === 'group' && !groupName.trim()) {
      setErrMsg('Please enter a group name.');
      return;
    }

    mutateCreateChat({ mode, usernames: userArr, name: groupName.trim() });
  };
  /* HANDLING OF THE ADD CHAT POPUP */

  useEffect(() => {
    if (errMsg) {
      toast.error(errMsg);
      const t = setTimeout(() => setErrMsg(''), 5000);
      return () => clearTimeout(t);
    }
  }, [errMsg])

  // CHAT DELETION LOGIC//
  // Close on any global click/esc
  useEffect(() => {
    const closeAll = () => setCtx({ open: false, x: 0, y: 0, chat: null });
    const onEsc = (e) => { if (e.key === 'Escape') { closeAll(); setConfirm({ open: false, chat: null }); } };
    window.addEventListener('click', closeAll);
    window.addEventListener('contextmenu', closeAll);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('click', closeAll);
      window.removeEventListener('contextmenu', closeAll);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  // --- helper used by WS & as a safety fallback after a successful DELETE ---
  const handleChatDeletedLocally = useCallback((deletedId) => {
    if (!deletedId) return;

    // 1) Remove chat from sidebar cache
    qc.setQueryData(['chats', auth.username], (prev = []) =>
      Array.isArray(prev) ? prev.filter(c => (c.id ?? c._id) !== deletedId) : prev
    );

    // 2) Wipe messages cache for that chat
    qc.removeQueries({ queryKey: ['messages', deletedId], exact: true });

    // 3) If viewing that chat, navigate away
    if (location.pathname === `/main/chats/${deletedId}`) {
      navigate('/main', { replace: true });
    }
  }, [qc, auth?.username, location.pathname, navigate]);

  // ---- OPTIMISTIC DELETE ----
  const deleteChatApi = async (chatId) => {
    // If your server uses JWT, you can drop the body; otherwise keep username.
    await axios.delete(`/chats/${chatId}`, { data: { username: auth.username } });
  };

  const { mutate: mutateDeleteChat, isPending: isDeleting } = useMutation({
    mutationFn: deleteChatApi,

    // Apply the deletion immediately
    onMutate: async (chatId) => {
      await qc.cancelQueries({ queryKey: ['chats', auth.username] });
      await qc.cancelQueries({ queryKey: ['messages', chatId] });

      const prevChats = qc.getQueryData(['chats', auth.username]);
      const prevMsgs  = qc.getQueryData(['messages', chatId]);

      // one line instead of repeating the logic
      handleChatDeletedLocally(chatId);

      return { prevChats, prevMsgs, chatId, viewingThisChat: location.pathname === `/chats/${chatId}` };
    },

    // If server fails, restore caches (and optionally route)
    onError: (_err, chatId, ctx) => {
      if (ctx?.prevChats) qc.setQueryData(['chats', auth.username], ctx.prevChats);
      if (ctx?.prevMsgs)  qc.setQueryData(['messages', chatId], ctx.prevMsgs);

      // If we navigated away solely because of this delete, you can take the user back.
      // Only do it if they haven't moved somewhere else meanwhile.
      if (ctx?.viewingThisChat && location.pathname === '/') {
        navigate(`/main/chats/${chatId}`, { replace: true });
      }

      toast.error('Failed to delete chat');
    },

    // Keep things fresh either way
    onSettled: (_data, _err, chatId) => {
      qc.invalidateQueries({ queryKey: ['chats', auth.username] });
      // No need to invalidate ['messages', chatId]; we either removed it or restored it.
    },
  });

  /* WS SUBSCRIPTION TO CHAT:DELETED */
  useEffect(() => {
    if (!auth?.username) return;

    const onChatDeleted = (payload) => {
      const deletedId = payload?.chatId || payload?.id || payload?._id;
      if (!deletedId) return;

      // idempotent: safe if we already removed it optimistically
      handleChatDeletedLocally(String(deletedId));
    };

    socket.on('chat:deleted', onChatDeleted);
    return () => { socket.off('chat:deleted', onChatDeleted); };
  }, [auth?.username, handleChatDeletedLocally]);
  // CHAT DELETION LOGIC//

  return (
    <>
     <ToastContainer theme="colored"/>
      <section className='main-grid relative w-full h-[99vh] rounded-2xl overflow-hidden grid'
        style={{ gridTemplateRows: "1fr", gridTemplateColumns: "auto 1fr", filter: blur }}
      >

        {!showChats && (
          <button
            type="button"
            aria-label="Open sidebar"
            aria-expanded={showChats}
            onClick={() => setShowChats(true)}
            className={`absolute left-0 top-3 z-20 group focus:outline-none ${!showChats ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <span
              className="
                h-10 w-6
                rounded-r-2xl shadow
                bg-slate-300/80
                flex items-center justify-center
                transition-all duration-200 ease-out
                group-hover:bg-slate-400 group-hover:translate-x-1
                focus-visible:ring-2 focus-visible:ring-slate-300
              "
            >
              <Menu size={18} className="transition-colors text-slate-600 group-hover:text-slate-800" />
            </span>
          </button>
        )}

        <aside className={`bg-white border-r border-black transition-all duration-300 overflow-hidden ${showChats ? "w-20 sm:w-30 md:w-52 lg:w-64 opacity-100 " : "w-0 opacity-0 pointer-events-none"}`}>
          <header className='controls border-b border-black flex items-center justify-between h-16'>
            <div className="flex gap-4 text-2x">
              <button onClick={() => setShowAddPopup(!showAddPopup)} className='plus-icon text-blue-300 active:scale-90 transition-transform duration-300 ease-out -translate-x-4 lg:translate-x-0'><Plus size={52}/></button>
              <button onClick={() => setShowChats(!showChats)} className='hide-btn text-blue-300 transition-transform duration-300 ease-out -translate-x-42 sm:-translate-x-32 md:-translate-x-10 lg:translate-x-0'><Menu size={48}/></button>
            </div>
          </header>
          <div className='chat-list flex-1 overflow-y-auto'>
            {chatsLoading && (
              <div className="p-4 text-sm text-slate-500">Loading chats…</div>
            )}
            {chatsError && (
              <div className="p-4 text-sm text-red-600">Failed to load chats</div>
            )}
            {!chatsLoading && !chatsError && chats.length === 0 && (
              <div className="p-4 text-sm text-slate-500">No chats yet</div>
            )}

            {!chatsLoading && !chatsError && chats.map((chat) => {
              const id = String(chat.id ?? chat._id);
              const isActive = id === openChatId;

              const title =
                chat.name || chat.fallbackTitle || (chat.type === 'chat' ? 'Chat' : 'Group');
              const preview = chat.lastMessage?.text || 'No messages yet';
              const memberNames = (chat.members ?? chat.usernames ?? chat.participants ?? [])
                .map((m) => (typeof m === 'string' ? m : m?.username))
                .filter(Boolean)
                .filter((u) => u !== auth.username);

              const hoverText = memberNames.length ? `Members: ${memberNames.join(', ')}` : 'Only you';

              return (
                <button
                  key={id}
                  title={hoverText}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-slate-100 ${isActive ? 'bg-slate-100' : ''}`}
                  onClick={() => {
                    const target = `/main/chats/${id}`;
                    if (location.pathname !== target) navigate(target);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setCtx({ open: true, x: e.clientX, y: e.clientY, chat });
                  }}
                >
                  <div className="font-medium truncate">{title}</div>
                  <div className="text-xs text-slate-500 truncate">{preview}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="relative overflow-hidden flex flex-col">
          <div
            aria-hidden
            className="absolute inset-0 -z-10
             bg-gradient-to-br from-slate-100 via-white to-slate-200
             opacity-70 saturate-100"
          />

          <header className='bg-white controls border-b border-black flex items-center justify-end h-16'>
            <div className="flex gap-4 text-2xl">
              <button onClick={() => navigate('/main')} aria-label="Home" className="home-btn text-blue-300 active:scale-90"><Home size={48}/></button>
              <button onClick={() => setShowSettingsPopup(!showSettingsPopup)} className='text-blue-300 active:scale-90'><Settings size={48}/></button>
              <button onClick={() => setForcedLogout(true)} className='text-blue-300 active:scale-90'><LogOut size={48}/></button>
            </div>
          </header>
          <div className='messages flex-1 overflow-y-auto min-h-0'>
            <Routes>
              <Route path="chats/:chatId" element={<ChatWindow />} />
            </Routes>
          </div>
        </main>



      </section>

      <div onClick={() => setShowAddPopup(false)} className={`w-full h-full absolute flex justify-center items-center ${showAddPopup ? "" : "pointer-events-none"}`}>
        <section onClick={(e) => e.stopPropagation()} className={`relative flex flex-col justify-center items-center h-100 w-100 rounded-2xl shadow-2xl bg-white ${showAddPopup ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <button onClick={() => setShowAddPopup(false)} className="absolute top-4 right-4 text-2xl font-bold active:scale-90 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">&times;</button>

          <div className='space-y-1.5 flex flex-col justify-center items-center mt-4'>
            <label className="text-lg font-medium text-gray-800">
              Do you want to start a chat or create a group?
            </label>
            <select 
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="block w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="chat">Chat</option>
              <option value="group">Group</option>
            </select>
          </div>

          <div className='space-y-1.5 flex flex-col justify-center items-center mt-3'>
            <label className="text-lg font-medium text-gray-800">
              Enter the username{mode === 'group' ? 's' : ''}:
            </label>
            <input
              type="text"
              value={usernames}
              onChange={(e) => setUsernames(e.target.value)}
              placeholder={mode === 'chat' ? 'e.g. john_doe' : 'e.g. john_doe, jane_doe'}
              className="block w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {mode === 'group' && (
            <div className='space-y-1.5 flex flex-col justify-center items-center mt-3'>
              <label className="text-lg font-medium text-gray-800">
                Enter the name for the group:
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={'Business chat'}
                className="block w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          )}

          <div className='pt-11'>
            <button
              onClick={handleCreate}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition active:translate-y-px"
            >
              Create
            </button>
          </div>

        </section>
      </div>

      <div onClick={() => setShowSettingsPopup(false)} className={`w-full h-full absolute flex justify-center items-center ${showSettingsPopup ? "" : "pointer-events-none"}`}>
        <SettingsPopup errMsg={errMsg} setErrMsg={setErrMsg} setForcedLogout={setForcedLogout} showSettingsPopup={showSettingsPopup} setShowSettingsPopup={setShowSettingsPopup} />
      </div>

      {/* Context Menu */}
      {ctx.open && (
        <div
          role="menu"
          className="fixed z-[1000] min-w-[160px] rounded-md border border-slate-200 bg-white shadow-lg"
          style={{ left: Math.max(8, ctx.x - 4), top: Math.max(8, ctx.y - 4) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-red-50 hover:text-red-600"
            onClick={() => {
              setCtx({ open: false, x: 0, y: 0, chat: null });
              setConfirm({ open: true, chat: ctx.chat });
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirm.open && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/20"
          onClick={() => setConfirm({ open: false, chat: null })}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Delete chat?
            </h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete this chat and all its messages?
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setConfirm({ open: false, chat: null })}
              >
                No
              </button>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => {
                  const id = confirm.chat?.id ?? confirm.chat?._id;
                  if (id) mutateDeleteChat(id);
                  setConfirm({ open: false, chat: null });
                }}
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default Main;
