# StyleConv

一个本地运行的轻量写作改写工具，支持：

- 基础去模板化改写
- 基于个人语料的风格画像改写
- 基于个人映射表的增强改写

## Run

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## Data Layout

- `data/personas/`：本地 persona、语料和画像数据，仅供个人使用，不应提交到公开仓库
- `data/examples/`：完全虚构的公开示例文本，可用于演示和测试

## Public Repo Notes

- 不要提交真实语料、私人写作样本、导出的 persona 数据
- 不要提交任何 API key、私有 endpoint 或本地环境配置
- 当前应用的模型配置保存在浏览器本地，不会自动写入仓库
- 如果你准备将仓库公开，建议在发布前检查 Git 历史中的作者邮箱和旧文件

## Notes

- 语料首版支持 `txt`、`md`
- 模型走 OpenAI 兼容接口，需要填写 `base URL / API key / model`
- 如果要给他人演示项目，优先使用 `data/examples/` 中的虚构文本
