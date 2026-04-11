/**
 * ブラウザ内で実行される HTML 構造抽出ロジック（純粋な JavaScript）
 * tsx/esbuild のトランスフォームを受けないよう、別ファイルとして管理する。
 *
 * window.__extractPageStructure(selectors, styleProps) を定義する。
 */
(function () {
  var STYLE_PROPS = [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color',
    'backgroundColor', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'display', 'position', 'width', 'maxWidth', 'height',
    'borderTopWidth', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor',
    'boxShadow', 'textTransform', 'letterSpacing', 'textAlign',
    'flexDirection', 'gap', 'alignItems', 'justifyContent',
  ];

  function getStyles(el) {
    var cs = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      var prop = STYLE_PROPS[i];
      var cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      result[prop] = cs.getPropertyValue(cssProp) || cs[prop] || '';
    }
    return result;
  }

  function getChildInfo(el) {
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.from(el.classList),
      innerText: el.innerText ? el.innerText.slice(0, 200) : '',
      styles: getStyles(el),
    };
  }

  function getElementInfo(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var sel = candidates[i];
      var el = document.querySelector(sel);
      if (el) {
        var html = el.outerHTML;
        var rect = el.getBoundingClientRect();
        return {
          selector: sel,
          tagName: el.tagName.toLowerCase(),
          id: el.id || '',
          classes: Array.from(el.classList),
          outerHTML: html.length > 3000 ? html.slice(0, 3000) + '\n<!-- truncated -->' : html,
          innerText: el.innerText ? el.innerText.slice(0, 500) : '',
          styles: getStyles(el),
          children: Array.from(el.children).slice(0, 10).map(getChildInfo),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      }
    }
    return null;
  }

  function extractNavigation() {
    var navEl = document.querySelector(
      'nav, .main-navigation, #site-navigation, .primary-menu-wrapper'
    );
    if (!navEl) return [];
    var items = [];
    // 直下 ul → 子 ul → さらに子 ul の順で最初に見つかったトップレベルリストを使う
    var topLevel = navEl.querySelectorAll(':scope > ul > li');
    if (topLevel.length === 0) {
      topLevel = navEl.querySelectorAll('ul.menu > li, ul.nav-menu > li, ul.menu-main-menu > li');
    }
    if (topLevel.length === 0) {
      // div ラッパーを経由するパターン（例: nav > div > ul > li）
      topLevel = navEl.querySelectorAll('div > ul > li');
    }
    topLevel.forEach(function (li) {
      var a = li.querySelector(':scope > a');
      if (!a) return;
      var children = [];
      li.querySelectorAll('.sub-menu > li > a, .dropdown-menu > li > a, ul > li > a').forEach(function (sub) {
        // トップレベルの a と同じものは除外
        if (sub === a) return;
        children.push({ text: (sub.textContent || '').trim(), href: sub.href || '' });
      });
      items.push({
        text: (a.textContent || '').trim(),
        href: a.href || '',
        classes: Array.from(li.classList),
        children: children,
      });
    });
    return items;
  }

  function extractCSSVariables() {
    var vars = {};
    var rootStyle = window.getComputedStyle(document.documentElement);
    Array.from(document.styleSheets).forEach(function (sheet) {
      try {
        Array.from(sheet.cssRules).forEach(function (rule) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
            Array.from(rule.style).forEach(function (prop) {
              if (prop.startsWith('--')) {
                vars[prop] = rootStyle.getPropertyValue(prop).trim();
              }
            });
          }
        });
      } catch (e) { /* cross-origin */ }
    });
    return vars;
  }

  window.__extractPageStructure = function (selectors) {
    var elements = {};
    Object.entries(selectors).forEach(function (entry) {
      elements[entry[0]] = getElementInfo(entry[1]);
    });

    var bodyEl = document.body;
    var metaVp = document.querySelector('meta[name="viewport"]');

    return {
      url: window.location.href,
      title: document.title,
      bodyClasses: Array.from(bodyEl.classList),
      bodyStyles: getStyles(bodyEl),
      elements: elements,
      navigation: extractNavigation(),
      cssVariables: extractCSSVariables(),
      metaViewport: metaVp ? (metaVp.getAttribute('content') || '') : '',
      extractedAt: new Date().toISOString(),
    };
  };
})();
