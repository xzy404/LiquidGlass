# cf-sidebar-nav —— CatchFish OJ 侧边栏 + 顶栏 + 液态玻璃

给 [CatchFish OJ](https://oj.xzy404.top)（Hydro v5.0.4 / `@hydrooj/ui-default` 4.58.4）写的
一个 addon：把原生顶栏挪成侧栏、顶栏换成递进面包屑，并给全站加上**液态玻璃**。

---

## 几轮下来改了什么

### v19：五条需求 + 两个被藏了很久的坑

用户一次提了五条，全部落地；其中第 2 条挖出了**两个一直没被发现的部署/渲染坑**。

| # | 用户原话 | 做了什么 |
|---|---|---|
| 1 | 「比赛页面顶栏没有题目列表，应该显示：**比赛列表 / [比赛详情] [题目列表] [比赛成绩]**（中括号指这四个字包在一个按钮里）」 | `cf-nav.js` 新增 `contestTabs()`：比赛页的第二段从"比赛名"换成**一组分段按钮**（胶囊 + 发丝描边），当前页高亮。href 从**当前路径里的比赛 id 现推**（服务端注入顶栏时还不知道比赛 id）。选中态由 `<html data-page>` 决定而不是 href 前缀 —— `/contest/<id>` 是 `/contest/<id>/problems` 的前缀，前缀匹配会把三个全点亮 |
| 2 | 「讨论区回复等按钮没有轮廓」 | **根因不是配色，是 `<input>` 装不了玻璃画布**。见「★★ `<input>` 装不了玻璃」 |
| 3 | 「侧栏管理域应该跳转到 `/domain/dashboard`」 | `index.ts` 的 `ADMIN` 表：`/home/domain`（我的域列表）→ `/domain/dashboard`（`domain_dashboard`，`src/handler/domain.ts:481`） |
| 4 | 「侧栏非 SU 不应出现控制面板」 | 「控制面板」项多一个 `cf-si--su` 类；`cf-nav.js` 的 `markSU()` 判定后给 `<html>` 加 `.cf-su`；CSS 里 `.cf-si--su{display:none}` → `html.cf-su .cf-si--su{display:flex}`。**默认就藏**，非 SU 从头到尾看不到、不会闪一下 |
| 5 | 「顶栏、侧栏应有鼠标移动到上面的选中效果」 | 统一成同一档"药丸"反馈：`.cf-si:hover`（.10 → **.17**）、`.cf-crumb > a:hover`、`.cf-tab:hover`、顶栏用户区 `.nav__item:hover`。**并修了一个反向 bug**：`.cf-si:hover`(0,2,0) 特异性高于 `.cf-si--on`(0,1,0)，鼠标停在当前页上时高亮反而从 .13 掉到 .10 —— 看着就是"没有 hover 效果" |

**SU 判定用的是 Hydro 自己的标记**（不额外发请求、不查库）：
`templates/partials/nav.html` 里「切换账号」那一项被 `handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)` 包着，
所以 `document.querySelector('[name="nav_switch_account"]')` 存在就是 SU；兜底读 `window.UserContext.priv & 1`
（`@hydrooj/core` 的 `permission.ts: PRIV_EDIT_SYSTEM: 1 << 0`）。游客 `priv = 8` → `& 1 = 0` ✓。

> ⚠ 一处**没做**的取舍：用户说"直接照搬"的那个 hint 是「比赛名」的位置改成了按钮组 ——
> 于是比赛页顶栏**不再显示比赛名**（页面上 `section__title` 里还有）。用户给的就是这个排版，照做；
> 想要「比赛列表 / 比赛名 / [三个按钮]」的话得把 `renderCrumb` 的两层上限放到三层。

### 顶栏 / 侧栏的结构（v19 起）

**顶栏**（`.cf-bar` → `nav.cf-crumb#cf-crumb`）由 `cf-nav.js` 的 `renderCrumb()` 按
`<html data-page>` 渲染，**最多两段**，段可以是取值规则 / 固定段 / 分段按钮组：

```js
var PAGE_CRUMB = {
  homepage:            ['site'],
  contest_main:        ['site', { t: '比赛列表', href: '/contest' }],
  contest_detail:      [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
  contest_problemlist: [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
  contest_scoreboard:  [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
  contest_detail_problem: ['contest', 'problem'],   // 进了题目就退回「比赛名 / 题名」
  ...
};
```

* `'site'` → `CatchFishOnlineJudge`（可点回首页）· `'contest'` → 比赛名 · `'problem'` → 题名
  （从 `<title>` 取，不用 `.section__title` —— 前端会往里插分数/进度条）· `'title'` → `docTitle()`
* `{ tabs: 'contest' }` → `contestTabs()` 生成的一组胶囊按钮（比赛详情 / 题目列表 / 比赛成绩），
  href 从当前路径的比赛 id 现推，选中态看 `data-page`
* **加一层就是往 `PAGE_CRUMB` 里加一个键**；想放到三层要把 `renderCrumb` 里的 `segs.length < 2` 放宽

**侧栏**（`.cf-side`）是**服务端渲染**的（`index.ts` 的 `NAV` / `ADMIN` 两张表 + `ICON` 内联 SVG）：

* 主导航 10 项（`NAV`）+ 底部 2 项（`ADMIN`：管理域 / 控制面板）
* 用户区（登录 / 注册 / 用户名下拉）不搬 DOM，靠 CSS `position: fixed` 钉在顶栏右侧 ——
  pjax 换页会整体替换 body，**搬过的节点会被服务端新渲染的同名容器盖掉**（踩过）
* 「控制面板」只有 `cf-si--su` 类，由前端 `markSU()` 判定后开关
* 高亮（`.cf-si--on`）由 `markActive()` 按 `location.pathname` 前缀匹配
* `dedupeSides()` 防"寄生侧栏"：`/cfai`、首页犇犇那种用 `DOMParser` 复制 `body.innerHTML`
  渲染片段的实现，会把我们注入的 `<aside>` 一起复制进内容区

### ★★ `<input>` 装不了玻璃（v19 第 2 条的真根因）

**症状**：讨论区的「回复 (Ctrl+Enter)」「取消」、登录页的「登录」这些按钮**没有轮廓** ——
在浅色玻璃上就是一颗悬空的字。

**排查**：`tools/probe-inputbtn.js` 量登录页的 `INPUT[type=submit].button` →
`bg: rgba(255,255,255,.55)`、`border: 0`、**`glass: false` / `cvs: 0`**。
`probe-inputtest.js` 再定点验证：`el.insertBefore(canvas, el.firstChild)` **不报错**、
`el.children.length === 1`，但那个 canvas 的 `rect` 是 **0×0** ——
空元素没有渲染内容的盒子，塞进去的子节点根本不画。

**于是形成一条死路**：
```
KINDS 的 `.slideout-panel .button` 选中它 → mount() 塞画布（不渲染）→ 同时加 .cf-glass/.cf-glass-on
→ plan3.css 把 background 摘成 transparent → 白底没了、画布又画不出来 → 整个按钮消失
```

**修法（两处一起）**：
1. `glass.js` 的 `collect()` 里 skip 掉空元素：
   `var VOID = { INPUT:1, SELECT:1, TEXTAREA:1, IMG:1, BR:1, HR:1 };`
2. `plan3.css` 的按钮**基础外观自带 1px 可见描边**（`border: 1px solid rgba(47,64,86,.20)`）。
   原来写的 `border: 0` + 白色底，在浅色壁纸上等于什么都没有。
   描边必须用**深色发丝线** —— 白描边在本站等于隐形。
   玻璃真的接管时（`.cf-glass.cf-glass-on`）再 `border: 0` 把描边摘掉，避免和折射边叠成双层轮廓。

**顺带**：`.dczcomments__operations a`（`comments_discussion.html` 里 `action` 宏生成的
`<a data-op="reply"><span class="icon icon-reply"></span></a>`）不是 `.btn`/`.button`，
一并给了圆角发丝线 + hover（26×26 的药丸）。

**实测**（`tools/verify-v19c.js`，在**玻璃正常跑着**的讨论页上插一份真实 markup）：
```
INPUT.button  glass=false/false bg=rgba(255,255,255,.62) bd=1px rgba(47,64,86,.2) canvas=无   ✓
BUTTON.btn    glass=true/true  bg=rgba(0,0,0,0)          bd=0px              canvas=64x16  ✓
```

### ★★ 部署链路：为什么"上传"等于没改（v19 才查清）

**`oj.xzy404.top` 的静态文件根本不经过 Hydro。**
`/root/.hydro/Caddyfile`：

```
:80 {
  root * /root/.hydro/static
  @static { file { try_files {path} } }
  handle @static { file_server }
  handle { reverse_proxy http://127.0.0.1:8888 }
}
```

Caddy 只要在 `/root/.hydro/static/` 下找得到同名文件就自己吐（响应头是 `Server: Caddy` +
`Accept-Ranges: bytes`），找不到才转给 Hydro。而 **Hydro 把 addon 的 `public/` 拷进
`/root/.hydro/static/` 只在启动时发生**。

⇒ **只上传 `public/*` 不重启 = 线上一点变化都没有。**
（实测：上传后 `stat /root/.hydro/static/cf-nav.js` 的 mtime 还是上一次重启的时间。）
⇒ 唯一正确顺序：**上传 `public/*` 与 `index.ts` → `pm2 restart hydrooj` → 验证**。

**顺带纠正一条之前记错的结论**：查询串**是** Cloudflare 缓存键的一部分
（A/B 实测：两个随机查询串各自 `MISS`，同一串第二次 `HIT` 且带 `Age`）。
所以 `?v=<VERSION>` 这套破缓存**是有效的**，前提是**这个 VERSION 值从没被请求过**。
之前连续踩坑的真正原因是：那个 VERSION 是在**重启前**被请求的，缓存里存的是旧内容。

> 两个验证陷阱：
> ① 别用 `curl -s <url>` 之后再 `curl -sI <url>` —— 第二次一定是 `HIT`
>    （第一次已经把条目建好了），看起来就像"缓存没破"。
> ② 光比"本地 MD5 == 服务器 MD5"只说明上传成功；**必须**再看第三份：CF 真正返回的字节数/MD5。

### v18：玻璃"实体感"（中间不能是洞）

用户：**「你只有边框有液态玻璃的感觉，中间部分就跟没有东西一样，而不是玻璃感」**。

根因是 v13 的一次过度修正：为了消掉"贴图感"，我把玻璃内部**整个挖空**（`hole 1`），
结果等于在壁纸上凿了个洞 —— 只剩一圈边，没有"一块玻璃"的体量感。
真正的病根不是"画满"，而是**画得和背景不一样**（写死 `sat 1.5`、`surface .30`、`frost 1`）。

改法两步：
1. **先对齐**：`sat` 改成 `'page'`（启动时实测页面背景的 `saturate()` 值，本站 1.1），
   `frost 0`、`surface .05~.07` → 卡内重绘与页面背景**逐像素一致**（实测 0.33~0.59/255）。
2. **再叠质感**：新增 `uInner / uInnerW / uTilt / uSheen` ——
   形状驱动的内壁倒角（含方向性）+ 表面光泽，让"里面"有东西。

详见「玻璃内部：`hole` 的两次反转」和「玻璃'实体感'」两节；对照图 `v3shots/final-ab.png`。

### v13：照搬参考 + 真透明

用户的指令是「**你不用管效果好不好，直接把我给你的那个 github 仓库搬上来**」+
「**每个卡片/块的底是一张背景图片…这个是不对的，我要的是透明效果**」。所以：

1. **卡内真透明**（`hole`）：shader 里加 `uHole`，玻璃内部一个像素都不画，只保留贴边折射带。
   实测卡内平均差 **0.04/255**。详见「★ 真透明：`hole`」。
2. **参数照搬参考，不再自作主张**：`sat 1.5 / surface 0 / rimHi .5`，卡片 `refMin 16 / refMax 32`，
   按钮固定 `12/12`，带宽上限 20% → **30%**。详见「参数表」。
   （**顶栏是唯一例外**，v17 起改成 `sat 1 / frost 0`，原因见下面的问题 3。）
3. **边缘高光重写成 0.5dp 细线**（参考 `DefaultHighlightShaderString` 的 `abs(dot(法线,45°))`）。
   上一版是整条折射带发亮的 `rim*rim`，所以用户说"刺眼"。**这一条反转了此前"不要高光"的指令。**
4. **卡片投影改成参考的 `DEFAULT_SHADOW`**（`0 4px 24px rgba(0,0,0,.1)`）。

### v16/v17：三个线上 bug

用户报的三条，全部定位到根因并修掉：

| 用户原话 | 根因 | 修法 |
|---|---|---|
| 「**边框和中间衔接不自然**，为什么中间是黄的在绿色下面，边框变成了黄色部分在绿色上面」 | **`px.y` 上下镜像** —— `vUv.y` 是从下往上数的，SDF 自洽所以形状没露馅，但**采样点落在了镜像位置**：上边缘那条折射带取的是卡片**上方**的像素（详见「★★ 那个上下镜像的 bug」） | shader 里 `vec2 px = uWin.xy + vec2(vUv.x, 1.0 - vUv.y) * uWin.zw;` |
| 「**侧边栏收起和折叠的时候边框不会移动**，只有文字动了，滚动几下才展开」 | 侧栏展开是 CSS `:hover` + transition，既不是 window resize 也不是 DOM 增删 —— 原来的 window.resize / MutationObserver(childList) / 4 秒轮询**一个都接不住**，只能等 4 秒轮询 | 给每个目标挂 `ResizeObserver`，尺寸一变就标脏 + 排重绘 |
| 「**顶栏只有边框有液态玻璃效果，中间不是透明的，目前还是模糊效果**」 | 那个"模糊"不是 CSS 的 `backdrop-filter`（`.cf-glass` 早把它干掉了），是 shader 里 `frost=1` 采样了 20px 重糊纹理 | `bar` 改成 `frost 0 / sat 1 / hole 0`：中间画**未糊**的壁纸，静止时与背景逐像素一致，滚动时正文从下面过、面包屑始终可读 |

5. **`VERSION` 必须一起动**。⚠ s 版改了 CSS 却没动版本号，被 Cloudflare 缓存挡住了一整轮
   （改了 = 没改）。见踩坑 16 / 22 / 23。

当前线上状态（v19，`VERSION = 20261007z6`）：`fail: null`、玻璃元素全部挂载
（比赛页 5 / 讨论页 5）、卡片 `bg: rgba(0,0,0,0)` / `backdrop-filter: none` /
`box-shadow: rgba(0,0,0,.1) 0 4px 24px`，稳态 0.1–0.2ms/帧；三份对拍
（本地 / 服务器 / CF 返回体）MD5 一致：

```
94333561974d44fdc9458097e99c03d2  plan3.css   25840 B
6774cada1af08b0a7f68aa0b0515a5df  cf-nav.js   17170 B
d8b750f09169c89bbcf2da28b4fed442  glass.js    55315 B
```

### ★★ 那个上下镜像的 bug（值得单独记一笔）

**症状**：只有用户看得出"边框和中间衔接不自然"，我一开始完全没意识到 ——
因为 **SDF、法线、位移全都在同一套镜像坐标里自洽**：
形状是上下对称的圆角矩形，法线依然"朝外"，位移依然"向内"，
所以肉眼看不出错误，错的只是**采样点落在了镜像位置**。

**为什么藏了这么久**：卡片内部 `hole=1` 根本不画；顶栏内部被 20px 的 `frost` 糊掉；
侧栏内部也不画。**唯一会暴露它的就是贴边那条折射带** —— 而上边缘的带子取的是卡片
上方的像素，在平滑渐变壁纸上几乎看不出来。

**定位过程**（这套方法可复用）：

1. 先排除几何：`tools/find-shift.js` 做高通后暴力搜 `dx/dy/scale` → 结果 `(0,0,1.000)`，
   说明**位置和缩放都是对的**，问题不在映射的线性部分。
2. 再排除纹理：加 `window.__cfGlassTex(x, y)` 直接读三张源画布的像素 →
   和浏览器 `canvas.getImageData` 逐点一致，**纹理是对的**。
3. 最后打 UV：加 `uDbgUV`，把采样坐标当颜色输出（`R=u, G=v`）。
   **u 完全正确、v 反向**，且 `v = 1.2013 - y/900`；
   而当时的卡片 `rect.y = 343.7`、高 `395.1`，`2*343.7 + 395.1 = 1082.5` ——
   正好等于实测截距 `1082`。**镜像成立，收工。**

**根因**：`gl.viewport(0,0,W,H)` 画进 drawing buffer 的底部 H 行；WebGL 的 buffer 行 0
既是"GL 的下边"、也是 canvas 作为图片时的下边。所以 `drawImage(glCanvas, 0, glCanvas.height - H, …)`
拿到的正是那条带子、行序也没错，**但结果是 `vUv.y` 从下往上数**，
与页面坐标相反。判据：`uDbgUV` 打开后 `G` 应当等于 `y/900`。

**修复验证**：UV 场逐点精确（y=380/460/620/700 → G=108/131/176/199，
期望 108/130/176/198）；"玻璃 1:1 重绘壁纸"和真实背景的逐像素平均差
**21.53 → 5.93**，>8 的像素占比 **77.6% → 6.4%**。
（当时还剩的 5.93 是页面自己 `filter: saturate(1.1)` 与我写死的 `sat 1.5` 的差；
v18 把 `sat` 改成读页面实测值之后，这一项已经消掉 —— 见「`hole` 的两次反转」。）

---

## 目录结构

```
index.ts              addon 入口：注入 plan3.css + 侧栏 DOM + cf-nav.js + glass.js
                      ★ VERSION 常量在这里，改任何 public/ 文件都要递增（见部署那段）
                      ★ 侧栏 DOM（含 管理域 / 控制面板）是**服务端渲染**的，
                        「控制面板」只带 cf-si--su 这个类名，SU 与否交给前端判定
public/
  cf-nav.js           面包屑（含比赛页分段按钮 contestTabs）、SU 判定（markSU）、
                      侧栏高亮、删 Language、装饰用户区、去重寄生侧栏
  plan3.css           外观。玻璃的边（含 0.5dp 高光）完全由 shader 画；
                      CSS 只保留：兜底外观 + 投影 + 按钮/图标按钮的**基础描边**
  glass.js            液态玻璃渲染器（WebGL，全站）
                      ★ collect() 里跳过 INPUT/SELECT/TEXTAREA/IMG —— 见「<input> 装不了玻璃」
  _wp-test.webp       参考 demo 的壁纸，给 __cfGlassWallpaper 演示用（临时文件，可删）
tools/
  cdp.js              CDP 注入 + 截图（--css / --js / --eval / --pre / --hover / --after）
  undo-flip.js        配 --pre：把 vUv 翻转改回修复前，做"同状态 A/B"
  find-shift.js       高通后搜位移 / 缩放（判断重绘对不对得齐）
  png-crop.js / png-px.js / png-diff.js / png-side.js   零依赖图像工具
  probe-*.js          --eval 探针（v13 / ro / acrylic2 / rects / contest / inputbtn / inputtest / discuss / su / hover …）
  verify-v19*.js      v19 的验收探针（final / b / c / d）
  v19-preview.js      配 --js：用 ?nocache= 把服务器上新的 css+js 重新挂进当前页面
                      （⚠ 只能拿到**已经重启进 /root/.hydro/static/ 的那份**）
  t-*.js              线上试参数的注入脚本（配 --js）
  upload-ssh.js       单文件 SFTP 上传
  run-ssh.js          远端执行（--sudo 后面的整段要作为**单个 argv**）
```

部署目标：`/home/ubuntu/hydro-addons/Sidebar/`

```bash
# 上传（可多个文件）
HG_SSH_PASS=… NODE_PATH=… node tools/upload-ssh.js \
  cf-sidebar-nav/index.ts cf-sidebar-nav/public/glass.js cf-sidebar-nav/public/plan3.css
# 重启（只有这一种写法是对的，见踩坑 2 / 项目 MEMORY.md）
HG_SSH_PASS=… NODE_PATH=… node tools/run-ssh.js "--sudo bash -lc 'pm2 restart hydrooj'"
```

> ⚠ `pm2` 只在 **root 的 login shell** 里。`sudo pm2 ...` 和 `su - ubuntu -c 'pm2 ...'` 都是错的。
>
> ⚠ **重启这一步不能省。** 静态文件是 Caddy 从 `/root/.hydro/static/` 直接吐的，
> 而 Hydro 只在启动时把 addon 的 `public/` 拷进去 —— 只上传不重启，线上毫无变化。
> 详见「部署链路：为什么'上传'等于没改」。
>
> ⚠ 改任何 `public/` 下的文件都要**同时**递增 `index.ts` 里的 `VERSION`，并且**新版本号必须是
> 从没被请求过的值**：`?v=<VERSION>` 是有效的破缓存手段，但一旦某个版本号在重启**之前**被请求过，
> CF 和浏览器就会把它连同旧内容缓存 4 小时（`max-age=14400`），改内容再重启也救不回来。
>
> ⚠ **判断有没有真的换掉**要分三份对：
> ① 本地 MD5 ② 服务器上文件的 MD5 ③ **CF 真正返回的字节数/MD5**。
> 前两个一致只说明"文件上传成功了"，第 ③ 个才决定浏览器看到什么
> （2026-10-07 就在这上面白折腾了一轮）。
> ```bash
> # ③ CF 真正返回的那份（用当前 VERSION，别用 -s 之后再 -sI，第二次一定是 HIT）
> curl -s "https://oj.xzy404.top/plan3.css?v=$VERSION" | md5sum
> # 源站真身（对照用）
> curl -s "https://oj.xzy404.top/plan3.css" | md5sum      # 走 Caddy 的 static
> ```
> 不一致 → 换一个新 `VERSION` 再重启。光看 HTTP 200 说明不了任何事。

---

## 一、液态玻璃是怎么做出来的（v2 移植 → v13 折射 → v18 成型）

v1 是我自己"看着像"攒的（`band=42` + 白纱 `tint=.33` + 内部糊到 22px），用户的评价是
**「这不就是直接加了一层高光吗，没有一点液态的感觉，然后还很刺眼」**。对的 —— 它跟真玻璃的
光学没半点关系。

v2 改成移植 [martin65536/liquid-glass-webgl](https://github.com/martin65536/liquid-glass-webgl)
（[Kyant / AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass) 的 Web 移植）里
真正在跑的那段 shader，逐行对齐：

| 参考文件 | 搬过来的东西 |
|---|---|
| `shaders/element.ts` | 折射主循环（第 414-451 行） |
| `shaders/element-utils.ts` | `circleMap`、`applyColorControls`、`DefaultHighlightShaderString`（第 454-486 行 → 0.5dp 细高光） |
| `shaders/sdf.ts` | `sdRoundedRect`、`gradSdRoundedRect` |
| `renderer/methods-wallpaper.ts` | cover 规则采样壁纸 |
| `catalog/constants.ts` | `GLASS_PARAMS`、`DEFAULT_HIGHLIGHT`、`DEFAULT_SHADOW` |
| `catalog/build-scroll-container.ts` | 「懒加载容器」卡片的参数 |

### 核心就一行

```glsl
float d = circleMap(1.0 - depth / uRefH) * uRefAmt;   // depth = 离边的深度
vec2  g = gradSdRoundedRect(c, hh, r);                // SDF 外法线
vec2  p = px + d * g;                                 // 取样点
```

其中 `circleMap(x) = 1 - sqrt(1 - x*x)`：在 `x=1` 处陡、在 `x=0` 处平。代进 `depth` 后：

| 位置 | circleMap | 位移（refH=30, amt=-60） |
|---|---|---|
| 贴边 `depth=0` | `circleMap(1) = 1` | **60px** |
| 带中 `depth=h/2` | `circleMap(0.5) = 0.134` | 8px |
| 带内沿 `depth=h` | `circleMap(0) = 0` | 0 |

**外面十几像素几乎不动，所有形变全部挤在最贴边的一圈里** —— 这就是"厚玻璃边"的全部秘密：
一个又窄又陡的位移场。v1 用 `(1-t)²` 铺满 42px，等距、平缓，摊成一大片渐变，所以只剩"糊"。

另外三条同样重要：

1. **位移方向是向内**（`refractionAmount` 是负数）。边缘那一圈映射的是"再往里一点"的内容，
   等效于贴边放了个放大镜。我原来以为要把外面的东西拉进来，也是错的。
2. **位移量恒为 `-2 × band`**。参考里 16/-32、12/-24 都是 2 倍，这个比例不能破，破了就是"糊边"。
3. **边之所以看得见，主要是背景被掰弯了**，而不是靠描边。
   参考确实额外描了一条 0.5dp 的高光线（`DEFAULT_HIGHLIGHT`），但它是"细线 + 四角最亮"，
   跟"整条带子发亮"完全是两回事 —— 见下面「边缘那圈不是高光，是 0.5dp 的细线」。

### 参数表（`glass.js` 顶部 `KINDS`）

用户的原话是「**你不用管效果好不好，直接把我给你的那个 github 仓库搬上来**」，
所以几何部分（折射带宽、位移量、圆角、高光、投影）就是参考源码里的数值。
但**颜色 / 内部**那几项在 v18 之后**不能照抄**了 —— 原因见「玻璃内部：`hole` 的两次反转」。

| kind | 选择器 | refMin/refMax | sat | surface | frost | rimHi | hole | inner | sheen |
|---|---|---|---|---|---|---|---|---|---|
| side | `.cf-side` | 12 / 14 | **`'page'`** | **.07** | 0 | .5 | **0** | **.70** | **.80** |
| bar | `.cf-bar` | 12 / 14 | **`'page'`** | **.07** | 0 | .5 | **0** | **.70** | **.80** |
| card | `.slideout-panel .section` | 16 / 32 | **`'page'`** | **.07** | 0 | .5 | **0** | **.70** | **.80** |
| btn | `.slideout-panel .btn` / `button.btn` / `.button` | 12 / 12 | **`'page'`** | **.05** | 0 | .5 | **0** | **.50** | **.50** |

> **加粗的每一项都是 v18 偏离开参考的地方**，各有硬理由：
> · `sat` 必须等于页面背景自己的 `saturate()`（写死 1.5 就会画出一块更艳的矩形）；
> · `hole` 全 0 —— 参考本来就是整块画的，v13~v17 挖空是我为了避免"贴图感"做的过度修正；
> · `surface` .05~.07 —— 对齐背景之后不抬起一点，中间就跟背景一模一样，看着是个洞；
> · `inner` / `sheen` —— 参考里由它的 inner-shadow 后处理 + 3D 场景光照负责，我们只能自己算。
> 几何项（`refMin/refMax/amt/radius/rimHi`）和 `frost 0` **仍然照抄参考，一个字没改**。

参考参数原文（几何部分照抄，别改）：

| 出处 | 参数 |
|---|---|
| `GLASS_PARAMS`（按钮） | `refractionHeight 12 / refractionAmount -24 / blurRadius 2 / saturation 1.5 / brightness 0 / contrast 1`，`surfaceColor [0,0,0,0]`，胶囊圆角 = 高/2 |
| `build-scroll-container.ts`（卡片） | `cornerRadius 32 / refractionHeight 16 / refractionAmount -32 / blurRadius 0 / saturation 1.5 / surfaceColor [0,0,0,0]` + `DEFAULT_HIGHLIGHT` |
| `DEFAULT_HIGHLIGHT` | mode 0、白、45°、falloff 1.0、**alpha 0.5**、widthDp 0.5 |
| `DEFAULT_SHADOW` | radius 24、alpha 0.1、offsetX 0、**offsetY 4**、黑 |
| 渲染顺序 | ① 裁形状 ② 采样 backdrop（含模糊）③ vibrancy ④ 透镜折射 ⑤ 表面色 ⑥ 高光 ⑦ 边缘 AA；inner shadow 是**单独的后处理 pass** |

带宽仍然是自适应的（参考卡片只有 160px 高，16px 带子 = 短边 10%；
我们 588px 高的卡照搬只有 2.7%，1× 下看不见）：

```js
band   = clamp(短边 × 0.055, refMin, refMax)      // 再设一道 短边×0.30 的硬上限
amt    = -2 × band
innerW = min(band × 2.2, 短边 × 0.35)             // 倒角宽度，窄元素别让两侧在中线叠满
```

上限从 20% 放到 **30%** 是 v13 改的：参考按钮 48dp 配 12dp 带子 = 25%，
卡在 20% 等于把参考数值改掉了。

### ★ 玻璃内部：`hole` 的两次反转（这一段是全文最该读的）

**第一轮（v13）**：用户连着两轮说的是同一件事 ——
**「每一个卡片的底都是一张新的图片」「我希望的是一个透明的效果而不是拿一张底图就来凑数」**。
当时卡内铺了 `surface .30` 白纱 + 20px 重糊，在壁纸上看就是「一块颜色和周围不一样的矩形」。
于是我加了 `uniform float uHole`，把内部**整个挖空**（`aIn` 到 `t = 1` 归零）：

```glsl
float t = (uRefH > 0.5 && depth < uRefH) ? (depth / uRefH) : 1.0;
float wColor = (uHole > 0.5) ? (1.0 - smoothstep(0.45, 0.95, t)) : 1.0;   // 颜色渐隐
float aIn    = (uHole > 0.5) ? (1.0 - smoothstep(0.82, 1.0, t)) : 1.0;   // alpha 渐隐
```
实测卡内平均差 **0.04/255** —— 字面意义上的"一个像素都没画"。

**第二轮（v18）**：用户说 **「你只有边框有液态玻璃的感觉，中间部分就跟没有东西一样，而不是玻璃感」**。
他又说对了 —— 内部不画 = **在壁纸上凿了个洞**，只剩一圈边，没有"一块玻璃"的体量感。
参考项目里玻璃是**整面画出来**的（采样 backdrop → 提饱和 → 折射 → 表面色 → 高光），
我为了消掉"贴图感"把这一步整个删了，属于矫枉过正。

**转折点：真正的病根不是"画满"，而是"画得和背景不一样"。**
拆开看，当初那块"异色矩形"来自两处，都不是"画满"本身：

| 病根 | 当时的写法 | 真相 |
|---|---|---|
| 内部比周围更**艳** | 写死 `sat 1.5` | 页面自己的滤镜是 `backdrop-filter: blur(0px) saturate(1.1)` → 我这边 1.5 就是"更艳的一块" |
| 内部比周围更**白** | `surface .30` + `frost 1` | 30% 白纱 + 20px 重糊 = 一块奶白磨砂贴纸 |

所以现在的正确做法是**两步**：

1. **先把内部重绘调成和页面背景逐像素一致**：
   `sat` 不再写死，改成字符串 `'page'` —— `measurePageSat()` 在启动时读
   `getComputedStyle(document.body, '::before').filter` 里的 `saturate(...)` 值（本站 1.1）直接用；
   `frost 0`（页面没模糊，我们也不能糊）、`surface` 只留极淡的一层 .05~.07。
   **实测卡内 0.33 / 0.59 / 255（今日运势 / 最新题目）→ 已对齐。**
2. **再往上叠"玻璃质感"，而且必须是形状驱动的**（内壁倒角 `inner` + 方向性 `tilt` + 表面光泽 `sheen`），
   详见下节。这一层带来的所有差异都是我有意加的玻璃特征，
   而不是"重绘没对齐"漏出来的色块 —— 这才是当初"像贴了张图"和现在"像一块玻璃"的分界线。

> 想回到"只剩一圈边"的观感：把 `KINDS` 里那几个 `hole` 改回 1（一行）。
> 想更接近参考原样的"整面墙"：把 `surface` 提到 .15 左右（但会开始发乳白，别过）。

配套 CSS 在 `plan3.css`（特异性 (0,4,0)，原因见踩坑 6）：

```css
.slideout-panel .section.cf-glass.cf-glass-on,
.slideout-panel .main .section.cf-glass.cf-glass-on {
  background: transparent !important;
  backdrop-filter: none !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, .10) !important;   /* DEFAULT_SHADOW */
}
```

⚠ 这条**必须挂在 `.cf-glass-on` 上**。这个类只在画布真的挂上之后才由 `glass.js` 加；
玻璃失败（没壁纸 / WebGL 不可用）时类不加，卡片保持正常白底，
页面不会变成「正文糊在壁纸上」。

### ★ 玻璃"实体感"：内壁倒角 + 表面光泽（v18 新增）

用户那句话——「中间部分就跟没有东西一样，而不是玻璃感」——的解药就是这三个 uniform：

```glsl
if (uInner > 0.001) {
  float eLine = (1.0 - smoothstep(1.0, 5.0, depth)) * smoothstep(0.0, 1.0, depth);
  float bevel = 1.0 - smoothstep(0.0, max(uInnerW, 4.0), depth);
  float side  = clamp(dot(g, normalize(vec2(0.45, 0.55))), -1.0, 1.0);  // 向外的法线 · 右下方向
  float thick = bevel * (1.0 + uTilt * side);
  col *= 1.0 - uInner * (0.13 * eLine + 0.055 * thick);
}
if (uSheen > 0.001) {
  vec2 np = clamp(px / uSize, 0.0, 1.0);
  float sh = clamp(1.0 - (np.x * 0.45 + np.y * 0.55), 0.0, 1.0);       // 左上 1、右下 0
  col *= 1.0 + uSheen * (sh - 0.5) * 0.16;
}
```

| uniform | 作用 | 为什么这么写 |
|---|---|---|
| `uInner` / `uInnerW` | 贴边一段距离内微微压暗（玻璃的**厚度**），到 `uInnerW` 归零 | 由 SDF 的 `depth` 驱动 → 永远贴着形状走，换尺寸换圆角都不错位 |
| `uTilt` | 倒角的**方向性**：右下方向更厚更暗 | 四周对称的倒角看着像"一圈均匀的晕"；加上方向性，整块玻璃的受光关系才成立（光在左上） |
| `uSheen` | 表面光泽：左上亮、右下暗 | ★ 必须用**乘法**，不能加白色 —— 本站壁纸接近纯白，加白会被直接裁掉、完全看不见；乘法在纯白区域也能压出层次 |

另外补了一条 `eLine`：紧贴那根 0.5dp 高光线**内侧**再压一条 1~5px 的窄暗环，
和高光线构成"亮—暗"的切口观感。位置是算好的（高光占最外 1.2px，暗环从 1.0px 起），两者不打架。

**参数怎么定的**：做了四档（挖空 / 轻度 / 中度 / 明显）在同一页面同参数下截图对比，
选了中度（`inner .70 / sheen .80 / surface .07`）——
"明显"那档（`surface .15`）已经发乳白，像磨砂塑料而不是玻璃。
对照图：`v3shots/variants.png`、`v3shots/final-ab.png`。

> 数值的敏感度：`surface` 是**最敏感**的一个。0 = 中间和背景完全一样（就是用户否掉的"没有东西"），
> .07 = 一眼看出是一块玻璃板，.15 以上开始发乳白。改它之前先看一眼 `final-ab.png`。

### 边缘那圈不是高光，是 0.5dp 的细线

用户之前说「**你这个不就是直接加了一层高光，没有一点液态的感觉，然后还很刺眼**」。
当时我的实现是拿 SDF 外法线在**整条折射带上**刷一层 `rim*rim` —— 一整条带子在发亮，当然刺眼。

参考的做法（`shaders/element-utils.ts:454-486`，`DefaultHighlightShaderString`）是**独立一个 pass 描一条 0.5dp 的线**：

```glsl
float intensity = pow(abs(dot(gradSdRoundedRect(local, half, r), vec2(cos45, sin45))), falloff);
resultRgb += vec3(0.5) * intensity * innerMask * progress;   // Plus 叠加
```

关键是 `abs(dot(法线, 45°))`：**最亮在四角、四边中点最暗**；`vec3(0.5)` × alpha 0.5 很淡。
重写成：

```glsl
if (uRimHi > 0.001 && depth < 1.2) {
  float line  = 1.0 - smoothstep(0.0, 1.2, depth);          // 只在贴边 1.2px 内
  float inten = abs(dot(g, vec2(0.70710678, 0.70710678)));  // g = SDF 梯度 = 法线
  col += vec3(uRimHi) * inten * line;
}
```

> ⚠ 这一条**反转了上一轮「不要加高光」的指令**。原因是用户后来说
> 「我体验了一下感觉效果就是可以的」，而参考之所以"很明显"，靠的正是这条默认高光。
> `rimHi = 0` 可以随时关掉。

### 为什么 surface 现在是 .05~.07（而不是 0，也不是 .30）

参考给的 `surfaceColor` 是 `[0,0,0,0]`（全透）。这是一条**走过两头**的曲线：

| 版本 | 值 | 结果 |
|---|---|---|
| v2 时期 | `.30` + `frost 1` | 卡内奶白一块 + 20px 重糊 → 用户：「每个卡片的底都是一张新的图片」 |
| v13 ~ v17 | `0` + `hole 1` | 内部一个像素都不画 → 用户：「中间部分就跟没有东西一样」 |
| **v18 起** | **.05~.07** + `hole 0` | 对齐背景之后**主动抬起一点点** → 一眼看出是一块玻璃板 |

关键区别在于：现在这层白纱是**叠在"已经和背景逐像素对齐"的重绘之上**的，
所以它带来的任何差异都是"玻璃自己的颜色"，而不是"重绘没对齐的色块"。
以前那 .30 之所以像贴纸，是因为它盖在**已经偏色**（`sat 1.5`）的底上，两个误差叠加。

如果将来某个页面读着累，**单独给那一页加白纱**，别全局动。
（`surface` 是全表最敏感的一项：0 = 洞，.07 = 玻璃，.15 以上 = 磨砂塑料。）

- `surface` = 极淡白纱（现在 .05~.07）。
- `frost` = 内部用 20px 重糊版（留作开关：想让它挡住背后滚动内容且不接受"看穿"时用）。
  **当前所有档位都是 0** —— 顶栏 v13 时用过 1，v17 依用户要求归零（"中间还是模糊效果"）。
  折射带永远用原图保证锐利。
- **圆角是从元素实际计算出的 `border-radius` 读的**，所以 shader 的 SDF 和浏览器画的形状
  严格一致。想改玻璃的形状，改 `plan3.css` 里的圆角就行。

### 三张纹理

| 纹理 | 内容 | 用途 |
|---|---|---|
| `uWall` | 原始壁纸（cover 铺满视口） | 主体、内部 |
| `uRimTex` | 4px 微糊 | 折射带 |
| `uFrostTex` | 20px 重糊 | `frost=1` 时的内部（当前无人使用） |

**为什么要那张 4px 的**：折射带是 2× 压缩，壁纸上的细线稿会被拉成一条条硬彩边
（实测出过粉/蓝竖条）。微糊一下它就变成柔和的光色过渡 —— 真玻璃本来也有这一点点扩散。
主体（`rw→0`）仍用原图，保证内部绝对干净。

---

## 二、背景从哪来

参考项目每帧把整个场景渲进 FBO，玻璃去采样它后面的场景。我们做不到 —— 那要离屏重绘整个 DOM
（v0 试过 html2canvas：**伪元素渲染不出来**，而且 shader 写死 `alpha=1` 让透明区变黑，
线上侧栏发黑就是它）。

但本站有个先天优势：

```css
body::before {
  background-image: var(--acrylic-wallpaper);   /* cdn.luogu.com.cn/images/bg/fe/luogu4-bg-l.jpg */
  background-size: cover; background-position: 50% 50%;
  position: fixed; inset: 0; z-index: -1;
}
```

**壁纸是一张钉在视口上的图**，而且那个 CDN 带 `Access-Control-Allow-Origin: *`。
于是直接把这张图按 cover 规则画成"视口大小的纹理"，就得到与页面逐像素一致的背景：
一次加载永不失效，不用 198KB 的库，也没有跨域问题。

代价：**玻璃只折射壁纸，折射不到"壁纸之上的 DOM"**（比如卡片上的按钮）。
本站所有玻璃元素背后都只有壁纸，所以这个近似恰好成立。

> ⚠ **`/login` 这类页面没有壁纸**（`body::before content=none`，`--acrylic-wallpaper` 为空）。
> 此时 `glass.js` 轮询 12 秒后打上 `data-glass-fail="no wallpaper"`，元素**不会**加 `.cf-glass`，
> 自动退回 `plan3.css` 里那套「半透明白 + `backdrop-filter`」的兜底外观。页面不会坏。
> 登录表单照样是药丸按钮，只是不是 WebGL 玻璃。

---

## 三、为什么你的看起来和 demo 不一样（重要）

### 先把 demo 拆开看

跑了几个探针之后，参考 demo 的真实情况和我原先的猜测**不一样**，记下来免得再猜：

| 问题 | 实测答案 |
|---|---|
| demo 的页面背景是什么 | **纯白** `rgb(255,255,255)`，`bodyBgImg: none`，页面上**没有** `<img>` 壁纸 |
| 那它的玻璃在掰什么 | 掰的是它**自己画在 canvas 里的壁纸**（`/wallpaper/wallpaper_light.webp`） |
| 那张壁纸长什么样 | **竖版、大块饱和蓝/绿/青圆形、边界很硬**（74 KB webp） |
| demo 的菜单是 DOM 吗 | **不是**。`document.querySelectorAll` 找不到任何菜单项、`scrollables: []` —— **整个 UI 都是 canvas 画的** |

所以 demo 的"好看"是两件事叠起来的：
① 干净的磨砂面 + 一圈柔和亮边（这部分我们也有：内部真透明 + 0.5dp 细高光 + 折射带）；
② 大色块硬边背景被边缘"掰"出一道弧（这部分**依赖背景**，见下）。

### 为什么我们的折射看不见

玻璃边缘显示的，是「贴边向内约 `refractionHeight` 的一条带子**被折叠压缩**」的结果。
采样位置 `s(t) = t + |d(t)|` 是**非单调**的（会折返），所以贴边那条带子里是
一段被反复折叠的内容。这条带子里有没有东西，完全取决于背景在这一小片里
有没有**明暗 / 颜色突变**。

- demo：大块硬边圆 → 折叠出一道干净漂亮的弧 ✓
- 本站 `luogu4-bg-l.jpg`：**1~2px 的极细低对比线稿** → 位移 32px 后取到的颜色几乎不变 ✗

（早前我记成"接近纯白"，下载下来看了才发现是"蓝→白→黄渐变 + 细线稿"，判断偏差。）

**这是物理限制，不是实现问题。** 想让它像 demo 那样夸张，只有两条路：

1. **换一张有大块硬边形状的壁纸**（最有效，改一行）。acrylic 插件认 `--acrylic-wallpaper`。
   已验证：同一页面、同一 shader、**只换壁纸**（换成 demo 自己那张 `wallpaper_light.webp`），
   卡片边缘立刻从"看不出"变成一道清晰的青色厚玻璃边。
   线上复现方法见 §五 的「换壁纸的热钩子」。
2. 调大 `refMax`（带宽）—— 效果有限，因为背景没有突变可掰。

反过来，**侧栏/顶栏**的玻璃更容易看见：它们的折射带贴着的壁纸区域内容更多。

> ⚠ 有些页面**根本没有壁纸**，玻璃会按设计退回 CSS 兜底（`data-glass-fail`）。
> 已知的：
> - `/login` 等未登录页面：`body::before` 无背景、`--acrylic-wallpaper` 为空。
> - **`/record` 等需要登录的页面在未登录时会 302 到 `/login`**，所以探针读到的也是"0 个玻璃元素"。
>   线上抽查方法：`node tools/cdp.js "<url>" --eval=tools/probe-v13.js`，看 `fail` 与 `已挂载数`。

### 几个开关（按需调）

```js
// glass.js 的 KINDS 里
ca: 0        // 色散。参考默认也是关的（按钮/滚动容器都不开）。
             // 打开后边缘会出现棱镜彩边 —— 强度 ∝ (cx·cy)/(hx·hy)，中线为 0、四角最大，
             // 所以是"局部彩边"而不是"一圈彩虹描边"。（v1 那种一圈均匀彩边就是这么被嫌丑的。）
rimHi: .5    // 0.5dp 细边缘高光，见上面「边缘那圈不是高光，是 0.5dp 的细线」。
             // 调 0 就关掉 —— v13 之前一直是 0，是用户要求"照搬仓库"才打开的。
hole: 0      // 0 = 内部整块画出来（现在全站都是 0）。
             // 1 = 内部挖空、只剩一圈折射边（v13~v17，用户否掉了："中间跟没有东西一样"）。
surface: .07 // 玻璃的"体量感"主要靠它。0 = 洞，.07 = 玻璃，.15+ = 磨砂塑料。
inner: .70   // 内壁倒角（厚度）强度。0 = 关（会退回"一块平板"）。
sheen: .80   // 表面光泽。0 = 关（中间又变平）。
tilt: .75    // 倒角的方向性：光在左上 → 右下更厚更暗。0 = 四周对称（像一圈均匀的晕）。
```

---

## 四、性能

- **一个共享 WebGL 上下文**（浏览器上限通常 16 个）。一个元素一个上下文的话，
  卡片一多的列表页当场就炸。这里是逐元素渲染 → 立刻 `drawImage` 到元素自己的 2D canvas。
  所以**每个玻璃元素都有一个自己的 canvas**（首页实测 8 个，合计 **4.1 MB** 显存 / 1.09 MP），
  但它们画的是**同一张纹理、同一个位置** —— 不是各画各的图
  （逐像素验证过：8 个画布互相比 **最大差 0**；卡内 vs 页面背景 **平均差 0.04/255**）。
- **只渲染「元素 ∩ 视口」那一段**。工程题列表页那张包住整张表格的卡片有几千 px 高，
  按整块建画布实测一帧 170ms，滚一下像幻灯片。所以卡片画布的高度就是它可见的高度
  （870×629 的卡片在视口内只剩 212px 时，画布就是 870×212）。
- **窗口在屏幕上的矩形没变就不重绘**。壁纸是 `fixed` 的，屏幕上同一块矩形看到的壁纸永远一样；
  一张比视口还高的长卡片滚过一屏，窗口一直是"整个视口"，只有上下边缘进出视口时才真的变。
- **渲染分辨率 `SCALE = clamp(dpr, 1, 1.5)`。⚠ 必须 ≥1**：玻璃内部画的就是壁纸本身，
  按 0.7 渲染再放大会让卡片内部比周围页面糊 —— 那就又变回"一层模糊"了。
- `IntersectionObserver`（`rootMargin: 200px`）懒加载：进视口才建画布。
- 线上实测（1440×900，无头 SwiftShader，比真机慢）：首帧 ~90–125ms（建三张纹理 + 上传），
  稳态 **0.2–0.3 ms/帧**，滚动时最坏 ~85ms（真实 GPU 上约 1–2ms）。

自测：`window.__cfGlassStats` → `{paints, ms, last, worst, targets}`。
**别用 rAF 帧间隔测** —— 无头环境本身就被压到 24fps，测不出真实开销。

---

## 五、线上调参钩子

部署一次很贵（Cloudflare 缓存 + 重启），所以参数表暴露出来了：

```js
__cfGlassTune('card', { refMin: 20 })       // 改某一类
__cfGlassTune(null,   { ca: 1 })            // 'card' | 'btn' | 'side' | 'bar' | null=全部
__cfGlassTune(null,   { hole: 0, inner: .7, sheen: .8, surface: .07, tilt: .75 })  // v18 那套
__cfGlassKinds                              // 看当前值
```

**一次试多档的正确姿势**（v18 就是这么选出参数的）：写几个 `tools/t-*.js`，
每个只调一次 `__cfGlassTune`，然后

```bash
node tools/cdp.js https://oj.xzy404.top/ --js=tools/t-P2.js --after=700 --shot=a.png --wait=5500
```

`--after` 是必须的：`__cfGlassTune` 只是标脏 + 排重绘，注入完立刻截图会拍到旧帧。
截图之后用 `png-crop.js` 从每张里裁**同一块区域**，再拼成版式页比较
（`v3shots/variants.html` 就是这个套路）。

### 换壁纸的热钩子（`__cfGlassWallpaper`）

`glass.js` 只在启动时读一次壁纸，所以"想看看换张壁纸会不会更好看"以前必须重新部署。
现在可以在控制台里直接换（**两行都要**，否则玻璃采样新图、页面还显示旧图，两边对不上）：

```js
// 1) 换页面背景
const s = document.createElement('style');
s.textContent = "body::before{background-image:url('/路径.webp') !important;background-size:cover !important}";
document.head.appendChild(s);
// 2) 让玻璃重新采样 + 重建三张纹理
await __cfGlassWallpaper('/路径.webp');
```

`.cf-glass` 元素不用重建，`refreshList()` + `invalidate()` 会自动重画。

> **实测对照**（同一页面、同一套代码、只换壁纸）：
> 本站壁纸下卡片边缘是一条**柔和的黄绿色渐变带**（因为壁纸是蓝→白→黄的平滑渐变，
> 没有硬边可掰）；换成参考 demo 那张 `wallpaper_light.webp` 后，卡片内部能看见**完整的蓝色圆形**，
> 下边缘会被掰出一道**清晰的弧** —— 跟 demo 里看到的是同一种东西。
> 演示用的壁纸临时放在 `/home/ubuntu/hydro-addons/Sidebar/public/_wp-test.webp`
> （`https://oj.xzy404.top/_wp-test.webp`），想自己试就照上面两行走一遍。

配合 `tools/cdp.js` 可以在一轮里注入 + 截图：

```bash
node tools/cdp.js "https://oj.xzy404.top/p" --w=1440 --h=900 --wait=5000 \
  --eval=tools/tune/e.js --shot=out.png
```

调好后把数值抄回 `KINDS`，**递增 `VERSION`**，重新上传
（`VERSION` 不改的话改了就等于没改，见踩坑 16）。

---

## 六、踩坑清单

1. **`half` 是 GLSL 保留字**。变量只能叫 `hh`。
2. **WebGL viewport 原点在左下角，2D `drawImage` 源坐标原点在左上角**。必须
   `drawImage(glCanvas, 0, glCanvas.height - H, W, H, 0, 0, W, H)`。
   写成 `(0,0,W,H)` 就是拷没画过的区域 —— `alpha:false` 时那片是不透明白，卡片全黑。
   **副作用很阴**：侧栏高度恰好等于画布高度，所以它一直是对的，只有卡片露馅。
3. **本站壁纸是页面加载后由 acrylic 插件用 JS 挂上的**，而本脚本是服务端注入的 `<script>`，
   `DOMContentLoaded` 就跑完了。所以 `boot()` 是**轮询等待**，不是查一次。
   线上第一次部署就死在这一步（`data-glass-fail="no wallpaper"`）。
4. **band 不能超过短边的 20%**。侧栏总共才 72px 宽，给 64px 的带子等于整条都是"边缘"，
   采样被左右两边互相拉，糊成一片彩色条纹。
5. **`uFrost` 不能既当 sampler 又当标量** —— GLSL 同名的不同类型 uniform 直接编译失败。
   所以纹理叫 `uFrostTex`。
6. **acrylic 插件自己也写 `.section`**：
   ```css
   .slideout-panel .main .section { border-radius: var(--acrylic-radius); /* 14px */ }
   ```
   specificity (0,3,0) 高于我的 `.slideout-panel .section` (0,2,0)。不加 `!important`
   的话 CSS 明明写着 20px、computed 却是 14px。（`border` / `background` / `box-shadow`
   我本来就有 `!important`，所以只有圆角中招。）
7. **`li.contest__item` 左边那条 5px 粉/蓝竖线是 Hydro 原生的**（比赛类型色：
   IOI 粉、其它蓝），不是折射画出来的。别去查玻璃。
8. **本地预览必须抹掉容器底色**。线上 acrylic 插件把 `.slideout-panel` / `.main` 都设成了
   `rgba(0,0,0,0)`，静态快照里它们还带着 Hydro 默认的 `#edf0f2` 灰底。
   不抹掉的话卡片显示壁纸、周围却是灰的，预览完全失真 —— 我因此白判断过一轮。
9. **`MutationObserver` 观察太宽会打碎 Hydro 初始化**。只观察必要的子树。
10. **`position:fixed` + `z-index` 的 stacking context 只有截图能看出来**，`getBoundingClientRect`
    看不出问题。
11. **量出来的东西要看数值**。曾经以为"线上和本地不一致"，实际两张截图数值完全一致
    （`195,222,222` vs `194,222,221`），是肉眼看缩放图产生的错觉。
    所以有了 `tools/png-px.js`：直接从截图里读像素。
12. **`ssh-run.js` 里 `conn.exec(cmd, cb)` 的 stream 必须在回调里拿**。
    写成 `const stream = conn.exec(cmd, cb => ...)` 拿到的是 Client 不是 stream，
    `stream.write()` 直接 TypeError。
13. **`--eval` 的脚本不能写成 IIFE**。`cdp.js` 把文件整体包进 `(async()=>{ ... })()`
    且开了 `awaitPromise`；如果你在文件里写 `(async function(){ await ... })()`，
    外层**不会 await 它**，于是截图可能跑在"调参还没生效 / 样式还没注入"之前 ——
    会拿到一张看起来"什么都没变"的截图，然后得出错误结论。
    **直接把语句写在最外层 + 最后 `return`。**（我为这个坑白量了一轮。）
14. **`.slideout-panel .section` 的 `background: rgba(255,255,255,.5) !important`
    会压过 `.cf-glass` 的 `background: transparent !important`**（specificity 0,2,0 vs 0,1,0）。
    目前不影响观感（画布是 `z-index:-1` 的子元素，盖在这层底色上面），
    但它是个隐患：**万一玻璃失败／画布没覆盖到，露出来的是白底**。已知，暂不动。
15. **逐像素比对时，样本区里别混进文字**。我第一次拿"卡内 vs 纯壁纸"做对比，
    差值里绝大部分是**文字**贡献的，不是卡片材质 —— 完全读不出结论。
    正确做法是拿"卡内 vs 卡外**同一张壁纸**"、并且卡外那一侧要真的没有任何元素
    （用 `elementFromPoint` 横向扫一遍确认边界，不要靠肉眼估坐标 ——
    我据此把坐标估错过一次，读到的其实是左边那张大卡的轮播插画）。
16. **★ 改了 `public/*.css` 却没改 `index.ts` 的 `VERSION` = 等于没改。**
    Cloudflare 把 `/plan3.css?v=…` 整个 URL 当 key 缓存，文件内容变了但 URL 没变，
    它继续吐 4 小时前的旧副本。**2026-10-07 又踩了一次**：本地 MD5 和服务器文件 MD5
    完全一致（`d599578b…`），但 `curl "…/plan3.css?v=20261007s"` 拿到的是旧版 18027 B，
    computed 里那条 `box-shadow` 就是不生效，查了半天特异性 —— 其实是缓存。
    **判据**：
    ```bash
    curl -s "https://oj.xzy404.top/plan3.css"               | md5sum   # 走 Caddy static 的真身
    curl -s "https://oj.xzy404.top/plan3.css?v=$VERSION"    | md5sum   # CF 上那份
    ```
    两者不一致 → 换一个**没用过的** `VERSION` 再上传 + 重启（见踩坑 22/23）。
    **结论：改任何一个静态文件都要递增 `VERSION`，而且必须是新值。**
17. **`curl` 到的是 CF，不是源站**，所以"服务器上文件对"和"浏览器拿到的是新的"是两件事，
    必须分开验（本地 MD5 / 服务器 MD5 / CF 返回体 三份都要对）。
18. **★★ "玻璃内部画满"本身不是"贴图感"的原因 —— 画得和背景不一样才是。**
    这是我栽得最深的一次：用户说「底是一张背景图片」，我就把内部**整个挖空**（`hole 1`）；
    结果用户又说「中间部分就跟没有东西一样」。两次我都在改"画不画"，
    而真正的变量是 **`sat` 写死了 1.5，而页面背景自己的滤镜是 `saturate(1.1)`** ——
    内部一画出来就比周围更艳，当然像贴上去的一块。
    **教训：内部重绘的参数不能靠猜，要实测页面背景自己的 `filter`**（`tools/probe-acrylic2.js`），
    所以现在 `sat` 支持字符串 `'page'`。
19. **拿"分两次加载的截图"做 A/B 是陷阱。** 首页有自动轮播、`一言` 卡片每次随机换文案，
    两次加载的页面状态根本不同 —— 我为此得到过一张**差异图全是噪声**的对照
    （16×16 网格里全是 `#`，完全读不出玻璃改了什么）。
    正解有两条：
    · **同一次加载里只改那一个变量**（`--js=tools/t-*.js` 调 `__cfGlassTune`，
      或 `--pre=tools/undo-flip.js` 在编译前改 shader），
    · 或者退一步，**只裁同一块静态区域**（右列卡片），别拿整页去比。
    另外 `__cfGlassTune` 之后必须 `--after=` 等一帧，否则截到的是旧帧。
20. **沙箱里 `execSync` 起 `cmd.exe` 会 `EBUSY`**，所以不要在 Node 脚本里
    `execSync('node tools/png-px.js …')` 拼长参数；直接把参数写进命令行分两次跑，
    或者在脚本里自己解码 PNG。
21. **比对区域别越界**。我第一次把"卡外对照区"取成 `卡片右边+270px`，
    卡片右边 1341 + 270 = 1611 > 视口宽 1440 —— 取到的是越界数据。
    取对照区前先用 `getBoundingClientRect()` 确认还有多少可用空间。
22. **★★ 只上传 `public/*` 不重启 = 线上毫无变化。** 静态文件是 **Caddy** 从
    `/root/.hydro/static/` 直接 `file_server` 吐的（`root * /root/.hydro/static`，
    找不到才 `reverse_proxy :8888`），而 Hydro 只在**启动时**把 addon 的 `public/`
    拷进那个目录。v19 我为这个白跑了三轮：上传后 `stat` 那个目录里的文件，mtime 还是
    上一次重启的时间。**唯一正确顺序：上传 → `pm2 restart hydrooj` → 验证。**
23. **`?v=<VERSION>` 是有效的破缓存手段，但版本号本身必须是"从没被请求过的值"。**
    我曾在重启**之前**用 `curl "…?v=20261007z4"` 探过路，于是 CF（和任何那时打开过页面的
    浏览器）就把 `z4` 连同**旧内容**缓存 4 小时（`max-age=14400`）；之后再怎么改内容、重启，
    `?v=z4` 拿到的还是旧的。**换一个新值（z5 → z6）立刻就好。**
    配合这条的两个验证陷阱：
    · 别写 `curl -s <url>` 之后再 `curl -sI <url>` —— 第二次必然是 `HIT`
      （第一次已经把条目建好了），看着就像"缓存没破"，我据此得出过**完全错误**的结论。
    · 判定"查询串是不是缓存键"要做 A/B：两个**不同**的随机查询串应当各自 `MISS`。
24. **特异性：`.cf-crumb a` 是 (0,2,1)，比 `.cf-tab` (0,1,0) 和 `.cf-tab:hover` (0,2,0) 都高。**
    比赛 tab 整组是塞进 `#cf-crumb` 里的一个"段"，所以只要父级规则写成
    `.cf-crumb a { … }`，tab 的 `padding` / `border-radius: 999px` 就会被面包屑的
    `9px` / `8px` 覆盖掉，**胶囊变方角**。
    改成子选择器 `.cf-crumb > a` 即可（tab 的 `<a>` 在 `.cf-tabs` 里，不是直接子节点）。
    一般的判据：**给"容器内的所有 a"写规则之前，先想清楚容器里将来还会不会塞别的组件。**
25. **`<input>` 塞不进画布 —— 而且它不会报错。** `input.insertBefore(canvas, null)` 正常返回、
    `children.length` 变成 1，但那个 canvas 的 `rect` 是 **0×0**（空元素没有渲染内容的盒子）。
    所以"遍历给它插画布"这种写法在 `<input>` 上是**静默失效**，
    再叠一条 `background: transparent` 就变成"按钮凭空消失"。
    凡是 `.btn` / `.button` 这种类名，**先去确认它挂在 `<button>` 还是 `<input>` 上**。

---

## 七、调试工具（都在仓库根的 `tools/`）

| 工具 | 用途 |
|---|---|
| `cdp.js` | 零依赖 Chrome DevTools Protocol 客户端。`--css=` / `--js=` / `--eval=` 往**线上页面**注入候选样式和脚本并立刻截图，一轮几秒钟，不用走"部署 → 等 CF → 截图"。⚠ `--eval` 的脚本必须是**最外层语句 + return**，不能是 IIFE（见踩坑 13）。<br>**v18 新增三个开关**：<br>· `--pre=f.js` → `Page.addScriptToEvaluateOnNewDocument`，在**页面脚本执行之前**注入。这是唯一能在 `glass.js` 之前改 WebGL 行为的时机。<br>· `--hover=x,y` + `--hoverwait=ms` → `Input.dispatchMouseEvent`，**真触发 CSS `:hover`**（JS 改不了 `:hover`，而侧栏展开恰好是纯 `:hover` + transition 驱动的）。<br>· `--after=ms` → 注入之后再等一会儿才截图（等 `__cfGlassTune` 的重绘落地）。 |
| `undo-flip.js` | 配 `--pre` 用：把 shader 里那行 `vUv` 翻转**在 `shaderSource()` 里拦下来改回修复前**。这样"修前 / 修后"是**同一次加载、同一页面状态**，不会像分两次截图那样被首页轮播换页的噪声淹没。 |
| `find-shift.js` | 暴力搜位移 / 缩放，判断"重绘和背景对不对得齐"。⚠ **必须用高通模式**（默认就是）：壁纸是大面积平滑渐变，直接比时误差被渐变主导，最优点会落在 `(0,0,1.0)` 这个**假最优**上。 |
| `png-crop.js` | 零依赖 PNG 裁剪 + 最近邻放大（自己实现 decode/encode/crc32，只用 Node 自带 zlib）。 |
| `png-px.js` | 从截图里读像素值。把"肉眼觉得不对"变成数字。 |
| `png-side.js` | 把两张同尺寸截图在**同一区域**裁出来并排拼成一张（左 A 右 B）。做"开/关玻璃"、"两张壁纸"这种对照图用。 |
| `png-diff.js` | **两张同尺寸截图的指定区域逐像素相减**，输出平均差 / 最大差 / 超阈像素占比。判断"卡片材质到底偏离背景多少"就靠它。 |
| `probe-*.js` | `--eval` 探针：`v13`（终验：白底/投影/参数/hole/inner/sheen）/ `ro`（hover 展开时画布是否跟着尺寸走）/ `acrylic2`（页面背景自己的 `filter` 到底是多少 —— 定 `sat` 就靠它）/ `rects`（打印所有玻璃卡片的 `getBoundingClientRect`）/ `v2` / `chrome` / `live-bg` / `radius` / `buttons-live` / `canvas-cost` / `scan` / `hit` / `refdemo`+`refdemo-dom`。 |
| `t-*.js` / `scroll*.js` | 线上试参数的注入脚本（配 `cdp.js --js`）。v18 的四档候选：`t-P1/P2/P3.js`、`t-P2sym/t-P2dir.js`；`hide-card-text.css` 把卡内文字藏起来，方便**只对拍玻璃本身**。 |
| `tune2/*.js` | 早期那批：`neutral2`（纯壁纸态）/ `hidecv2`（藏画布对照）/ `trueglass`（真透明）/ `trueglass-veil`（透明+白纱）/ `live-frost` 等。 |

`cf-sidebar-nav/tools/make-v2test.py` 会从 `preview/plan3.html`（线上首页的本地快照）
生成带壁纸的 `preview/v2test.html`，配合
`python -m http.server 8765 --directory preview` 就能在本地改 glass.js 秒级看效果。
`make-walltest.py` 再生成一份 `v2test-struct.html`（**只换壁纸**，用来验证"折射看不看得见
取决于背景有没有硬边"）。`preview/board*.html` 是几张对比方案板，截图给用户看的。
