const { json, redirect, requireEnv, getRedirectUri, appReturnUrl, sb, encryptText, googleTokenExchange, getGoogleProfile, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INITIAL_SCAN_FROM, SCAN_INTERVAL_HOURS, MAX_GMAIL_CONNECTIONS } = require('./_pi-gmail-shared');
const { verifySession } = require('./_pi-security');

function decodeState(state){
  if(!state) return null;
  return verifySession(state, { roles:['gmail_state'] });
}

exports.handler = async function(event){
  try{
    requireEnv();
    const qs = event.queryStringParameters || {};
    if(qs.error) return redirect(appReturnUrl(event, { gmail:'error', reason:qs.error }));
    const code = qs.code;
    const state = decodeState(qs.state);
    if(!state || state.role !== 'gmail_state' || !state.returnTo){
      return json(400, { ok:false, message:'Nieprawidłowy lub wygasły state OAuth Gmail. Uruchom połączenie Gmail ponownie z panelu admina.' });
    }
    if(!code) return json(400, { ok:false, message:'Brak kodu autoryzacji Google.' });
    const token = await googleTokenExchange({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(event),
      grant_type: 'authorization_code',
    });
    const profile = await getGoogleProfile(token.access_token);
    const gmailEmail = String(profile.email || '').toLowerCase();
    if(!gmailEmail) throw new Error('Google nie zwrócił adresu e-mail konta Gmail.');
    const existing = await sb(`gmail_connections?gmail_email=eq.${encodeURIComponent(gmailEmail)}&select=*`, { prefer:null }).catch(() => []);
    const activeConnections = await sb('gmail_connections?status=eq.active&select=id,gmail_email', { prefer:null }).catch(() => []);
    const existingRow = Array.isArray(existing) && existing[0] ? existing[0] : null;
    const activeCountExcludingThis = Array.isArray(activeConnections) ? activeConnections.filter(c => !existingRow || String(c.id) !== String(existingRow.id)).length : 0;
    if(!existingRow && activeCountExcludingThis >= MAX_GMAIL_CONNECTIONS){
      throw new Error(`Limit połączonych kont Gmail wynosi ${MAX_GMAIL_CONNECTIONS}. Odłącz jedno konto i spróbuj ponownie.`);
    }
    const existingRefresh = existingRow ? existingRow.refresh_token_encrypted : null;
    const refreshTokenEncrypted = token.refresh_token ? encryptText(token.refresh_token) : existingRefresh;
    if(!refreshTokenEncrypted) throw new Error('Google nie zwrócił refresh tokenu. Wejdź w konto Google → Dostęp aplikacji zewnętrznych, usuń PureInvest i połącz ponownie z prompt=consent.');
    const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
    const payload = {
      provider: 'gmail',
      gmail_email: gmailEmail,
      status: 'active',
      scope: token.scope || 'gmail.readonly userinfo.email',
      access_token_encrypted: encryptText(token.access_token),
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      initial_scan_from: INITIAL_SCAN_FROM,
      scan_interval_hours: SCAN_INTERVAL_HOURS,
    };
    if(existingRow){
      await sb(`gmail_connections?id=eq.${encodeURIComponent(existingRow.id)}`, { method:'PATCH', body: JSON.stringify(payload) });
    }else{
      await sb('gmail_connections', { method:'POST', body: JSON.stringify([payload]) });
    }
    const url = new URL(state.returnTo || appReturnUrl(event));
    url.searchParams.set('gmail','connected');
    url.searchParams.set('gmail_email', gmailEmail);
    return redirect(url.toString());
  }catch(e){
    const url = appReturnUrl(event, { gmail:'error', reason:String(e.message||e).slice(0,180) });
    return redirect(url);
  }
};
