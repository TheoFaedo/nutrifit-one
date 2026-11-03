import { Service } from '@angular/core';
import { supabase } from '@core/services/supabase.client';

@Service()
export class OAuthService {
  async details(id: string) {
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) {
      throw error;
    }
    return data;
  }

  async decide(id: string, approve: boolean): Promise<string> {
    const options = { skipBrowserRedirect: true };
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id, options)
      : await supabase.auth.oauth.denyAuthorization(id, options);
    if (error) {
      throw error;
    }
    return data.redirect_url;
  }

  async grants() {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) {
      throw error;
    }
    return data;
  }

  async revoke(clientId: string): Promise<void> {
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    if (error) {
      throw error;
    }
  }
}

/** Only navigate to the HTTPS URL returned by the authenticated Auth API. */
export function followOAuthRedirect(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid OAuth redirect');
  }
  window.location.assign(url.href);
}
