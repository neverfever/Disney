# 奥兰多迪士尼 5 天安排（2026/11/1–11/5）

单文件网页 `index.html`：按天气分配园区的 5 天路线，87 个项目可勾选、收藏、写备注。
全家打开同一个链接，先选自己是谁，各人的标注通过 Supabase 实时共享（每 5 秒同步，断网自动排队）。

- 在线地址（GitHub Pages）：https://neverfever.github.io/Disney/
- 共享标注表：`supabase/wdw_marks.sql`（Supabase 项目 Gembox，表 `wdw_marks`，RLS 只允许读写本次行程）
- 测试：`cd test && node mock-sync.test.js`（需要 Playwright + Chromium）
