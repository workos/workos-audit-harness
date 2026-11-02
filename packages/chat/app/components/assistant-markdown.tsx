import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AssistantMarkdown({ children, origin }: { children: string; origin: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{ img: ({ alt }) => <span>{alt}</span> }}
      urlTransform={(url) => {
        try {
          return new URL(url, origin).origin === origin ? url : "";
        } catch {
          return "";
        }
      }}
    >
      {children}
    </Markdown>
  );
}
