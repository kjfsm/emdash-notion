---
"@emdash-notion/sync": patch
---

Notion の table/column_list/equation/video/audio/file/pdf/bookmark/embed/link_preview ブロックの Portable Text 変換に対応した。table・column_list・video・audio・embed は emdash コア標準の table/columns/embed 形状へ変換し、file/pdf は emdash コア標準の file 形状（署名付き URL は emdash メディアへ永続化）へ変換することで、既存の描画コンポーネントをそのまま流用できるようにした。equation は生の LaTeX 文字列のまま、bookmark/link_preview は OGP メタデータ（title/description/image、取得失敗時は url/caption のみへフォールバック）付きのカスタムブロックへ変換する。
