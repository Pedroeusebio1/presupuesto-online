import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm';

const SUPABASE_URL = 'https://evrcbtrtxciogfkhovge.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9vgB38uKoF7cGziQTxOt4Q_Senl7_Ai';
const STORAGE_KEY = 'presupuesto-online-dark-v2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let currentUser = null;
let syncing = false;
let syncTimer = null;
let cloudStatus = null;

const originalSetItem = Storage.prototype.setItem;

function setStatus(text, tone = 'ok') {
  if (!cloudStatus) return;
  cloudStatus.textContent = text;
  cloudStatus.dataset.tone = tone;
}

function mountCloudStatus(email) {
  const wrap = document.createElement('div');
  wrap.id = 'cloudStatus';
  wrap.innerHTML = `<span class="cloud-dot"></span><span class="cloud-text">Sincronizado</span><button type="button" class="cloud-user">${escapeHtml(email || 'Cuenta')}</button>`;
  document.body.appendChild(wrap);
  cloudStatus = wrap.querySelector('.cloud-text');
  wrap.querySelector('.cloud-user').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión en Presupuesto Online?')) return;
    await supabase.auth.signOut();
    location.reload();
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function injectCloudStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #cloudStatus{position:fixed;right:12px;bottom:12px;z-index:40;display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #27313d;border-radius:999px;background:rgba(16,21,28,.94);backdrop-filter:blur(10px);font:11px Inter,system-ui,sans-serif;color:#f4f7fb;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    #cloudStatus .cloud-dot{width:7px;height:7px;border-radius:50%;background:#6ee7a8;flex:none}
    #cloudStatus .cloud-text[data-tone="busy"]~*{}
    #cloudStatus .cloud-user{border:0;border-left:1px solid #27313d;background:transparent;color:#8e9aa9;padding:0 0 0 7px;font:inherit;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cloud-auth{position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:18px;background:#080b10;color:#f4f7fb;font:14px Inter,system-ui,sans-serif}
    .cloud-auth-card{width:min(420px,100%);background:#10151c;border:1px solid #27313d;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
    .cloud-auth small{color:#d8ff4f;font-weight:900;letter-spacing:.12em}.cloud-auth h1{font-size:28px;margin:7px 0 5px}.cloud-auth p{color:#8e9aa9;font-size:12px;margin:0 0 18px}.cloud-auth label{display:block;color:#8e9aa9;font-size:11px;font-weight:800;margin:10px 0 5px}.cloud-auth input{width:100%;border:1px solid #27313d;background:#0b1016;color:#f4f7fb;border-radius:9px;padding:11px;outline:none}.cloud-auth input:focus{border-color:#526170}.cloud-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.cloud-auth button{border:1px solid #27313d;border-radius:9px;padding:10px 12px;font-weight:850;background:#151b23;color:#f4f7fb}.cloud-auth button.primary{background:#d8ff4f;color:#0a0d08;border-color:#d8ff4f}.cloud-auth-msg{min-height:18px;margin-top:10px!important;color:#ffd166!important}
    @media(max-width:520px){#cloudStatus{right:8px;bottom:8px}.cloud-auth-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function showAuth() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'cloud-auth';
    overlay.innerHTML = `
      <div class="cloud-auth-card">
        <small>PRESUPUESTO ONLINE</small>
        <h1>Tu presupuesto, en todos tus equipos.</h1>
        <p>Inicia sesión para guardar tus datos en la nube y verlos desde móvil o PC.</p>
        <label>Correo</label>
        <input id="cloudEmail" type="email" autocomplete="email" placeholder="tu@email.com">
        <label>Contraseña</label>
        <input id="cloudPassword" type="password" autocomplete="current-password" placeholder="••••••••">
        <div class="cloud-auth-actions">
          <button id="cloudLogin" class="primary" type="button">Entrar</button>
          <button id="cloudSignup" type="button">Crear cuenta</button>
        </div>
        <p id="cloudMessage" class="cloud-auth-msg"></p>
      </div>`;
    document.body.appendChild(overlay);

    const email = overlay.querySelector('#cloudEmail');
    const password = overlay.querySelector('#cloudPassword');
    const message = overlay.querySelector('#cloudMessage');
    const login = overlay.querySelector('#cloudLogin');
    const signup = overlay.querySelector('#cloudSignup');

    async function finishAuth(mode) {
      const e = email.value.trim();
      const p = password.value;
      if (!e || p.length < 6) {
        message.textContent = 'Escribe tu correo y una contraseña de al menos 6 caracteres.';
        return;
      }
      login.disabled = signup.disabled = true;
      message.textContent = mode === 'login' ? 'Entrando…' : 'Creando cuenta…';
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: e, password: p })
        : await supabase.auth.signUp({ email: e, password: p });

      login.disabled = signup.disabled = false;
      if (result.error) {
        message.textContent = result.error.message;
        return;
      }
      if (!result.data.session) {
        message.textContent = 'Cuenta creada. Revisa tu correo para confirmar el acceso y luego pulsa Entrar.';
        return;
      }
      overlay.remove();
      resolve(result.data.session.user);
    }

    login.addEventListener('click', () => finishAuth('login'));
    signup.addEventListener('click', () => finishAuth('signup'));
    password.addEventListener('keydown', e => { if (e.key === 'Enter') finishAuth('login'); });
  });
}

async function pullOrSeedCloud() {
  const { data, error } = await supabase
    .from('budget_state')
    .select('data, updated_at')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.data && Object.keys(data.data).length) {
    originalSetItem.call(localStorage, STORAGE_KEY, JSON.stringify(data.data));
    return 'downloaded';
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const { error: upsertError } = await supabase
      .from('budget_state')
      .upsert({ user_id: currentUser.id, data: parsed, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;
    return 'uploaded';
  }

  return 'empty';
}

async function pushCloud() {
  if (!currentUser || syncing) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  syncing = true;
  setStatus('Guardando…', 'busy');
  const { error } = await supabase
    .from('budget_state')
    .upsert({ user_id: currentUser.id, data: parsed, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  syncing = false;

  if (error) {
    console.error('Supabase sync error', error);
    setStatus('Error al sincronizar', 'error');
    return;
  }
  setStatus('Sincronizado', 'ok');
}

function installStorageSync() {
  if (Storage.prototype.__presupuestoCloudPatched) return;
  const wrapped = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === STORAGE_KEY) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushCloud, 550);
    }
  };
  wrapped.__presupuestoCloudPatched = true;
  Storage.prototype.setItem = wrapped;
  Storage.prototype.__presupuestoCloudPatched = true;
}

export async function initializeCloud() {
  injectCloudStyles();
  const { data: sessionData } = await supabase.auth.getSession();
  currentUser = sessionData.session?.user || null;
  if (!currentUser) currentUser = await showAuth();

  try {
    await pullOrSeedCloud();
  } catch (error) {
    console.error('Initial Supabase sync failed', error);
    alert('No se pudo sincronizar con Supabase. Revisa tu conexión a internet.');
  }

  installStorageSync();
  mountCloudStatus(currentUser?.email);
  setStatus('Sincronizado', 'ok');

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') return;
    currentUser = session?.user || currentUser;
  });
}
