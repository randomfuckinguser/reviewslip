/* Reviewslip booking embed — put Reviewslip's booking pages on any website.
 *
 *   <div data-reviewslip-booking data-venue="baanponglodge"></div>
 *   <script src="https://reviewslip.com/embed.js" async></script>
 *
 * Options, as data- attributes on the div:
 *   data-venue    a venue's Reviewslip address (slug): that venue only. Leave it
 *                 out for every listed venue, with the search bar.
 *   data-place    every venue, starting with this search ("Chiang Mai").
 *   data-lang     en th zh ja ko es fr de it pt nl. Default: the page's own
 *                 <html lang>, else English.
 *   data-accent   the colour of the main buttons, as hex ("#1f4fa3").
 *   data-theme    light (default), dark, or auto to follow the visitor.
 *   data-height   the height before the page inside reports its own (px).
 *
 * The pages run in an iframe on reviewslip.com, so bookings, prices and
 * availability are Reviewslip's own and land on the venue's calendar. The frame
 * grows to fit what is inside it, and scrolls back into view when the guest
 * moves to the next page. Several embeds on one page work independently.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var ORIGIN = script ? new URL(script.src).origin : "https://reviewslip.com";
  var LANGS = ["en", "th", "zh", "ja", "ko", "es", "fr", "de", "it", "pt", "nl"];
  var frames = [];

  function langOf(el) {
    var asked = (el.getAttribute("data-lang") || document.documentElement.lang || "en")
      .toLowerCase()
      .split("-")[0];
    return LANGS.indexOf(asked) >= 0 ? asked : "en";
  }

  function srcOf(el) {
    var venue = (el.getAttribute("data-venue") || "").trim().toLowerCase();
    var place = (el.getAttribute("data-place") || "").trim();
    var accent = (el.getAttribute("data-accent") || "").trim().replace(/^#/, "");
    var lang = langOf(el);

    // English pages have no language prefix on reviewslip.com.
    var path = (lang === "en" ? "" : "/" + lang) + (venue ? "/stays/" + encodeURIComponent(venue) : "/stays");
    var query = ["embed=1"];
    if (venue) query.push("venue=" + encodeURIComponent(venue));
    if (place && !venue) query.push("q=" + encodeURIComponent(place));
    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) query.push("accent=" + accent.toLowerCase());
    var theme = (el.getAttribute("data-theme") || "").toLowerCase();
    if (theme === "dark" || theme === "auto") query.push("theme=" + theme);
    return ORIGIN + path + "?" + query.join("&");
  }

  function mount(el) {
    if (el.getAttribute("data-reviewslip-mounted")) return;
    el.setAttribute("data-reviewslip-mounted", "1");

    var iframe = document.createElement("iframe");
    iframe.src = srcOf(el);
    iframe.title = el.getAttribute("data-title") || "Book a stay";
    // The softphone's Call button needs the microphone; clipboard for copying
    // a booking reference.
    iframe.allow = "microphone; clipboard-write";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    var start = parseInt(el.getAttribute("data-height"), 10) || 720;
    iframe.style.cssText =
      "display:block;width:100%;border:0;background:transparent;height:" + start + "px;" +
      "transition:height .15s ease;color-scheme:normal";
    el.innerHTML = "";
    el.appendChild(iframe);
    frames.push({ iframe: iframe, loaded: false });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data || {};
    if (data.source !== "reviewslip") return;

    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.iframe.contentWindow !== event.source) continue;

      if (data.type === "height" && data.height > 0) {
        frame.iframe.style.height = Math.ceil(data.height) + "px";
      } else if (data.type === "navigate") {
        // Every page after the first: bring the frame's top into view, or the
        // guest lands half way down a page they never scrolled.
        if (frame.loaded) {
          var top = frame.iframe.getBoundingClientRect().top;
          if (top < 0 || top > window.innerHeight * 0.6) {
            frame.iframe.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        frame.loaded = true;
      }
      return;
    }
  });

  function mountAll() {
    var els = document.querySelectorAll("[data-reviewslip-booking]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
