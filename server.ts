/**
 * ============================================================================
 * SERVIDOR EXPRESS - UTILERÍA DE API CALL A LLM
 * ============================================================================
 * Objetivo académico:
 * Demostrar de forma clara y funcional cómo el cliente (navegador web)
 * se comunica con un servidor (Node.js + Express), y cómo este servidor
 * realiza una llamada segura a la API del modelo Gemini de Google sin
 * exponer la API Key en el código del frontend.
 * Soporta solicitudes simples y conversaciones multi-turno (historial de chat).
 * ============================================================================
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

// 1. Cargar las variables de entorno desde el archivo .env
dotenv.config();

// Obtener rutas del sistema de archivos en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // El entorno de AI Studio ejecuta el servidor en el puerto 3000
  const PORT = Number(process.env.PORT) || 3000;

  // 2. Middleware para interpretar cuerpos de petición en formato JSON
  app.use(express.json());

  /**
   * Ruta de estado de salud (Health Check)
   * Permite al frontend verificar que el servidor Express está respondiendo
   * y comprobar si la variable secreta GEMINI_API_KEY está configurada,
   * sin exponer en ningún momento su valor.
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
    return res.json({
      status: 'ok',
      hasApiKey,
      defaultModel: 'gemini-3.1-flash-lite',
      fallbackModel: 'gemini-3.8-flash',
      features: ['single-turn', 'multi-turn-chat', 'network-tracing'],
      serverTime: new Date().toISOString(),
    });
  });

  /**
   * Helper para invocar a Gemini con reintentos y tolerancia a fallos
   * Utiliza 'gemini-3.1-flash-lite' con reintentos exponenciales para superar
   * los picos de demanda momentáneos (error 503) típicos en modelos públicos.
   */
  async function callGeminiWithFallback(
    ai: GoogleGenAI,
    contents: any,
    requestedModel?: string,
    systemInstruction?: string
  ) {
    const modelToUse = requestedModel || 'gemini-3.1-flash-lite';
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Servidor] Solicitando generación a Gemini: ${modelToUse} (Intento ${attempt}/3)`);
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: contents,
          config: systemInstruction ? { systemInstruction } : undefined,
        });

        return {
          response,
          usedModel: modelToUse,
        };
      } catch (err: any) {
        lastError = err;
        const status = err?.status;
        const msg = String(err?.message || '');
        const isRetryable =
          status === 503 ||
          status === 429 ||
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('temporarily');

        if (isRetryable && attempt < 3) {
          console.warn(`[Servidor] ${modelToUse} reportó ${status || '503 alta demanda'}. Reintentando en 1.2s (intento ${attempt + 1})...`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Ruta Principal: POST /api/ask
   * Recibe la pregunta enviada por el navegador (y opcionalmente el historial previo),
   * valida los datos, llama a la API de Gemini mediante el SDK @google/genai de forma segura
   * y devuelve la respuesta junto con métricas de rendimiento (latencia).
   */
  app.post('/api/ask', async (req: Request, res: Response) => {
    const requestStartTime = Date.now();

    try {
      const { prompt, model, systemInstruction, history } = req.body;

      // Paso A: Validación en el servidor (nunca confiar ciegamente en el cliente)
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
          success: false,
          error: 'La pregunta no puede estar vacía. Por favor escribe una consulta válida.',
          code: 'EMPTY_PROMPT',
        });
      }

      // Paso B: Comprobación de la clave secreta de entorno
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'No se encontró la variable GEMINI_API_KEY en las variables de entorno del servidor.',
          code: 'MISSING_API_KEY',
          suggestion: 'Asegúrate de que la API Key esté configurada en el panel de secretos del entorno.',
        });
      }

      // Paso C: Instanciar el cliente oficial de Gemini en el backend
      // Nota: Configuramos la cabecera User-Agent requerida por la guía de AI Studio.
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Paso D: Construir los contenidos de la petición (soporta memoria de conversación multi-turno)
      let contents: any = prompt.trim();
      if (Array.isArray(history) && history.length > 0) {
        // Filtrar y formatear únicamente mensajes válidos previos
        const validHistory = history
          .filter((item: any) => item && (item.content || item.text))
          .map((item: any) => ({
            role: item.role === 'assistant' || item.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(item.content || item.text || '').trim() }],
          }));

        contents = [
          ...validHistory,
          { role: 'user', parts: [{ text: prompt.trim() }] },
        ];
      }

      // Paso E: Llamada al modelo con tolerancia a fallos
      const { response, usedModel } = await callGeminiWithFallback(
        ai,
        contents,
        model,
        systemInstruction
      );

      // Paso F: Extraer el texto generado (propiedad .text, no función)
      const generatedText = response.text || 'El modelo procesó la solicitud pero no generó texto de salida.';
      const latencyMs = Date.now() - requestStartTime;

      // Paso G: Responder al cliente con estado HTTP 200 y JSON estructurado
      return res.status(200).json({
        success: true,
        answer: generatedText,
        meta: {
          model: usedModel,
          latencyMs,
          timestamp: new Date().toISOString(),
          promptLength: prompt.trim().length,
          responseLength: generatedText.length,
          finishReason: response.candidates?.[0]?.finishReason || 'STOP',
          historyLength: Array.isArray(history) ? history.length : 0,
        },
      });
    } catch (error: any) {
      // Manejo de errores detallado y didáctico
      const latencyMs = Date.now() - requestStartTime;
      console.error('Error al procesar la llamada a Gemini en el servidor:', error);

      let userFriendlyMessage = 'Ocurrió un error al comunicarse con el modelo Gemini.';
      const rawError = error?.message || String(error);

      if (rawError.includes('quota') || rawError.includes('RESOURCE_EXHAUSTED') || rawError.includes('429')) {
        userFriendlyMessage = 'Se ha superado temporalmente la cuota de peticiones por minuto. Espera unos momentos antes de reintentar.';
      } else if (rawError.includes('API key') || rawError.includes('UNAUTHENTICATED')) {
        userFriendlyMessage = 'La API Key de Gemini configurada no es válida o carece de permisos suficientes.';
      } else if (rawError.includes('503') || rawError.includes('UNAVAILABLE') || rawError.includes('high demand')) {
        userFriendlyMessage = 'Los servidores de Gemini están experimentando una alta demanda temporal. Por favor intenta nuevamente en unos instantes.';
      } else if (rawError.includes('timeout') || rawError.includes('ECONNRESET')) {
        userFriendlyMessage = 'Tiempo de espera agotado al conectar con los servidores de Google Gemini.';
      }

      return res.status(500).json({
        success: false,
        error: userFriendlyMessage,
        details: rawError,
        code: 'GEMINI_CALL_FAILED',
        meta: {
          latencyMs,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  // 3. Montar la capa de Frontend (Vite en desarrollo o archivos estáticos en producción)
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // En desarrollo: Montar los middlewares de Vite para servir React y compilar al vuelo
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // En producción: Servir la carpeta dist generada por `npm run build`
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // 4. Iniciar la escucha del servidor HTTP
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Servidor] Utilería de API Call a LLM corriendo en http://0.0.0.0:${PORT}`);
  });
}

// Arrancar el servidor
startServer().catch((err) => {
  console.error('Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
