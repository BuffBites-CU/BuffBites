// services/usersService.ts
// All calls to /api/users/* endpoints.
//
// createUser(user: UserCreate): Promise<UserResponse>
//   POST /api/users/
//   Called once at end of Onboarding after Firebase sign-in
//   Throws 400 if firebase_uid or username is already taken
//
// getUser(firebase_uid: string): Promise<UserResponse>
//   GET /api/users/{firebase_uid}
//   Called in AuthContext on every sign-in to check if profile exists
//   Throws 404 if the user hasn't completed onboarding yet → redirect to /onboarding
//
// updateUser(firebase_uid: string, updates: Partial<UserCreate>): Promise<{ message: string }>
//   PUT /api/users/{firebase_uid}
//   Body: partial dict — only send the fields that changed
//   Called from Profile page when user saves edits
