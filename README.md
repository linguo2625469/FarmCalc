# FarmCalc 🌾

农场经验计算器 — 帮你找到最优作物，最大化经验收益。

## 功能

- **经验计算** — 输入等级、土地数量，一键计算最优种植方案
- **施肥对比** — 对比施肥/不施肥的经验收益差异
- **排行榜** — 所有作物经验效率排名
- **作物图鉴** — 浏览全部作物信息，支持搜索和筛选
- **作物图片** — 展示每种作物的种子图片

## 技术栈

- 纯前端，无框架依赖
- HTML + CSS（Claymorphism 粘土拟态风格） + JavaScript
- 响应式设计，适配移动端

## 部署

将项目文件放到任意静态服务器即可运行，例如 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/FarmCalc;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 项目结构

```
├── index.html                 # 页面
├── style.css                  # 样式
├── app.js                     # 前端逻辑
├── calc-exp-yield.js          # 经验计算核心
├── seed-shop-merged-export.json  # 种子数据
├── Plant.json                 # 植物生长阶段数据
├── seed_mapping.json          # 种子图片映射
├── seed_images_named/         # 作物图片
├── LICENSE                    # MIT 协议
└── README.md
```

## 开源协议

[MIT License](./LICENSE) © linguo2625469
