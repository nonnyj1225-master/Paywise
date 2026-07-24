import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ── Encouraging opening messages (randomly selected) ──
const OPENING_MESSAGES = [
  "Hey there! \uD83D\uDC4B I'm Nonny. How can I help you navigate PayWise today?",
  "Welcome back! \uD83D\uDCAA You're doing great just by being here. What do you need?",
  "Hi friend! \uD83C\uDF1F Taking control of your finances is a big deal. Where would you like to go?",
  "Good to see you! \uD83D\uDE0A I can take you anywhere in the app \u2014 just ask or tap below.",
  "You've got this! \uD83D\uDC99 What part of PayWise can I help you find?",
  "Hey hey! \u2728 Ready to make your money moves? Tell me where you'd like to go!",
  "So glad you're here! \uD83E\uDD17 I'm Nonny, your PayWise guide. Where to?",
  "Look at you, staying on top of things! \uD83D\uDC4F What can I help with today?",
  "Hi! \uD83C\uDF38 Whether it's bills or budgets, I can point the way. What do you need?",
  "Nice to see your face! \uD83D\uDE0E Tap a button or type a destination \u2014 I've got you.",
  "You're making smart choices just by showing up. \uD83E\uDDE0 Where would you like to go in PayWise?",
  "Hello hello! \uD83C\uDF08 I'm your friendly PayWise navigator. How can I help?",
];

const GREETINGS = [
  "Hey there! \uD83D\uDC4B How can I help you navigate PayWise?",
  "Hi! \u2728 Good to see you. What are you looking for?",
  "Hello! \uD83D\uDE0A I'm here to help you find your way around. Where to?",
  "Hey! \uD83C\uDF1F Ready to explore PayWise? Let me know where you'd like to go.",
  "Hi friend! \uD83D\uDC99 What part of the app can I help you find?",
];

// ── Quick-action buttons ──
interface QuickAction {
  icon: string;
  label: string;
  path: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: "\uD83D\uDCCA", label: "Dashboard", path: "/" },
  { icon: "\uD83D\uDCB5", label: "My Bills", path: "/bills" },
  { icon: "\uD83D\uDCC8", label: "Compare Jobs", path: "/compare" },
  { icon: "\uD83D\uDD38", label: "Resources", path: "/resources" },
  { icon: "\uD83C\uDFAF", label: "Goals", path: "/goals" },
  { icon: "\u2699\uFE0F", label: "Settings", path: "/settings" },
];

// ── Message type ──
interface Message {
  from: "nonny" | "user";
  text: string;
}

// ── Keyword matching ──
function matchIntent(input: string): { text: string; path?: string } | null {
  const q = input.toLowerCase().trim();

  // Dashboard / home
  if (/\b(dashboard|home|overview)\b/.test(q)) {
    return { text: "Taking you to your Dashboard!", path: "/" };
  }

  // Bills
  if (/\b(bills?|payment|due|pay)\b/.test(q)) {
    return { text: "Let's check your Bills!", path: "/bills" };
  }

  // Compare
  if (/\b(compare|job|difference|old job|new job)\b/.test(q)) {
    return { text: "Let's compare your jobs!", path: "/compare" };
  }

  // Help / Resources / Advice — redirect to Resources, NOT financial advice
  if (/\b(help|advice|advisor|advisors|counselor|counseling|financial help)\b/.test(q)) {
    return {
      text: "I can connect you to free local financial advisors! Taking you to Resources.",
      path: "/resources",
    };
  }

  // Settings
  if (/\b(settings|profile|account|rate|tax|insurance|deduction)\b/.test(q)) {
    return {
      text: "Taking you to Settings where you can update your profile!",
      path: "/settings",
    };
  }

  // Goals
  if (/\b(goal|goals|savings|save|target)\b/.test(q)) {
    return { text: "Taking you to Goals!", path: "/goals" };
  }

  // Logout
  if (/\b(logout|sign out|log out)\b/.test(q)) {
    return {
      text: "Tap your email in the top bar and select Log Out to sign out. I can't log you out from here — but you're in control!",
    };
  }

  // Greetings
  if (/\b(hello|hi|hey|yo|sup|howdy|hola|what's up)\b/.test(q)) {
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    return { text: greeting };
  }

  // Thanks
  if (/\b(thanks|thank you|thx|ty)\b/.test(q)) {
    return {
      text: "You're welcome! \uD83D\uDE0A I'm always here if you need to find your way around.",
    };
  }

  // Financial-adjacent queries that sound like advice-seeking
  if (
    /\b(invest|stock|crypto|retirement|should i|what should|how much|can i afford|is it worth|should i buy|debt|credit card|loan|mortgage|refinance|budget tip|money tip)\b/.test(
      q
    )
  ) {
    return {
      text: "I'm here to help you navigate PayWise! For financial advice, check out the Resources tab for free local counselors.",
    };
  }

  return null;
}

export default function NonnyBot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Open the chat and seed with a random greeting
  function handleOpen() {
    if (!open) {
      const greeting =
        OPENING_MESSAGES[Math.floor(Math.random() * OPENING_MESSAGES.length)];
      setMessages([{ from: "nonny", text: greeting }]);
    }
    setOpen((prev) => !prev);
  }

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessage(from: "nonny" | "user", text: string) {
    setMessages((prev) => [...prev, { from, text }]);
  }

  function handleQuickAction(action: QuickAction) {
    addMessage("user", `${action.icon} ${action.label}`);
    addMessage("nonny", `Taking you to ${action.label}!`);
    navigate(action.path);
  }

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    addMessage("user", trimmed);
    setInput("");

    // Try keyword matching
    const match = matchIntent(trimmed);
    if (match) {
      addMessage("nonny", match.text);
      if (match.path) {
        // Short delay so the user sees the response before navigating
        setTimeout(() => navigate(match.path!), 600);
      }
    } else {
      addMessage(
        "nonny",
        "I'm not sure what you're looking for! Try tapping one of the buttons below, or ask me to take you to: Dashboard, Bills, Compare, Resources, Goals, or Settings."
      );
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
          open
            ? "bg-gray-500 text-white rotate-45"
            : "bg-indigo-600 text-white"
        }`}
        aria-label={open ? "Close Nonny chat" : "Open Nonny chat"}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        ) : (
          <span className="text-2xl">💬</span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-32 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          style={{ maxHeight: "420px", height: "420px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <span className="font-semibold">Nonny</span>
              <span className="ml-1 inline-block w-2 h-2 rounded-full bg-green-300" />
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    msg.from === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-action buttons — always visible */}
          <div className="px-3 py-2 border-t border-gray-100 bg-white shrink-0">
            <p className="text-xs text-gray-400 mb-2 text-center font-medium uppercase tracking-wide">
              Quick Navigation
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action)}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 active:bg-indigo-100"
                >
                  <span className="text-base">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a destination..."
              className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 shrink-0"
              aria-label="Send"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
