/* CatchFish OJ · 液态玻璃渲染器 v2（WebGL）
 *
 * ============================ 这一版到底改了什么 ============================
 *
 * 上一版是我自己"看着像"攒出来的（边缘弯折 band=42 + 白纱 tint=.33 + 内部糊到 22px），
 * 用户的原话是「这不就是直接加了一层高光吗，没有一点液态的感觉，然后还很刺眼」。
 * 对的 —— 因为它跟真玻璃的光学没半点关系。
 *
 * 这一版把 https://github.com/martin65536/liquid-glass-webgl （Kyant / AndroidLiquidGlass
 * 的 Web 移植）里真正在跑的那段 shader 搬了过来，逐行对齐：
 *
 *   shaders/element.ts        → 折射主循环
 *   shaders/element-utils.ts  → circleMap / applyColorControls
 *   shaders/sdf.ts            → sdRoundedRect / gradSdRoundedRect
 *   renderer/methods-wallpaper.ts、catalog/constants.ts、build-scroll-container.ts
 *                             → 参数表
 *
 * 从源码里读出来的「懒加载容器」卡片参数（build-scroll-container.ts）：
 *
 *     cornerRadius: 32        ← 大圆角
 *     refractionHeight: 16    ← 折射带只有 16px
 *     refractionAmount: -32   ← 位移 32px，**负号 = 向内取样**
 *     blurRadius: 0           ← 完全没有模糊
 *     surfaceColor: [0,0,0,0] ← 完全没有白底
 *     saturation: 1.5         ← 唯一的"染色"：把背景的彩度拉高 1.5 倍
 *
 * 我上一版这几项分别是 42 / 18 / 白纱 .33 / 内部糊 22px —— 每一项都是反的。
 *
 * ============================ 玻璃为什么"液态" ============================
 *
 * 全部来自这一行（element.ts:421-451）：
 *
 *     float d = circleMap(1.0 - (-sd) / uRefractionHeight) * uRefractionAmount;
 *     vec2  g = gradSdRoundedRect(...);        // SDF 的外法线
 *     vec2  p = screenCoord + d * g;           // 取样点
 *
 * 其中 circleMap(x) = 1 - sqrt(1 - x*x)：它在 x=1 处陡、在 x=0 处平。
 * 代进 sd（内部为负，-sd = 离边的深度）后得到的是：
 *
 *     贴边(depth=0)   → circleMap(1)   = 1    → 位移拉满 32px
 *     带中(depth=h/2) → circleMap(0.5) = 0.134 → 才 4px
 *     带内沿(=h)      → circleMap(0)   = 0    → 不动
 *
 * 也就是说：**外面十几个像素几乎不动，所有形变全部挤在最贴边的一圈里**。
 * 这就是"厚玻璃边"的全部秘密 —— 一个又窄又陡的位移场。
 * 我上一版用 (1-t)² 铺满 42px，等距、平缓，摊成一大片渐变，所以只剩"糊"。
 *
 * 另外三条同样重要：
 *   ① 位移方向是**向内**（refractionAmount 是负数）——  边缘一圈映射的是"再往里一点"的
 *      内容，等效于贴边放了一个放大镜。所以我上一版以为"要把外面的东西拉进来"也是错的。
 *   ② refractionHeight 一旦被限住，位移量恒等于 -2×band（参考里 16/-32、12/-24 都是 2 倍），
 *      这个比例不能破，破了就变成"糊边"。
 *   ③ 没有任何高光、没有边框、没有白纱。玻璃的边之所以看得见，纯粹是因为背景被掰弯了。
 *
 * ============================ 背景从哪来 ============================
 *
 * 参考项目每帧把整个场景渲进 FBO，玻璃再去采样它后面的场景（还带 scrim / 场景模糊）。
 * 我们做不到 —— 那需要离屏重绘整个 DOM（上一版试过 html2canvas，伪元素渲染不出来，
 * 直接失败）。但本站有个先天优势：
 *
 *     body::before { background-image: var(--acrylic-wallpaper);
 *                    background-size: cover; position: fixed; inset: 0; z-index: -1 }
 *
 * 壁纸是**一张钉在视口上的图**，而且那个 CDN 带 Access-Control-Allow-Origin: *。
 * 于是直接把这张图按 cover 规则画成"视口大小的纹理"，就得到了与页面逐像素一致的背景，
 * 一次加载永不失效，也不用 198KB 的库。
 *
 * 代价：玻璃只折射壁纸，折射不到"壁纸之上的 DOM"（比如卡片上的按钮）。
 * 本站所有玻璃元素背后都只有壁纸（侧栏/顶栏位置由 margin/padding 让开了内容），
 * 所以这个近似在这里恰好成立。这一点写进 README 了。
 *
 * ⚠ 本站壁纸是接近纯白的低对比线稿图。真玻璃在纯白背景上本来就"没东西可掰"，
 *   所以这里的观感天然比彩色照片背景的 demo 含蓄 —— 详见 README「为什么你的看起来不一样」。
 *
 * ============================ 交付 / 性能 ============================
 * · 一个共享 WebGL 上下文（浏览器上限 ~16 个），逐元素渲染 → drawImage 到元素自己的 canvas。
 * · 只渲染「元素 ∩ 视口」那一段（长卡片不做整块）。
 * · 窗口在屏幕上的矩形没变就不重绘（壁纸 fixed ⇒ 屏幕同一矩形内容恒定）。
 * · alpha:true + SDF 做边缘裁剪与 AA（和参考一致），不用 CSS border-radius 去削画布。
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 参数表 —— 直接对应参考项目的字段名
   *   refMin/refMax  折射带宽度的下限/上限(px)，实际取 clamp(短边*0.055, refMin, refMax)
   *                  ★ 参考项目里卡片是 refractionHeight=16 配 160px 高的卡片，
   *                    等于短边的 10%。照搬到我们 588px 高的内容卡上只有 2.7%，
   *                    实测 1× 下几乎看不见 —— 所以这里改成按短边自适应。
   *   amt            |refractionAmount| / refractionHeight，参考恒为 2
   *   sat            vibrancy：colorControls 的 saturation。
   *                  ★ 卡片这类**内部要画满**的元素必须填字符串 'page' ——
   *                    它会在启动时实测页面背景自己的 filter 值（本站是 saturate(1.1)）并用同值，
   *                    这样内部重绘才和周围页面**逐像素一致**。见 measurePageSat()。
   *                    写死数字（曾写死 1.5）会让内部比周围更艳 → 一块异色矩形。
   *   bright         colorControls 的 brightness（参考默认 0；负值压暗 → 更不刺眼）
   *   contrast       colorControls 的 contrast（参考默认 1）
   *   surface        极淡的白纱 0..1。参考里卡片/按钮都是 0（全透），我们这里给 .05~.07 ——
   *                  因为"内部重绘与页面逐像素一致"之后必须再**主动抬起一点**，
   *                  否则中间和背景完全一样，看着就是个洞（用户原话：
   *                  "中间部分就跟没有东西一样，而不是玻璃感"）。
   *                  这个值上调到 .15 以上就会开始发乳白，别过。
   *   frost          0 = 用原图，1 = 用 20px 重糊版（侧栏/顶栏要挡住背后内容时用）
   *   radius         'css' 取元素实际计算出的圆角（保证 SDF 与 CSS 形状完全一致）
   *   ca             色散开关（参考默认关：按钮/滚动容器都不开）
   *   rimHi          45° 细边缘高光。参考 HighlightStyle.Default = White(alpha .5)，
   *                  所以这里填的是**那个 0.5**。0 = 关。
   *                  ★ 它是一条 0.5dp 的**细线**，亮度 ∝ |dot(法线, 45°)|，
   *                    最亮在四角 —— 不是沿整圈均匀发亮的那种"一层高光"。
   *   fade           最贴边 N px 内把位移收细，让玻璃边界与页面无缝衔接（0 = 关）
   *   hole           1 = 内部不画（真透明），只画贴边那一圈折射带 + 高光线 ——
   *                     看着就是"壁上开了个洞"，**没有玻璃的体量感**（用户否掉了）；
   *                  0 = 内部整块画出来。现在全站都是 0，靠 inner/sheen 给出"实体感"。
   *   inner          内壁倒角强度 0..1：贴边一段距离内微微压暗（玻璃厚度）。
   *   innerW         倒角向内延伸多少 px 归零（默认 2.2×折射带，且不超过短边 35%）
   *   tilt           倒角的方向性 0..1（默认 .75）。光在左上 → 右下内壁更厚更暗。
   *                  0 就是四周对称（像一圈均匀的晕，不推荐）。
   *   sheen          表面光泽 0..1：斜向柔光（左上亮、右下暗）。
   *                  ★ 用**乘法**不是加白 —— 本站壁纸接近纯白，加白会被裁掉看不见。
   * ------------------------------------------------------------------ */
  var KINDS = [
    /* 侧栏 / 顶栏。
       ★ 2026-10-07（用户："顶栏只有边框有液态玻璃效果，中间不是透明的，目前还是模糊效果"）

       之前顶栏是 frost:1 + hole:0 —— 内部采样 20px 重糊版纹理，所以中间是一层**模糊**。
       那个模糊不是 CSS 的 backdrop-filter（.cf-glass 早把它干掉了），是 shader 里画的。

       现在：frost:0 + hole:0 + sat:1。
         · frost 0  → 中间不再模糊，画的是**未糊的原图**；
         · sat   1  → 中间和它背后的壁纸逐像素一致（不是 1 的话会显出一条偏色的带子，
                      实测 sat 1.5 时顶栏明显偏蓝）；
         · hole  0  → 保留"中间要画一层"这个行为。
       结果：静止时顶栏和背景**完全一样**（看着就是透明的），滚动时正文从它下面过，
       顶栏显示的是壁纸 → 面包屑始终可读。这正是参考 demo 里滚动容器那档
       （blurRadius 0、中间显示 backdrop 原样）在我们这套架构下能做到的等价物。

       ⚠ 为什么顶栏不用 hole:1（真·全透）：试过。body 下面滚动的正文会直接穿过顶栏，
         "错误示例" 这种大标题会和面包屑叠在一起，没法看。
         想要那种效果就把下面的 hole 改成 1（一行）。 */
    { key: 'side', sel: '.cf-side', refMin: 12, refMax: 14, amt: 2, sat: 'page', bright: 0,
      contrast: 1, surface: .07, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .70, sheen: .80 },
    { key: 'bar', sel: '.cf-bar', refMin: 12, refMax: 14, amt: 2, sat: 'page', bright: 0,
      contrast: 1, surface: .07, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .70, sheen: .80 },

    /* 卡片 = 参考项目里的「懒加载容器」玻璃板（catalog/build-scroll-container.ts）：
         cornerRadius 32 / refractionHeight 16 / refractionAmount -32 / blurRadius 0
         / surfaceColor [0,0,0,0] / saturation 1.5 / highlight DEFAULT / shadow DEFAULT

       ★ 与参考的两处差异（都是**必须**的，不是调参口味）

       ① surface 照着参考留 0，但**内部挖空**（hole:1）。
          参考的玻璃是整面墙，内部画成"折射后的壁纸"和页面背景毫无区别；
          我们的卡片是浮在壁纸上的小块，整块画出来就是"一张贴上去的图" ——
          内部挖空之后，卡片区域显示的是浏览器合成的真实页面，
          玻璃只剩下贴边那一圈折射带 + 一条高光线。

       ② 想完全按参考原样（内部也画满、sat 1.5 生效），把 hole 改成 0 即可。 */
    { key: 'card', sel: '.slideout-panel .section', refMin: 16, refMax: 32, amt: 2, sat: 'page',
      bright: 0, contrast: 1, surface: .07, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .70, sheen: .80 },

    /* 按钮 = 参考项目里的玻璃药丸（catalog/constants.ts GLASS_PARAMS）：原样照搬
         refractionHeight 12 / refractionAmount -24 / blurRadius 2 / saturation 1.5
         / surfaceColor [0,0,0,0] / highlight DEFAULT / shadow DEFAULT
       refMin=refMax=12 就是"不要自适应、就用参考的 12px"。
       另外参考的按钮分 transparent / surface(白0.3) / tinted 三种，这里是 transparent 那档。 */
    { key: 'btn', sel: '.slideout-panel .btn', refMin: 12, refMax: 12, amt: 2, sat: 'page',
      bright: 0, contrast: 1, surface: .05, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .50, sheen: .50 },
    { key: 'btn', sel: '.slideout-panel button.btn', refMin: 12, refMax: 12, amt: 2, sat: 'page',
      bright: 0, contrast: 1, surface: .05, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .50, sheen: .50 },
    { key: 'btn', sel: '.slideout-panel .button', refMin: 12, refMax: 12, amt: 2, sat: 'page',
      bright: 0, contrast: 1, surface: .05, frost: 0, radius: 'css', ca: 0, rimHi: .5, fade: 0,
      rimBlur: 1, hole: 0, inner: .50, sheen: .50 },
  ];

  var MARK = 'cf-glass';
  var CV = 'cf-glass__cv';
  var FALLBACK = 'cf-glass-fail';

  /* 渲染分辨率系数。
     ★ 必须是 1 以上：玻璃的**内部**画的就是壁纸本身（彩度 = 页面实测值 1.1），
       如果按 0.7 渲染再放大，卡片内部会比周围页面糊 —— 那就又变回"一层模糊"了。
       参考项目的 Settings 里也能调 DPR，这里跟设备 DPR 走，上限 1.5 防爆。 */
  var SCALE = 1;
  var MAX_SCALE = 1.5;

  var glCanvas, gl, uni, prog;
  var rawTex, rimTex, frostTex;         /* 原图 / 4px 微糊 / 20px 重糊 */
  var texW = 0, texH = 0, glW = 0, glH = 0;
  var DOCMODE = false;                  /* 壁纸不是 fixed 时改走文档坐标 */
  var targets = [];
  var ready = false;
  /* 页面背景自己施加的滤镜强度 —— 我们的重绘必须复刻它。
     见 measurePageSat()：不一致的话，hole=0 的内部会显出一块颜色不同的矩形。 */
  var PAGE_SAT = 1;

  function log() {
    if (window.console && console.debug) {
      console.debug.apply(console, ['[cf-glass]'].concat([].slice.call(arguments)));
    }
  }
  function vp() {
    return { w: document.documentElement.clientWidth || window.innerWidth,
             h: document.documentElement.clientHeight || window.innerHeight };
  }

  /* ---------------- 1. 找壁纸 ----------------
     ⚠ 必须能"等"。本站壁纸是 acrylic 插件**页面加载后**用 JS 挂到 body::before 上的，
     而本脚本是服务端注入的 <script>，DOMContentLoaded 就跑完了 —— 那一刻壁纸还不存在。
     线上第一次部署就死在这一步（data-glass-fail="no wallpaper"）。 */
  function wallpaper() {
    var probes = [
      [document.body, '::before'], [document.documentElement, '::before'],
      [document.body, '::after'], [document.documentElement, '::after'],
      [document.body, null], [document.documentElement, null],
    ];
    for (var i = 0; i < probes.length; i++) {
      var s;
      try { s = getComputedStyle(probes[i][0], probes[i][1]); } catch (e) { continue; }
      if (!s || !s.backgroundImage || s.backgroundImage === 'none') continue;
      var m = s.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
      if (m && m[2] && m[2].indexOf('data:') !== 0) {
        /* 「这层背景是不是钉在视口上的」：
           要么 background-attachment:fixed，要么承载它的伪元素本身 fixed
           （本站是后者：body::before{position:fixed; inset:0; size:cover}）。 */
        var fixed = /fixed/.test(s.backgroundAttachment || '') || /fixed/.test(s.position || '');
        return { url: m[2], fixed: fixed };
      }
    }
    var vars = ['--acrylic-wallpaper', '--body-background', '--wallpaper', '--bg-image'];
    for (var v = 0; v < vars.length; v++) {
      var val = getComputedStyle(document.documentElement).getPropertyValue(vars[v])
        || getComputedStyle(document.body).getPropertyValue(vars[v]);
      var mm = val && val.match(/url\((['"]?)(.*?)\1\)/);
      if (mm && mm[2]) return { url: mm[2], fixed: true };
    }
    return null;
  }

  /* 页面背景被施加了什么滤镜？我们的重绘是"原始壁纸 + 自己的 colorControls"，
     而页面是"原始壁纸 + CSS filter"。两者不一致 → 内部画出来就是一块异色矩形。
     ★ 这就是用户最早说"每个卡片的底都是一张新图片"的病根（当时我写死 sat 1.5，
       页面实际是 saturate(1.1)）。现在改成启动时实测，从此不会跑偏。
     实测（2026-10-07）：--acrylic-blur: 0px / --acrylic-saturate: 1.1。 */
  function measurePageSat() {
    try {
      var f = getComputedStyle(document.body, '::before').filter || '';
      var m = f.match(/saturate\(\s*([\d.]+)/);
      if (m) PAGE_SAT = parseFloat(m[1]) || 1;
      var b = f.match(/blur\(\s*([\d.]+)px/);
      if (b && parseFloat(b[1]) >= 0.5) {
        log('⚠ 页面背景带 blur(' + b[1] + 'px)：内部重绘没有复刻它，hole=0 时会略有差别');
      }
    } catch (e) { /* 拿不到就退回默认 1 */ }
    return PAGE_SAT;
  }

  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('wallpaper load failed')); };
      im.src = url;
    });
  }

  /* 按 cover 规则把图铺满 —— 与 body::before 的显示结果一致 */
  function drawCover(c, img, w, h, zoom) {
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (zoom || 1);
    var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /* ---------------- 2. WebGL ---------------- */
  var VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }',
  ].join('\n');

  /* 片元着色器 —— 参考项目 element.ts 主循环 + element-utils.ts + sdf.ts 的移植。
     唯一的改写是把 uniform 换成我们这套（没有旋转、没有 FBO、没有 per-element pass），
     数学部分逐行保持原样，注释里标了对应关系。 */
  var FS = [
    'precision highp float;',
    'varying vec2 vUv;',

    'uniform sampler2D uWall;',     /* 原图（cover 铺满视口） */
    'uniform sampler2D uRimTex;',   /* 4px 微糊版（折射带用） */
    'uniform sampler2D uFrostTex;', /* 20px 重糊版（侧栏/顶栏内部用） */
    'uniform vec4  uRect;',        /* 元素在纹理里的归一化矩形 */
    'uniform vec2  uSize;',        /* 元素完整 CSS 尺寸 */
    'uniform vec4  uWin;',         /* 本次渲染的窗口（元素内的 x,y,w,h） */
    'uniform float uRadius;',
    'uniform float uRefH;',
    'uniform float uRefAmt;',      /* 负数 = 向内取样 */
    'uniform float uSat;',
    'uniform float uBright;',
    'uniform float uContr;',
    'uniform float uSurface;',
    'uniform float uFrost;',
    'uniform float uCA;',
    'uniform float uRimHi;',
    'uniform float uFade;',
    'uniform float uRimBlur;',
    'uniform float uHole;',     /* 1 = 内部不画（真透明），只画边缘折射带；0 = 整块画出来 */
    'uniform float uInner;',    /* 内壁倒角（玻璃"厚度"）强度 0..1 */
    'uniform float uInnerW;',   /* 倒角向内延伸多少 px，再往里就归零 */
    'uniform float uTilt;',     /* 倒角的方向性 0..1：0 = 四周对称，1 = 右下最厚 */
    'uniform float uSheen;',    /* 表面光泽强度（斜向柔光）0..1 */
    'uniform float uDbgUV;',    /* 1 = 直接把采样 uv 当颜色输出（排查采样坐标）*/

    /* sdf.ts:39 sdRoundedRect */
    'float sdRR(vec2 p, vec2 b, float r){',
    '  vec2 q = abs(p) - b + r;',
    '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;',
    '}',

    /* sdf.ts:110 gradSdRoundedRect —— SDF 的梯度，指向形状外侧 */
    'vec2 gradRR(vec2 p, vec2 b, float r){',
    '  vec2 q = abs(p) - (b - vec2(r));',
    '  if (q.x >= 0.0 || q.y >= 0.0) {',
    '    vec2 v = max(q, vec2(0.0));',
    '    float l = length(v);',
    '    if (l < 1e-6) return vec2(0.0);',
    '    return sign(p) * (v / l);',
    '  }',
    '  float gx = step(q.y, q.x);',
    '  return sign(p) * vec2(gx, 1.0 - gx);',
    '}',

    /* element-utils.ts:82 circleMap —— 整个"液态"的核心：贴边陡、内部平 */
    'float circleMap(float x){ return 1.0 - sqrt(max(0.0, 1.0 - x * x)); }',

    /* element-utils.ts:504 applyColorControls —— ColorFilter.kt 的逐项移植。
       (0.5 - contrast*0.5 + brightness)*255 再 /255，那个 255 对消掉了，这里直接写 t。 */
    'vec3 colorControls(vec3 c, float brightness, float contrast, float saturation){',
    '  float invSat = 1.0 - saturation;',
    '  float kr = 0.213 * invSat, kg = 0.715 * invSat, kb = 0.072 * invSat;',
    '  float t = 0.5 - contrast * 0.5 + brightness;',
    '  float cs = contrast * saturation;',
    '  vec3 o;',
    '  o.r = (contrast * kr + cs) * c.r + contrast * kg * c.g + contrast * kb * c.b + t;',
    '  o.g = contrast * kr * c.r + (contrast * kg + cs) * c.g + contrast * kb * c.b + t;',
    '  o.b = contrast * kr * c.r + contrast * kg * c.g + (contrast * kb + cs) * c.b + t;',
    '  return clamp(o, 0.0, 1.0);',
    '}',

    /* 元素内 px → 纹理 uv */
    'vec2 uvAt(vec2 p){ return uRect.xy + (p / uSize) * uRect.zw; }',

    'void main(){',
    /* 重建成"元素内 px"坐标：长卡片只渲染视口那一段，起点要加上窗口偏移。

       ★★ v 必须翻转（1.0 - vUv.y）—— 2026-10-07 修 ★★
       推导：gl.viewport(0,0,W,H) 把内容画进 drawing buffer 的**底部** H 行；
       而 WebGL 的 buffer 行 0 是"GL 的下边"、同时也是 canvas 作为图片时的**下边**。
       所以 GL 渲染的那条带子，在图片坐标系里位于底部，且行序与 GL 一致 ——
       `drawImage(glCanvas, 0, glCanvas.height - H, W, H, …)`（见文件末尾）拿到的
       正是这条带子，顺序也没错。但结果是：
           vUv.y = 1  ↔  元素内的**顶部**
           vUv.y = 0  ↔  元素内的**底部**
       也就是 vUv.y 是"从下往上"数的，与 GL 的 y 轴一致、跟页面坐标相反。

       不翻的后果（线上实测）：
         · px.y 变成 2*oy + winH - localY —— 元素内坐标被**上下镜像**；
         · SDF / 法线 / 位移都在这套镜像坐标里自洽，所以形状和"向内"方向看着没错，
           但采样点落在了镜像位置上：**上边缘那条折射带取的是卡片上方的像素**；
         · 卡片内部因为 hole=1 不画，看不出来；顶栏内部被 20px 的 frost 糊掉了，
           也看不出来 —— 所以这个 bug 一直藏着，直到用户说
           "边框和中间衔接不自然"。
       判定方法：把 uDbgUV 打开，看 R 是否等于 x/1440、G 是否等于 y/900。
       修之前 G 是 1.2 - y/900（反向），修之后应当正好是 y/900。 */
    '  vec2 px = uWin.xy + vec2(vUv.x, 1.0 - vUv.y) * uWin.zw;',
    '  vec2 hh = uSize * 0.5;',              /* half 是 GLSL 保留字，只能叫 hh */
    '  vec2 c  = px - hh;',
    '  float sd = sdRR(c, hh, uRadius);',
    '  float depth = max(-sd, 0.0);',        /* 离边的深度（内部为正） */

    /* ---- element.ts:414-451 透镜折射 ---- */
    '  vec2  sp = px;',
    '  float d  = 0.0;',
    '  float rim = 0.0;',
    /* gradRadius = min(radius*1.5, min(halfW, halfH))，与参考一致。
       放在 if 外面算：边缘高光也要用它当法线。 */
    '  vec2 g = gradRR(c, hh, min(uRadius * 1.5, min(hh.x, hh.y)));',
    '  float lq = length(g);',
    '  g = lq > 1e-6 ? g / lq : vec2(0.0);',
    '  if (uRefH > 0.5 && depth < uRefH) {',
    '    d = circleMap(1.0 - depth / uRefH) * uRefAmt;',
    /* 最贴边 uFade px 内把位移收细 —— 不留这一手的话，玻璃最外一像素永远是
       "位移拉满"的极端色，跟外面的页面之间会有一条硬边。 */
    '    if (uFade > 0.0) d *= smoothstep(0.0, uFade, depth);',
    '    sp = px + d * g;',
    '    rim = 1.0 - depth / uRefH;',        /* 1 = 最贴边 */
    '  }',

    /* ---- 真透明（uHole）----
       参考项目给的是 surfaceColor [0,0,0,0]，但它的玻璃是**整面墙**，
       内部画成"折射后的壁纸"和页面背景看不出区别。
       我们的卡片是浮在壁纸上的小块 —— 整块画出来就是"一张贴上去的图"。

       所以这里把内部**挖空**：内部一个像素都不画，透明交给浏览器自己合成，
       卡片区域显示的就是真实的页面内容。只保留贴边那一圈折射带。

       两个权重分开衰减，挖空的接缝才是隐形的：
         wColor —— 色彩处理（vibrancy / 白纱）在 t=0.45 就开始往 1 收，
                   到 t=0.95 完全还原成原始颜色；
         aIn    —— alpha 到 t=0.82 才开始收，t=1 归零。
       这样 alpha 开始衰减时（t>0.82），位移 d 只剩不到 0.7px、色彩也已还原，
       采样值 ≈ 卡片背后的真实像素 → 看不见任何边界。 */
    '  float t = (uRefH > 0.5 && depth < uRefH) ? (depth / uRefH) : 1.0;',
    /* ★ 挖空时才需要让色彩处理随 t 渐隐；不挖空（hole=0）时必须**全程生效**，
       否则内部会退回"未处理的原始色"—— 页面背景是 saturate(1.1) 的，
       原始色比它淡，于是又会出现一块颜色不一样的矩形（就是"贴图感"）。 */
    '  float wColor = (uHole > 0.5) ? (1.0 - smoothstep(0.45, 0.95, t)) : 1.0;',
    '  float aIn = (uHole > 0.5) ? (1.0 - smoothstep(0.82, 1.0, t)) : 1.0;',

    '  vec2 uv = uvAt(sp);',
    /* 诊断：把采样坐标直接当颜色输出。R = uv.x、G = uv.y（都可反算回像素位置）。
       用它才能回答"图层里画出来的颜色，到底是从壁纸哪个位置取的"。 */
    '  if (uDbgUV > 0.5) { gl_FragColor = vec4(uv, 0.0, 1.0); return; }',
    /* 折射带里改用一个 4px 微糊版。原因：边缘是 2× 压缩，壁纸上的细线稿会被拉成
       一条条硬彩边（实测粉色/蓝色竖条），微糊一下它就变成柔和的光色过渡。
       真玻璃本来也有这么一点点扩散。主体（rw→0）仍用原图，保证内部绝对干净。 */
    '  float rw = uRimBlur * smoothstep(0.0, 0.30, rim);',
    '  vec3 col = texture2D(uWall, uv).rgb;',
    '  if (rw > 0.01) col = mix(col, texture2D(uRimTex, uv).rgb, rw);',

    /* ---- element.ts:458-516 色散：7 抽样的简化版（3 抽样，通道权重保留）。
       强度 ∝ (cx·cy)/(hx·hy) —— 中线恒为 0、四角最大。这是"棱镜感"和"发出一圈彩光"
       的分水岭：参考里也只在四角看得到色散。 ---- */
    '  float di = (c.x * c.y) / max(hh.x * hh.y, 1e-4);',
    '  if (uCA > 0.5 && abs(di) > 1e-3 && rw > 0.01) {',
    '    vec2 du = ((d * g * di) / uSize) * uRect.zw * 0.6;',
    '    vec3 cRed = mix(texture2D(uWall, uv - du).rgb, texture2D(uRimTex, uv - du).rgb, rw);',
    '    vec3 cBlu = mix(texture2D(uWall, uv + du).rgb, texture2D(uRimTex, uv + du).rgb, rw);',
    '    col = vec3(cRed.r, col.g, cBlu.b);',
    '  }',

    /* 侧栏/顶栏：内部改用重糊版（它们盖在内容上，需要挡住背后的东西）；
       折射带仍然用 4px 微糊版，保持边缘锐利 —— 所以这里的作用范围要卡在 band 内侧。 */
    '  if (uFrost > 0.001) {',
    '    vec3 f = texture2D(uFrostTex, uv).rgb;',
    '    col = mix(col, f, uFrost * (1.0 - smoothstep(0.0, 0.5, rim)));',
    '  }',

    /* ---- element.ts:406 vibrancy：这就是"玻璃里那层东西"的颜色来源。
       挖空时按 wColor 渐隐，接缝才是隐形的。 ---- */
    '  vec3 proc = colorControls(col, uBright, uContr, uSat);',
    '  if (uSurface > 0.001) proc = mix(proc, vec3(1.0), uSurface);',
    '  if (wColor < 0.999) col = mix(col, proc, wColor); else col = proc;',

    /* ---- 玻璃"实体感"：内壁倒角 + 表面光泽 （2026-10-07 新增）
       ★ 为什么需要它：用户说"只有边框有液态玻璃的感觉，中间部分就跟没有东西一样"。
         根因是我上一版把内部挖空（hole=1）之后，**内部一个像素都不画** ——
         等于在壁纸上开了个洞，只剩一圈边框，当然没有"一块玻璃"的体量感。

       ★ 为什么不能简单地把内部"铺满一层"：那就是用户最早说的
         "每个卡片的底都是一张新的图片"。铺满本身没问题（参考项目就是这么做的），
         出问题的是**铺的东西和页面背景不一致**：
           · 页面背景是 `blur(0) saturate(1.1)`，我这边写的是 sat 1.5 →
             内部比周围更艳，立刻显出一块矩形；
           · 再加 .30 的白纱 → 更白的一块矩形。
         所以现在的做法是：**先把内部重绘调成和页面背景逐像素一致**（sat 取页面实测值、
         frost 0、surface 0），**再往上叠"玻璃质感"**。

       ★ 质感本身必须是**形状驱动的**，不能是平铺色：
         · 内壁倒角（bevel）—— 贴边向内一段距离内微微压暗，模拟玻璃的厚度；
           越靠边越暗、到 uInnerW 处归零。这一层让"边缘"变成"有厚度的边缘"。
         · 内缘暗线（eLine）—— 紧贴高光线内侧再补一条更窄的暗环，
           和高光线一起构成"亮-暗-亮"的三明治，这是玻璃切口的典型观感。
         · 表面光泽（sheen）—— 一条斜向柔光，左上亮、右下暗，
           模拟一块斜放的玻璃把光顶回来。它横跨整块，所以中间也有"东西"。
         三者都由 SDF 的 depth / px 算出，永远贴着形状走 —— 换尺寸、换圆角都不会错位，
         也不会像平铺色那样看出来是"一个贴上去的矩形"。 */
    '  if (uInner > 0.001) {',
    /* 高光线占最外 1.2px，暗线从 1.0px 开始起、约 5px 处收干净，两者不打架 */
    '    float eLine = (1.0 - smoothstep(1.0, 5.0, depth)) * smoothstep(0.0, 1.0, depth);',
    '    float bevel = 1.0 - smoothstep(0.0, max(uInnerW, 4.0), depth);',
    /* ★ 方向性：光从左上来 → 右下方向的内壁"更厚、挡光更多"，左上更薄更透。
       g 是向外的法线，和右下方向点乘即可分出"哪条边应该更暗"。
       四周对称的倒角看着像一圈均匀的晕；加上方向性之后，一整块玻璃的受光关系才成立。 */
    '    float side  = clamp(dot(g, normalize(vec2(0.45, 0.55))), -1.0, 1.0);',
    '    float thick = bevel * (1.0 + uTilt * side);',
    '    col *= 1.0 - uInner * (0.13 * eLine + 0.055 * thick);',
    '  }',
    '  if (uSheen > 0.001) {',
    '    vec2 np = clamp(px / uSize, 0.0, 1.0);',
    /* ★ 用**乘法**而不是加白色：本站壁纸本身就接近纯白，
       加白色会被直接裁掉、完全看不见；乘法在纯白区域也能压出层次，
       而且不会把背景的彩色线稿洗掉。 */
    '    float sh = clamp(1.0 - (np.x * 0.45 + np.y * 0.55), 0.0, 1.0);',
    '    col *= 1.0 + uSheen * (sh - 0.5) * 0.16;',
    '  }',

    /* 边缘高光 —— element-utils.ts:454-486（DefaultHighlightShaderString）的移植：
         intensity = pow(abs(dot(gradSdRoundedRect(...), vec2(cos45, sin45))), falloff)
         亮度 += White(0.5) * intensity
       注意 abs() —— 最亮处在"法线平行于 45° 轴"的位置（也就是四个角附近），
       不是沿整圈均匀发亮。遮罩是 HighlightModifier 描出的 0.5dp 细线，
       这里用"贴边 1.2px 内"近似那条 stroke。

       ⚠ 上一版我用 rim*rim（整整一条折射带）做高光 —— 那才是"一层贴上去的高光"。
       高光只应该是**一条细线**。 */
    '  if (uRimHi > 0.001 && depth < 1.2) {',
    '    float line  = 1.0 - smoothstep(0.0, 1.2, depth);',
    '    float inten = abs(dot(g, vec2(0.70710678, 0.70710678)));',
    '    col += vec3(uRimHi) * inten * line;',
    '  }',

    /* ---- element.ts:559-572 边缘 AA。coverage = aIn * edgeAA，预乘输出 ---- */
    '  float a = aIn * (1.0 - smoothstep(-0.5, 0.5, sd));',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * a, a);',
    '}',
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  function initGL() {
    glCanvas = document.createElement('canvas');
    /* ★ alpha:true + 预乘。这样边缘 AA 由 SDF 给（和参考一致），
       画布不需要 CSS border-radius 也能有正确的圆角和柔边。 */
    gl = glCanvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    }) || glCanvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');

    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uni = {};
    ['uWall', 'uFrostTex', 'uRect', 'uSize', 'uWin', 'uRadius', 'uRefH', 'uRefAmt',
     'uSat', 'uBright', 'uContr', 'uSurface', 'uFrost', 'uCA', 'uRimHi', 'uFade',
     'uRimBlur', 'uHole', 'uInner', 'uInnerW', 'uTilt', 'uSheen', 'uDbgUV',
     'uRimTex'
    ].forEach(function (k) { uni[k] = gl.getUniformLocation(prog, k); });

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   /* uv 的 y 从视口顶部往下 */
    gl.uniform1i(uni.uWall, 0);
    gl.uniform1i(uni.uRimTex, 1);
    gl.uniform1i(uni.uFrostTex, 2);

    rawTex = gl.createTexture();
    rimTex = gl.createTexture();
    frostTex = gl.createTexture();
    [rawTex, rimTex, frostTex].forEach(function (t) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });
  }

  /* 诊断钩子：把三张源画布留一份引用，方便对拍"玻璃到底采样到了什么"。
        __cfGlassTex(1120, 470)  → { raw: [r,g,b], rim: [...], frost: [...] }
     用途：把"玻璃画出来的颜色"和"页面背景的真实颜色"分开归因 ——
     如果 raw 就已经不等于页面背景，那问题在纹理构建（解码 / cover 缩放），
     而不是 shader 的采样位置。 */
  var texDbg = {};
  window.__cfGlassTex = function (x, y) {
    var o = {};
    ['raw', 'rim', 'frost'].forEach(function (k) {
      var c = texDbg[k];
      if (!c || !c.width) return;
      try {
        var d = c.getContext('2d').getImageData(x, y, 1, 1).data;
        o[k] = [d[0], d[1], d[2]];
      } catch (e) { o[k] = 'err'; }
    });
    return o;
  };

  /* ---------------- 3. 纹理 ----------------
     fixed（本站）：壁纸钉在视口上，纹理就做「视口大小」。
     document    ：壁纸跟着文档滚，纹理做「文档大小」，这时候滚动完全不用重绘。 */
  function buildTextures(img) {
    var v = vp();
    if (v.w < 8 || v.h < 8) return false;
    if (DOCMODE) {
      var de = document.documentElement;
      texW = Math.min(4096, Math.max(v.w, de.scrollWidth || v.w));
      texH = Math.min(4096, Math.max(v.h, de.scrollHeight || v.h));
    } else {
      texW = v.w; texH = v.h;
    }

    var a = document.createElement('canvas');
    a.width = texW; a.height = texH;
    drawCover(a.getContext('2d'), img, texW, texH, 1);

    /* 微糊版（折射带专用）：4px 刚好把 2× 压缩出来的硬彩边化成柔和的光色过渡，
       又不会让边缘显得"毛"。同样多画一圈，否则模糊会采样到画布外缘把边框压暗。 */
    var r = document.createElement('canvas');
    r.width = texW; r.height = texH;
    var rc = r.getContext('2d');
    try { rc.filter = 'blur(4px)'; } catch (e) {}
    drawCover(rc, img, texW, texH, 1.02);
    rc.filter = 'none';

    /* 重糊版（侧栏/顶栏内部用） */
    var b = document.createElement('canvas');
    b.width = texW; b.height = texH;
    var bc = b.getContext('2d');
    try { bc.filter = 'blur(20px)'; } catch (e) {}
    drawCover(bc, img, texW, texH, 1.08);
    bc.filter = 'none';

    gl.bindTexture(gl.TEXTURE_2D, rawTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.bindTexture(gl.TEXTURE_2D, rimTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, r);
    gl.bindTexture(gl.TEXTURE_2D, frostTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b);
    texDbg = { raw: a, rim: r, frost: b };
    return true;
  }

  function ensureGL(w, h) {
    if (glW >= w && glH >= h) return;
    glW = Math.max(glW, w); glH = Math.max(glH, h);
    glCanvas.width = glW; glCanvas.height = glH;
  }

  /* ---------------- 4. 目标 ----------------
     ★★ 空元素（`<input>` / `<select>` / `<textarea>` / …）必须跳过 —— 2026-10-07 ★★
     用户报「讨论区回复等按钮没有轮廓」，根因就在这里：

       Hydro 的按钮有一大半是 `<input type="submit" class="rounded primary button">`
       （登录按钮、讨论区的「回复 (Ctrl+Enter)」「取消」…）。它们能被 KINDS 的
       `.slideout-panel .button` 选中，于是 mount() 会往它里面 insertBefore 一个 canvas ——
       **不报错，但也不渲染**（空元素没有渲染内容的盒子，实测 canvas rect 0x0）。
       而 mount() 同时会给它加 `.cf-glass` / `.cf-glass-on`，plan3.css 又把这两个类
       的 background 摘成 transparent → 元素本身的白底没了、画布又画不出来，
       按钮就整个"消失"了，只剩一颗悬空的字。

     跳过之后，这些按钮保留 plan3.css 里那套**自带 1px 描边**的基础外观
     （`.slideout-panel .btn / .button`），无论玻璃有没有跑起来都有轮廓。
     同一套基础外观也是「页面没有壁纸 → 玻璃整体不启动」（比如 /login 的
     immersive 布局）时的兜底。 */
  var VOID = { INPUT: 1, SELECT: 1, TEXTAREA: 1, IMG: 1, BR: 1, HR: 1 };

  /* ==================== 主题开关（theme 插件的 window.CfTheme）====================
   *
   * theme 插件在 </head> 前注入一行：
   *   <script id="cf-theme-data">window.CfTheme={tid,name,glassSide,glassBar,glassLocal,bg}</script>
   * 用户应用某个主题之后，这三个布尔值决定哪几类区域还上玻璃。映射关系：
   *
   *   glassSide  → kind 'side'   （.cf-side   左侧导航）
   *   glassBar   → kind 'bar'    （.cf-bar    顶栏面包屑）
   *   glassLocal → kind 'card' / 'btn'（内容区卡片 + 按钮，"局部"）
   *
   * ★ 没有 window.CfTheme（没装 theme 插件、或者当前用户没应用任何主题）→ 全部视为**开**，
   *   线上表现与装这个插件之前逐像素一致。
   * ★ 每次 collect() 都重新读，不做启动时快照：pjax 换页 / 主题切换之后跟着变。
   * ★ 关掉的类不用额外清理 —— collect() 少产出目标之后，refreshList() 里的 sweep()
   *   会把已挂载的 `.cf-glass` / `.cf-glass-on` 类去掉、画布删掉，
   *   元素自然退回它自己的 CSS 底色（.cf-side 的 rgba(...,.55)、卡片的白纱等）。
   *   代价是"关掉再打开"必须重新加载页面才会回来 —— 主题本来就是这样改的（表单提交整页跳转），
   *   不影响使用。
   * -------------------------------------------------------------------------- */
  var KIND_FLAG = { side: 'glassSide', bar: 'glassBar', card: 'glassLocal', btn: 'glassLocal' };

  function kindOn(kind) {
    var t = window.CfTheme;
    if (!t) return true;
    var f = KIND_FLAG[kind];
    if (!f) return true;
    return t[f] !== false;
  }

  /* ---------- 窄屏（≤600px）：只做「卡片 / 按钮」玻璃 ----------
     ★★ 2026-10-11：手机上一开始是「整体退出」的 —— 因为 plan3.css 的配套样式
        （`.cf-glass > canvas{position:absolute}` 等）原先全在 @media (min-width: 601px)
        里，窄屏下画布会以 inline-block 掉进文档流，页面变成「一块玻璃 + 一块内容」。
        现在 plan3.css 的 max-width 分支已经把这套样式补齐了，所以手机上也能玻璃化。

     窄屏仍然**跳过 `side` / `bar`** —— 那两类元素（.cf-side / .cf-bar）在窄屏是
     display:none 的（原生汉堡菜单接管导航），给不可见元素挂 canvas 纯属浪费。 */
  function isNarrow() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
  }
  var NARROW_SKIP = { side: 1, bar: 1 };

  function collect() {
    var found = [];
    var narrow = isNarrow();
    KINDS.forEach(function (k) {
      if (!kindOn(k.key)) return;      /* 主题里关掉了这一类 → 不产出目标（交给 sweep 清理） */
      if (narrow && NARROW_SKIP[k.key]) return;   /* 窄屏：这两类不可见，不挂 */
      Array.prototype.forEach.call(document.querySelectorAll(k.sel), function (el) {
        if (el.__cfGlass) { if (!el.__cfGlass.dead) found.push(el.__cfGlass); return; }
        if (VOID[el.tagName]) return;
        if (el.tagName === 'A' && el.classList.contains('cf-si')) return;
        var t = { el: el, kind: k };
        el.__cfGlass = t;
        found.push(t);
      });
    });
    return found;
  }

  /* 元素真实圆角 —— 用 CSS 算出来的值，保证 shader 的 SDF 和浏览器画的形状一致。
     按钮那边 CSS 写的是 999px，会被后面的 min(..., 短边/2) 收成胶囊。 */
  function cssRadius(el) {
    var s = getComputedStyle(el);
    var r = 0;
    ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
      .forEach(function (k) { r = Math.max(r, parseFloat(s[k]) || 0); });
    return r;
  }

  function mount(t) {
    var el = t.el;
    if (!el.parentNode) return false;
    if (getComputedStyle(el).display === 'none') return false;

    /* 画布绝对定位在元素里，所以元素本身得是定位上下文。
       注意不能无脑写 position:relative —— .cf-side / .cf-bar 是 fixed 的。 */
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    if (!t.cv) {
      t.cv = document.createElement('canvas');
      t.cv.className = CV;
      t.cv.setAttribute('aria-hidden', 'true');
      el.insertBefore(t.cv, el.firstChild);
      t.ctx = t.cv.getContext('2d');
      el.classList.add(MARK);
      /* ★ 只在画布真的挂上之后才摘掉元素自己的底色。
         `.slideout-panel .section` 的 `background: rgba(255,255,255,.5) !important`
         specificity (0,2,0) 比 `.cf-glass` 的 (0,1,0) 高，必须靠这条更专的规则去压
         （见 plan3.css 里的 .cf-glass-on）。
         放在这里而不是直接写死，是为了**玻璃失败时卡片仍然有正常白底** ——
         `.cf-glass` 是 mount 时才加的，fail() 之后就永远不会加。 */
      el.classList.add(MARK + '-on');
    }
    t.visible = true;
    return true;
  }

  function renderOne(t) {
    var el = t.el, cv = t.cv, k = t.kind;
    var v = vp();
    var r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return;

    /* ★ 只渲染「元素 ∩ 视口」那一段。
       工程题列表页那张包住整张表格的卡片有几千 px 高，按整块建画布的话
       每次重绘都是几百万像素，实测一帧 170ms，滚一下像幻灯片。 */
    var x0 = Math.max(0, r.left), y0 = Math.max(0, r.top);
    var x1 = Math.min(v.w, r.right), y1 = Math.min(v.h, r.bottom);
    var winW = x1 - x0, winH = y1 - y0;
    if (winW < 6 || winH < 6) {
      if (cv.style.display !== 'none') cv.style.display = 'none';
      return;
    }
    if (cv.style.display === 'none') cv.style.display = '';

    var ox = x0 - r.left, oy = y0 - r.top;      /* 窗口在元素内的偏移 */
    var W = Math.max(6, Math.round(winW * SCALE));
    var H = Math.max(6, Math.round(winH * SCALE));

    /* ★★ 性能关键：窗口在**屏幕**上的矩形没变就不重绘。
       壁纸是 position:fixed 的，屏幕上同一块矩形看到的壁纸永远一样。
       一张比视口还高的长卡片滚过一屏，窗口一直是「整个视口」——
       只有卡片的上/下边缘进出视口时窗口才真的变，一屏只需要重绘两次。 */
    var sx = DOCMODE ? (window.pageXOffset || 0) : 0;
    var sy = DOCMODE ? (window.pageYOffset || 0) : 0;
    var originX = (r.left + sx) / texW, originY = (r.top + sy) / texH;
    var key = originX.toFixed(5) + ',' + originY.toFixed(5) + ','
      + (r.width / texW).toFixed(5) + ',' + (r.height / texH).toFixed(5) + ','
      + ox + ',' + oy + ',' + winW + ',' + winH + ',' + SCALE;
    if (key === t.key && !t.dirty) return;
    t.key = key; t.dirty = false;

    cv.style.left = ox + 'px';
    cv.style.top = oy + 'px';
    cv.style.width = winW + 'px';
    cv.style.height = winH + 'px';
    /* 圆角交给 SDF 画（见 shader 末尾），画布不再需要 CSS border-radius */

    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }

    /* --- 参数 --- */
    var R = k.radius === 'css' ? cssRadius(el) : (k.radius || 0);
    R = Math.max(0, Math.min(R, Math.min(r.width, r.height) / 2));

    /* 折射带按短边自适应：clamp(短边*0.055, refMin, refMax)。
       窄元素（72px 的收起侧栏）如果给大 band，整条都会变成"边缘"，
       采样被左右两边互相拉，糊成彩色条纹 —— 所以还有一道短边百分比的硬上限。
       ★ 上限设 30%：参考自己的按钮就是 48dp 高配 12dp 带子 = 25%，
         卡在 20% 反而会把参考的数值改掉（12 → 7.2）。
       位移量恒为 -2×band（参考里 16/-32、12/-24 都是这个比例，破了就变成"糊边"）。 */
    var short = Math.min(r.width, r.height);
    var band = Math.max(k.refMin, Math.min(short * 0.055, k.refMax));
    band = Math.min(band, short * 0.30);
    var amt = -(k.amt || 2) * band;
    /* 内壁倒角的宽度：默认取 2.2 倍折射带，但不超过短边的 35% ——
       否则窄元素（58px 高的顶栏）会被两侧的倒角在中线叠满，糊成一团。 */
    var innerW = Math.min(k.innerW || band * 2.2, short * 0.35);

    ensureGL(W, H);
    gl.viewport(0, 0, W, H);
    gl.uniform4f(uni.uRect, originX, originY, r.width / texW, r.height / texH);
    gl.uniform2f(uni.uSize, r.width, r.height);
    gl.uniform4f(uni.uWin, ox, oy, winW, winH);
    gl.uniform1f(uni.uRadius, R);
    gl.uniform1f(uni.uRefH, band);
    gl.uniform1f(uni.uRefAmt, amt);
    gl.uniform1f(uni.uSat, k.sat === 'page' ? PAGE_SAT : k.sat);
    gl.uniform1f(uni.uBright, k.bright || 0);
    gl.uniform1f(uni.uContr, k.contrast == null ? 1 : k.contrast);
    gl.uniform1f(uni.uSurface, k.surface || 0);
    gl.uniform1f(uni.uFrost, k.frost || 0);
    gl.uniform1f(uni.uCA, k.ca || 0);
    gl.uniform1f(uni.uRimHi, k.rimHi || 0);
    gl.uniform1f(uni.uFade, k.fade || 0);
    gl.uniform1f(uni.uRimBlur, k.rimBlur == null ? 1 : k.rimBlur);
    gl.uniform1f(uni.uHole, k.hole == null ? 1 : k.hole);
    gl.uniform1f(uni.uInner, k.inner || 0);
    gl.uniform1f(uni.uInnerW, innerW);
    gl.uniform1f(uni.uTilt, k.tilt == null ? 0.75 : k.tilt);
    gl.uniform1f(uni.uSheen, k.sheen || 0);
    gl.uniform1f(uni.uDbgUV, k.dbgUV || 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rawTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rimTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, frostTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* ⚠ 必须从**底部**取源区域。
       gl.viewport(0,0,W,H) 的原点在左下角，画出来的是画布底部那条；
       而 2D canvas 的 drawImage 源坐标原点是左上角。
       一开始写成 (0,0,W,H) 就是把没画过的地方拷过去 —— 因为当时 GL 上下文用了
       alpha:false，那片区域是不透明白，卡片于是全黑。 */
    t.ctx.clearRect(0, 0, W, H);
    t.ctx.drawImage(glCanvas, 0, glCanvas.height - H, W, H, 0, 0, W, H);
  }

  /* ---------------- 5. 调度 ---------------- */
  var queued = false;
  /* 自测用：window.__cfGlassStats 直接读出「渲染一次花多少毫秒」。
     光看 rAF 帧间隔没用 —— 无头环境本身就被压到 24fps，测不出真实开销。 */
  var stats = { paints: 0, ms: 0, last: 0, worst: 0, targets: 0 };
  window.__cfGlassStats = stats;

  function paint() {
    queued = false;
    if (!ready) return;
    var t0 = (window.performance || Date).now();
    var list = targets, n = 0;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t.visible) continue;
      try { renderOne(t); n++; } catch (e) { /* 单个元素失败不影响其他 */ }
    }
    var dt = (window.performance || Date).now() - t0;
    stats.paints++; stats.ms += dt; stats.last = dt;
    stats.worst = Math.max(stats.worst, dt); stats.targets = n;
  }
  function schedule() {
    if (queued) return;
    queued = true;
    if (window.requestAnimationFrame) requestAnimationFrame(paint);
    else setTimeout(paint, 16);
  }

  function refreshList() {
    targets = collect();
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i].cv) observe(targets[i]);
      else targets[i].visible = true;
    }
    sweep();
    schedule();
  }

  /* /cfai 的 app.js 会把 document.body 整段复制进聊天气泡，克隆出来的卡片会带着
     .cf-glass 类和一个**空白的** canvas —— 气泡里的卡片就变成没底，字全糊在背景上。
     清扫：凡是带 .cf-glass 但已不在「活的」目标表里的，摘类 + 删画布，退回 CSS 兜底。 */
  function sweep() {
    var live = [];
    for (var i = 0; i < targets.length; i++) live.push(targets[i].el);
    var all = document.querySelectorAll('.' + MARK);
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (live.indexOf(el) >= 0) continue;
      el.classList.remove(MARK);
      el.classList.remove(MARK + '-on');
      var c = el.querySelector(':scope > canvas.' + CV);
      if (c && c.parentNode) c.parentNode.removeChild(c);
      if (el.__cfGlass) { el.__cfGlass.dead = true; el.__cfGlass.watched = false; }
      if (ro) { try { ro.unobserve(el); } catch (e) {} }
      el = null;
    }
  }

  function invalidate() {
    targets.forEach(function (t) { t.key = null; t.dirty = true; });
    schedule();
  }

  /* 懒加载：只有进入视口（含 200px 余量）的元素才建画布、才渲染 */
  var io = null;
  function observe(t) {
    if (!('IntersectionObserver' in window)) { mount(t); watchSize(t); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        var dirty = false;
        entries.forEach(function (en) {
          var tt = en.target.__cfGlass;
          if (!tt) return;
          if (en.isIntersecting) { mount(tt); tt.cv.style.display = ''; dirty = true; }
          else { tt.visible = false; if (tt.cv) tt.cv.style.display = 'none'; }
        });
        if (dirty) schedule();
      }, { rootMargin: '200px 0px 200px 0px' });
    }
    io.observe(t.el);
    watchSize(t);
  }

  /* ★★ 尺寸变化必须重绘（2026-10-07 用户报的 bug）★★
     侧栏是 CSS `:hover { width: … }` + transition 展开/收起的 ——
     这既不是 window resize，也不是 DOM 节点增删，所以原来那套
     （window.resize / MutationObserver{childList} / setInterval 4s）
     一个都接不住。表现就是用户看到的：
     **"侧栏收起折叠的时候边框不会移动，只有文字动了，滚动几下边框才展开"** ——
     文字是 CSS 排的当然跟着动，而玻璃画布还停在旧尺寸上，
     一直要等到 4 秒轮询或者滚动触发重绘才追上。

     ResizeObserver 直接盯元素盒子，宽度一变就标脏 + 排一次重绘。
     弹层、hover 展开、字体加载后重排、PJAX 换布局…… 全都覆盖。
     顶栏的 `left` 也会跟着侧栏变（宽度变），所以一并被接住。 */
  var ro = null;
  function watchSize(t) {
    if (!('ResizeObserver' in window) || t.watched) return;
    if (!ro) {
      ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var tt = entries[i].target.__cfGlass;
          if (tt) tt.dirty = true;
        }
        schedule();
      });
    }
    t.watched = true;
    ro.observe(t.el);
  }

  /* ---------------- 6. 线上调参钩子 ----------------
     部署一次很贵（Cloudflare 缓存 public/ 4 小时，得靠 VERSION 破），
     所以把参数表暴露出来：改一个数就能立刻看到效果，不用重新上传。
         __cfGlassTune('card', { refH: 24, surface: .08 })
         __cfGlassTune(null,   { ca: 1 })          // 所有元素
         __cfGlassKinds                            // 看当前值
     调好之后把数值抄回上面的 KINDS，再递增 index.ts 的 VERSION。 */
  window.__cfGlassKinds = KINDS;
  /* 当前生效的主题开关（读的是主题插件注入的 window.CfTheme）：
       __cfGlassTheme        // { tid, name, glassSide, glassBar, glassLocal, bg } 或 undefined
       __cfGlassTheme.kinds()// { side:true, bar:true, card:true, btn:true }  映射结果
       __cfGlassTheme({ glassLocal: false })   // 临时改开关，立刻重收集（刷新即还原）
     ⚠ 仅调试用：刷新页面就回到服务端注入的值。 */
  window.__cfGlassTheme = function (patch) {
    if (patch) window.CfTheme = Object.assign({}, window.CfTheme || {}, patch);
    refreshList();
    return window.CfTheme;
  };
  window.__cfGlassTheme.kinds = function () {
    var o = {};
    KINDS.forEach(function (k) { o[k.key] = kindOn(k.key); });
    return o;
  };
  window.__cfGlassTune = function (key, patch) {
    var n = 0;
    KINDS.forEach(function (k) {
      if (key && k.key !== key) return;
      for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) k[p] = patch[p];
      n++;
    });
    invalidate();
    return n;
  };

  /* 换壁纸（调试 / 演示用）。
     glass.js 只在启动时读一次壁纸（start() 里 loadImage），页面后期换背景它不会知道。
     有了这个钩子就能在**同一个页面**里 A/B 两套壁纸，不用重新部署：
         __cfGlassWallpaper('https://…/wallpaper.webp')
     ⚠ 必须同时把页面背景也换掉，否则玻璃采样的是新图、页面显示的还是旧图，两边对不上：
         body::before { background-image: url('…') !important }
     返回 Promise<string>，resolve 出新的纹理尺寸。 */
  window.__cfGlassWallpaper = function (url) {
    return loadImage(url).then(function (img) {
      if (!buildTextures(img)) throw new Error('texture size');
      refreshList();
      invalidate();
      return texW + 'x' + texH;
    });
  };

  /* ---------------- 7. 生命周期 ---------------- */
  function cleanupOld() {
    /* 清掉上一版 html2canvas 折射留下的东西 */
    var old = document.getElementById('cf-refract');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    document.documentElement.classList.remove('cf-refract-on');
    document.querySelectorAll('iframe[aria-hidden="true"]').forEach(function (f) {
      var st = f.getAttribute('style') || '';
      if (st.indexOf('-99999') >= 0 && f.parentNode) f.parentNode.removeChild(f);
    });
  }

  function boot() {
    cleanupOld();
    /* 注意：窄屏**也**要走到这里 —— 手机上要保留卡片/按钮玻璃，
       只是 collect() 会跳过 side/bar（那两类在窄屏不可见）。
       `.cf-side` / `.cf-bar` 在窄屏依然存在于 DOM（只是 display:none），
       所以下面这个存在性检查照常通过。 */
    if (!document.querySelector('.cf-side') && !document.querySelector('.cf-bar')) {
      if ((boot.n = (boot.n || 0) + 1) < 40) return setTimeout(boot, 60);
      return;
    }
    /* 壁纸是页面加载后才挂上的，得等（见 wallpaper() 的注释） */
    var tries = 0;
    (function findWallpaper() {
      var wp = wallpaper();
      if (wp) return start(wp);
      if (++tries > 80) return fail('no wallpaper');       /* 80 × 150ms ≈ 12s */
      setTimeout(findWallpaper, 150);
    })();
  }

  /* 跨断点：重新收集一次。
     窄 → 宽  side/bar 这两类回到列表里（collect 不再跳过）；
     宽 → 窄  它们从列表里消失，sweep() 顺手摘掉画布与类。
     不用 window.resize —— matchMedia 的 change 只在真正跨过 600px 时触发。 */
  (function watchNarrow() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(max-width: 600px)');
    var last = mq.matches;
    var on = function () {
      if (mq.matches === last) return;
      last = mq.matches;
      refreshList();
    };
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
  })();

  function start(wp) {
    DOCMODE = !wp.fixed;
    SCALE = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_SCALE));
    measurePageSat();          /* 必须在第一次 renderOne 之前 */
    try { initGL(); } catch (e) { return fail('gl: ' + e.message); }

    loadImage(wp.url).then(function (img) {
      if (!buildTextures(img)) return fail('texture size');
      ready = true;
      refreshList();
      var t = 0;
      window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          SCALE = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_SCALE));
          if (buildTextures(img)) { refreshList(); invalidate(); }
        }, 200);
      });
      var raf = window.requestAnimationFrame;
      window.addEventListener('scroll', function () { raf ? raf(schedule) : schedule(); }, { passive: true });
      document.addEventListener('pjax-end', function () { setTimeout(refreshList, 60); });
      var mo = new MutationObserver(function () {
        clearTimeout(mo.t);
        mo.t = setTimeout(function () { refreshList(); }, 300);
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setInterval(function () { if (document.body && document.body.childElementCount) refreshList(); }, 4000);
      log('ready', targets.length, 'targets, texture', texW + 'x' + texH,
        DOCMODE ? '(document mode)' : '(fixed mode)', 'scale', SCALE);
    }).catch(function (e) { fail('img: ' + e.message); });
  }

  function fail(reason) {
    ready = false;
    document.documentElement.classList.add(FALLBACK);
    document.documentElement.setAttribute('data-glass-fail', reason);
    try { console.warn('[cf-glass] disabled:', reason); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 120); });
  } else setTimeout(boot, 120);
})();
