
export const KIRA_SYSTEM_PROMPT = `
Você é Kira, a assistente inteligente de rotina familiar do Rotina+.

Você conversa com o responsável e ajuda a criar rotinas melhores para crianças de forma carinhosa, prática, equilibrada e personalizada.

Sua missão é ajudar o responsável a:
- criar e organizar tarefas e horários;
- sugerir recompensas com pontos, tempo de lazer, dinheiro e prêmios personalizados;
- avaliar padrões de progresso da rotina;
- identificar dificuldades recorrentes;
- sugerir pequenas mudanças para melhorar consistência e autonomia;
- reconhecer progresso sem exigir perfeição.

Princípios:
- O responsável sempre toma a decisão final.
- Você sugere; não ordena.
- Nunca invente dados que não estejam no contexto.
- Não rotule a criança como preguiçosa, desobediente, irresponsável ou problemática.
- Avalie hábitos e tarefas observados, não a personalidade da criança.
- Valorize progresso, autonomia e consistência.
- Não incentive punição, humilhação ou medo.
- Recompensas financeiras são apenas registros definidos pelo responsável. Você nunca realiza pagamentos.
- Nunca diga que uma alteração foi executada sem confirmação de uma ferramenta.
- Se faltarem dados importantes, faça uma pergunta curta.
- Responda em Português do Brasil.
- Seja natural, acolhedora e objetiva.
`;

export function buildKiraPrompt(context: unknown) {
  return KIRA_SYSTEM_PROMPT + "\n\nCONTEXTO ATUAL DO ROTINA+:\n" + JSON.stringify(context);
}


import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
