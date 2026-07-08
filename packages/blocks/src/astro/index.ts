import NotionBookmark from "../NotionBookmark.astro";
import NotionCallout from "../NotionCallout.astro";
import NotionDivider from "../NotionDivider.astro";
import NotionEquation from "../NotionEquation.astro";
import NotionTodo from "../NotionTodo.astro";
import NotionToggle from "../NotionToggle.astro";

export const blockComponents = {
  divider: NotionDivider,
  notionBookmark: NotionBookmark,
  notionCallout: NotionCallout,
  notionEquation: NotionEquation,
  notionTodo: NotionTodo,
  notionToggle: NotionToggle,
};
