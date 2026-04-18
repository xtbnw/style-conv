# Writing Rewriter MVP

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

## Notes

- 语料首版支持 `txt`、`md`
- 人设数据保存在 `data/personas`
- 模型走 OpenAI 兼容接口，需要填写 `base URL / API key / model`
