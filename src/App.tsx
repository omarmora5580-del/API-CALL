/**
 * ============================================================================
 * UTILERÍA DE API CALL A LLM - FRONTEND CON HISTORIAL DE CHAT
 * ============================================================================
 * Aplicación didáctica que demuestra la comunicación Cliente-Servidor
 * con historial conversacional continuo (multi-turno), llamadas reales
 * al API de Gemini en el backend, indicador de carga en tiempo real,
 * manejo de errores e inspección de paquetes HTTP.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Trash2,
  Sparkles,
  Server,
  Globe,
  ShieldCheck,
  Check,
  Copy,
  AlertCircle,
  Clock,
  ArrowRight,
  Code2,
  Terminal,
  BookOpen,
  RefreshCw,
  Cpu,
  CornerDownLeft,
  User,
  Bot,
  RotateCcw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// Estructura de cada mensaje en el historial de conversación
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  meta?: {
    model?: string;
    latencyMs?: number;
    promptLength?: number;
    responseLength?: number;
    finishReason?: string;
  };
}

// Estructura del registro de inspección HTTP para aprendizaje
interface HttpTrace {
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
    timestamp: string;
  };
  response: {
    status: number;
    statusText: string;
    body: any;
    latencyMs: number;
  } | null;
}

export default function App() {
  // 1. Estados de la conversación
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 2. Estados del servidor y didáctica
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [httpTrace, setHttpTrace] = useState<HttpTrace | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'inspector' | 'arquitectura'>('chat');
  const [systemPersona, setSystemPersona] = useState<string>('pedagogico');

  // 3. Estado de expansión independiente para respuestas de Gemini (inician contraídas a 5-7 palabras)
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());

  // Referencias para auto-scroll y temporizador
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Helper para generar la versión resumida de aproximadamente 5 a 7 palabras
   */
  const getWordPreview = (text: string, limit: number = 7) => {
    if (!text) return { preview: '', isTruncated: false, wordCount: 0 };
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    if (wordCount <= limit) {
      return { preview: text, isTruncated: false, wordCount };
    }
    const preview = words.slice(0, limit).join(' ') + '...';
    return { preview, isTruncated: true, wordCount };
  };

  /**
   * Alterna de manera independiente la expansión/contracción de una respuesta específica
   */
  const toggleExpand = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /**
   * Expande o contrae todas las respuestas visibles
   */
  const toggleExpandAll = () => {
    const assistantIds = messages.filter((m) => m.role === 'assistant').map((m) => m.id);
    if (expandedMessageIds.size >= assistantIds.length && assistantIds.length > 0) {
      setExpandedMessageIds(new Set());
    } else {
      setExpandedMessageIds(new Set(assistantIds));
    }
  };

  // Preguntas rápidas de prueba pedagógica
  const exampleQuestions = [
    {
      label: '1. ¿Qué es Cliente-Servidor?',
      text: 'Explica de forma sencilla qué es la arquitectura cliente-servidor y qué rol cumple cada parte.',
    },
    {
      label: '2. ¿Por qué ocultar la API Key?',
      text: '¿Por qué nunca se debe guardar la API key en el código del navegador y cuál es el riesgo?',
    },
    {
      label: '3. Pregunta de seguimiento (Contexto)',
      text: 'Con base en lo que me acabas de explicar, ¿cuál sería un ejemplo práctico en la vida cotidiana?',
    },
    {
      label: '4. ¿Cómo funciona HTTP POST?',
      text: 'Explica qué viaja en el cuerpo (body) de una petición HTTP POST en formato JSON.',
    },
  ];

  // Comprobar la conexión con el servidor Express al cargar la aplicación
  useEffect(() => {
    checkServerHealth();
  }, []);

  // Desplazar automáticamente hacia el último mensaje cuando cambia el historial o el estado de carga
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, activeTab]);

  const checkServerHealth = async () => {
    try {
      setServerStatus('checking');
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setServerStatus('online');
        setHasApiKey(data.hasApiKey);
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  };

  /**
   * Envía la pregunta del usuario al servidor Express
   * y acumula la conversación en el historial sin borrar los mensajes previos.
   */
  const handleSendQuestion = async (customPrompt?: string) => {
    const textToSend = (typeof customPrompt === 'string' ? customPrompt : prompt).trim();

    // Validación: Evitar envíos vacíos
    if (!textToSend) {
      setErrorMessage('Por favor, escribe una pregunta antes de enviar la solicitud.');
      textareaRef.current?.focus();
      return;
    }

    // 1. Crear y agregar el mensaje del usuario de inmediato al historial
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    // Actualizar historial con la nueva pregunta del usuario
    setMessages((prev) => [...prev, userMsg]);
    setPrompt(''); // Limpiar el cuadro de texto para la siguiente pregunta
    setErrorMessage(null);
    setIsLoading(true);
    setElapsedTime(0);

    // Iniciar cronómetro de tiempo transcurrido en vivo
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Number(((Date.now() - startTime) / 1000).toFixed(1)));
    }, 100);

    // Configurar persona/rol pedagógico
    let systemInstruction = '';
    if (systemPersona === 'pedagogico') {
      systemInstruction =
        'Eres un profesor experto y didáctico de informática. Responde en español con explicaciones claras, amables, bien estructuradas y con ejemplos comprensibles para estudiantes de nivel introductorio.';
    } else if (systemPersona === 'conciso') {
      systemInstruction =
        'Responde en español de manera muy directa, técnica y concisa, yendo al grano sin rodeos innecesarios.';
    }

    // Formatear el historial previo para que Gemini tenga contexto conversacional
    const historyPayload = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const payload = {
      prompt: textToSend,
      history: historyPayload,
      systemInstruction: systemInstruction || undefined,
    };

    // Registrar traza para el Inspector HTTP didáctico
    const currentTrace: HttpTrace = {
      request: {
        url: '/api/ask',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload,
        timestamp: new Date().toLocaleTimeString(),
      },
      response: null,
    };

    try {
      /**
       * Comunicación Cliente -> Servidor Express
       * La petición viaja al endpoint /api/ask de nuestro servidor backend.
       */
      const fetchResponse = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const latency = Date.now() - startTime;
      const data = await fetchResponse.json();

      // Completar traza HTTP
      currentTrace.response = {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText || (fetchResponse.ok ? 'OK' : 'Error'),
        body: data,
        latencyMs: latency,
      };
      setHttpTrace(currentTrace);

      if (!fetchResponse.ok || !data.success) {
        throw new Error(data.error || 'El servidor devolvió un error al consultar el modelo.');
      }

      // 2. Agregar la respuesta real de Gemini debajo de la pregunta en orden cronológico
      const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        meta: data.meta,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Error durante la llamada:', err);
      const friendlyError =
        err?.message || 'No fue posible completar la comunicación con el servidor.';
      setErrorMessage(friendlyError);

      if (!currentTrace.response) {
        currentTrace.response = {
          status: 0,
          statusText: 'Network / Client Error',
          body: { error: friendlyError },
          latencyMs: Date.now() - startTime,
        };
        setHttpTrace(currentTrace);
      }
    } finally {
      clearInterval(timerRef.current);
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  /**
   * Limpia toda la conversación visible (borra el historial sin desconectar el servidor)
   */
  const handleClearConversation = () => {
    setMessages([]);
    setExpandedMessageIds(new Set());
    setErrorMessage(null);
    setElapsedTime(0);
    textareaRef.current?.focus();
  };

  /**
   * Limpia únicamente el texto del borrador en el cuadro de entrada
   */
  const handleClearDraft = () => {
    setPrompt('');
    setErrorMessage(null);
    textareaRef.current?.focus();
  };

  /**
   * Copia el texto de una respuesta al portapapeles
   */
  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  /**
   * Atajo de teclado: Ctrl + Enter o Cmd + Enter para enviar
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading) {
        handleSendQuestion();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* ================================================================== */}
      {/* ENCABEZADO SUPERIOR */}
      {/* ================================================================== */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Utilería de API Call a LLM
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Chat Historial
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Comunicación Cliente-Servidor real con modelo Gemini y memoria conversacional
              </p>
            </div>
          </div>

          {/* Badges de conexión del servidor y acciones globales */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                {serverStatus === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    serverStatus === 'online'
                      ? 'bg-emerald-500'
                      : serverStatus === 'checking'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <span className="font-medium hidden sm:inline">
                {serverStatus === 'online'
                  ? 'Servidor Express Conectado'
                  : serverStatus === 'checking'
                  ? 'Comprobando...'
                  : 'Servidor Desconectado'}
              </span>
              <span className="font-medium sm:hidden">
                {serverStatus === 'online' ? 'En línea' : 'Desconectado'}
              </span>
              <button
                onClick={checkServerHealth}
                title="Verificar conexión de nuevo"
                className="hover:text-white transition-colors ml-1 p-0.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>API Key Protegida</span>
            </div>

            {/* Botón para Limpiar Conversación */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearConversation}
                disabled={isLoading}
                title="Borrar el historial visible de preguntas y respuestas"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 hover:text-white border border-rose-800/40 text-xs font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpiar conversación</span>
                <span className="sm:hidden">Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {/* Pestañas de navegación */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-2 border-t border-slate-800/60 pt-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'chat'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Historial de Conversación</span>
            {messages.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                {messages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'inspector'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Inspector de Red HTTP</span>
            {httpTrace && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('arquitectura')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'arquitectura'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Flujo Académico & Código</span>
          </button>
        </div>
      </header>

      {/* ================================================================== */}
      {/* CUERPO PRINCIPAL */}
      {/* ================================================================== */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 flex-1 flex flex-col gap-4">
        {/* Notificación si falta la API Key en el entorno */}
        {!hasApiKey && serverStatus === 'online' && (
          <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-3.5 text-amber-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-amber-300">
                Aviso: Variable de entorno GEMINI_API_KEY no detectada
              </p>
              <p className="text-amber-200/80">
                El servidor Express no encontró la clave en <code className="bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-100 font-mono">process.env.GEMINI_API_KEY</code>.
                Asegúrate de haberla configurado en el panel de Secretos del entorno.
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PESTAÑA 1: HISTORIAL DE CONVERSACIÓN (CHAT) */}
        {/* ================================================================ */}
        {activeTab === 'chat' && (
          <div className="flex flex-col flex-1 gap-4">
            {/* Banner pedagógico de flujo cliente-servidor */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-200">Flujo activo:</span>
                <span className="text-slate-400">
                  Navegador &rarr; Servidor Express (/api/ask) &rarr; Google Gemini API &rarr; Navegador
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-slate-400 font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300 hidden sm:inline">
                  Vista inicial: 5-7 palabras
                </span>
                {messages.filter((m) => m.role === 'assistant').length > 0 && (
                  <button
                    type="button"
                    onClick={toggleExpandAll}
                    className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    {expandedMessageIds.size > 0 ? 'Contraer todas' : 'Expandir todas'}
                  </button>
                )}
                <span>Mensajes: <strong className="text-indigo-400">{messages.length}</strong></span>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearConversation}
                    className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
                  >
                    Borrar historial
                  </button>
                )}
              </div>
            </div>

            {/* ÁREA DE CONVERSACIÓN (HISTORIAL DESPLAZABLE) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex-1 min-h-[380px] max-h-[58vh] overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 shadow-inner">
              {/* Mensaje de bienvenida inicial si la conversación está vacía */}
              {messages.length === 0 && !isLoading && (
                <div className="my-auto py-10 flex flex-col items-center justify-center text-center text-slate-500 max-w-lg mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/10">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200 mb-1">
                    Historial de Conversación Vacío
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Escribe tu pregunta en el cuadro inferior o elige una de las sugerencias académicas.
                    Cada pregunta y respuesta quedará registrada en orden cronológico mientras la aplicación esté abierta.
                  </p>
                  <div className="w-full text-left space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Preguntas rápidas para comenzar:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {exampleQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPrompt(q.text);
                            textareaRef.current?.focus();
                          }}
                          className="text-left text-xs bg-slate-800/80 hover:bg-indigo-950/60 hover:text-indigo-200 hover:border-indigo-700/60 text-slate-300 p-2.5 rounded-xl border border-slate-700/60 transition-all cursor-pointer"
                        >
                          <p className="font-semibold text-indigo-300 mb-0.5">{q.label}</p>
                          <p className="text-[11px] text-slate-400 line-clamp-2">{q.text}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* RENDERIZADO CRONOLÓGICO DE MENSAJES */}
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isExpanded = expandedMessageIds.has(msg.id);
                const { preview, isTruncated, wordCount } = isUser
                  ? { preview: msg.content, isTruncated: false, wordCount: 0 }
                  : getWordPreview(msg.content, 7);

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${
                      isUser ? 'items-end' : 'items-start'
                    } gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  >
                    {/* Encabezado del mensaje con autor, hora y badges de estado */}
                    <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-400">
                      {isUser ? (
                        <>
                          <span className="font-mono text-slate-500">{msg.timestamp}</span>
                          <span className="font-semibold text-indigo-300 flex items-center gap-1">
                            Tú (Cliente)
                            <User className="w-3.5 h-3.5 text-indigo-400" />
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-emerald-400 flex items-center gap-1">
                            <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            Gemini AI (Servidor)
                          </span>
                          <span className="font-mono text-slate-500">{msg.timestamp}</span>
                          {msg.meta?.model && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                              {msg.meta.model}
                            </span>
                          )}
                          {msg.meta?.latencyMs && (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              {(msg.meta.latencyMs / 1000).toFixed(2)}s
                            </span>
                          )}
                          {/* Badge de formato breve vs completo */}
                          {isTruncated && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono border transition-all ${
                                isExpanded
                                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {isExpanded ? 'Respuesta completa' : 'Breve (5-7 palabras)'}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Burbuja del mensaje */}
                    <div
                      className={`relative max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-md select-text transition-all ${
                        isUser
                          ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/40 rounded-tr-sm'
                          : `bg-slate-950/90 text-slate-200 border rounded-tl-sm ${
                              isTruncated && !isExpanded
                                ? 'border-slate-700/80 hover:border-indigo-500/50 cursor-pointer shadow-indigo-950/20'
                                : 'border-slate-800'
                            }`
                      }`}
                      onClick={() => {
                        // Si es respuesta de Gemini y tiene contenido resumido, hacer clic en el mensaje permite expandir/contraer
                        if (!isUser && isTruncated) {
                          toggleExpand(msg.id);
                        }
                      }}
                    >
                      {isUser ? (
                        /* Las preguntas del usuario siempre se muestran completas */
                        <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                      ) : (
                        /* Respuestas de Gemini con sistema expandible/contraíble */
                        <div className="space-y-2.5">
                          <div className="whitespace-pre-wrap font-sans">
                            {isTruncated && !isExpanded ? (
                              <span className="font-medium text-slate-200">
                                {preview}
                              </span>
                            ) : (
                              msg.content
                            )}
                          </div>

                          {/* Indicador visual y botón interactivo para Leer más / Contraer */}
                          {isTruncated && (
                            <div className="pt-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(msg.id);
                                }}
                                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  isExpanded
                                    ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                                    : 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border-indigo-500/40 hover:text-white shadow-sm'
                                }`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Contraer a vista breve</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Leer más &bull; Ver respuesta completa ({wordCount} palabras)</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Barra inferior para mensajes del asistente con botón de copiar */}
                      {!isUser && (
                        <div
                          className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
                            <span>{msg.content.length} caracteres totales</span>
                            {isTruncated && (
                              <>
                                <span>&bull;</span>
                                <span>{wordCount} palabras</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isTruncated && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(msg.id)}
                                title={isExpanded ? 'Contraer respuesta' : 'Expandir respuesta'}
                                className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer mr-1"
                              >
                                {isExpanded ? (
                                  <>
                                    <Minimize2 className="w-3 h-3" />
                                    <span>Contraer</span>
                                  </>
                                ) : (
                                  <>
                                    <Maximize2 className="w-3 h-3" />
                                    <span>Expandir</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleCopy(msg.id, msg.content)}
                              title="Copiar respuesta original completa"
                              className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2 py-1 rounded-md border border-slate-700/60 transition-all cursor-pointer"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">¡Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-400" />
                                  <span>Copiar completa</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* INDICADOR DE ESPERA EN TIEMPO REAL CUANDO SE PROCESA UNA PREGUNTA */}
              {isLoading && (
                <div className="flex flex-col items-start gap-1.5 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                    <span className="font-semibold text-cyan-400 flex items-center gap-1">
                      <Bot className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                      Gemini AI (Procesando solicitud)
                    </span>
                    <span className="font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.2 rounded border border-cyan-800/40">
                      {elapsedTime} s
                    </span>
                  </div>

                  <div className="bg-slate-950/90 border border-indigo-500/40 rounded-2xl rounded-tl-sm p-4 text-sm text-slate-300 max-w-[90%] sm:max-w-[80%] flex flex-col gap-2.5 shadow-lg shadow-indigo-950/20">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-6 h-6 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin"></div>
                        <Sparkles className="w-3 h-3 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <span className="text-xs font-medium text-indigo-200">
                        El servidor Express está consultando la API de Gemini...
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Transfiriendo tokens vía HTTPS &bull; Tiempo: {elapsedTime}s</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AVISO DE ERROR DENTRO DEL CHAT */}
              {errorMessage && !isLoading && (
                <div className="my-2 p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 font-semibold text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Error en la llamada a la API</span>
                  </div>
                  <p className="text-xs leading-relaxed">{errorMessage}</p>
                  <div className="pt-2 border-t border-rose-900/50 flex items-center justify-between text-[11px] text-rose-300/80">
                    <span>Puedes intentar de nuevo o verificar la conexión del servidor.</span>
                    {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                      <button
                        type="button"
                        onClick={() => handleSendQuestion(messages[messages.length - 1].content)}
                        className="underline hover:text-white font-medium cursor-pointer"
                      >
                        Reintentar última pregunta
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Elemento ancla para auto-scroll */}
              <div ref={messagesEndRef} />
            </div>

            {/* SECCIÓN INFERIOR: ENTRADA DE PREGUNTA Y BOTONES */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
              {/* Sugerencias contextuales rápidas */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  Sugerencias rápidas:
                </span>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Cpu className="w-3 h-3 text-slate-500" />
                  <span>Modo:</span>
                  <button
                    onClick={() => setSystemPersona(systemPersona === 'pedagogico' ? 'conciso' : 'pedagogico')}
                    className="text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer ml-1"
                  >
                    {systemPersona === 'pedagogico' ? 'Docente Didáctico' : 'Técnico Conciso'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {exampleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(q.text);
                      textareaRef.current?.focus();
                    }}
                    className="text-[11px] bg-slate-800/80 hover:bg-indigo-950/60 hover:text-indigo-200 hover:border-indigo-700/60 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/70 transition-all cursor-pointer"
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Área de texto para escribir la pregunta */}
              <div className="relative">
                <textarea
                  id="user-prompt"
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe aquí tu pregunta para el modelo Gemini... (Ej: Explica cómo viaja una petición HTTP)"
                  rows={3}
                  disabled={isLoading}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl p-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none resize-none transition-all leading-relaxed font-sans"
                />
              </div>

              {/* Barra de acciones: Enviar, Limpiar borrador y Limpiar conversación */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  {/* Botón primario: Enviar pregunta */}
                  <button
                    type="button"
                    onClick={() => handleSendQuestion()}
                    disabled={isLoading || !prompt.trim()}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${
                      isLoading || !prompt.trim()
                        ? 'bg-slate-800 text-slate-500 border border-slate-700/40 cursor-not-allowed shadow-none'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25 active:scale-[0.98] cursor-pointer'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar pregunta</span>
                      </>
                    )}
                  </button>

                  {/* Botón para limpiar el texto actual que se está escribiendo */}
                  {prompt && (
                    <button
                      type="button"
                      onClick={handleClearDraft}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer"
                      title="Borrar el texto del cuadro de entrada"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpiar texto</span>
                    </button>
                  )}

                  {/* Botón para limpiar toda la conversación visible */}
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearConversation}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 transition-all cursor-pointer"
                      title="Borrar todo el historial de conversación"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Limpiar conversación</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                  <span>{prompt.length} caracteres</span>
                  <span className="hidden sm:inline">&bull;</span>
                  <span className="hidden sm:flex items-center gap-1">
                    <CornerDownLeft className="w-3 h-3" />
                    Ctrl + Enter para enviar
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* PESTAÑA 2: INSPECTOR DE RED HTTP (DIDÁCTICO) */}
        {/* ================================================================ */}
        {activeTab === 'inspector' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  Inspector de Red HTTP (Payload & Tracing)
                </h2>
                <p className="text-xs text-slate-400">
                  Inspecciona el paquete JSON real que el navegador envía a Express y la respuesta que devuelve el servidor.
                </p>
              </div>

              {httpTrace && (
                <div className="text-xs font-mono px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                  Última traza: {httpTrace.request.timestamp} &bull; {httpTrace.response?.latencyMs || 0} ms
                </div>
              )}
            </div>

            {httpTrace ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Solicitud HTTP (Request) */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 font-mono">
                      <ArrowRight className="w-3.5 h-3.5" />
                      HTTP REQUEST (Cliente &rarr; Servidor)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {httpTrace.request.method} {httpTrace.request.url}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Headers:
                    </span>
                    <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 overflow-x-auto">
                      {JSON.stringify(httpTrace.request.headers, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Body (Payload JSON con historial):
                    </span>
                    <pre className="text-[11px] font-mono text-emerald-400 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 overflow-x-auto max-h-[240px]">
                      {JSON.stringify(httpTrace.request.body, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Respuesta HTTP (Response) */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                      <Check className="w-3.5 h-3.5" />
                      HTTP RESPONSE (Servidor &rarr; Cliente)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        httpTrace.response?.status === 200
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      Status: {httpTrace.response?.status || 'N/A'}{' '}
                      {httpTrace.response?.statusText || ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Métricas de Latencia:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 text-slate-300">
                      <div>
                        Latencia de red:{' '}
                        <span className="text-emerald-400">
                          {httpTrace.response?.latencyMs} ms
                        </span>
                      </div>
                      <div>
                        Timestamp:{' '}
                        <span className="text-slate-400">
                          {new Date().toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Respuesta JSON de Gemini (Devuelta por Express):
                    </span>
                    <pre className="text-[11px] font-mono text-cyan-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 overflow-x-auto max-h-[240px]">
                      {JSON.stringify(httpTrace.response?.body, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
                <Terminal className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-400">
                  Aún no se ha realizado ninguna petición HTTP.
                </p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Envía una pregunta en la pestaña “Historial de Conversación” y regresa aquí para ver el paquete JSON completo.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* PESTAÑA 3: FLUJO ACADÉMICO Y CÓDIGO COMENTADO */}
        {/* ================================================================ */}
        {activeTab === 'arquitectura' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col gap-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Guía Didáctica: ¿Cómo funciona el Historial y la Comunicación Cliente-Servidor?
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Fundamentos sobre el flujo de datos, seguridad de claves de API y memoria multi-turno en LLMs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  1. Seguridad de la API Key en el Backend
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  El navegador nunca debe poseer la clave secreta. El cliente React solo invoca <code className="font-mono text-indigo-300">fetch('/api/ask')</code>. El servidor Express lee de forma confidencial <code className="font-mono text-indigo-300">process.env.GEMINI_API_KEY</code> y hace la petición segura hacia Google AI.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  2. ¿Cómo recuerda el contexto un LLM?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Los modelos de lenguaje no tienen memoria persistente propia entre llamadas. Para simular una conversación continua, el cliente envía el arreglo <code className="font-mono text-cyan-300">history</code> con los turnos anteriores en cada nueva petición, permitiendo que el modelo responda preguntas de seguimiento.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  3. Invocación con @google/genai
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  En el servidor, usamos <code className="font-mono text-emerald-300">ai.models.generateContent()</code> pasando la lista de contenidos con roles <code className="font-mono text-emerald-300">'user'</code> y <code className="font-mono text-emerald-300">'model'</code>, extrayendo la respuesta con <code className="font-mono text-emerald-300">response.text</code>.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  4. Limpieza del Historial
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Al pulsar “Limpiar conversación”, simplemente restablecemos el estado de React <code className="font-mono text-amber-300">setMessages([])</code>. Esto borra la vista y el contexto anterior, sin desconectar el servidor ni alterar la conexión con Gemini.
                </p>
              </div>
            </div>

            {/* Código comentado representativo */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                Manejo Multi-Turno en Express (<code className="font-mono text-indigo-300">server.ts</code>):
              </span>
              <pre className="text-xs font-mono bg-slate-950 border border-slate-800 p-4 rounded-xl text-slate-300 overflow-x-auto leading-relaxed">
{`// Construcción de contenidos multi-turno para el SDK de Gemini:
let contents = prompt.trim();

if (Array.isArray(history) && history.length > 0) {
  // Convertimos los mensajes previos al formato de Gemini (roles: 'user' y 'model')
  const validHistory = history.map(item => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }));

  // Agregamos la nueva pregunta al final de la secuencia
  contents = [
    ...validHistory,
    { role: 'user', parts: [{ text: prompt.trim() }] }
  ];
}

// Llamada al modelo con tolerancia a fallos (gemini-3.8-flash con respaldo gemini-3.1-flash-lite)
const response = await ai.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: contents
});`}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* PIE DE PÁGINA ACADÉMICO */}
      {/* ================================================================== */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-3.5 px-4 sm:px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Utilería de API Call a LLM &bull; Práctica académica de comunicación Cliente-Servidor y Chat Multi-Turno
          </span>
          <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
            Node.js + Express + React + Google Gemini API
          </span>
        </div>
      </footer>
    </div>
  );
}
