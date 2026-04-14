## 0 暂定需求

静态展示部分：
- 社团发展历程
- 优秀成员风采
- 社团优秀项目展示
- 友情链接

**动态资讯**部分：
- 新闻、推文
- **社团系列博客**
- 赛事通知
- 实时活动通知

互动功能部分：
- 开发板、书籍借助平台
- 实验室参观预约

社团成员独享：
- 内部资料（github链接，文章等形式）


## 1 更新规范
### 博客
博客统一放在以下结构中：

```txt
src/content/blogs/<slug>/index.md
src/content/blogs/<slug>/图片或附件
```

其中 `<slug>` 统一使用小写英文 + 连字符（kebab-case），例如：

- `first-blog`
- `opengauss-guide`
- `ai-agent-tools`

它允许的样子是：

hello
first-blog
my-post-2026
abc123

不允许的样子一般是：

First-Blog      // 有大写
first_blog      // 有下划线
first blog      // 有空格
-first-blog     // 不能开头就是 -
first-blog-     // 不能结尾就是 -

`index.md` 的 frontmatter 建议包含：

```yaml
slug: "opengauss-guide"
title: "openGauss 使用指北"
date: 2025-11-13
```

最终文章链接为：

```txt
/blogs/<slug>
```

## 2 视觉规范与主题色

### 品牌主色

- 主色（青色）：`#05C9C9`
- 辅色（深蓝）：`#022F66`
- 基础色（白色）：`#FFFFFF`

### 延伸色建议

- 主色深色态：`#03A8A8`（按钮 hover、强调边框）
- 主色浅色态：`#E6FAFA`（浅背景、提示底）
- 辅色浅色态：`#E9EEF6`（卡片分区、次级背景）
- 文本主色：`#0F172A`（正文）
- 文本次色：`#475569`（说明、辅助文案）

### 使用建议

- 页面大标题、关键 CTA：优先使用辅色 `#022F66`
- 按钮主操作、交互高亮：优先使用主色 `#05C9C9`
- 背景优先保持高留白，使用白色 + 少量浅色块
- 同一页面避免再引入新的高饱和主色，确保视觉统一

### 可选 CSS 变量（建议在全局样式中维护）

```css
:root {
	--brand-primary: #05c9c9;
	--brand-primary-strong: #03a8a8;
	--brand-primary-soft: #e6fafa;

	--brand-secondary: #022f66;
	--brand-secondary-soft: #e9eef6;

	--brand-white: #ffffff;
	--text-main: #0f172a;
	--text-muted: #475569;
}
```

> 说明：后续页面（尤其招新、新闻列表、落地页）默认按这套主题色执行。

## 3 成员协作


### 框架选型与本地开发

使用 Astro 框架
- 适合内容展示型网站
- 对 md 和 json 的内容支持很好，方便创作

会用到的命令

```bash
npm install #安装依赖
npm run dev #启动本地进程，通过服务器预览效果
```

### 说明

- 目前该网站 github 仓库属于个人，后续可考虑加入 github 的 organization
- 为了方便协作，我会直接邀请博客、推文、网站迭代的负责人作为仓库的 collaborator，然后直接 push 到 main 分支就行，vercel 或者 腾讯的边缘加速平台 会自动抓取

### 具体操作

协作者需要将项目 clone 到本地，有node环境就行，win和linux均可

```bash
git clone https://github.com/whiszk/Waymaker.git
cd Waymaker-main
```

此时打开可视化 git 工具，应该可以看到 git 历史

当你完成修改（推文撰写，网站外观更新等）后，首先需要将修改同步到本地

```bash
# 提交修改
git add .

git commit -m "更新一篇博客"
```

或者也可以采用可视化的操作方式，比如 vs code 的 git 页面

这是命令行的方式

```bash
# 第一次推送，需要 -u 绑定默认远程分支
git push -u origin main

# 后续直接 git push 就行
git push
```
