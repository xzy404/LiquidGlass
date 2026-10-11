/**
 * CatchFish OJ —— 侧边栏（液态玻璃）+ 顶栏递进面包屑
 *
 * 目标版本：Hydro v5.0.4 / @hydrooj/ui-default 4.58.4
 *
 * 做法：不覆盖 Hydro 任何模板，只在 </body> 前注入一段自己的 DOM。
 *  · 侧栏主导航在这里固化输出 —— 因为 Hydro 在比赛页会把 nav__list--main
 *    整个换成「返回比赛列表 / 比赛名 / 题目列表 / 比赛成绩表」的比赛上下文，
 *    纯 CSS 挪位置的话，比赛页的侧栏就变成比赛上下文了，主导航会消失。
 *  · 用户区（登录 / 注册 / 用户名下拉）由 /cf-nav.js 从原生 nav__list--secondary 搬过来，
 *    这样登录态、头像、登出这些都不用自己重写。
 *  · 原生 .nav 整块隐藏（它里面的比赛上下文导航我们不要了），另起一个顶栏放面包屑。
 */

import { Schema } from 'hydrooj';

export const Config = Schema.object({
  plan: Schema.number().default(3)
    .description('0=保留原样 1=方案一(旧) 2=方案二(旧) 3=方案三：液态玻璃侧栏 + 顶栏递进'),
});

/** 侧栏主导航：固化输出，任何页面都一致。图标是 24×24 stroke 内联 SVG。 */
const ICON = (d: string) => '<path d="' + d + '"/>';
const NAV: [string, string, string][] = [
  ['/', '首页', 'M3.5 10.6 12 3.5l8.5 7.1|M6 9.4V20h12V9.4|M10 20v-5h4v5'],
  ['/p', '题库', 'M4 3.2h16v17.6H4z|M9 3.2v17.6|m12.4 10.6 2.6 2.6-2.6 2.6'],
  ['/training', '训练', 'm12 3.2 8.8 4.8-8.8 4.8L3.2 8z|m3.2 13 8.8 4.8 8.8-4.8|M3.2 8v5|m20.8 8v5'],
  ['/contest', '比赛', 'M8 4.2h8v3.6a4 4 0 0 1-8 0z|M8 5.4H5.2v1.9A3 3 0 0 0 8 10.4|M16 5.4h2.8v1.9A3 3 0 0 1 16 10.4|M12 11.8v4.4|M8.6 20.6h6.8|M9.6 16.2h4.8l1 4.4H8.6z'],
  ['/discuss', '讨论', 'M4.4 4.6h15.2v11.8H9.6L4.4 20.2z|M8.4 9h7.2|M8.4 12.4h4.6'],
  ['/ranking', '排名', 'M4.4 20.4V11|M9.8 20.4V4.6|M15.2 20.4v-6.2|M20.6 20.4V8|M2.6 20.4h18.8'],
  ['/ticket', '工单', 'M6.4 3.2h11.2v17.6l-2.8-1.7-2.8 1.7-2.8-1.7-2.8 1.7z|M9.4 8h5.2|M9.4 12h5.2'],
  ['/games', '游戏', 'M2.6 7h18.8v10.4H2.6z|M7.2 10.6v3|M5.7 12.1h3|M15.6 11.4h.02|M17.8 13.6h.02'],
  ['/store', '商城', 'M5.4 8h13.2l-1 11.4a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z|M9 8V6.4a3 3 0 0 1 6 0V8'],
  ['/cfai', 'CF AI', 'm11 3.2 1.7 4.4 4.4 1.7-4.4 1.7L11 15.4 9.3 11 4.9 9.3 9.3 7.6z|m18 15.4.85 2.05L21 18.3l-2.15.85L18 21.2l-.85-2.05L15 18.3l2.15-.85z'],
];

/** 侧栏底部：管理域 / 控制面板（两项都**默认隐藏**，靠 JS 判定后按需显示）。
 *
 *  · 管理域 → `/domain/dashboard`
 *      Hydro 的 `domain_dashboard` 路由（src/handler/domain.ts:481：
 *      `ctx.Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler)`）。
 *      ⚠ 2026-10-07 用户要求改成这个。之前写的是 `/home/domain`（= home_domain，
 *        「我的域」列表页），两者都在，但用户要的是域管理面板。
 *
 *      ★★ 2026-10-11 用户要求：**未登录 / 普通用户下不应出现这一项。**
 *         `DomainDashboardHandler extends ManageHandler`，没权限的人点进去只会被拦，
 *         摆在侧栏上纯属误导（游客点了直接被弹去登录页）。
 *         服务端这里拿不到用户身份（server layer 只包响应体，不经过 handler），
 *         所以和「控制面板」同一套办法：只打类名 `cf-si--da`，
 *         由 /cf-nav.js 的 isDomainAdmin() 判定后给 <html> 加 `.cf-da`。
 *         判据是 **域内 `PERM_EDIT_DOMAIN`**（不是全站 PRIV）——
 *         因为「管理域」管的是"当前这个域"，每个域的角色权限不一样。
 *
 *  · 控制面板 → `/manage`，**只有 SU 才显示**（`cf-si--su` + `html.cf-su`）。
 *
 *  两项都默认 `display:none`（见 plan3.css），命中条件才 `display:flex` ——
 *  非目标用户**从头到尾看不到**，不会"先闪一下再被收走"。 */
const ADMIN: [string, string, string, string?][] = [
  ['/domain/dashboard', '管理域',
    'M12 3.5c2.6 2.4 4.2 5.4 4.2 8.5s-1.6 6.1-4.2 8.5c-2.6-2.4-4.2-5.4-4.2-8.5s1.6-6.1 4.2-8.5Z'
    + '|M3.4 12h17.2|M12 3.5a8.6 8.6 0 0 1 0 17',
    'cf-si--da'],
  ['/manage', '控制面板',
    'M4 7h9|M17.6 7h2.4|M15 7a2 2 0 1 0 0-4|M4 17h3.4|M12.6 17h7.4|M9.4 17a2 2 0 1 0 0-4',
    'cf-si--su'],
];

const BRAND = 'CatchFishOJ';

function sidebarHtml() {
  const render = (list: [string, string, string, string?][]) => list.map(([href, label, d, extra]) => {
    const paths = d.split('|').map(ICON).join('');
    return `<a class="cf-si${extra ? ` ${extra}` : ''}" href="${href}">`
      + `<i class="cf-si__ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" `
      + `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></i>`
      + `<span class="cf-si__tx">${label}</span></a>`;
  }).join('');

  return `<aside class="cf-side" id="cf-side">`
    + `<a class="cf-side__brand" href="/">`
    + `<img class="cf-side__logo" src="/favicon.ico" alt="${BRAND}">`
    + `<span class="cf-side__name">${BRAND}</span></a>`
    + `<nav class="cf-side__nav">${render(NAV)}</nav>`
    + `<nav class="cf-side__admin">${render(ADMIN)}</nav>`
    + `</aside>`
    + `<header class="cf-bar"><nav class="cf-crumb" id="cf-crumb"></nav></header>`;
}

const STYLESHEET: Record<number, string> = { 1: '/plan1.css', 2: '/plan2.css', 3: '/plan3.css' };
const NEEDS_SCRIPT = new Set([2, 3]);

/** 改样式时必须同步改这个，否则浏览器/Cloudflare 会继续用 4 小时前的旧文件。
 *
 *  ★★ 2026-10-07 把链路彻底查清了，之前一直误判「CF 按路径缓存、忽略查询串」★★
 *
 *  1. `oj.xzy404.top` 的静态文件**根本不经过 Hydro**：
 *       /root/.hydro/Caddyfile
 *         root * /root/.hydro/static
 *         @static { file { try_files {path} } }
 *         handle @static { file_server }
 *         handle { reverse_proxy http://127.0.0.1:8888 }
 *     Caddy 只要在 /root/.hydro/static/ 下找得到同名文件就自己吐（响应头是 `Server: Caddy`
 *     + `Accept-Ranges: bytes`），找不到才转给 Hydro。
 *
 *  2. Hydro 把插件的 public/ 拷进 /root/.hydro/static/ **只在启动时发生**。
 *     ⇒ **只上传 public/* 不重启 = 线上一点变化都没有**（实测：上传后
 *       /root/.hydro/static/cf-nav.js 的 mtime 还是上一次重启的时间）。
 *     ⇒ 部署唯一正确顺序：上传 public/* 与 index.ts → `pm2 restart hydrooj` → 验证。
 *
 *  3. 查询串**是**缓存键的一部分（A/B 实测：两个随机查询串各自 MISS，
 *     同一串第二次 HIT 且带 Age）。所以 `?v=<VERSION>` 这套破缓存是有效的 ——
 *     唯一的前提是**这个 VERSION 值从没被请求过**。
 *     ⚠ 反过来：如果某个 ?v=xxx 是在重启**之前**请求过的，它已经在 CF 和浏览器里
 *       存了 4 小时（max-age=14400）的旧内容，改内容再重启也救不回来 ——
 *       必须换一个新的 VERSION 值。
 *     ⚠ 验证时别用 `curl -s <url>` 之后再 `curl -sI <url>`：第二次一定是 HIT
 *       （第一次已经把条目建好了），看起来就像"缓存没破"。
 *
 *  z / z2（2026-10-07）：用户说"只有边框有液态玻璃的感觉，中间部分就跟没有东西一样"。
 *    根因是上一版把玻璃内部挖空（hole=1）—— 等于在壁纸上开了个洞。
 *    改法：hole 全部改回 0（整块画出来），同时
 *      · sat 由写死的 1.5 改成字符串 'page'，启动时实测页面背景的 saturate() 值
 *        （本站 1.1）→ 内部重绘与周围页面逐像素一致，不再是一块异色矩形；
 *      · 新增 uInner/uInnerW/uSheen：形状驱动的内壁倒角 + 表面光泽，
 *        让"里面"有玻璃的体量感，而不是平铺一层色。
 *  z3（2026-10-07）：定型成 `sat 'page' / surface .07 / inner .70 / sheen .80`。
 *
 *  z4（2026-10-07）用户提了五条，全部落在这一版：
 *    1. 比赛页顶栏缺「题目列表」→ cf-nav.js 给比赛页输出 tab 组
 *       「比赛列表 / [比赛详情][题目列表][比赛成绩]」；
 *    2. 讨论区「回复」等按钮没有轮廓 → 根因是 `<input>` 装不了玻璃画布
 *       （见 glass.js collect() 里的 VOID 跳过 + plan3.css 的按钮基础描边）；
 *    3. 管理域 → /domain/dashboard；
 *    4. 控制面板只对 SU 显示（cf-si--su + html.cf-su）；
 *    5. 顶栏、侧栏补鼠标移入的选中效果（plan3.css .cf-si:hover / .cf-crumb a:hover / .cf-tab:hover）。
 *
 *  z7（2026-10-07）用户又提了两条：
 *    1. 「管理域」要**加当前域前缀**而不是硬编码跳 /domain/dashboard ——
 *       独立域下编辑域是 /d/xxx/domain/dashboard，不带前缀会掉到主域去。
 *       → cf-nav.js 新增 domainPrefix()/linkTo()/canonPath()/fixDomainLinks()，
 *         整条侧栏 + 顶栏面包屑 + 比赛 tab 全部改成"域内导航"；
 *         markActive() 改用 canonPath()（否则加前缀后「管理域/控制面板」永远不亮）。
 *         ⚠ 首页是特例：`/d/<域>` 是 404，必须写成 `/d/<域>/`（带尾斜杠）。
 *    2. 侧栏的选中效果改成和顶栏一样的**白色方框**（plan3.css .cf-si:hover /
 *       .cf-si--on：rgba(255,255,255,.68~.72) + 0 1px 3px rgba(15,23,42,.12)），
 *       去掉原来的深色底和左侧 3px 蓝色指示条。
 *  z8（2026-10-07）：z7 上线后又补一个自埋伏：fixDomainLinks() 原来带
 *       `if (!pre) return`，pjax 从独立域跳回主域时侧栏节点被保留 → href 卡在
 *       /d/xxx/… 里回不来。改成无条件归一化（幂等、可自愈）。
 *       ⚠ 因为 z7 这个版本号已经被请求过、连旧内容进了 CF 缓存，
 *         所以这里必须换一个**没用过的值**，不能原地改 z7。
 *
 *  20261011a（2026-10-11）：配合新的 theme 插件（/theme/store/user、/theme/store/admin、
 *      /theme/setting[/:tid]）—— 用户在"主题设置"里可以关掉三类液态玻璃中的任意一类，
 *      真正生效的地方是 glass.js：
 *        · 新增 KIND_FLAG / kindOn()，读主题插件注入的 `window.CfTheme`
 *          （glassSide→side、glassBar→bar、glassLocal→card+btn）；
 *        · collect() 里先过滤掉被关掉的类，refreshList() 原有的 sweep() 会把
 *          已经挂上的画布和 `.cf-glass` 类一并清掉，元素退回自己的 CSS 底色；
 *        · 没有 window.CfTheme 时全部视为开 —— 不装 theme 插件表现完全不变；
 *        · 新增调试出口 `window.__cfGlassTheme`（.kinds() 看映射结果）。
 *      ⚠ 改了 public/ 下的文件 → VERSION 必须换新值，且不能是之前请求过的（CF 缓存 4 小时）。
 */
const VERSION = '20261011d';

export async function apply(ctx: any, config: any) {
  const plan = Number(config?.plan ?? 3);
  if (!STYLESHEET[plan] && !NEEDS_SCRIPT.has(plan)) return;

  ctx.inject(['server'], ({ server }: any) => {
    server.addServerLayer('cf-sidebar-nav', async (c: any, next: any) => {
      await next();
      if (typeof c.body !== 'string') return;
      const type = `${c.response?.type || ''}`;
      if (type && !type.includes('html')) return;

      let tag = '';
      if (STYLESHEET[plan]) tag += `<link rel="stylesheet" href="${STYLESHEET[plan]}?v=${VERSION}">`;
      /* 侧栏 DOM 必须在脚本之前 —— 否则脚本同步执行时 getElementById 拿到 null，
         而 DOMContentLoaded 也已经不会再触发，整段逻辑静默失效。 */
      if (plan === 3) tag += sidebarHtml();
      if (NEEDS_SCRIPT.has(plan)) tag += `<script src="/cf-nav.js?v=${VERSION}"></script>`;
      /* ---- 液态玻璃渲染器（全站）----
         移植 https://github.com/martin65536/liquid-glass-webgl 的折射数学
         （circleMap + gradSdRoundedRect + colorControls），拿站点壁纸
         （body::before 上那张，acrylic 插件挂的）当纹理，对侧栏 / 顶栏 / 卡片 / 按钮做
         「贴边陡降的位移场 + 向内放大 + vibrancy」。
         ⚠ 卡片/按钮不能照搬参考的 surfaceColor [0,0,0,0]：参考 demo 底下是深色
         大色块壁纸 + 高对比正文，全透也清楚；本站是浅色系统 + 深色正文，
         全透会把壁纸颜色透上来把文字糊掉（"刺眼、发花"），所以留了一层白纱。
         只在元素进入视口时才建画布（懒加载），不额外引入任何第三方库。
         之前的 html2canvas 方案已经删掉：它会漏掉伪元素（壁纸就在伪元素上），
         而且 shader 强制 alpha=1 让透明区变黑 —— 线上侧栏发黑就是它。 */
      if (plan === 3) tag += `<script src="/glass.js?v=${VERSION}"></script>`;
      if (!tag) return;

      const i = c.body.lastIndexOf('</body>');
      c.body = i >= 0 ? c.body.slice(0, i) + tag + c.body.slice(i) : c.body + tag;
    });
  });
}
