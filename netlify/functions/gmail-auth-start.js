const { json, redirect, requireEnv, getRedirectUri, appReturnUrl, GOOGLE_CLIENT_ID } = require('./_pi-gmail-shared');
const { signSession, requireAdmin, headerValue } = require('./_pi-security');

exports.handler = async function(event){
  try{
    requireEnv();
    const requester = await requireAdmin(event);
    if(!requester) return json(401, { ok:false, message:'Brak autoryzacji administratora.' });
    const statePayload = signSession({ role:'gmail_state', returnTo: appReturnUrl(event, { gmail:'connected' }) }, 15 * 60);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: getRedirectUri(event),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ].join(' '),
      state: statePayload,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const wantsJson = String(event.queryStringParameters?.json || '') === '1' || String(event.rawQuery || '').includes('json=1') || String(headerValue(event, 'accept') || '').includes('application/json');
    if(wantsJson) return json(200, { ok:true, auth_url:authUrl });
    return redirect(authUrl);
  }catch(e){
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('GMAIL_AUTH_START_ERROR',requestId,e); return json(500, { ok:false, message:'Nie można uruchomić połączenia Gmail.', requestId });
  }
};
