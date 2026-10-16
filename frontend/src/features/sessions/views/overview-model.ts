import type { AgentTurn } from "@/features/agent/api";
import type { SessionMessage } from "@/features/messages/api";

export function overviewModel(messages: readonly SessionMessage[], turns: readonly AgentTurn[]) {
  const turn = turns.at(-1);
  const tools = turns.flatMap((item) => item.tool_calls);
  const completed = turns.findLast((item) => item.state === "completed");
  const goal = turn === undefined ? undefined : messages.find((message) => message.id === turn.user_message_id);
  const reply = completed === undefined ? undefined : messages.findLast((message) => message.role === "assistant" && message.run_id === completed.id && message.status === "completed" && message.content.trim() !== "");
  const todoTool = turn?.tool_calls.findLast((tool) => tool.name === "todo_write" && tool.status === "completed");
  const result = todoTool?.result;
  const todo = typeof result === "object" && result !== null && !Array.isArray(result) && "todos" in result ? result.todos : undefined;
  const active = turn !== undefined && ["ready", "model_running", "tool_running", "waiting_input", "waiting_confirmation"].includes(turn.state);
  return { turn, tools, goal, reply, todo, active };
}
