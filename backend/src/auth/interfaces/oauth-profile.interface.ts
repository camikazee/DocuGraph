/** Znormalizowany profil użytkownika z dowolnego dostawcy OAuth. */
export interface OAuthProfile {
  providerUserId: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}
