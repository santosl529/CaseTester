// Password bounds, shared by the sign-up form (client) and POST /api/sign-up (server). No server imports here.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;   // bcrypt's limit; Supabase refuses longer
