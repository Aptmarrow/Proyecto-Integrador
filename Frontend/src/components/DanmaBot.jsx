import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { askAssistant } from '../services/api';
import '../styles/chatbot.css';

const HIDDEN_ROUTES = ['/character-selection', '/game'];

const FAQ_ITEMS = [
  { emoji: '🎮', label: 'How do I play?', question: 'How do I play Danmakrew and what are the controls?' },
  { emoji: '🛡️', label: 'What roles & skills exist?', question: 'What roles exist in Danmakrew (Tank, Support, DPS, Special Attack) and what does each one do?' },
  { emoji: '🛒', label: 'How do Shop & Inventory work?', question: 'What can I find in the Shop and how does the Inventory & Chips system work?' },
  { emoji: '⚡', label: 'How do I play online?', question: 'How do I create or join a multiplayer room in Danmakrew?' },
];

const QUICK_CHIPS = [
  { label: 'Controls', question: 'What are the controls in Danmakrew?' },
  { label: 'Roles', question: 'Explain the 4 character roles in Danmakrew' },
  { label: 'Bosses', question: 'What bosses and worlds does Danmakrew have?' },
  { label: 'Difficulties', question: 'What is the difference between Normal, Difficult, and No Mercy?' },
];

const WELCOME_MSG = {
  id: 'welcome',
  sender: 'bot',
  text: 'Hey! 👋 I am **DanmaBot**, your **Danmakrew** assistant. Pick a frequent question or type below to ask me anything.',
};

function renderFormattedText(text) {
  const lines = String(text || '').split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={lineIdx}>
        {parts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            part
          )
        )}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
}

function getLocalFallbackAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('control') || q.includes('play') || q.includes('juega')) {
    return 'In **Danmakrew**, move with **WASD or Arrow Keys**, shoot with **Z / Space**, hold **Shift** for Focus Mode (precision movement), and trigger your special skill with **X**. During a *Beam Struggle*, mash **Z / Space** rapidly to win the clash.';
  }
  if (q.includes('role') || q.includes('rol') || q.includes('tank') || q.includes('support') || q.includes('dps')) {
    return 'There are 4 unique roles per squad:\n• **DPS:** high damage and fast fire rate.\n• **Tank:** higher HP/defense and deploys protective barriers.\n• **Support:** auto-aim shots and team healing.\n• **Special Attack:** fires **Master Spark** and triggers *Beam Struggles*.';
  }
  if (q.includes('room') || q.includes('online') || q.includes('multiplayer') || q.includes('sala')) {
    return 'From the main menu, click **PLAY** to create a room or join an existing one via room code or lobby browser. Then each player picks a unique role in Character Selection and hits **READY UP** to start.';
  }
  if (q.includes('difficult') || q.includes('mercy') || q.includes('dificultad')) {
    return 'The campaign has 3 difficulties: **Normal** (base), **Difficult** (+10% stats and crimson aura), and **No Mercy** (+25% stats and violet aura), each with 3 worlds and 3 stages.';
  }
  return 'I could not reach the assistant server right now. Please try again in a few seconds, or ask me about **controls**, **roles**, **online rooms**, or **difficulties**.';
}

export default function DanmaBot() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [showFaq, setShowFaq] = useState(true);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isHiddenRoute = HIDDEN_ROUTES.some((route) =>
    location.pathname.toLowerCase().startsWith(route)
  );

  // Cerrar el panel al cambiar de ruta
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Scroll automático al final de los mensajes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  // Enfocar input al abrir
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (isHiddenRoute) return null;

  const sendQuestion = async (rawText) => {
    const question = rawText.trim();
    if (!question || isTyping) return;

    setShowFaq(false);
    setInput('');
    const userMsg = { id: `u_${Date.now()}`, sender: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const data = await askAssistant(question);
      const replyText = data?.answer || getLocalFallbackAnswer(question);
      setMessages((prev) => [
        ...prev,
        { id: `b_${Date.now()}`, sender: 'bot', text: replyText },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `b_${Date.now()}`, sender: 'bot', text: getLocalFallbackAnswer(question) },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const handleReset = () => {
    if (isTyping) return;
    setMessages([WELCOME_MSG]);
    setShowFaq(true);
    setInput('');
  };

  return (
    <div className={`cb-root${isOpen ? ' cb-open' : ''}`} id="cbRoot">
      {/* Fondo sutil al abrir */}
      <div
        className="cb-backdrop"
        id="cbBackdrop"
        onClick={() => setIsOpen(false)}
      />

      {/* Floating chatbot button */}
      <button
        type="button"
        className="cb-fab"
        id="cbOpenBtn"
        aria-label="Open DanmaBot assistant"
        onClick={() => setIsOpen(true)}
      >
        <span className="cb-tooltip">Need help?</span>
        <span className="cb-status-dot" />
        <svg
          className="cb-bot-icon"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Antena */}
          <line x1="32" y1="10" x2="32" y2="18" stroke="#00e5ff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="8" r="3.5" fill="#ff2a85" />
          {/* Orejas */}
          <rect x="6" y="27" width="6" height="14" rx="3" fill="#00e5ff" />
          <rect x="52" y="27" width="6" height="14" rx="3" fill="#ff2a85" />
          {/* Cabeza */}
          <rect x="12" y="18" width="40" height="32" rx="12" fill="#131629" stroke="url(#cbGrad)" strokeWidth="3" />
          {/* Pantalla/Cara */}
          <rect x="18" y="24" width="28" height="20" rx="7" fill="#090b16" />
          {/* Ojos animados */}
          <g className="cb-eyes">
            <circle cx="26" cy="33" r="3" fill="#00e5ff" />
            <circle cx="38" cy="33" r="3" fill="#00e5ff" />
          </g>
          {/* Sonrisa */}
          <path d="M27.5 39C29 41 35 41 36.5 39" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          <defs>
            <linearGradient id="cbGrad" x1="12" y1="18" x2="52" y2="50" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00e5ff" />
              <stop offset="1" stopColor="#ff2a85" />
            </linearGradient>
          </defs>
        </svg>
      </button>

      {/* Barra lateral derecha del Chatbot */}
      <aside className="cb-drawer" id="cbDrawer" aria-hidden={!isOpen}>
        {/* Encabezado */}
        <header className="cb-header">
          <div className="cb-header-info">
            <div className="cb-avatar">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="16" width="44" height="34" rx="12" fill="#131629" stroke="#00e5ff" strokeWidth="3" />
                <circle cx="25" cy="32" r="3.5" fill="#00e5ff" />
                <circle cx="39" cy="32" r="3.5" fill="#00e5ff" />
                <path d="M26 40C28.5 42.5 35.5 42.5 38 40" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="cb-avatar-dot" />
            </div>
            <div>
              <h3 className="cb-title">DanmaBot</h3>
              <span className="cb-subtitle">Online • AI Assistant</span>
            </div>
          </div>

          <div className="cb-header-actions">
            <button
              type="button"
              className="cb-icon-btn"
              id="cbResetBtn"
              title="Reset chat"
              aria-label="Reset chat"
              onClick={handleReset}
              disabled={isTyping}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              type="button"
              className="cb-icon-btn"
              id="cbCloseBtn"
              title="Close"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        {/* Área de mensajes */}
        <div className="cb-messages" id="cbMessages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`cb-msg ${msg.sender === 'user' ? 'cb-msg--user' : 'cb-msg--bot'}`}
            >
              {renderFormattedText(msg.text)}
            </div>
          ))}

          {/* FAQ Cards */}
          {showFaq && (
            <div className="cb-faq-section" id="cbFaqSection">
              <span className="cb-faq-label">Frequently Asked Questions</span>
              <div className="cb-faq-list">
                {FAQ_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="cb-faq-card"
                    onClick={() => sendQuestion(item.question)}
                    disabled={isTyping}
                  >
                    <span className="cb-faq-emoji">{item.emoji}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="cb-typing" id="cbTyping" aria-label="DanmaBot is typing">
              <span />
              <span />
              <span />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        <div className="cb-chips">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="cb-chip"
              onClick={() => sendQuestion(chip.question)}
              disabled={isTyping}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Bottom input bar */}
        <form className="cb-input-bar" id="cbForm" autoComplete="off" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="cb-input"
            id="cbInput"
            placeholder="Type your question..."
            aria-label="Type your question"
            maxLength={1000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <button
            type="submit"
            className="cb-send-btn"
            aria-label="Send message"
            disabled={isTyping || !input.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </aside>
    </div>
  );
}
