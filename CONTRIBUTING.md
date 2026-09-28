# 协作流程

`main` 受保护：不能直接 push，不能强推，不能删除，管理员也不例外。所有改动都通过 Pull Request 合并，并且需要至少一位其他成员批准。

## 一次改动的完整流程

```
git switch main
git pull                                   # 从 main 的最新状态开始
git switch -c feat/entropy-page            # 分支名：feat/ fix/ docs/ 加一个短描述
# ……改代码；改了场景就出几张检查帧看一眼：bun scripts/export.ts --shots 44,49
git add -A
git commit -m "Entropy page: label the three letter-entropy rows"
git push -u origin feat/entropy-page
gh pr create --fill                        # 或在 GitHub 网页上开 PR
```

然后：

1. 在 PR 页面填写"改了什么、为什么、怎么验证"（模板会提示）。改了画面就把检查帧拖进描述里。
2. 请一位成员 Review。审核者在 Files changed 里逐行留评论，最后 Approve 或 Request changes。
3. 有评论就在同一个分支上继续提交，push 后 PR 自动更新；每条评论解决后点 Resolve。
4. 批准之后由作者点 Squash and merge。分支合并后会自动删除。
5. 本地回到 main 拉取：`git switch main && git pull`。

## 约定

- 一个 PR 只做一件事，小到能在十分钟内读完。
- 提交信息第一行用祈使句说明"做了什么"，不超过 72 个字符。
- 改了场景时长或音效 cue，要一起重跑 `just cues` 和 `just music`，并在 PR 里说明。
- 视频、检查帧、依赖、缓存不进仓库（见 `.gitignore`）。成片放到 GitHub Release。
- 不 rebase 已经推送的分支；PR 里的历史会在 squash 时压成一条。

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 看自己有哪些 PR | `gh pr list --author @me` |
| 在本地拉取别人的 PR 来看 | `gh pr checkout 12` |
| 审核 | `gh pr review 12 --approve` 或 `--request-changes -b "原因"` |
| 合并 | `gh pr merge 12 --squash` |
