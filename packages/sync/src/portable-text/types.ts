/**
 * Portable Text 型は sync/blocks 間で形状を合わせる必要があるため
 * `@emdash-notion/types` を単一の情報源として re-export する。
 */
export type {
  NotionCalloutBlock,
  NotionCalloutIcon,
  NotionTodoBlock,
  NotionToggleBlock,
  PortableTextArbitrary,
  PortableTextBlock,
  PortableTextImage,
  PortableTextMarkDef,
  PortableTextNode,
  PortableTextSpan,
} from "@emdash-notion/types";
