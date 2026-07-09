import NotionBookmark from "../NotionBookmark.astro";
import NotionCallout from "../NotionCallout.astro";
import NotionChildDatabase from "../NotionChildDatabase.astro";
import NotionChildPage from "../NotionChildPage.astro";
import NotionDivider from "../NotionDivider.astro";
import NotionEquation from "../NotionEquation.astro";
import NotionLinkToPage from "../NotionLinkToPage.astro";
import NotionTableOfContents from "../NotionTableOfContents.astro";
import NotionTodo from "../NotionTodo.astro";
import NotionToggle from "../NotionToggle.astro";

export const blockComponents = {
  divider: NotionDivider,
  notionBookmark: NotionBookmark,
  notionCallout: NotionCallout,
  notionChildDatabase: NotionChildDatabase,
  notionChildPage: NotionChildPage,
  notionEquation: NotionEquation,
  notionLinkToPage: NotionLinkToPage,
  notionTableOfContents: NotionTableOfContents,
  notionTodo: NotionTodo,
  notionToggle: NotionToggle,
};
