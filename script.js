(() => {
  "use strict";
  const cart = [];
  const panel = document.querySelector("#bag-panel");
  const overlay = document.querySelector("#bag-overlay");
  const counter = document.querySelector("#bag-count");
  const items = document.querySelector("#bag-items");
  const toast = document.querySelector("#toast");
  const open = document.querySelector("#open-bag");
  const close = document.querySelector("#close-bag");
  let lastFocus = null;
  let toastTimer;
  function render() {
    counter.textContent = String(cart.length);
    items.replaceChildren();
    if (!cart.length) {
      const empty = document.createElement("p"); empty.className = "empty-bag"; empty.innerHTML = "Sua sacola está vazia.<br><small>Explore os conceitos da coleção.</small>"; items.append(empty); return;
    }
    cart.forEach((name,index) => {
      const line = document.createElement("div"); line.className = "bag-item";
      const info = document.createElement("div"); const heading = document.createElement("strong"); heading.textContent = name;
      const sub = document.createElement("p"); sub.textContent = "Conceito demonstrativo"; info.append(heading,sub);
      const remove = document.createElement("button"); remove.type="button"; remove.textContent="Remover"; remove.setAttribute("aria-label","Remover "+name);
      remove.addEventListener("click",() => {cart.splice(index,1);render();}); line.append(info,remove);items.append(line);
    });
  }
  function showBag(){lastFocus=document.activeElement;overlay.hidden=false;panel.classList.add("open");panel.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";close.focus();}
  function hideBag(){panel.classList.remove("open");panel.setAttribute("aria-hidden","true");overlay.hidden=true;document.body.style.overflow="";if(lastFocus && lastFocus.focus)lastFocus.focus();}
  function notify(message){toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2300);}
  open.addEventListener("click",showBag);close.addEventListener("click",hideBag);overlay.addEventListener("click",hideBag);
  document.querySelector("#keep-exploring").addEventListener("click",hideBag);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&panel.classList.contains("open"))hideBag();if(event.key==="Tab"&&panel.classList.contains("open")){const focusable=[...panel.querySelectorAll('button:not([disabled]),a[href]')];const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.querySelectorAll(".add-btn").forEach(button=>button.addEventListener("click",()=>{cart.push(button.dataset.item);render();notify(button.dataset.item+" adicionado à sacola (simulação)");}));
  render();
})();