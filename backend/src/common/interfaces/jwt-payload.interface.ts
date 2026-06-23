/** Zawartość tokena JWT — wyłącznie tożsamość użytkownika. */
export interface JwtPayload {
  sub: string;
}

/** Obiekt wstrzykiwany do `req.user` po walidacji JWT. */
export interface AuthenticatedUser {
  userId: string;
}
