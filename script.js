/* =====================================================================
   CONFIGURAÇÃO DO CHECKOUT
   Cole aqui o link do seu checkout. TODOS os botões de compra usam
   esta mesma URL. Parâmetros UTM da página são repassados automaticamente.
   ===================================================================== */
var URL_CHECKOUT = ""; // ex.: "https://pay.suaplataforma.com/xxxx"

(function(){
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Checkout: todos os botões usam URL_CHECKOUT ---------- */
  function buildCheckoutUrl(){
    var base = (URL_CHECKOUT || "").trim();
    if(!base) return "";
    try{
      var url = new URL(base, location.href);
      var params = new URLSearchParams(location.search);
      params.forEach(function(v,k){
        if(/^(utm_|src$|sck$|fbclid$|gclid$|xcod$)/i.test(k) && !url.searchParams.has(k)) url.searchParams.set(k,v);
      });
      return url.toString();
    }catch(e){ return base; }
  }
  var checkoutUrl = buildCheckoutUrl();
  document.querySelectorAll("[data-checkout]").forEach(function(a){
    if(checkoutUrl){ a.href = checkoutUrl; }
    else{
      a.addEventListener("click", function(e){
        e.preventDefault();
        console.warn("Defina URL_CHECKOUT no início do script.js para ativar os botões de compra.");
      });
    }
  });

  /* ---------- 2. Imagens: carrega o arquivo se existir; senão mantém o placeholder ---------- */
  function loadSlot(fig){
    var src = fig.getAttribute("data-src");
    if(!src || fig.dataset.done) return;
    fig.dataset.done = "1";
    var img = new Image();
    img.decoding = "async";
    img.alt = fig.getAttribute("data-alt") || "";
    if(fig.hasAttribute("data-eager")) img.fetchPriority = "high";
    img.onload = function(){
      img.width = img.naturalWidth; img.height = img.naturalHeight;
      fig.appendChild(img);
      fig.classList.add("loaded");
      fig.dispatchEvent(new Event("slotdone"));
    };
    img.onerror = function(){
      fig.classList.add("missing");
      fig.dispatchEvent(new Event("slotdone"));
    };
    img.src = src;
  }
  var slots = document.querySelectorAll(".ph[data-src]");
  if("IntersectionObserver" in window){
    var imgObs = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ loadSlot(en.target); imgObs.unobserve(en.target); } });
    }, {rootMargin:"600px 0px"});
    slots.forEach(function(f){ f.hasAttribute("data-eager") ? loadSlot(f) : imgObs.observe(f); });
  } else { slots.forEach(loadSlot); }

  /* ---------- 2b. Livro do hero: páginas passando ---------- */
  (function(){
    var book = document.getElementById("heroBook");
    if(!book) return;
    var stage = book.querySelector(".book-pages");
    var nav = book.querySelector(".book-nav");
    var dotsWrap = book.querySelector(".book-dots");
    var pauseBtn = book.querySelector(".book-pause");
    var pages = Array.prototype.slice.call(book.querySelectorAll(".page"));
    var INTERVAL = 3800, DURATION = reduceMotion ? 600 : 1100;
    var order = [], dots = [], busy = false, timer = null;
    var userPaused = false, hovering = false, focused = false, offscreen = false;

    // Espera todas as imagens responderem; mantém só as que existem
    var pending = pages.length;
    pages.forEach(function(p){
      p.addEventListener("slotdone", function(){ if(--pending === 0) init(); }, {once:true});
      loadSlot(p);
    });

    function init(){
      var found = pages.filter(function(p){ return p.classList.contains("loaded"); });
      if(found.length){
        pages.forEach(function(p){ if(!p.classList.contains("loaded")) p.remove(); });
        pages = found;
      }
      order = pages.slice();
      layout();
      if(pages.length < 2) return;

      pages.forEach(function(p, i){
        var d = document.createElement("button");
        d.type = "button"; d.className = "book-dot";
        d.setAttribute("aria-label", "Mostrar página " + (i + 1));
        d.addEventListener("click", function(){ goTo(p); restart(); });
        dotsWrap.appendChild(d); dots.push(d);
      });
      nav.hidden = false;
      layout();

      stage.addEventListener("click", function(){ flip(); restart(); });
      var x0 = null;
      stage.addEventListener("touchstart", function(e){ x0 = e.touches[0].clientX; }, {passive:true});
      stage.addEventListener("touchend", function(e){
        if(x0 === null) return;
        if(Math.abs(e.changedTouches[0].clientX - x0) > 40){ flip(); restart(); }
        x0 = null;
      });
      book.addEventListener("mouseenter", function(){ hovering = true; restart(); });
      book.addEventListener("mouseleave", function(){ hovering = false; restart(); });
      book.addEventListener("focusin", function(){ focused = true; restart(); });
      book.addEventListener("focusout", function(){ focused = false; restart(); });
      pauseBtn.addEventListener("click", function(){
        userPaused = !userPaused;
        pauseBtn.setAttribute("aria-pressed", String(userPaused));
        pauseBtn.setAttribute("aria-label", userPaused ? "Continuar páginas" : "Pausar páginas");
        restart();
      });
      document.addEventListener("visibilitychange", restart);
      if("IntersectionObserver" in window){
        new IntersectionObserver(function(en){ offscreen = !en[0].isIntersecting; restart(); }).observe(book);
      }
      restart();
    }

    function layout(){
      order.forEach(function(p, i){
        p.style.zIndex = String(order.length - i);
        p.setAttribute("aria-hidden", i === 0 ? "false" : "true");
      });
      dots.forEach(function(d, i){ d.setAttribute("aria-current", String(pages[i] === order[0])); });
    }

    function flip(){
      if(busy || order.length < 2) return;
      busy = true;
      var top = order[0];
      top.classList.add("turning");
      setTimeout(function(){
        order.push(order.shift());
        layout();
        top.classList.remove("turning");
        busy = false;
      }, DURATION);
    }

    function goTo(p){
      if(busy || order[0] === p) return;
      while(order[0] !== p) order.push(order.shift());
      layout();
      p.classList.remove("appear"); void p.offsetWidth; p.classList.add("appear");
    }

    function restart(){
      clearInterval(timer); timer = null;
      if(userPaused || hovering || focused || offscreen || document.hidden) return;
      timer = setInterval(flip, INTERVAL);
    }
  })();

  /* Ano atual no rodapé */
  var ano = document.getElementById("ano");
  if(ano) ano.textContent = new Date().getFullYear();

  /* ---------- 3. Animações de entrada ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if(!reduceMotion && "IntersectionObserver" in window){
    var revObs = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add("in"); revObs.unobserve(en.target); } });
    }, {threshold:.12, rootMargin:"0px 0px -40px 0px"});
    reveals.forEach(function(el){ revObs.observe(el); });
  } else { reveals.forEach(function(el){ el.classList.add("in"); }); }

  /* ---------- 4. FAQ accordion acessível ---------- */
  var faqBtns = Array.prototype.slice.call(document.querySelectorAll(".faq-btn"));
  faqBtns.forEach(function(btn, i){
    btn.addEventListener("click", function(){
      var item = btn.closest(".faq-item");
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      item.classList.toggle("open", !open);
    });
    btn.addEventListener("keydown", function(e){
      var next = null;
      if(e.key === "ArrowDown") next = faqBtns[(i+1) % faqBtns.length];
      else if(e.key === "ArrowUp") next = faqBtns[(i-1+faqBtns.length) % faqBtns.length];
      else if(e.key === "Home") next = faqBtns[0];
      else if(e.key === "End") next = faqBtns[faqBtns.length-1];
      if(next){ e.preventDefault(); next.focus(); }
    });
  });

  /* ---------- 5. Barra fixa mobile ---------- */
  var sticky = document.getElementById("stickyCta");
  var heroCta = document.querySelector(".hero-cta");
  var offer = document.getElementById("oferta");
  if(sticky && "IntersectionObserver" in window){
    var heroVisible = true, offerVisible = false;
    var stickyLink = sticky.querySelector("a");
    function update(){
      var show = !heroVisible && !offerVisible;
      sticky.classList.toggle("show", show);
      sticky.setAttribute("aria-hidden", String(!show));
      stickyLink.tabIndex = show ? 0 : -1;
      document.body.classList.toggle("has-sticky", show);
    }
    new IntersectionObserver(function(en){
      heroVisible = en[0].isIntersecting || en[0].boundingClientRect.top > 0; update();
    }).observe(heroCta);
    new IntersectionObserver(function(en){ offerVisible = en[0].isIntersecting; update(); }, {threshold:.15}).observe(offer);
  }
})();
