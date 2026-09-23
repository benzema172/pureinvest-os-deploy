(function(){
  if(window.__PI_PAROBEK_AI_MINI__) return;
  window.__PI_PAROBEK_AI_MINI__ = true;

  const STATE = window.PI_PAROBEK_MINI = window.PI_PAROBEK_MINI || {
    open:false,
    loading:false,
    lastSignals:[]
  };

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function num(v){
    if(v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/\s/g,'').replace(',', '.').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }
  function money(v){
    const n = num(v);
    return n.toLocaleString('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' zł';
  }
  function shortMoney(v){
    const n = num(v);
    const prefix = n > 0 ? '+' : '';
    return prefix + n.toLocaleString('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' zł';
  }
  function pct(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(Math.abs(n) < 10 ? 1 : 0).replace('.', ',') + '%';
  }
  function dateValue(row){
    return row?.date || row?.payment_date || row?.expense_date || row?.created_at || row?.snapshot_date || '';
  }
  function monthKey(d){
    const x = d ? new Date(d) : new Date();
    if(Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
  }
  function monthLabel(){
    return new Date().toLocaleString('pl-PL',{month:'long'});
  }
  function paymentMonth(row){
    try{ return window.PureInvestPaymentPeriod?.settlementMonth?.(row) || monthKey(dateValue(row)); }
    catch(_){ return monthKey(dateValue(row)); }
  }
  function nowMonth(){ return monthKey(new Date()); }
  function daysAgo(value){
    if(!value) return null;
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  function props(){
    try{ if(Array.isArray(window.loadedProperties)) return window.loadedProperties; }catch(_){ }
    try{ if(typeof loadedProperties !== 'undefined' && Array.isArray(loadedProperties)) return loadedProperties; }catch(_){ }
    return [];
  }
  function activeProperty(){
    let p = null;
    try{ p = window.activePropertyData || (typeof activePropertyData !== 'undefined' ? activePropertyData : null); }catch(_){ p = window.activePropertyData || null; }
    if(p && p.id) return p;
    let id = null;
    try{ id = window.activeProperty || (typeof activeProperty !== 'undefined' ? activeProperty : null); }catch(_){ id = window.activeProperty || null; }
    if(id){
      const found = props().find(x => String(x.id) === String(id));
      if(found) return found;
    }
    return props()[0] || null;
  }
  function propertyRent(p){ return num(p?.rent_amount || p?.owner_rent || p?.monthly_rent || p?.rent || 0); }
  function propertyArea(p){ return num(p?.area_m2 || p?.area || p?.size_m2 || 0); }
  function rowsForProperty(rows, pid){
    return (Array.isArray(rows) ? rows : []).filter(r => !r.is_deleted && !r.deleted_at && String(r.property_id || '') === String(pid || ''));
  }
  function currentRows(p){
    const pid = p?.id;
    const m = nowMonth();
    const payments = rowsForProperty(window.rawPayments || [], pid).filter(x => paymentMonth(x) === m);
    const expenses = rowsForProperty(window.rawExpenses || [], pid).filter(x => monthKey(dateValue(x)) === m);
    return {payments, expenses};
  }
  function sum(rows){ return (rows || []).reduce((a,b) => a + num(b.amount), 0); }
  function signal(type, title, value, text, action){ return {type,title,value,text,action}; }

  function financialSignal(p){
    if(!p) return signal('neutral','Finanse','Wybierz','Wybierz mieszkanie, aby pokazać 3 konkretne sygnały.', ()=>showSection?.('properties'));
    const {payments, expenses} = currentRows(p);
    const income = sum(payments);
    const costs = sum(expenses);
    const balance = income - costs;
    const rent = propertyRent(p);
    if(income === 0 && rent > 0){
      return signal('warn','Finanse','Brak wpłaty', `Nie widzę czynszu za ${monthLabel()}. Sprawdź transakcje.`, ()=>showSection?.('transactions'));
    }
    if(balance < 0){
      return signal('bad','Finanse', shortMoney(balance), `Miesiąc jest na minusie. Koszty przewyższają wpływy.`, ()=>showSection?.('transactions'));
    }
    if(!income && !costs){
      return signal('info','Finanse','Brak danych', 'Brak zaksięgowanych transakcji w bieżącym miesiącu.', ()=>showSection?.('transactions'));
    }
    return signal('good','Finanse', shortMoney(balance), 'Saldo miesiąca. Najem i koszty wyglądają stabilnie.', ()=>openDashboard?.(p.id));
  }

  function dataSignal(p){
    if(!p) return signal('neutral','Dane','—','Brak wybranego mieszkania.');
    if(!propertyArea(p)) return signal('warn','Dane','Brak m²', 'Uzupełnij metraż, aby karta mieszkania i analiza ROI były kompletne.', ()=>window.piPropertiesManager?.edit?.(p.id));
    if(!propertyRent(p)) return signal('warn','Dane','Brak najmu', 'Uzupełnij najem właścicielski do analizy finansowej.', ()=>window.piPropertiesManager?.edit?.(p.id));
    if(!p.rent_due_day && !p.payment_day) return signal('info','Dane','Brak terminu', 'Ustaw dzień płatności, aby szybciej wykrywać zaległości.', ()=>window.piPropertiesManager?.edit?.(p.id));
    return signal('good','Dane','OK', 'Mieszkanie ma komplet danych do bieżącej analizy.', ()=>window.piPropertiesManager?.edit?.(p.id));
  }

  function toneFor(signals){
    if(signals.some(x=>x.type==='bad')) return 'bad';
    if(signals.some(x=>x.type==='warn')) return 'warn';
    if(signals.some(x=>x.type==='chance')) return 'chance';
    if(signals.some(x=>x.type==='info')) return 'info';
    return 'good';
  }

  function renderShell(){
    const root = document.getElementById('wiktorekAssistant');
    if(!root || root.__parobekMiniShell) return root;
    root.innerHTML = `
      <button type="button" class="pi-parobek-compact-toggle" id="piParobekCompactToggle" aria-label="AIos'">
        <span class="pi-parobek-compact-core">AI</span>
        <span class="pi-parobek-compact-badge" id="piParobekCompactBadge">0</span>
      </button>
      <div class="pi-parobek-compact-panel" id="piParobekCompactPanel">
        <div class="pi-parobek-compact-head">
          <div>
            <div class="pi-parobek-compact-title">AIos'</div>
            <div class="pi-parobek-compact-context" id="piParobekMiniContext">Aktualne mieszkanie</div>
          </div>
          <button type="button" class="pi-parobek-icon-btn" id="piParobekCloseBtn" aria-label="Zamknij">×</button>
        </div>
        <div class="pi-parobek-compact-list" id="piParobekMiniList"></div>
        <div class="pi-parobek-compact-foot">
          <button type="button" class="pi-parobek-btn ghost" id="piParobekOpenBtn">Mieszkanie</button>
        </div>
      </div>`;
    root.querySelector('#piParobekCompactToggle')?.addEventListener('click', ()=>window.toggleWiktorekAssistant());
    root.querySelector('#piParobekCloseBtn')?.addEventListener('click', ()=>window.toggleWiktorekAssistant(false));
    root.querySelector('#piParobekOpenBtn')?.addEventListener('click', ()=>window.piParobekMiniOpenProperty());
    root.__parobekMiniShell = true;
    return root;
  }

  function renderSignals(signals, p){
    const root = renderShell();
    if(!root) return;
    const context = document.getElementById('piParobekMiniContext');
    const list = document.getElementById('piParobekMiniList');
    const badge = document.getElementById('piParobekCompactBadge');
    const tone = toneFor(signals);
    const needsAttention = signals.filter(x => ['bad','warn','chance'].includes(x.type)).length;
    root.dataset.tone = tone;
    if(context){
      context.textContent = p ? `${p.name || 'Mieszkanie'}${propertyArea(p) ? ' · ' + propertyArea(p) + ' m²' : ''}` : 'Brak wybranego mieszkania';
    }
    if(badge){
      badge.textContent = String(needsAttention || 0);
      badge.classList.toggle('show', needsAttention > 0);
    }
    if(list){
      list.innerHTML = signals.slice(0,3).map((s,i)=>`
        <button type="button" class="pi-parobek-compact-row ${esc(s.type)}" data-pi-signal-index="${i}">
          <span class="pi-parobek-compact-dot"></span>
          <span class="pi-parobek-compact-copy">
            <span class="pi-parobek-compact-row-head">
              <span class="pi-parobek-compact-row-title">${esc(s.title)}</span>
              <span class="pi-parobek-compact-row-value">${esc(s.value || '—')}</span>
            </span>
            <span class="pi-parobek-compact-row-text">${esc(s.text || '')}</span>
          </span>
        </button>`).join('');
      list.querySelectorAll('[data-pi-signal-index]').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-pi-signal-index'));
          if(signals[i] && typeof signals[i].action === 'function') signals[i].action();
        });
      });
    }
  }

  async function buildAndRender(){
    const p = activeProperty();
    const signals = [financialSignal(p), dataSignal(p)].filter(Boolean).slice(0,3);
    STATE.lastSignals = signals;
    renderSignals(signals, p);
  }

  window.piParobekMiniOpenProperty = function(){
    const p = activeProperty();
    if(p?.id && typeof window.openDashboard === 'function') window.openDashboard(p.id);
  };
  window.toggleWiktorekAssistant = function(force){
    const root = renderShell();
    if(!root) return;
    const next = typeof force === 'boolean' ? force : !root.classList.contains('open');
    root.classList.toggle('open', next);
    STATE.open = next;
    if(next) buildAndRender();
  };
  window.renderWirtualnyWiktorek = buildAndRender;

  const oldOpenDashboard = window.openDashboard;
  if(typeof oldOpenDashboard === 'function' && !oldOpenDashboard.__parobekMiniHook){
    const wrapped = function(){
      const result = oldOpenDashboard.apply(this, arguments);
      setTimeout(buildAndRender, 500);
      return result;
    };
    wrapped.__parobekMiniHook = true;
    window.openDashboard = wrapped;
  }

  document.addEventListener('keydown', e => { if(e.key === 'Escape') window.toggleWiktorekAssistant(false); });
  document.addEventListener('click', e => {
    const root = document.getElementById('wiktorekAssistant');
    if(!root || !root.classList.contains('open')) return;
    if(root.contains(e.target)) return;
    window.toggleWiktorekAssistant(false);
  });
  document.addEventListener('DOMContentLoaded', () => setTimeout(buildAndRender, 900));
  setTimeout(buildAndRender, 1800);
})();
