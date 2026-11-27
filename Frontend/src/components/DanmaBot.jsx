import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { askAssistant } from '../services/api';
import '../styles/chatbot.css';

const HIDDEN_ROUTES = ['/character-selection', '/game', '/sandbox', '/dev', '/test'];

const FAQ_ITEMS = [
  { emoji: '🎮', label: '¿Cómo se juega?', question: '¿Cómo se juega a Danmakrew y cuáles son los controles?' },
  { emoji: '🛡️', label: '¿Qué roles y habilidades hay?', question: '¿Qué roles existen en Danmakrew (Tank, Support, DPS, Special Attack) y qué hace cada uno?' },
  { emoji: '🛒', label: '¿Qué hay en Shop e Inventory?', question: '¿Qué encuentro en la Shop y cómo funciona el Inventory?' },
  { emoji: '⚡', label: '¿Cómo jugar en sala online?', question: '¿Cómo creo o me uno a una sala multijugador en Danmakrew?' },
];

const QUICK_CHIPS = [
  { label: 'Controles', question: '¿Cuáles son los controles de Danmakrew?' },
  { label: 'Roles', question: 'Explicame los 4 roles de personajes en Danmakrew' },
  { label: 'Jefes', question: '¿Qué jefes y mundos tiene Danmakrew?' },
  { label: 'Dificultades', question: '¿Qué diferencia hay entre Normal, Difficult y No Mercy?' },
];

const WELCOME_MSG = {
  id: 'welcome',
  sender: 'bot',
  text: '¡Hola! 👋 Soy **DanmaBot**, tu asistente de **Danmakrew**. Elegí una pregunta frecuente o escribime abajo en qué te puedo ayudar.',
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
  if (q.includes('control') || q.includes('juega')) {
    return 'En **Danmakrew** te movés con **WASD o Flechas**, disparás con **Z / Espacio**, activás modo precisión (hitbox reducida) manteniendo **Shift**, y lanzás tu habilidad especial con **X**. En un *Beam Struggle*, presioná **Z / Espacio** rápido para ganar el choque.';
  }
  if (q.includes('rol') || q.includes('tank') || q.includes('support') || q.includes('dps')) {
    return 'Hay 4 roles únicos por escuadrón:\n• **DPS:** alto daño y cadencia rápida.\n• **Tank:** mayor vida/defensa y despliega barreras protectoras.\n• **Support:** disparos auto-aim y soporte de curación.\n• **Special Attack:** disparo de **Master Spark** y choques de rayos (*Beam Struggle*).';
  }
  if (q.includes('sala') || q.includes('online') || q.includes('multijugador')) {
    return 'Desde el menú principal tocá **PLAY** para crear una sala o unirte a una existente por código/explorador. Luego cada jugador elige un rol único en la selección de personaje y marca **LISTO** para iniciar.';
  }
  if (q.includes('dificultad') || q.includes('mercy') || q.includes('difficult')) {
    return 'La campaña tiene 3 dificultades: **Normal** (base), **Difficult** (+10% stats y aura carmesí) y **No Mercy** (+25% stats y aura violeta), cada una con 3 mundos y 3 sectores.';
  }
  return 'En este momento no pude conectar con el servidor del asistente. Intentá nuevamente en unos segundos o consultame sobre **controles**, **roles**, **salas online** o **dificultades**.';
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

  // Enfocar input al abrir solo en escritorio (en móvil evita tapar las FAQs con el teclado)
  useEffect(() => {
    if (isOpen) {
      const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
      if (!isCoarse) {
        const timer = setTimeout(() => inputRef.current?.focus(), 220);
        return () => clearTimeout(timer);
      }
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

      {/* Botón flotante con carita de chatbot */}
      <button
        type="button"
        className="cb-fab"
        id="cbOpenBtn"
        aria-label="Abrir asistente DanmaBot"
        onClick={() => setIsOpen(true)}
      >
        <span className="cb-tooltip">¿Necesitás ayuda?</span>
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
              <span className="cb-subtitle">En línea • Asistente IA</span>
            </div>
          </div>

          <div className="cb-header-actions">
            <button
              type="button"
              className="cb-icon-btn"
              id="cbResetBtn"
              title="Reiniciar chat"
              aria-label="Reiniciar chat"
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
              title="Cerrar"
              aria-label="Cerrar chat"
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

          {/* Tarjetas de Preguntas Frecuentes */}
          {showFaq && (
            <div className="cb-faq-section" id="cbFaqSection">
              <span className="cb-faq-label">Preguntas frecuentes</span>
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

          {/* Indicador de escribiendo */}
          {isTyping && (
            <div className="cb-typing" id="cbTyping" aria-label="DanmaBot está escribiendo">
              <span />
              <span />
              <span />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chips rápidos */}
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

        {/* Barra inferior para escribir */}
        <form className="cb-input-bar" id="cbForm" autoComplete="off" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="cb-input"
            id="cbInput"
            placeholder="Escribí tu consulta..."
            aria-label="Escribí tu consulta"
            maxLength={1000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <button
            type="submit"
            className="cb-send-btn"
            aria-label="Enviar mensaje"
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
