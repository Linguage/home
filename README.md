# Linguista 阅读工作台

Linguista 的 DeepSeek Harness 插件。打开 **Linguista**，用右上角在首页与 RSS 之间切换。首页展示 Workshop 软件，切换底栏时，左侧同步显示站点形象与栏目。搜索可检索各站 RSS 的标题与摘要。旁边的日月按钮可切换明暗，选择保存在本地。

[网站](https://linguista.cn/home/) · [下载插件](https://github.com/Linguage/home/releases)

## 安装

在 DeepSeek Harness 0.2 系列的插件管理中选择添加插件，在「包名或地址」填入 `https://github.com/Linguage/home`。安装并启用后，从左侧打开 **Linguista**。宿主需要 Node.js 22.19 或以上。

也可以从[发行页](https://github.com/Linguage/home/releases/tag/dsh-v0.3.0-dev.5)下载 `dsh-linguista-0.3.0-dev.5.tgz`，在同一个字段中填入文件的本地绝对路径。

## 开始阅读

1. 点击右上角 **RSS**，再从底栏选择站点。
2. 点击文章查看摘要。打开即标记为已读，可在筛选菜单找回。
3. 点击 **在原站打开** 可以查看源页面。手机端关闭阅读卡片后回到列表。

先打开 RSS 摘要，再点击 **全文阅读** 读取公开正文。Library 显示订阅指向的译文或频道概要。Notion 只读取两个公开订阅中的可匿名访问页面。正文读取失败时保留摘要，可以重试。

在 DeepSeek Harness 中阅读时，可以打开右侧 **AI 伴读**，使用提炼要点、解释选段或拆解论证。侧栏显示所用的文章和内容版本，阅读资料随伴读会话提供。选中正文时，也可以直接点击 **解释选段**。

Notion 入口可以在 Linguista 和 Bullets 两路公开摘要之间切换。只改 Notion 页面时，需要等主站重新发布 RSS 后才能在插件里刷新。订阅失败时，已有缓存仍可阅读。

窄窗的 RSS 搜索紧接 Newsletter。点击底栏站点，模块卡片从选中图标上方展开，与图标共用外框。再次点击收起，封面位置保持不动。默认主屏展示可滑动的软件卡片，优先排列 DSH 插件，子站主屏展示对应封面。宽窗模块入口统一为两列两行，显示图标、名称与简短说明，超过四项用底部箭头翻页。

## 来源与许可

界面、订阅配置与 [Linguista Home](https://linguista.cn/home/) 共用。插件使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件宿主。自有代码的包声明为 `UNLICENSED`，图标的来源与授权见 [UPSTREAM.md](UPSTREAM.md)。
