import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { ToolCall } from "@/features/agent/api";
import type { HumanQuestion, QuestionItem } from "@/features/questions/api";
import type { SubmittedPlan } from "./api";

const parser = unified().use(remarkParse).use(remarkGfm);
interface MarkdownNode {
  readonly type: string;
  readonly children?: readonly MarkdownNode[];
}
function firstParagraph(node: MarkdownNode): string | null {
  if (node.type === "paragraph")
    return toString(node).replace(/\s+/g, " ").trim();
  for (const child of node.children ?? []) {
    const paragraph = firstParagraph(child);
    if (paragraph !== null && paragraph !== "") return paragraph;
  }
  return null;
}
export function planSummary(markdown: string): {
  title: string;
  description: string;
} {
  const tree = parser.parse(markdown),
    first = tree.children[0];
  const title =
    first === undefined ? "" : toString(first).replace(/\s+/g, " ").trim();
  const description = firstParagraph(tree);
  return {
    title,
    description:
      description === null || description === title ? "" : description,
  };
}
export function submittedPlan(tool: ToolCall): SubmittedPlan | null {
  const plan = tool.arguments.plan;
  if (
    tool.name !== "exit_plan_mode" ||
    typeof plan !== "string" ||
    !/^#\s+\S/.test(plan.trim())
  )
    return null;
  return {
    tool_call_id: tool.id,
    title: planSummary(plan).title,
    markdown: plan,
  };
}
export function planReviewOf(pending: HumanQuestion): QuestionItem | null {
  if (pending.questions.length !== 1) return null;
  const question = pending.questions[0]!;
  if (
    question.intent?.kind !== "plan-review" ||
    question.detail === null ||
    question.multi_select ||
    question.options.length > 2 ||
    question.intent.call_id !== pending.tool_call_id ||
    !question.options.some(
      (option) => option.label === question.intent!.approve,
    )
  )
    return null;
  return question;
}
