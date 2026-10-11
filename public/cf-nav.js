/* CatchFish OJ · 侧边栏运行时（方案三：液态玻璃侧栏 + 顶栏递进面包屑）
 *
 * 五件事：
 *   1. dropMenus()    删掉 Language 和 作业
 *   2. moveUserZone() 把原生 nav__list--secondary（登录/注册/用户名下拉）搬进侧栏底部
 *   3. renderCrumb()  按当前页面生成顶栏的递进面包屑（最多两层；
 *                     比赛页第二段是一组分段按钮，见 contestTabs()）
 *   4. markSU()       给 <html> 打 .cf-su —— 侧栏「控制面板」只对 SU 显示
 *   5. markActive()   给侧栏当前项加高亮
 *
 * ⚠ 上一版把「所有带 data-dropdown-target 的 li」都删了，结果把登录后的用户名/登出
 *   菜单一起删掉了 —— 登录态的用户菜单和 Language 用的 target id 是一样的（#menu-nav-user），
 *   没法靠属性区分，只能靠文案和 href。这里只删 Language。
 */
(function () {
  'use strict';

  var SITE = 'CatchFishOnlineJudge';

  /* 要从侧栏里删掉的菜单（按 pathname 匹配） */
  var DROP = ['/language', '/homework'];

  /* 用户区用得到的图标 */
  var ICONS = {
    '/login':    '<path d="M13.4 4h4.2a2.4 2.4 0 0 1 2.4 2.4v11.2A2.4 2.4 0 0 1 17.6 20h-4.2"/><path d="m9.6 8.2-3.8 3.8 3.8 3.8"/><path d="M5.8 12H14"/>',
    '/register': '<circle cx="9.6" cy="8" r="3.4"/><path d="M3.4 20.2c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2"/><path d="M17.6 7.4h4.4"/><path d="M19.8 5.2v4.4"/>',
  };
  var FALLBACK = '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/>'
               + '<rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/>'
               + '<rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/>'
               + '<rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>';
  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
               + 'stroke-linecap="round" stroke-linejoin="round">';

  /* 顶栏递进规则：最多两段。键是 <html data-page>，值是各段取什么。
     段可以是：'site' | 'contest' | 'problem' | 'title'（取值规则）
              | { t, href }（固定一段）
              | { tabs: 'contest' }（一组比赛分段按钮，见 contestTabs()） */
  var PAGE_CRUMB = {
    homepage:               ['site'],
    contest_main:           ['site', { t: '比赛列表', href: '/contest' }],
    /* ★ 比赛页顶栏（2026-10-07 用户要求）
       原来是「比赛列表 / <比赛名>」，用户要的是洛谷那种 tab：
         比赛列表 / [比赛详情] [题目列表] [比赛成绩]
       注意 <html data-page> 在这三个页面上分别是
         contest_detail / contest_problemlist / contest_scoreboard —— 用来点亮当前那个 tab。 */
    contest_detail:         [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
    contest_problemlist:    [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
    contest_scoreboard:     [{ t: '比赛列表', href: '/contest' }, { tabs: 'contest' }],
    /* 比赛内的题目详情：这里保留「比赛名 / 题名」的面包屑 —— 进了题目之后
       题名比 tab 有用，硬塞三段又会被 renderCrumb 的两层上限砍掉。 */
    contest_detail_problem: ['contest', 'problem'],
    contest_ranking:        ['contest', { t: '排名' }],
    problem_main:           ['site', { t: '题库', href: '/p' }],
    problem_detail:         [{ t: '题库', href: '/p' }, 'problem'],
    discussion_main:        ['site', { t: '讨论', href: '/discuss' }],
    discussion_detail:      [{ t: '讨论', href: '/discuss' }, 'title'],
    training_main:          ['site', { t: '训练', href: '/training' }],
    /* 训练详情页的 <title> 只有「训练详情 - CatchFish」，页面上也没有训练名的独立元素，
       拿不到就不硬凑第二段，只显示可点回列表的「训练」。 */
    training_detail:        [{ t: '训练', href: '/training' }],
    ranking:                ['site', { t: '排名', href: '/ranking' }],
    ticket_main:            ['site', { t: '工单', href: '/ticket' }],
    /* theme 插件（主题商店）的三个页面。
       不加这三条就会走 renderCrumb 的兜底 ['site','title']，而模板没给 <title>，
       顶栏会显示原始路由名「theme_store」—— 用户看到的就是这个。 */
    theme_store:            ['site', { t: '主题广场', href: '/theme/store/user' }],
    theme_store_admin:      ['site', { t: '主题管理' }],
    theme_setting:          ['site', { t: '主题设置' }],
  };

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function textOf(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  /* ---------- 路径归一化 ----------
     独立域（/d/lmtoj）下 href 可能是绝对 URL 或带 /d/<域> 前缀，必须还原成 /p 这种 */
  function pathOf(a) {
    var href = a.getAttribute('href') || '';
    var m = href.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/[^?#]*)?/i);
    var p = m ? (m[1] || '/') : href.split(/[?#]/)[0];
    p = p.replace(/^\/d\/[^/]+(?=\/|$)/, '');
    if (!p || p === '/d') return '/';
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  /* ---------- 1. 删掉 Language / 作业 ---------- */
  function dropMenus() {
    each(document.querySelectorAll('.nav__list--main > .nav__list-item, .nav__list--secondary > .nav__list-item'), function (li) {
      var a = li.querySelector('a');
      if (!a) return;
      if (/Language|语言|語言/i.test(textOf(li))) { li.remove(); return; }
      if (DROP.indexOf(pathOf(a)) >= 0) li.remove();
    });
  }

  /* ---------- 2. 给用户区补图标 + 包文字 ----------
     注意：这里只「装饰」原生 .nav__list--secondary，**不搬动它**。
     之前用 JS 把它 append 到侧栏容器里，结果 pjax 换页时整体替换 body，
     服务端注入的那个同名空容器把搬好的东西直接盖没了 —— 登录/注册/用户名全丢。
     现在位置完全交给 CSS（.nav__list--secondary { position: fixed }），pjax 免疫。 */
  function decorateUser() {
    each(document.querySelectorAll('.nav__list--secondary .nav__item, .nav__list--secondary .nav__item--round'), function (a) {
      if (a.dataset.cfDone) return;
      a.dataset.cfDone = '1';

      var txt = '';
      each(Array.prototype.slice.call(a.childNodes), function (n) {
        if (n.nodeType === 3) { txt += ' ' + n.textContent + ' '; a.removeChild(n); }
      });
      txt = txt.replace(/\s+/g, ' ').trim();
      if (txt) {
        var lb = document.createElement('span');
        lb.className = 'cf-lb';
        lb.textContent = txt;
        a.appendChild(lb);
        a.title = txt;
      }

      /* 自带 .icon 的（比如登录后的用户名 + 下拉箭头）就不再塞 SVG */
      if (a.querySelector('.icon, .cf-ic')) return;
      var ic = document.createElement('i');
      ic.className = 'cf-ic';
      ic.innerHTML = SVG_OPEN + (ICONS[pathOf(a)] || FALLBACK) + '</svg>';
      a.insertBefore(ic, a.firstChild);
    });
  }

  /* ---------- 3. 顶栏递进面包屑 ---------- */
  function contestName() {
    /* 比赛相关页面，nav__list--main 会被 Hydro 换成比赛上下文，
       其中 href 正好是 /contest/<id> 的那一项就是比赛名 */
    var items = document.querySelectorAll('.nav__list--main > .nav__list-item');
    for (var i = 0; i < items.length; i++) {
      var a = items[i].querySelector('a');
      if (a && /^\/contest\/[^/]+$/.test(pathOf(a))) return textOf(a);
    }
    return textOf(document.querySelector('.contest__title')) || '';
  }

  function problemName() {
    /* 用 <title> 而不是 .section__title —— 前端 JS 会往 .section__title 里插分数/进度条，
       text() 会把「100.00 小 C 的糖果分配」这种一起取出来。
       title 是服务端渲染的，格式固定为「题名 - 题目详情 - CatchFish」，干净。 */
    var t = docTitle();
    if (t) return t;
    var el = document.querySelector('.section__title');
    return el ? textOf(el).replace(/^#?[A-Za-z]{0,2}\d{0,5}[.．、]\s*/, '').trim() : '';
  }

  function docTitle() {
    var t = (document.title || '').replace(/\s*-\s*CatchFish\s*$/, '').trim();
    /* <title> 形如「小 C 的糖果分配 - 题目详情 - CatchFish」，
       去掉站点名之后还剩页面类型后缀（「题目详情」「训练详情」…），一并剥掉。 */
    var m = t.match(/^(.+?)\s+-\s+(题目详情|训练详情|比赛详情|题目列表|比赛成绩表|讨论区|讨论|用户|题库|比赛|训练|排名|工单|首页)$/);
    return (m ? m[1] : t).trim();
  }

  /* 当前路径（去掉独立域前缀 /d/<域>，去掉尾斜杠） */
  function curPath() {
    var p = location.pathname || '/';
    p = p.replace(/^\/d\/[^/]+(?=\/|$)/, '');
    if (!p) p = '/';
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p;
  }

  /* ---------- 3c. 侧栏链接一律挂在当前域下（域内导航） ----------
     用户（2026-10-07）：独立域里「管理域」不是 `oj.xzy404.top/domain/dashboard`，
     而是 `/d/xxx/domain/dashboard` —— 不带前缀会掉到**主域**的管理页去。

     实测子域前缀对整条侧栏都有效（这些全部 200）：
       /d/lmtoj/p  /contest  /training  /discuss  /ranking  /cfai  /games  /store  /ticket
     管理入口是 302（需登录，路由存在）：
       /d/lmtoj/domain/dashboard  /d/lmtoj/manage

     ⚠ 唯一的例外是首页：`/d/lmtoj` 是 **404**，必须写成 `/d/lmtoj/`（带尾斜杠）。
       这个斜杠不能省，所以单独判一下。

     主域下 pre === ''，所有 href 与以前逐字节一致，行为零变化。 */
  function domainPrefix() {
    var m = (location.pathname || '').match(/^\/d\/([^/]+)(?=\/|$)/);
    return m ? '/d/' + m[1] : '';
  }

  /* 把一个**规范路径**挂到当前域下（主域原样返回）。 */
  function linkTo(p) {
    var pre = domainPrefix();
    if (!pre) return p;
    return p === '/' ? pre + '/' : pre + p;
  }

  /* 元素的**规范路径**（永远不带 /d/<域> 前缀），缓存在 data-cf-path 上。
     href 会被 fixDomainLinks() 改写，不能拿 href 当基准 ——
     不过 pathOf() 自己也会剥前缀，所以缓存值恒为规范路径，重复跑是幂等的。 */
  function canonPath(a) {
    var c = a.getAttribute('data-cf-path');
    if (!c) { c = pathOf(a); a.setAttribute('data-cf-path', c); }
    return c;
  }

  function fixDomainLinks() {
    /* ⚠ 不能写成 `if (!pre) return;` —— pjax 从独立域跳回主域时，
       侧栏节点可能被原样保留，那时候 pre 变回 ''，但 href 里还挂着 /d/lmtoj/…
       于是整条侧栏都指向旧域。这里**无条件**把 href 归一化到 linkTo(canonPath)：
       主域下就是写回规范路径，幂等、可自愈。 */
    each(document.querySelectorAll('.cf-si'), function (a) {
      var want = linkTo(canonPath(a));
      if (a.getAttribute('href') !== want) a.setAttribute('href', want);
    });
  }

  function contestId() {
    var m = curPath().match(/^\/contest\/([^/]+)/);
    return m ? m[1] : '';
  }

  /* ---------- 3b. 比赛页的分段按钮 ----------
       比赛列表 /  [比赛详情] [题目列表] [比赛成绩]

     · 三个 href 全部从**当前路径里的比赛 id** 现推，不依赖 Hydro 的 url()——
       服务器端注入顶栏时还不知道比赛 id（那是 JS 才知道的事）。
     · 按钮的「选中」由 <html data-page> 决定，不靠 href 前缀匹配 ——
       /contest/<id> 是 /contest/<id>/problems 的前缀，前缀匹配会把三个全点亮。
     · /contest/<id>/problems 在未登录 / 未报名时返回 403，但它确实就是题目列表页
       （Hydro 的 contest_problemlist 路由），按钮该在还得在。 */
  function contestTabs() {
    var id = contestId();
    if (!id) return null;
    var base = linkTo('/contest/' + id);   /* 独立域下要挂在同一个域里，不然点一下掉回主域 */
    var page = document.documentElement.getAttribute('data-page') || '';
    var defs = [
      { t: '比赛详情', href: base,                 on: page === 'contest_detail' },
      { t: '题目列表', href: base + '/problems',   on: page === 'contest_problemlist' },
      { t: '比赛成绩', href: base + '/scoreboard', on: page === 'contest_scoreboard' },
    ];
    var box = document.createElement('span');
    box.className = 'cf-tabs';
    for (var i = 0; i < defs.length; i++) {
      var a = document.createElement('a');
      a.className = 'cf-tab' + (defs[i].on ? ' cf-tab--on' : '');
      a.href = defs[i].href;
      a.textContent = defs[i].t;
      box.appendChild(a);
    }
    return box;
  }

  function renderCrumb() {
    var host = document.getElementById('cf-crumb');
    if (!host) return;
    var page = document.documentElement.getAttribute('data-page') || '';
    var def = PAGE_CRUMB[page] || ['site', 'title'];

    var segs = [];
    for (var i = 0; i < def.length && segs.length < 2; i++) {   /* 硬上限两层 */
      var k = def[i];
      /* site 段做成链接：CatchFishOnlineJudge 可点回首页 */
      if (k === 'site') segs.push({ t: SITE, href: '/' });
      else if (k === 'contest') segs.push({ t: contestName() || '比赛' });
      else if (k === 'problem') segs.push({ t: problemName() || docTitle() });
      else if (k === 'title') { if (docTitle()) segs.push({ t: docTitle() }); }
      else if (k && k.tabs) { var tb = contestTabs(); if (tb) segs.push({ node: tb }); }
      else if (k && k.t) segs.push(k);
    }

    host.textContent = '';
    for (var j = 0; j < segs.length; j++) {
      if (j) {
        var sep = document.createElement('span');
        sep.className = 'cf-crumb__sep';
        sep.textContent = '/';
        host.appendChild(sep);
      }
      /* 分段按钮组：整组作为一个「段」挂进去，组内每个按钮自带样式 */
      if (segs[j].node) { host.appendChild(segs[j].node); continue; }

      var last = j === segs.length - 1;
      var n = document.createElement(last || !segs[j].href ? 'span' : 'a');
      /* 面包屑里的链接同样挂在当前域下（独立域里点「题库」不该回主域） */
      if (n.tagName === 'A') n.href = linkTo(segs[j].href);
      if (last) n.className = 'cf-crumb__cur';
      n.textContent = segs[j].t;
      host.appendChild(n);
    }
  }

  /* ---------- 5. 清理「寄生」在页面内容里的侧栏副本 ----------
     有些插件（/cfai 的 app.js、首页的犇犇）会用
        new DOMParser().parseFromString(html) → 取 doc.body.innerHTML → 塞进某个容器
     的方式渲染片段。它们只摘掉 script/iframe/style/link/form，
     我们注入的 <aside class="cf-side"> 不在名单里 → 会被复制进内容区，
     于是页面里出现两个侧栏。
     没法去改别人的解析逻辑，只能在客户端兜底：
     只信任 body 的直接子节点里的那一个侧栏，其余（寄生在内容区里的）一律删掉。 */
  var INJECTED = '.cf-side, .cf-bar';   /* 我注入的所有顶层元素 */
  function hasDup() {
    return document.querySelectorAll('.cf-side').length > 1
        || document.querySelectorAll('.cf-bar').length > 1;
  }
  function dedupeSides() {
    ['.cf-side', '.cf-bar'].forEach(function (sel) {
      var list = document.querySelectorAll(sel);
      if (list.length < 2) return;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.parentNode === document.body) { el.setAttribute('data-cf-main', '1'); continue; }
        el.style.display = 'none';                    /* 先藏，避免闪一下 */
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });
  }
  /* ⚠ 必须用 canonPath()（规范路径）而不是 href ——
     fixDomainLinks() 会给「管理域 / 控制面板」的 href 加上 /d/<域> 前缀，
     而 curPath() 是**剥掉**前缀的，两边一比永远不等 → 这两项永远不亮。 */
  function markActive() {
    var path = curPath();
    each(document.querySelectorAll('.cf-si'), function (a) {
      var p = canonPath(a);
      a.classList.toggle('cf-si--on', p === '/' ? path === '/' : path.indexOf(p) === 0);
    });
  }

  /* ---------- 4b. SU 判定 ----------
     侧栏底部的「控制面板」只该对 SU 出现（2026-10-07 用户要求）。
     服务端注入侧栏时拿不到用户身份（那个 server layer 只包响应体，不经过 handler），
     所以标记打在 DOM 上，由这里判定后给 <html> 加 .cf-su：

       · 主判据：Hydro 自己的用户下拉里，「切换账号」这一项是用
         `handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)` 包着渲染的
         （templates/partials/nav.html）—— 服务端给的现成标记，最可靠。
         `.nav` 虽然被 CSS 藏了（display:none），但节点还在 DOM 里，照样能查。
       · 兜底：window.UserContext.priv 的第 0 位就是 PRIV_EDIT_SYSTEM
         （@hydrooj/common/permission.ts: PRIV_EDIT_SYSTEM: 1 << 0）。
         游客的 priv 是 8，& 1 === 0，判为非 SU。 */
  function isSU() {
    if (document.querySelector('[name="nav_switch_account"]')) return true;
    var U = window.UserContext;
    return !!(U && typeof U.priv === 'number' && (U.priv & 1) === 1);
  }
  function markSU() {
    document.documentElement.classList.toggle('cf-su', isSU());
  }

  /* ---------- 4c. 域管理员判定（侧栏「管理域」） ----------
     ★★ 2026-10-11 用户要求：**未登录 / 普通用户下不应出现「管理域」。**
        那一项指向 /domain/dashboard（DomainDashboardHandler extends ManageHandler），
        没权限的人点进去只会被拦，摆在侧栏上纯属误导。

     判据用**域内** `PERM_EDIT_DOMAIN`，不是全站的 PRIV ——
     「管理域」管的是"当前这个域"，每个域的角色权限是分开的。

     · PERM_EDIT_DOMAIN = `1n << 1n`（@hydrooj/common/permission.ts:6）→ 第 1 位。
     · 前端能拿到的是 `window.UserContext.perm`，它是 BigInt 的序列化串：
         "BigInt::37483536673142767745"
       实测游客（priv=8）这个串的最后两位是 ...01 → bit0(PERM_VIEW)=1、bit1=0 ✓
     · 负值（-1）表示 PERM_ALL，直接放行。

     ⚠ 千万别用 parseInt / Number 去比 —— 权限位图有 70+ 位，
       远超 Number.MAX_SAFE_INTEGER（2^53），parseInt 会静默丢精度给出错误答案。
       必须走 BigInt。 */
  function permBigInt() {
    var U = window.UserContext;
    if (!U) return null;
    var p = U.perm;
    if (typeof p === 'bigint') return p;
    var s = p == null ? '' : String(p);
    if (s.indexOf('BigInt::') === 0) s = s.slice(8);   /* 'BigInt::'.length */
    if (!/^-?\d+$/.test(s)) return null;
    try { return BigInt(s); } catch (e) { return null; }
  }
  function isDomainAdmin() {
    var U = window.UserContext;
    /* 兜底：全站超级管理员一定能进管理域（PRIV_EDIT_SYSTEM = 1 << 0，
       和 isSU() 同一个判据）。放在前面 —— 万一某个页面/某个域的
       UserContext.perm 没带上域权限位，也不该让 SU 反而看不到这一项。 */
    if (U && typeof U.priv === 'number' && (U.priv & 1) === 1) return true;
    if (typeof BigInt !== 'function') return false;    /* 远古浏览器：宁可不显示 */
    var v = permBigInt();
    if (v === null) return false;
    if (v < 0n) return true;                           /* -1 = PERM_ALL */
    return (v & 2n) === 2n;                            /* PERM_EDIT_DOMAIN = 1n << 1n */
  }
  function markDomainAdmin() {
    document.documentElement.classList.toggle('cf-da', isDomainAdmin());
  }

  /* ---------- 0. 移动端：整套改造完全不参与 ----------
     ★★ 2026-10-11 用户报「手机上一块玻璃下面跟着一块内容、侧栏跑到最下面」。

     根因：plan3.css 的**全部**规则都写在 `@media (min-width: 601px)` 里。
     窄屏下 CSS 一条都不生效，但服务端注入的 <aside class="cf-side"> 是实打实的
     DOM —— 于是 `.cf-side{position:fixed}` 失效，它退化成文档流里一个
     4000+ px 高的普通块，出现在正文**之后**（实测 y=4591、高 4897），
     把整页挤成"侧栏在最下面"。同时 glass.js 给卡片挂的 canvas 因为
     `.cf-glass > canvas{position:absolute}` 也失效，变成 inline-block 夹在内容前面，
     就是用户看到的"一块玻璃 + 一块内容"。

     Hydro 自己的移动端布局（汉堡抽屉 + 单栏卡片）本来就是对的，
     所以窄屏下我们**什么都不做**：DOM 改造、href 归一化、面包屑全部跳过。
     `.cf-side` / `.cf-bar` 的隐藏交给 plan3.css 的 max-width 分支
     （服务端注入的 DOM 还在，只有 CSS 能收掉它）。 */
  function isMobile() {
    return window.matchMedia('(max-width: 600px)').matches;
  }

  function run() {
    if (isMobile()) return;
    dedupeSides();
    dropMenus();
    decorateUser();
    markSU();
    markDomainAdmin();
    fixDomainLinks();     /* 先改 href，再判高亮（markActive 读的是 data-cf-path，顺序其实无所谓） */
    markActive();
    renderCrumb();
    watchUserZone();
  }

  /* 跨断点：窄 → 宽 时必须补跑一次改造（否则拉宽后侧栏是空的）；
     宽 → 窄 不需要收尾 —— CSS 直接把 .cf-side / .cf-bar 藏掉，
     DOM 改造留着不影响（原生移动布局不看侧栏）。 */
  (function watchBreakpoint() {
    var last = isMobile();
    window.addEventListener('resize', function () {
      var now = isMobile();
      if (now === last) return;
      last = now;
      if (!now) setTimeout(function () { boot(0); }, 0);
    });
  })();

  /* 侧栏是服务端注入的，可能比这个脚本晚一拍（pjax、缓存命中、注入顺序变化）。
     等它出现再跑，跑不了就重试。 */
  function boot(attempt) {
    if (!document.getElementById('cf-side')) {
      if ((attempt || 0) < 40) setTimeout(function () { boot((attempt || 0) + 1); }, 50);
      return;
    }
    run();
  }

  /* pjax 换页后，新的 .nav__list--secondary 是全新节点（没有 data-cf-done），要重新装饰。
   ⚠ 观察范围必须窄到只有用户区自己。
     之前观察 .slideout-panel / documentElement，CF AI 这类页面会频繁重绘消息列表，
     每次都触发回调 → 又改 DOM → 可能和它自己的监听互相触发，页面直接卡死炸掉。 */
  var pending = 0;
  function schedule() {
    if (pending) return;
    pending = setTimeout(function () { pending = 0; boot(0); }, 200);
  }

  function watchUserZone() {
    var sec = document.querySelector('.nav__list--secondary');
    if (!sec || !window.MutationObserver || sec.dataset.cfWatched === '1') return;
    sec.dataset.cfWatched = '1';
    new MutationObserver(schedule).observe(sec, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); });
  else boot(0);

  document.addEventListener('pjax-end', function () { setTimeout(boot, 0); });
  if (window.MutationObserver) {
    /* 只做「数量 > 1 才动手」的轻量检查。回调里不碰用户区、不改 DOM 结构，
       所以不会像 v5 那样和页面自己的渲染逻辑互相触发。 */
    var pending2 = 0;
    var mo = new MutationObserver(function () {
      if (pending2) return;
      pending2 = setTimeout(function () {
        pending2 = 0;
        if (hasDup()) run();
      }, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  /* 兜底：observer 在个别环境下不触发（插件可能整体替换 body）。
     1.5 秒一次的 querySelectorAll 开销可以忽略，只在数量 > 1 时才动手。 */
  setInterval(function () {
    if (hasDup()) dedupeSides();
  }, 1500);
})();
