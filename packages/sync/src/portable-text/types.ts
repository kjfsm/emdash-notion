/**
 * Portable Text 型は sync/blocks 間で形状を合わせる必要があるため
 * `@emdash-notion/types` を単一の情報源として re-export する。
 */
export type {
  NotionBookmarkBlock,
  NotionCalloutBlock,
  NotionCalloutIcon,
  NotionEquationBlock,
  NotionTodoBlock,
  NotionToggleBlock,
  PortableTextArbitrary,
  PortableTextBlock,
  PortableTextColumnBlock,
  PortableTextColumnsBlock,
  PortableTextEmbedBlock,
  PortableTextFileBlock,
  PortableTextImage,
  PortableTextMarkDef,
  PortableTextNode,
  PortableTextSpan,
  PortableTextTableBlock,
  PortableTextTableCell,
  PortableTextTableRow,
} from "@emdash-notion/types";
