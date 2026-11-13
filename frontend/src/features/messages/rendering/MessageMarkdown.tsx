import { ResultMapLink } from "@/features/analysis/ResultMapLink";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import type { Definition, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { defineComponent, h, type VNodeChild } from "vue";
const parser = unified().use(remarkParse).use(remarkGfm);
function renderNode(
  node: Root | RootContent,
  definitions: ReadonlyMap<string, Definition>,
): VNodeChild {
  const children =
    "children" in node
      ? node.children.map((child) =>
          renderNode(child as RootContent, definitions),
        )
      : [];
  switch (node.type) {
    case "root":
      return children;
    case "text":
      return node.value;
    case "paragraph":
      return h("p", children);
    case "heading":
      return h("h" + node.depth, children);
    case "strong":
      return h("strong", children);
    case "emphasis":
      return h("em", children);
    case "delete":
      return h("del", children);
    case "inlineCode":
      return h("code", node.value);
    case "break":
      return h("br");
    case "thematicBreak":
      return h("hr");
    case "blockquote":
      return h("blockquote", children);
    case "code":
      return h(
        "div",
        {
          class: "message-code-block",
        },
        [
          h(
            "div",
            {
              class: "message-code-toolbar",
            },
            [
              h(CopyButton, {
                text: node.value,
              }),
            ],
          ),
          h("pre", [
            h(
              "code",
              {
                class: node.lang ? "language-" + node.lang : undefined,
              },
              node.value + "\n",
            ),
          ]),
        ],
      );
    case "link":
      if (node.url.startsWith("/workspace/results/"))
        return h(
          ResultMapLink,
          {
            path: node.url,
          },
          () => children,
        );
      if (/^(?:https?:|mailto:|tel:)/i.test(node.url))
        return h(
          "a",
          {
            href: node.url,
            title: node.title,
            target: "_blank",
            rel: "noreferrer",
          },
          children,
        );
      return h("span", children);
    case "linkReference": {
      const definition = definitions.get(node.identifier.toUpperCase());
      return definition === undefined
        ? children
        : renderNode(
            {
              type: "link",
              url: definition.url,
              title: definition.title,
              children: node.children,
            },
            definitions,
          );
    }
    case "imageReference": {
      const definition = definitions.get(node.identifier.toUpperCase());
      return definition === undefined
        ? node.alt
        : renderNode(
            {
              type: "image",
              url: definition.url,
              title: definition.title,
              alt: node.alt,
            },
            definitions,
          );
    }
    case "image":
      return /^https?:/i.test(node.url)
        ? h("img", {
            src: node.url,
            alt: node.alt ?? "",
            loading: "lazy",
          })
        : h("span", node.alt ?? "");
    case "list":
      return h(
        node.ordered ? "ol" : "ul",
        {
          start: node.ordered ? node.start : undefined,
          class: node.children.some((item) => typeof item.checked === "boolean")
            ? "contains-task-list"
            : undefined,
        },
        children,
      );
    case "listItem":
      return h(
        "li",
        {
          class:
            typeof node.checked === "boolean" ? "task-list-item" : undefined,
        },
        [
          typeof node.checked === "boolean"
            ? h("input", {
                type: "checkbox",
                checked: node.checked,
                disabled: true,
              })
            : null,
          ...children,
        ],
      );
    case "table":
      return h(
        "div",
        {
          class: "message-table-scroll",
        },
        [
          h("table", [
            h("thead", [
              h(
                "tr",
                node.children[0]?.children.map((cell, index) =>
                  h(
                    "th",
                    {
                      style: {
                        textAlign: node.align?.[index] ?? undefined,
                      },
                    },
                    cell.children.map((child) =>
                      renderNode(child, definitions),
                    ),
                  ),
                ),
              ),
            ]),
            h(
              "tbody",
              node.children.slice(1).map((row) =>
                h(
                  "tr",
                  row.children.map((cell, index) =>
                    h(
                      "td",
                      {
                        style: {
                          textAlign: node.align?.[index] ?? undefined,
                        },
                      },
                      cell.children.map((child) =>
                        renderNode(child, definitions),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ],
      );
    default:
      return null;
  }
}
export const MessageMarkdown = defineComponent(
  (props: { text: string }) => {
    return () => {
      const tree = parser.parse(props.text) as Root;
      const definitions = new Map(
        tree.children
          .filter((node): node is Definition => node.type === "definition")
          .map((node) => [node.identifier.toUpperCase(), node]),
      );
      return (
        <div class="message-markdown w-full min-w-0">
          {renderNode(tree, definitions)}
        </div>
      );
    };
  },
  {
    props: ["text"],
  },
);
