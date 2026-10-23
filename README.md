# UNDERTALE 本地化研究与中文学习项目

私人学习项目。GitHub 远程仓库必须保持 Private；不启用公开 GitHub Pages。书籍素材和译稿尚未取得公开发布许可。

## 当前内容

已有 272 页可编辑译稿，支持原文/译文切换、点击定位、译文和斜体编辑、版面调整、自动保存、JSON 存档与恢复，以及保留字形位置的 PDF 导出。全书译稿仍需人工校订，不能把批量生成视为已完成逐页校审。

- `viewer/`：本地网页及 Python 服务。
- `private/content/viewer/`：当前有效的逐页文本、译文、格式和排版数据；这里的人工修改优先于旧种子数据。
- `private/content/glossary.json`、`docs/translation-policy.md`：术语取舍和翻译规范。
- `docs/viewer-usage.md`、`docs/viewer-design.md`：使用说明和设计；早期样本范围以当前 272 页数据为准。
- `docs/private-hosting.txt`：带登录的私人站点方案与尚待适配的部分。
- `docs/legal-risk.md`、`rights/status.json`：公开发布许可状态记录。

## 本地运行

已有完整素材的这台电脑：运行 `start-viewer.cmd`，访问 http://127.0.0.1:8767 。

新设备需要 Python 3.11+，并先准备本地依赖：

```sh
python -m venv .venv
# 使用该虚拟环境的 Python 执行后续命令
python -m pip install -r scripts/requirements.txt -r viewer/requirements.txt
python viewer/build_pdf_fonts.py
python viewer/server.py --port 8767
```

仅克隆 Git 仓库不足以启动完整书籍：必须另行安全复制原素材的 `private/source/manifest.json` 和 `private/extracted/audit/samples/`。后者包含 272 页对应的 `embedded-00-Im0.jpg` 与页面元数据。原始扫描、原 PDF、导出文件和历史备份均不随 Git 上传。

## 版本与数据

Git 跟踪代码、字体及其许可证、翻译规范和 `private/content/` 中的 JSON/Markdown。运行时备份、缓存、PDF、安装依赖及生成的 PDF 字体均被忽略；它们需要另做备份。

网页“保存”写入服务所在机器的页面文件，并生成备份；它不会自动执行 Git 提交或推送。线上部署应使用持久化数据目录，发布代码时不能覆盖在线修改。多设备同时编辑通过页面 revision 检查冲突，保留两边修改后再合并。

`project-settings.json` 是项目约定，不提供身份认证。当前服务仅面向本机，正式上线前必须完成登录保护、来源校验和部署适配。
